import { contractToRuleFns, isQualityContract } from '@/lib/quality-contract'

function makeSupabase(counts: Record<string, number>) {
  return {
    from: (table: string) => ({
      select: () => ({
        count: 'exact',
        head: true,
        is: () => Promise.resolve({ count: counts.is ?? 0 }),
        lt: () => Promise.resolve({ count: counts.lt ?? 0 }),
        gt: () => Promise.resolve({ count: counts.gt ?? 0 }),
        lte: () => Promise.resolve({ count: counts.lte ?? 0 }),
        gte: () => Promise.resolve({ count: counts.gte ?? 0 }),
        eq: () => Promise.resolve({ count: counts.eq ?? 0 }),
        neq: () => Promise.resolve({ count: counts.neq ?? 0 }),
        not: () => Promise.resolve({ count: counts.not ?? 0 }),
        or: () => Promise.resolve({ count: counts.or ?? 0 }),
        filter: () => Promise.resolve({ count: counts.filter ?? 0 }),
      }),
    }),
    rpc: () => Promise.resolve({ data: counts.rpc ?? 0 }),
  } as unknown as import('@supabase/supabase-js').SupabaseClient
}

describe('quality-contract', () => {
  describe('isQualityContract', () => {
    it('rules 배열이 있으면 true', () => {
      expect(isQualityContract({ rules: [] })).toBe(true)
    })
    it('rules 가 없으면 false', () => {
      expect(isQualityContract({})).toBe(false)
      expect(isQualityContract(null)).toBe(false)
    })
  })

  describe('contractToRuleFns', () => {
    it('not_null 규칙을 생성한다', async () => {
      const rules = contractToRuleFns('test_table', {
        rules: [{ name: 'NULL 금지', check: { type: 'not_null', column: 'population' } }],
      })
      expect(rules).toHaveLength(1)
      const sb = makeSupabase({ is: 5 })
      expect(await rules[0][1](sb)).toBe(5)
    })

    it('range 규칙은 min/max 를 각각 집계한다', async () => {
      const rules = contractToRuleFns('test_table', {
        rules: [{ name: '양수 범위', check: { type: 'range', column: 'population', min: 0, max: 100 } }],
      })
      const sb = makeSupabase({ lt: 3, gt: 7 })
      expect(await rules[0][1](sb)).toBe(10)
    })

    it('range 규칙은 includeMin/includeMax 를 반영한다', async () => {
      const rules = contractToRuleFns('test_table', {
        rules: [{ name: '양수', check: { type: 'range', column: 'population', min: 0, includeMin: false } }],
      })
      const sb = makeSupabase({ lte: 5 })
      expect(await rules[0][1](sb)).toBe(5)
    })

    it('in 규칙은 허용값 이외를 집계한다', async () => {
      const rules = contractToRuleFns('test_table', {
        rules: [{ name: '코드 유효성', check: { type: 'in', column: 'sex', values: ['M', 'F'] } }],
      })
      const sb = makeSupabase({ not: 2 })
      expect(await rules[0][1](sb)).toBe(2)
    })

    it('year_range 규칙을 생성한다', async () => {
      const rules = contractToRuleFns('test_table', {
        rules: [{ name: '연도 범위', check: { type: 'year_range', column: 'year', min: 2018, max: 2025 } }],
      })
      const sb = makeSupabase({ lt: 1, gt: 4 })
      expect(await rules[0][1](sb)).toBe(5)
    })

    it('or_null 규칙을 생성한다', async () => {
      const rules = contractToRuleFns('test_table', {
        rules: [{ name: '좌표 결측', check: { type: 'or_null', columns: ['lon', 'lat'] } }],
      })
      const sb = makeSupabase({ or: 8 })
      expect(await rules[0][1](sb)).toBe(8)
    })

    it('rpc 규칙을 생성한다', async () => {
      const rules = contractToRuleFns('test_table', {
        rules: [{ name: '정합성', check: { type: 'rpc', name: 'count_emp_lt_biz' } }],
      })
      const sb = makeSupabase({ rpc: 12 })
      expect(await rules[0][1](sb)).toBe(12)
    })

    it('알 수 없는 check type 은 0을 반환한다', async () => {
      const rules = contractToRuleFns('test_table', {
        rules: [{ name: 'Unknown', check: { type: 'unknown' } as never }],
      })
      const sb = makeSupabase({})
      expect(await rules[0][1](sb)).toBe(0)
    })
  })
})
