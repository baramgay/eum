import { runQualityGeneric, generateQualityRecommendations, ERROR_RATE_THRESHOLD } from '@/lib/quality'

describe('runQualityGeneric', () => {
  const supabase = {} as never

  it('빈 배열은 모든 규칙 통과', async () => {
    const results = await runQualityGeneric(supabase, 'test_table', [])
    expect(results.every(r => r.passed)).toBe(true)
  })

  it('null 값 비율이 임계값 초과 시 실패', async () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({
      name: i < 50 ? null : 'value',
      lon: 128.0, lat: 35.0, emp: 5, biz: 3,
    }))
    const results = await runQualityGeneric(supabase, 'test_table', rows)
    const nullRule = results.find(r => r.rule_name.includes('null'))
    expect(nullRule).toBeDefined()
    expect(nullRule?.passed).toBe(false)
  })

  it('정상 데이터는 통과', async () => {
    const rows = Array.from({ length: 10 }, () => ({
      name: 'test', lon: 128.5, lat: 35.2, emp: 10, biz: 5,
    }))
    const results = await runQualityGeneric(supabase, 'test_table', rows)
    expect(results.filter(r => !r.passed).length).toBe(0)
  })

  it('경도 범위 벗어나면 실패', async () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({
      lon: i < 10 ? 200.0 : 128.0,
      lat: 35.0,
    }))
    const results = await runQualityGeneric(supabase, 'test_table', rows)
    const lonRule = results.find(r => r.rule_name.includes('경도') || r.rule_name.toLowerCase().includes('lon'))
    expect(lonRule?.passed).toBe(false)
  })
})

describe('generateQualityRecommendations', () => {
  it('통과 결과만 있으면 빈 배열', () => {
    const recs = generateQualityRecommendations([
      { dataset_id: 'x', table_name: 'x', rule_name: '규칙1', passed: true, message: 'OK', checked_at: '' },
    ])
    expect(recs).toHaveLength(0)
  })

  it('실패 결과에 대한 권고사항 생성', () => {
    const recs = generateQualityRecommendations([
      { dataset_id: 'x', table_name: 'x', rule_name: 'null 비율', passed: false, message: '50% null', checked_at: '' },
    ])
    expect(recs.length).toBeGreaterThan(0)
    expect(recs[0]).toMatch(/null/)
  })
})

describe('ERROR_RATE_THRESHOLD', () => {
  it('0.001', () => {
    expect(ERROR_RATE_THRESHOLD).toBe(0.001)
  })
})
