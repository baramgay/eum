import type { SupabaseClient } from '@supabase/supabase-js'
import { answer } from '@/lib/nlquery'
import {
  normalizeContext,
  inferContextualKeywords,
  extractInheritedSigun,
  buildEffectiveQuestion,
} from '@/lib/nlquery/context'

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
        _onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | undefined,
      ) {
        const value = { data }
        return Promise.resolve(onfulfilled ? onfulfilled(value) : value as unknown as TResult1)
      },
    }
    return chain
  }
  return { from: mockFrom } as unknown as SupabaseClient
}

const mockSupabase = createMockSupabase({
  tenants: [{ name: '창원시', sgg_cd: '48121' }],
  gold_settlement_index: [
    { sigun: '창원시', gov_type: '일반구', rank: 1, settlement_score: 78.5, youth_pop_2025: 12000, youth_net_migration: 100, income_monthly: 320, living_index: 105.2 },
    { sigun: '진주시', gov_type: '시', rank: 2, settlement_score: 72.3, youth_pop_2025: 8000, youth_net_migration: 50, income_monthly: 280, living_index: 102.1 },
    { sigun: '김해시', gov_type: '시', rank: 3, settlement_score: 68.0, youth_pop_2025: 9500, youth_net_migration: 80, income_monthly: 300, living_index: 104.0 },
  ],
})

describe('normalizeContext', () => {
  it('문자열 배열을 user 턴으로 정규화한다', () => {
    const ctx = normalizeContext(['창원시 사업체 현황', '상위 5개'])
    expect(ctx).toHaveLength(2)
    expect(ctx[0]).toMatchObject({ role: 'user', text: '창원시 사업체 현황' })
    expect(ctx[1]).toMatchObject({ role: 'user', text: '상위 5개' })
  })

  it('구조화된 턴을 그대로 정규화한다', () => {
    const ctx = normalizeContext([
      { role: 'user', text: '창원시 사업체 현황' },
      { role: 'assistant', intent: '사업체·고용', sigun: '창원시', topN: 5 },
    ])
    expect(ctx).toHaveLength(2)
    expect(ctx[1]).toMatchObject({ role: 'assistant', intent: '사업체·고용', sigun: '창원시', topN: 5 })
  })

  it('잘못된 항목은 필터링한다', () => {
    const ctx = normalizeContext([null, undefined, 123, { role: 'assistant' }, '질문'])
    expect(ctx).toHaveLength(1)
    expect(ctx[0].text).toBe('질문')
  })
})

describe('inferContextualKeywords', () => {
  it('의도가 명시되면 빈 배열을 반환한다', () => {
    const keywords = inferContextualKeywords('창원시 사업체 현황', [
      { role: 'assistant', intent: '소득·신용 현황' },
    ])
    expect(keywords).toHaveLength(0)
  })

  it('어시스턴트 의도에서 키워드를 상속한다', () => {
    const keywords = inferContextualKeywords('상위 5개', [
      { role: 'assistant', intent: '사업체·고용' },
    ])
    expect(keywords).toContain('사업체')
  })

  it('최근 텍스트에서 키워드를 추출한다', () => {
    const keywords = inferContextualKeywords('순위 보여줘', [
      { role: 'user', text: '소득 높은 시군' },
    ])
    expect(keywords).toContain('소득')
  })
})

describe('extractInheritedSigun', () => {
  it('최근 턴에서 시군을 역순으로 상속한다', () => {
    const match = extractInheritedSigun(
      [
        { role: 'user', text: '창원시 사업체 현황' },
        { role: 'assistant', intent: '사업체·고용' },
        { role: 'user', text: '상위 5개' },
      ],
      (q) => (q.includes('창원시') ? { name: '창원시', sgg_cd: '48121' } : null),
    )
    expect(match).toMatchObject({ name: '창원시', sgg_cd: '48121' })
  })
})

describe('buildEffectiveQuestion', () => {
  it('문맥 키워드를 질문 앞에 보강한다', () => {
    const { text, keywords } = buildEffectiveQuestion('상위 3개', [
      { role: 'assistant', intent: '소득·신용 현황' },
    ])
    expect(keywords).toContain('소득')
    expect(text).toBe('소득 상위 3개')
  })
})

describe('answer with multi-turn context', () => {
  it('이전 턴에서 시군을 상속한다', async () => {
    const r = await answer(mockSupabase, '사업체 현황', [
      { role: 'user', text: '창원시 사업체 현황' },
    ])
    expect(r.sigun).toBe('창원시')
    expect(r.intent).toBe('사업체·고용')
  })

  it('이전 어시스턴트 의도에서 주제를 상속한다', async () => {
    const r = await answer(mockSupabase, '상위 2개', [
      { role: 'user', text: '소득 높은 시군 순위' },
      { role: 'assistant', intent: '소득·신용 현황', sigun: null },
    ])
    expect(r.intent).toBe('소득·신용 현황')
    expect(r.rows).toHaveLength(2)
    expect(r.rows[0].sigun).toBe('창원시')
  })
})
