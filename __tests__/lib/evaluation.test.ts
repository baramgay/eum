import {
  AREAS,
  isQualityPassed,
  computeAiReadyChecklist,
  computeSubmissionContribution,
} from '@/lib/evaluation'

describe('AREAS', () => {
  it('5개 영역이 존재한다', () => {
    expect(AREAS).toHaveLength(5)
  })

  it('가중치 합이 1.0', () => {
    const sum = AREAS.reduce((acc, a) => acc + a.weight, 0)
    expect(sum).toBeCloseTo(1.0)
  })

  it('각 영역에 color가 있다', () => {
    AREAS.forEach(a => expect(a.color).toBeTruthy())
  })
})

describe('isQualityPassed', () => {
  it('null/undefined → false', () => {
    expect(isQualityPassed(null)).toBe(false)
    expect(isQualityPassed(undefined)).toBe(false)
  })

  it('통과 포함 문자열 → true', () => {
    expect(isQualityPassed('3/3 규칙 통과')).toBe(true)
  })

  it('실패 포함 문자열 → false', () => {
    expect(isQualityPassed('1/3 규칙 통과, 2 실패')).toBe(false)
  })
})

describe('computeAiReadyChecklist', () => {
  it('체크리스트가 5개 항목', () => {
    const row = {
      title: '테스트', description: '설명', theme: '인구', format: 'CSV',
      license: '공공누리', keywords: 'test',
      quality_summary: '모든 규칙 통과',
    }
    const { checklist } = computeAiReadyChecklist(row)
    expect(checklist).toHaveLength(5)
  })

  it('완전한 데이터는 ai_ready=true', () => {
    const row = {
      title: '제목', description: '설명있음', theme: '경제', format: 'CSV',
      license: '공공누리', keywords: 'k1,k2',
      quality_summary: '3/3 통과',
    }
    const { ai_ready } = computeAiReadyChecklist(row)
    expect(ai_ready).toBe(true)
  })

  it('누락 필드 있으면 ai_ready=false', () => {
    const { ai_ready } = computeAiReadyChecklist({})
    expect(ai_ready).toBe(false)
  })
})

describe('computeSubmissionContribution', () => {
  it('5개 영역 기여도 반환', () => {
    const contribs = computeSubmissionContribution({
      title: '제목', description: '설명', theme: '인구', format: 'CSV',
      license: '공공누리', keywords: 'k', quality_summary: '통과',
    })
    expect(contribs).toHaveLength(5)
    contribs.forEach(c => {
      expect(c).toHaveProperty('area')
      expect(c).toHaveProperty('score')
    })
  })
})
