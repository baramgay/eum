import type { SupabaseClient } from '@supabase/supabase-js'
import { answer, buildFollowUpQuestions } from '@/lib/nlquery'
import { parseModifiers, parseTopN, parseFilters, applyTopN, applyFilters } from '@/lib/nlquery/query-modifiers'

describe('buildFollowUpQuestions', () => {
  it('정착잠재지수 의도에 지역명이 포함된 후속 질문을 생성한다', () => {
    const qs = buildFollowUpQuestions('정착잠재지수', '창원시')
    expect(qs).toHaveLength(3)
    expect(qs[0]).toContain('상위 5개 시군')
    expect(qs[1]).toContain('창원시')
  })

  it('시군이 없으면 기본 후속 질문을 생성한다', () => {
    const qs = buildFollowUpQuestions('공공시설', null)
    expect(qs).toHaveLength(3)
    expect(qs.some(q => q.includes('경남'))).toBe(true)
  })

  it('알 수 없는 의도에도 기본 예시 질문을 반환한다', () => {
    const qs = buildFollowUpQuestions(null, null)
    expect(qs).toHaveLength(3)
    expect(qs[0]).toContain('정착잠재')
  })

  it('사업체 의도에서 제조업과 일반 사업체를 구분한다', () => {
    const mfg = buildFollowUpQuestions('제조업 사업체', '진주시')
    const biz = buildFollowUpQuestions('사업체·고용', '진주시')
    expect(mfg[0]).toContain('제조업')
    expect(biz[0]).toContain('제조업')
    expect(biz[1]).toContain('진주시')
  })
})

function createMockSupabase(tables: Record<string, unknown[]>): SupabaseClient {
  const mockFrom = (table: string) => {
    const data = tables[table] ?? []
    const chain = {
      select() { return chain },
      order() { return chain },
      limit() { return chain },
      eq() { return chain },
      ilike() { return chain },
      then<TResult1 = { data: unknown[] }, TResult2 = never>(
        onfulfilled?: ((value: { data: unknown[] }) => TResult1 | PromiseLike<TResult1>) | undefined,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | undefined
      ) {
        const value = { data }
        return Promise.resolve(onfulfilled ? onfulfilled(value) : value as unknown as TResult1)
      },
    }
    return chain
  }
  return { from: mockFrom } as unknown as SupabaseClient
}

describe('answer', () => {
  const mockSupabase = createMockSupabase({
    tenants: [{ name: '창원시', sgg_cd: '48121' }],
    gold_business: [
      { sigun: '창원시', industry: '전체', biz_count: 100, employees: 1000 },
      { sigun: '창원시', industry: '제조업', biz_count: 40, employees: 600 },
    ],
    gold_youth_population: [
      { sigun: '창원시', year: 2024, population: 12000, inflow: 800, outflow: 700 },
    ],
    gold_settlement_index: [
      {
        sigun: '창원시',
        gov_type: '일반구',
        rank: 1,
        settlement_score: 78.5,
        youth_pop_2025: 12000,
        youth_net_migration: 100,
        income_monthly: 320,
        living_index: 105.2,
        credit_score_avg: 750,
        loan_per_cap: 3000,
        card_3m_per_cap: 120,
      },
      {
        sigun: '진주시',
        gov_type: '시',
        rank: 2,
        settlement_score: 72.3,
        youth_pop_2025: 8000,
        youth_net_migration: 50,
        income_monthly: 280,
        living_index: 102.1,
        credit_score_avg: 720,
        loan_per_cap: 2500,
        card_3m_per_cap: 100,
      },
      {
        sigun: '김해시',
        gov_type: '시',
        rank: 3,
        settlement_score: 68.0,
        youth_pop_2025: 9500,
        youth_net_migration: 80,
        income_monthly: 300,
        living_index: 104.0,
        credit_score_avg: 735,
        loan_per_cap: 2800,
        card_3m_per_cap: 110,
      },
    ],
    gold_public_facility: [
      { sigun: '창원시', ftype: '청년센터' },
      { sigun: '창원시', ftype: '도서관' },
    ],
  })

  it('데이터 안내 질문은 카탈로그를 반환한다', async () => {
    const r = await answer(mockSupabase, '데이터 뭐있냐')
    expect(r.intent).toBe('데이터안내')
    expect(r.rows.length).toBeGreaterThan(0)
    expect(r.columns).toContain('주제')
  })

  it('의도에 맞지 않는 질문은 카탈로그 fallback 응답을 반환한다', async () => {
    const r = await answer(mockSupabase, '아묵개똥')
    expect(r.intent).toBe('데이터안내')
    expect(r.rows.length).toBeGreaterThan(0)
    expect(r.hint).toBeTruthy()
  })

  it('창원시 사업체 현황을 조회한다', async () => {
    const r = await answer(mockSupabase, '창원시 사업체 현황')
    expect(r.intent).toBe('사업체·고용')
    expect(r.rows[0]).toMatchObject({ sigun: '창원시' })
  })

  it('제조업 키워드는 제조업 사업체 의도로 분류한다', async () => {
    const r = await answer(mockSupabase, '경남 제조업 현황')
    expect(r.intent).toBe('제조업 사업체')
  })

  it('소득 순위는 소득·신용 의도로 분류한다', async () => {
    const r = await answer(mockSupabase, '소득 높은 시군 순위')
    expect(r.intent).toBe('소득·신용 현황')
  })

  it('정착잠재 키워드는 정착잠재지수 의도로 분류한다', async () => {
    const r = await answer(mockSupabase, '정착잠재 순위 보여줘')
    expect(r.intent).toBe('정착잠재지수')
  })

  it('TOP-N 키워드가 있으면 상위 N개만 반환한다', async () => {
    const r = await answer(mockSupabase, '소득 높은 시군 top 2')
    expect(r.intent).toBe('소득·신용 현황')
    expect(r.topN).toBe(2)
    expect(r.rows).toHaveLength(2)
    expect(r.rows[0].sigun).toBe('창원시')
    expect(r.summary).toContain('상위 2')
  })

  it('필터 조건을 파싱하여 결과에 적용한다', async () => {
    const r = await answer(mockSupabase, '소득 300 이상인 시군')
    expect(r.intent).toBe('소득·신용 현황')
    expect(r.rows.every((row) => (row['월평균소득'] as number) >= 300)).toBe(true)
    expect(r.filterDescription).toContain('월평균소득')
    expect(r.filterDescription).toContain('300')
  })

  it('TOP-N과 필터를 함께 적용한다', async () => {
    const r = await answer(mockSupabase, '정착잠재지수 상위 2개')
    expect(r.intent).toBe('정착잠재지수')
    expect(r.topN).toBe(2)
    expect(r.rows).toHaveLength(2)
    expect(r.rows[0].sigun).toBe('창원시')
    expect(r.rows[1].sigun).toBe('진주시')
  })

  it('명시적 TOP-N이 없으면 전체 결과를 반환한다', async () => {
    const r = await answer(mockSupabase, '소득 높은 시군 순위')
    expect(r.intent).toBe('소득·신용 현황')
    expect(r.topN).toBeUndefined()
    expect(r.rows.length).toBeGreaterThan(1)
  })
})

