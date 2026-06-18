process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'

import { validateSql, ensureLimit } from '@/lib/ai/nl-to-sql'
import type { Whitelist } from '@/lib/ai/nl-to-sql'

const whitelist: Whitelist = {
  tables: ['gold_settlement_index', 'gold_business'],
  columns: {
    gold_settlement_index: ['sigun', 'settlement_score', 'youth_pop_2025', 'income_monthly'],
    gold_business: ['sigun', 'industry', 'biz_count', 'employees'],
  },
}

describe('validateSql', () => {
  it('허용된 SELECT 문을 통과한다', () => {
    const res = validateSql(
      'SELECT sigun, settlement_score FROM gold_settlement_index LIMIT 10',
      whitelist,
    )
    expect(res.ok).toBe(true)
  })

  it('DML 키워드가 포함되면 거부한다', () => {
    const res = validateSql(
      'DELETE FROM gold_settlement_index WHERE sigun = "창원시"',
      whitelist,
    )
    expect(res.ok).toBe(false)
  })

  it('화이트리스트에 없는 테이블을 거부한다', () => {
    const res = validateSql(
      'SELECT * FROM unknown_table LIMIT 10',
      whitelist,
    )
    expect(res.ok).toBe(false)
  })

  it('화이트리스트에 없는 컬럼을 거부한다', () => {
    const res = validateSql(
      'SELECT secret_col FROM gold_settlement_index LIMIT 10',
      whitelist,
    )
    expect(res.ok).toBe(false)
  })

  it('LIMIT 절이 없으면 거부한다', () => {
    const res = validateSql(
      'SELECT sigun FROM gold_settlement_index',
      whitelist,
    )
    expect(res.ok).toBe(false)
  })

  it('SELECT로 시작하지 않으면 거부한다', () => {
    const res = validateSql(
      'INSERT INTO gold_settlement_index VALUES (1)',
      whitelist,
    )
    expect(res.ok).toBe(false)
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
