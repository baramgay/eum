import {
  parseProps,
  computeDegrees,
  getNeighborEdges,
  getNeighborIds,
  buildTypeColorMap,
} from '../../lib/ontology-utils'

describe('parseProps', () => {
  it('빈 문자열은 빈 객체를 반환한다', () => {
    expect(parseProps('')).toEqual({})
  })

  it('키=값 쌍을 파싱한다', () => {
    expect(parseProps('인구=1000;순이동=50')).toEqual({
      인구: '1000',
      순이동: '50',
    })
  })

  it('등호가 없는 키는 빈 값으로 처리한다', () => {
    expect(parseProps('키1;키2=값')).toEqual({ 키1: '', 키2: '값' })
  })

  it('양쪽 공백을 제거한다', () => {
    expect(parseProps(' 키 = 값 ')).toEqual({ 키: '값' })
  })
})

describe('computeDegrees', () => {
  const nodes = [
    { obj_id: 'a', label: 'A', obj_type: '시군', props: '' },
    { obj_id: 'b', label: 'B', obj_type: '청년인구', props: '' },
    { obj_id: 'c', label: 'C', obj_type: '사업체', props: '' },
  ]

  it('엣지가 없으면 모든 노드 차수는 0이다', () => {
    const deg = computeDegrees(nodes, [])
    expect(deg.get('a')).toBe(0)
    expect(deg.get('b')).toBe(0)
    expect(deg.get('c')).toBe(0)
  })

  it('양방향으로 차수를 계산한다', () => {
    const edges = [
      { src: 'a', rel: 'r1', dst: 'b', weight: 1 },
      { src: 'a', rel: 'r2', dst: 'c', weight: 1 },
    ]
    const deg = computeDegrees(nodes, edges)
    expect(deg.get('a')).toBe(2)
    expect(deg.get('b')).toBe(1)
    expect(deg.get('c')).toBe(1)
  })
})

describe('getNeighborEdges', () => {
  const edges = [
    { src: 'a', rel: 'r1', dst: 'b', weight: 1 },
    { src: 'b', rel: 'r2', dst: 'c', weight: 1 },
    { src: 'c', rel: 'r3', dst: 'a', weight: 1 },
  ]

  it('선택한 노드와 연결된 엣지만 반환한다', () => {
    expect(getNeighborEdges('a', edges)).toHaveLength(2)
  })

  it('연결된 엣지가 없으면 빈 배열이다', () => {
    expect(getNeighborEdges('z', edges)).toHaveLength(0)
  })
})

describe('getNeighborIds', () => {
  const edges = [
    { src: 'a', rel: 'r1', dst: 'b', weight: 1 },
    { src: 'b', rel: 'r2', dst: 'c', weight: 1 },
  ]

  it('양방향 이웃 ID를 수집한다', () => {
    expect(getNeighborIds('b', edges)).toEqual(new Set(['a', 'c']))
  })
})

describe('buildTypeColorMap', () => {
  it('모든 타입에 고유한 색상을 매핑한다', () => {
    const map = buildTypeColorMap(['시군', '청년인구', '사업체', '교통안전'])
    expect(Object.keys(map)).toHaveLength(4)
    expect(new Set(Object.values(map)).size).toBe(4)
    expect(map['시군']).toBe('#4F46E5')
  })

  it('빈 배열이면 빈 객체를 반환한다', () => {
    expect(buildTypeColorMap([])).toEqual({})
  })
})
