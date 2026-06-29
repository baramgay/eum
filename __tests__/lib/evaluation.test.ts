process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'

import {
  AREAS,
  isQualityPassed,
  computeAiReadyChecklist,
  computeSubmissionContribution,
  computeSyntheticBonus,
} from '@/lib/evaluation'

describe('AREAS', () => {
  it('5개 영역이 존재한다', () => {
    expect(AREAS).toHaveLength(5)
  })

  it('각 영역에 key·name·weight·color가 있다', () => {
    AREAS.forEach(a => {
      expect(a).toHaveProperty('key')
      expect(a).toHaveProperty('name')
      expect(a).toHaveProperty('weight')
      expect(a).toHaveProperty('color')
    })
  })

  it('weight 값이 양수', () => {
    AREAS.forEach(a => expect(a.weight).toBeGreaterThan(0))
  })
})

describe('isQualityPassed', () => {
  it('null/undefined → false', () => {
    expect(isQualityPassed(null)).toBe(false)
    expect(isQualityPassed(undefined)).toBe(false)
  })

  it('"통과"로 끝나면 true', () => {
    expect(isQualityPassed('3/3 규칙 통과')).toBe(true)
  })

  it('"미통과"로 끝나면 false', () => {
    expect(isQualityPassed('1/3 규칙 미통과')).toBe(false)
  })

  it('빈 문자열 → false', () => {
    expect(isQualityPassed('')).toBe(false)
  })
})

describe('computeAiReadyChecklist', () => {
  it('체크리스트가 8개 항목', () => {
    const { checklist } = computeAiReadyChecklist({})
    expect(checklist).toHaveLength(8)
  })

  it('완전한 데이터는 ai_ready=true', () => {
    const row = {
      title: '경남 청년 인구 현황',
      description: '경남 18개 시군별 청년 인구 유출입 현황 데이터 (2018~2025)',
      theme: '인구통계',
      format: 'CSV',
      license: '공공누리 1유형',
      keywords: '청년,인구,경남',
      quality_summary: '규칙 3종 / 오류 0건 / 오류율 0% / 통과',
      rows: 100,
      is_open: true,
      updated_at: new Date().toISOString(),
      api_enabled: true,
    }
    const { ai_ready } = computeAiReadyChecklist(row)
    expect(ai_ready).toBe(true)
  })

  it('누락 필드 있으면 ai_ready=false', () => {
    const { ai_ready } = computeAiReadyChecklist({})
    expect(ai_ready).toBe(false)
  })

  it('각 항목에 name·pass·detail이 있다', () => {
    const { checklist } = computeAiReadyChecklist({})
    checklist.forEach(c => {
      expect(c).toHaveProperty('name')
      expect(c).toHaveProperty('pass')
      expect(c).toHaveProperty('detail')
    })
  })
})

describe('computeSyntheticBonus', () => {
  it('0건 → bonus_score=0', () => {
    expect(computeSyntheticBonus(0, 0).bonus_score).toBe(0)
  })

  it('합성 1건 → bonus_score=1', () => {
    expect(computeSyntheticBonus(1, 0).bonus_score).toBe(1)
  })

  it('가명 1건 → bonus_score=1', () => {
    expect(computeSyntheticBonus(0, 1).bonus_score).toBe(1)
  })

  it('합성 2건 + 가명 1건 → bonus_score=3', () => {
    const r = computeSyntheticBonus(2, 1)
    expect(r.bonus_score).toBe(3)
    expect(r.total_cases).toBe(3)
  })

  it('10건이어도 max=5 초과 불가', () => {
    expect(computeSyntheticBonus(5, 5).bonus_score).toBe(5)
  })
})

describe('computeSubmissionContribution', () => {
  it('5개 영역 기여도 반환', () => {
    const contribs = computeSubmissionContribution({})
    expect(contribs).toHaveLength(5)
  })

  it('각 항목에 key·name·contributes·note가 있다', () => {
    const contribs = computeSubmissionContribution({})
    contribs.forEach(c => {
      expect(c).toHaveProperty('key')
      expect(c).toHaveProperty('name')
      expect(c).toHaveProperty('contributes')
      expect(c).toHaveProperty('note')
    })
  })

  it('승인(approved)이면 open contributes=true', () => {
    const contribs = computeSubmissionContribution({ status: 'approved', rows: 100 })
    const open = contribs.find(c => c.key === 'open')
    expect(open?.contributes).toBe(true)
  })

  it('미제출이면 open contributes=false', () => {
    const contribs = computeSubmissionContribution({ status: 'submitted' })
    const open = contribs.find(c => c.key === 'open')
    expect(open?.contributes).toBe(false)
  })
})
