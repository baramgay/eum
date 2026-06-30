process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  validateSqlAst,
  validateSql,
  ensureLimit,
  generateSql,
  buildWhitelist,
  type Whitelist,
} from '@/lib/ai/nl-to-sql'

const mockChatCompletion = jest.fn()
jest.mock('@/lib/ai/gateway', () => ({
  chatCompletionGateway: (...args: unknown[]) => mockChatCompletion(...args),
}))

function createMockSupabase(
  catalog: Record<string, unknown>[],
  tables: Record<string, { columns: string[]; rows: Record<string, unknown>[] }>,
): SupabaseClient {
  const mockFrom = (table: string) => {
    const chain: Record<string, jest.Mock> = {}
    const build = () => chain

    chain.select = jest.fn().mockImplementation(() => build())
    chain.in = jest.fn().mockImplementation(() => build())
    chain.eq = jest.fn().mockImplementation(() => build())
    chain.not = jest.fn().mockImplementation(() => build())
    chain.like = jest.fn().mockImplementation(() => build())
    chain.or = jest.fn().mockImplementation(() => build())
    chain.limit = jest.fn().mockImplementation((n: number) => {
      if (table === 'catalog') return Promise.resolve({ data: catalog })
      if (table === 'information_schema.tables') {
        return Promise.resolve({ data: Object.keys(tables).filter((t) => t.startsWith('derived_')).map((t) => ({ table_name: t })) })
      }
      if (table === 'information_schema.columns') {
        const cols: Record<string, unknown>[] = []
        for (const [t, meta] of Object.entries(tables)) {
          for (const c of meta.columns) cols.push({ table_name: t, column_name: c })
        }
        return Promise.resolve({ data: cols })
      }
      if (tables[table]) {
        const rows = tables[table].rows.slice(0, n)
        return Promise.resolve({ data: rows })
      }
      return Promise.resolve({ data: [] })
    })

    return build()
  }

  return {
    from: mockFrom,
    rpc: jest.fn().mockResolvedValue({ data: [], error: null }),
  } as unknown as SupabaseClient
}

const whitelist: Whitelist = {
  tables: ['gold_settlement_index', 'gold_business'],
  columns: {
    gold_settlement_index: ['sigun', 'settlement_score', 'youth_pop_2025', 'income_monthly', 'year'],
    gold_business: ['sigun', 'industry', 'biz_count', 'employees', 'year'],
  },
}

describe('validateSqlAst', () => {
  it('허용된 SELECT 문을 통과한다', () => {
    const res = validateSqlAst(
      'SELECT sigun, settlement_score FROM gold_settlement_index LIMIT 10',
      whitelist,
    )
    expect(res.ok).toBe(true)
  })

  it('JOIN과 집계 함수를 허용한다', () => {
    const res = validateSqlAst(
      'SELECT a.sigun, SUM(b.biz_count) FROM gold_settlement_index a JOIN gold_business b ON a.sigun = b.sigun GROUP BY a.sigun LIMIT 10',
      whitelist,
    )
    expect(res.ok).toBe(true)
  })

  it('CTE와 서브쿼리를 허용한다', () => {
    const res = validateSqlAst(
      'WITH cte AS (SELECT sigun FROM gold_settlement_index) SELECT c.sigun FROM cte c LIMIT 5',
      whitelist,
    )
    expect(res.ok).toBe(true)
  })

  it('DML 키워드가 포함되면 거부한다', () => {
    const res = validateSqlAst(
      'DELETE FROM gold_settlement_index WHERE sigun = \'창원시\'',
      whitelist,
    )
    expect(res.ok).toBe(false)
  })

  it('화이트리스트에 없는 테이블을 거부한다', () => {
    const res = validateSqlAst(
      'SELECT * FROM unknown_table LIMIT 10',
      whitelist,
    )
    expect(res.ok).toBe(false)
  })

  it('화이트리스트에 없는 컬럼을 거부한다', () => {
    const res = validateSqlAst(
      'SELECT secret_col FROM gold_settlement_index LIMIT 10',
      whitelist,
    )
    expect(res.ok).toBe(false)
  })

  it('허용되지 않은 함수를 거부한다', () => {
    const res = validateSqlAst(
      'SELECT pg_sleep(10) FROM gold_settlement_index LIMIT 1',
      whitelist,
    )
    expect(res.ok).toBe(false)
  })

  it('LIMIT 절이 없으면 거부한다', () => {
    const res = validateSqlAst(
      'SELECT sigun FROM gold_settlement_index',
      whitelist,
    )
    expect(res.ok).toBe(false)
  })

  it('SELECT로 시작하지 않으면 거부한다', () => {
    const res = validateSqlAst(
      'INSERT INTO gold_settlement_index VALUES (1)',
      whitelist,
    )
    expect(res.ok).toBe(false)
  })

  it('주석을 통한 우회를 차단한다', () => {
    const res = validateSqlAst(
      "SELECT sigun FROM gold_settlement_index /*; DROP TABLE users; */ LIMIT 10",
      whitelist,
    )
    expect(res.ok).toBe(true)
  })
})

describe('injection resistance', () => {
  it('세미콜론 뒤 DROP 시도를 거부한다', () => {
    const res = validateSqlAst(
      "SELECT sigun FROM gold_settlement_index; DROP TABLE gold_business; LIMIT 10",
      whitelist,
    )
    expect(res.ok).toBe(false)
  })

  it('UNION을 통한 데이터 유출 시도를 거부한다', () => {
    const res = validateSqlAst(
      "SELECT sigun FROM gold_settlement_index UNION SELECT password FROM users LIMIT 10",
      whitelist,
    )
    expect(res.ok).toBe(false)
  })

  it('문자열 리터럴 내 DROP은 허용한다', () => {
    const res = validateSqlAst(
      "SELECT 'DROP TABLE' AS hint FROM gold_settlement_index LIMIT 1",
      whitelist,
    )
    expect(res.ok).toBe(true)
  })
})

