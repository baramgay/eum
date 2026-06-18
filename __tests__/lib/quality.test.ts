import {
  runQualityGeneric, generateQualityRecommendations, ERROR_RATE_THRESHOLD,
  inferArea, buildAreaSignals, buildQualityIssues,
  getIssueSeverity, buildAreaComparison,
} from '@/lib/quality'

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

describe('inferArea', () => {
  it('NULL 키워드는 완전성', () => {
    expect(inferArea('population NULL 금지')).toBe('completeness')
  })
  it('연도 키워드는 최신성', () => {
    expect(inferArea('연도 범위(2018-2025)')).toBe('recency')
  })
  it('정합성 키워드는 일관성', () => {
    expect(inferArea('종사자>=사업체 정합성')).toBe('consistency')
  })
  it('코드 키워드는 메타데이터', () => {
    expect(inferArea('연령대 코드 유효성')).toBe('metadata')
  })
  it('기본값은 정확성', () => {
    expect(inferArea('population 음수 금지')).toBe('accuracy')
  })
})

describe('buildAreaSignals', () => {
  it('위반 없으면 모두 통과', () => {
    const signals = buildAreaSignals([{
      dataset_id: 'ds_1', table: 'gold_business', rule_count: 1, checked: 10,
      errors: 0, error_rate: 0, threshold: 0.001, passed: true,
      detail: [{ rule: '종사자>=사업체 정합성', violations: 0, area: 'consistency' }],
      ran_at: new Date().toISOString(),
    }])
    const consistency = signals.find(s => s.name === 'consistency')
    expect(consistency?.status).toBe('pass')
    expect(consistency?.violations).toBe(0)
  })

  it('위반이 있으면 fail', () => {
    const signals = buildAreaSignals([{
      dataset_id: 'ds_1', table: 'gold_business', rule_count: 1, checked: 10,
      errors: 5, error_rate: 50, threshold: 0.001, passed: false,
      detail: [{ rule: 'population NULL 금지', violations: 5 }],
      ran_at: new Date().toISOString(),
    }])
    const completeness = signals.find(s => s.name === 'completeness')
    expect(completeness?.status).toBe('fail')
    expect(completeness?.violations).toBe(5)
  })
})

describe('buildQualityIssues', () => {
  it('위반 건수 기준 내림차순 정렬', () => {
    const issues = buildQualityIssues([{
      dataset_id: 'ds_1', table: 'gold_business', rule_count: 2, checked: 100,
      errors: 15, error_rate: 7.5, threshold: 0.001, passed: false,
      detail: [
        { rule: '종사자수 음수 금지', violations: 5 },
        { rule: 'population NULL 금지', violations: 10 },
      ],
      ran_at: new Date().toISOString(),
    }])
    expect(issues).toHaveLength(2)
    expect(issues[0].violations).toBeGreaterThanOrEqual(issues[1].violations)
  })

  it('위반 0건은 제외', () => {
    const issues = buildQualityIssues([{
      dataset_id: 'ds_1', table: 'gold_business', rule_count: 1, checked: 10,
      errors: 0, error_rate: 0, threshold: 0.001, passed: true,
      detail: [{ rule: '종사자수 음수 금지', violations: 0 }],
      ran_at: new Date().toISOString(),
    }])
    expect(issues).toHaveLength(0)
  })

  it('심각도가 issue 객체에 포함된다', () => {
    const issues = buildQualityIssues([{
      dataset_id: 'ds_1', table: 'gold_business', rule_count: 1, checked: 100,
      errors: 5, error_rate: 5, threshold: 0.001, passed: false,
      detail: [{ rule: 'population NULL 금지', violations: 5 }],
      ran_at: new Date().toISOString(),
    }])
    expect(issues[0].severity).toBe('high')
  })
})

describe('getIssueSeverity', () => {
  it('비율 50% 이상이면 critical', () => {
    expect(getIssueSeverity(500, 1000)).toBe('critical')
  })
  it('비율 1% 이상이면 high', () => {
    expect(getIssueSeverity(10, 100)).toBe('high')
  })
  it('비율 0.1% 이상이면 medium', () => {
    expect(getIssueSeverity(1, 1000)).toBe('medium')
  })
  it('위반 0건이면 low', () => {
    expect(getIssueSeverity(0, 100)).toBe('low')
  })
})

describe('buildAreaComparison', () => {
  const current = {
    id: 'h1', dataset_id: 'ds_1', table_name: 'gold_business', rule_count: 2, checked: 100,
    errors: 15, error_rate: 7.5, passed: false,
    detail: [
      { rule: 'population NULL 금지', violations: 10, area: 'completeness' as const },
      { rule: '종사자>=사업체 정합성', violations: 5, area: 'consistency' as const },
    ],
    ran_at: new Date().toISOString(),
  }
  const previous = {
    id: 'h2', dataset_id: 'ds_1', table_name: 'gold_business', rule_count: 2, checked: 100,
    errors: 8, error_rate: 4, passed: false,
    detail: [
      { rule: 'population NULL 금지', violations: 8, area: 'completeness' as const },
      { rule: '종사자>=사업체 정합성', violations: 0, area: 'consistency' as const },
    ],
    ran_at: new Date().toISOString(),
  }

  it('영역별 증감을 계산한다', () => {
    const rows = buildAreaComparison(current, previous)
    const completeness = rows.find(r => r.area === 'completeness')
    expect(completeness?.delta).toBe(2)
    const consistency = rows.find(r => r.area === 'consistency')
    expect(consistency?.delta).toBe(5)
  })

  it('이전 이력이 없으면 current 값만 반환한다', () => {
    const rows = buildAreaComparison(current, null)
    expect(rows.every(r => r.previous === 0)).toBe(true)
  })
})
