import { runQualityGeneric, generateQualityRecommendations, ERROR_RATE_THRESHOLD } from '@/lib/quality'

describe('runQualityGeneric', () => {
  const supabase = {} as never

  it('빈 배열은 통과(passed=true), rule_count=0', async () => {
    const result = await runQualityGeneric(supabase, 'test_table', [])
    expect(result.passed).toBe(true)
    expect(result.rule_count).toBe(0)
    expect(result.errors).toBe(0)
  })

  it('null 값 50%면 실패', async () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({
      name: i < 50 ? null : 'value',
    }))
    const result = await runQualityGeneric(supabase, 'test_table', rows)
    expect(result.passed).toBe(false)
    expect(result.errors).toBeGreaterThan(0)
  })

  it('정상 데이터는 통과', async () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ name: `test_${i}`, value: i + 1 }))
    const result = await runQualityGeneric(supabase, 'test_table', rows)
    expect(result.passed).toBe(true)
    expect(result.errors).toBe(0)
  })

  it('음수 값이 많으면 실패', async () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({ score: i < 60 ? -1 : 1 }))
    const result = await runQualityGeneric(supabase, 'test_table', rows)
    expect(result.passed).toBe(false)
  })

  it('반환 객체에 필수 필드가 있다', async () => {
    const result = await runQualityGeneric(supabase, 'test_table', [{ a: 1 }])
    expect(result).toHaveProperty('table')
    expect(result).toHaveProperty('rule_count')
    expect(result).toHaveProperty('checked')
    expect(result).toHaveProperty('errors')
    expect(result).toHaveProperty('error_rate')
    expect(result).toHaveProperty('threshold')
    expect(result).toHaveProperty('passed')
    expect(result).toHaveProperty('detail')
    expect(result).toHaveProperty('ran_at')
  })
})

describe('generateQualityRecommendations', () => {
  it('통과(passed=true)이면 빈 배열', () => {
    const recs = generateQualityRecommendations({
      checked: 100, passed: true, error_rate: 0, threshold: 5,
      detail: [{ rule: '규칙1', violations: 0, threshold: 5 }],
    })
    expect(recs).toHaveLength(0)
  })

  it('checked=0이면 빈 데이터 안내 메시지', () => {
    const recs = generateQualityRecommendations({
      checked: 0, passed: false, error_rate: 0, threshold: 5, detail: [],
    })
    expect(recs.length).toBeGreaterThan(0)
  })

  it('실패 규칙에 대한 권고사항 생성', () => {
    const recs = generateQualityRecommendations({
      checked: 100, passed: false, error_rate: 50, threshold: 5,
      detail: [{ rule: 'null 비율 - name', violations: 50, threshold: 5 }],
    })
    expect(recs.length).toBeGreaterThan(0)
    expect(recs[0]).toContain('null 비율 - name')
  })
})

describe('ERROR_RATE_THRESHOLD', () => {
  it('0.001', () => {
    expect(ERROR_RATE_THRESHOLD).toBe(0.001)
  })
})