describe('ensureLimit', () => {
  it('LIMIT가 없으면 기본값을 추가한다', () => {
    expect(ensureLimit('SELECT * FROM t')).toBe('SELECT * FROM t LIMIT 100')
  })

  it('LIMIT가 있으면 그대로 둔다', () => {
    expect(ensureLimit('SELECT * FROM t LIMIT 5')).toBe('SELECT * FROM t LIMIT 5')
  })
})

describe('buildWhitelist', () => {
  it('catalog 테이블과 derived_* 테이블을 포함한다', async () => {
    const supabase = createMockSupabase(
      [{ table_name: 'gold_settlement_index' }],
      {
        gold_settlement_index: { columns: ['sigun'], rows: [] },
        derived_abc: { columns: ['x'], rows: [] },
      },
    )
    const wl = await buildWhitelist(supabase)
    expect(wl.tables).toContain('gold_settlement_index')
    expect(wl.tables).toContain('derived_abc')
  })

  it('공통 컬럼을 자동 추가한다', async () => {
    const supabase = createMockSupabase(
      [{ table_name: 'gold_settlement_index' }],
      {
        gold_settlement_index: { columns: ['sigun'], rows: [] },
      },
    )
    const wl = await buildWhitelist(supabase)
    expect(wl.columns.gold_settlement_index).toContain('year')
    expect(wl.columns.gold_settlement_index).toContain('sigun')
  })
})

describe('generateSql with self-correction', () => {
  beforeEach(() => {
    mockChatCompletion.mockReset()
  })

  it('유효한 SQL을 생성하면 즉시 반환한다', async () => {
    mockChatCompletion.mockResolvedValue({
      content: '{"sql": "SELECT sigun FROM gold_settlement_index LIMIT 10", "explanation": "시군 조회"}',
    })
    const supabase = createMockSupabase(
      [{ table_name: 'gold_settlement_index', title: '청년 정착지수' }],
      {
        gold_settlement_index: { columns: ['sigun'], rows: [{ sigun: '창원시' }] },
      },
    )

    const result = await generateSql(supabase, '시군 목록을 알려줘', {
      execute: async () => ({ data: [{ sigun: '창원시' }] }),
      maxRetries: 2,
    })

    expect(result).not.toBeNull()
    expect(result?.sql).toContain('gold_settlement_index')
    expect(result?.sql).toContain('LIMIT')
  })

  it('실행 오류 시 자동 교정을 재시도한다', async () => {
    mockChatCompletion
      .mockResolvedValueOnce({
        content: '{"sql": "SELECT sigun FROM gold_settlement_index WHERE year = 9999 LIMIT 10", "explanation": "실행 오류 유발"}',
      })
      .mockResolvedValueOnce({
        content: '{"sql": "SELECT sigun FROM gold_settlement_index LIMIT 10", "explanation": "수정된 쿼리"}',
      })

    const supabase = createMockSupabase(
      [{ table_name: 'gold_settlement_index', title: '청년 정착지수' }],
      {
        gold_settlement_index: { columns: ['sigun', 'year'], rows: [{ sigun: '창원시', year: 2024 }] },
      },
    )

    const execute = jest.fn()
      .mockResolvedValueOnce({ error: { message: 'no rows for year 9999' } })
      .mockResolvedValueOnce({ data: [{ sigun: '창원시' }] })

    const result = await generateSql(supabase, '시군 목록', { execute, maxRetries: 2 })

    expect(execute).toHaveBeenCalledTimes(2)
    expect(result?.sql).toContain('sigun')
  })

  it('0건 결과 시 재시도 후 실패 원인을 설명한다', async () => {
    mockChatCompletion
      .mockResolvedValueOnce({
        content: '{"sql": "SELECT sigun FROM gold_settlement_index WHERE year = 2099 LIMIT 10", "explanation": "미래 연도"}',
      })
      .mockResolvedValueOnce({
        content: '{"sql": "SELECT sigun FROM gold_settlement_index WHERE year = 2024 LIMIT 10", "explanation": "현재 연도"}',
      })

    const supabase = createMockSupabase(
      [{ table_name: 'gold_settlement_index', title: '청년 정착지수' }],
      {
        gold_settlement_index: { columns: ['sigun', 'year'], rows: [{ sigun: '창원시', year: 2024 }] },
      },
    )

    const execute = jest.fn()
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [{ sigun: '창원시' }] })

    const result = await generateSql(supabase, '2024년 시군 목록', { execute, maxRetries: 2 })

    expect(execute).toHaveBeenCalledTimes(2)
    expect(result?.sql).toContain('2024')
  })

  it('모든 재시도가 실패하면 null을 반환한다', async () => {
    mockChatCompletion.mockResolvedValue({
      content: '{"sql": "SELECT bad_col FROM gold_settlement_index LIMIT 10", "explanation": "계속 실패"}',
    })

    const supabase = createMockSupabase(
      [{ table_name: 'gold_settlement_index', title: '청년 정착지수' }],
      {
        gold_settlement_index: { columns: ['sigun'], rows: [{ sigun: '창원시' }] },
      },
    )

    const execute = jest.fn().mockResolvedValue({ error: { message: 'column bad_col does not exist' } })

    const result = await generateSql(supabase, '목록', { execute, maxRetries: 1 })

    expect(result).toBeNull()
  })
})
