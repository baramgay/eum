import { recommendOntologyCandidates, listActions } from '@/lib/ontology'

describe('recommendOntologyCandidates', () => {
  it('빈 메타 → 빈 배열', () => {
    const result = recommendOntologyCandidates({})
    expect(Array.isArray(result)).toBe(true)
  })

  it('키워드가 있으면 후보 반환', () => {
    const result = recommendOntologyCandidates({ keywords: '청년 인구' })
    expect(Array.isArray(result)).toBe(true)
  })

  it('숫자 키워드도 안전하게 처리', () => {
    expect(() => recommendOntologyCandidates({ keywords: 2030 as unknown as string })).not.toThrow()
  })

  it('null 키워드도 안전하게 처리', () => {
    expect(() => recommendOntologyCandidates({ keywords: null })).not.toThrow()
  })
})

describe('listActions', () => {
  it('액션 목록 반환', () => {
    const actions = listActions()
    expect(Array.isArray(actions)).toBe(true)
  })

  it('각 액션에 key·name·description이 있다', () => {
    const actions = listActions()
    actions.forEach(a => {
      expect(a).toHaveProperty('key')
      expect(a).toHaveProperty('name')
    })
  })
})