describe('query-modifiers', () => {
  it('parseTopN: 상위/top/높은 키워드를 파싱한다', () => {
    expect(parseTopN('상위 5개 시군')).toEqual({ topN: 5, direction: 'desc' })
    expect(parseTopN('소득 Top-3')).toEqual({ topN: 3, direction: 'desc' })
    expect(parseTopN('top 10')).toEqual({ topN: 10, direction: 'desc' })
    expect(parseTopN('월평균 소득 높은 5개')).toEqual({ topN: 5, direction: 'desc' })
    expect(parseTopN('5위 이내')).toEqual({ topN: 5, direction: 'desc' })
  })

  it('parseTopN: 낮은 키워드는 오름차순 방향을 반환한다', () => {
    expect(parseTopN('소득 낮은 3개')).toEqual({ topN: 3, direction: 'asc' })
  })

  it('parseTopN: TOP 키워드가 없으면 undefined를 반환한다', () => {
    expect(parseTopN('소득 현황').topN).toBeUndefined()
  })

  it('parseFilters: 컬럼 별칭과 비교 연산자를 파싱한다', () => {
    const aliases = { '월평균소득': ['소득', '월평균소득'] }
    expect(parseFilters('소득 300 이상', aliases)).toEqual([
      { column: '월평균소득', op: 'gte', value: 300 },
    ])
    expect(parseFilters('소득 500 이하', aliases)).toEqual([
      { column: '월평균소득', op: 'lte', value: 500 },
    ])
    expect(parseFilters('소득 400 초과', aliases)).toEqual([
      { column: '월평균소득', op: 'gt', value: 400 },
    ])
    expect(parseFilters('소득 200 미만', aliases)).toEqual([
      { column: '월평균소득', op: 'lt', value: 200 },
    ])
  })

  it('applyTopN: 정렬된 rows에서 N개를 잘라낸다', () => {
    const rows = [{ v: 10 }, { v: 8 }, { v: 6 }, { v: 4 }]
    expect(applyTopN(rows, 2, 'desc')).toEqual([{ v: 10 }, { v: 8 }])
    expect(applyTopN(rows, 2, 'asc')).toEqual([{ v: 4 }, { v: 6 }])
  })

  it('applyFilters: 조건에 맞는 행만 반환한다', () => {
    const rows = [
      { sigun: '창원시', '월평균소득': 320 },
      { sigun: '진주시', '월평균소득': 280 },
      { sigun: '김해시', '월평균소득': 300 },
    ]
    expect(applyFilters(rows, [{ column: '월평균소득', op: 'gte', value: 300 }])).toEqual([
      { sigun: '창원시', '월평균소득': 320 },
      { sigun: '김해시', '월평균소득': 300 },
    ])
  })

  it('parseModifiers: topN과 필터를 한 번에 파싱한다', () => {
    const aliases = { '월평균소득': ['소득'] }
    const mods = parseModifiers('소득 높은 상위 3개 중 300 이상', aliases)
    expect(mods.topN).toBe(3)
    expect(mods.direction).toBe('desc')
    expect(mods.filters).toEqual([{ column: '월평균소득', op: 'gte', value: 300 }])
  })
})
