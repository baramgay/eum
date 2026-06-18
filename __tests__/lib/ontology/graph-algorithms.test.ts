import {
  computeCentrality,
  detectCommunities,
  shortestPath,
  computeSimilarity,
  detectAnomalies,
} from '@/lib/ontology/graph-algorithms'
import type { OntologyNode, OntologyEdge } from '@/lib/ontology-utils'

function n(id: string, type = '시군', props = ''): OntologyNode {
  return { obj_id: id, label: id.toUpperCase(), obj_type: type, props }
}

function e(src: string, dst: string, weight = 1, rel = '연결'): OntologyEdge {
  return { src, dst, rel, weight }
}

describe('computeCentrality', () => {
  describe('star graph', () => {
    const nodes = [n('c'), n('a1'), n('a2'), n('a3'), n('a4')]
    const edges = [e('c', 'a1'), e('c', 'a2'), e('c', 'a3'), e('c', 'a4')]

    it('degree: center has highest degree', () => {
      const res = computeCentrality(nodes, edges, 'degree')
      expect(res[0].obj_id).toBe('c')
      expect(res[0].score).toBe(4)
    })

    it('betweenness: center has highest betweenness', () => {
      const res = computeCentrality(nodes, edges, 'betweenness')
      expect(res[0].obj_id).toBe('c')
      expect(res[0].score).toBeCloseTo(1, 5)
    })

    it('closeness: center ranks first', () => {
      const res = computeCentrality(nodes, edges, 'closeness')
      expect(res[0].obj_id).toBe('c')
    })
  })

  describe('chain graph', () => {
    const nodes = [n('a'), n('b'), n('c'), n('d'), n('e')]
    const edges = [e('a', 'b'), e('b', 'c'), e('c', 'd'), e('d', 'e')]

    it('shortest path follows the chain', () => {
      const path = shortestPath(nodes, edges, 'a', 'e')
      expect(path).not.toBeNull()
      expect(path!.path).toEqual(['a', 'b', 'c', 'd', 'e'])
      expect(path!.distance).toBeCloseTo(4, 5)
    })

    it('closeness: middle node has highest closeness', () => {
      const res = computeCentrality(nodes, edges, 'closeness')
      expect(res[0].obj_id).toBe('c')
    })

    it('eigenvector: middle nodes rank higher than endpoints', () => {
      const res = computeCentrality(nodes, edges, 'eigenvector')
      const middleRanks = [res.findIndex(r => r.obj_id === 'b'), res.findIndex(r => r.obj_id === 'd')]
      const endpointRanks = [res.findIndex(r => r.obj_id === 'a'), res.findIndex(r => r.obj_id === 'e')]
      expect(Math.max(...middleRanks)).toBeLessThan(Math.min(...endpointRanks))
    })
  })

  it('weightedDegree sums edge weights', () => {
    const nodes = [n('a'), n('b'), n('c')]
    const edges = [e('a', 'b', 3), e('a', 'c', 2)]
    const res = computeCentrality(nodes, edges, 'weightedDegree')
    expect(res[0].obj_id).toBe('a')
    expect(res[0].score).toBe(5)
  })
})

describe('detectCommunities', () => {
  it('two-clique graph: finds two communities', () => {
    const nodes = [n('a1'), n('a2'), n('a3'), n('b1'), n('b2'), n('b3')]
    const edges = [
      e('a1', 'a2'), e('a2', 'a3'), e('a1', 'a3'), // clique A
      e('b1', 'b2'), e('b2', 'b3'), e('b1', 'b3'), // clique B
      e('a1', 'b1', 1), // single bridge
    ]
    const communities = detectCommunities(nodes, edges)
    expect(communities.length).toBeGreaterThanOrEqual(2)
    const ids = communities.map(c => c.nodes.map(n => n.obj_id).sort())
    const aIds = ['a1', 'a2', 'a3']
    const bIds = ['b1', 'b2', 'b3']
    const hasA = ids.some(group => aIds.every(id => group.includes(id)))
    const hasB = ids.some(group => bIds.every(id => group.includes(id)))
    expect(hasA || hasB).toBe(true)
  })
})

describe('shortestPath', () => {
  it('returns null when target is unreachable', () => {
    const nodes = [n('a'), n('b'), n('c')]
    const edges = [e('a', 'b')]
    expect(shortestPath(nodes, edges, 'a', 'c')).toBeNull()
  })

  it('prefers high-weight edge', () => {
    const nodes = [n('a'), n('b'), n('c'), n('d')]
    const edges = [
      e('a', 'b', 1),
      e('b', 'd', 1),
      e('a', 'c', 100),
      e('c', 'd', 100),
    ]
    const path = shortestPath(nodes, edges, 'a', 'd')
    expect(path!.path).toEqual(['a', 'c', 'd'])
  })
})

describe('computeSimilarity', () => {
  const nodes: OntologyNode[] = [
    { obj_id: 's1', label: 'S1', obj_type: '시군', props: '인구=1000;종사자=200;사업체=50;순이동=30' },
    { obj_id: 's2', label: 'S2', obj_type: '시군', props: '인구=1100;종사자=210;사업체=55;순이동=35' },
    { obj_id: 's3', label: 'S3', obj_type: '시군', props: '인구=10;종사자=5;사업체=1;순이동=0' },
    { obj_id: 'x1', label: 'X1', obj_type: '기타', props: '' },
  ]
  const edges: OntologyEdge[] = [
    e('s1', 'x1'),
    e('s2', 'x1'),
    e('s3', 'x1'),
  ]

  it('ranks s2 as most similar to s1', () => {
    const res = computeSimilarity(nodes, edges, 's1')
    expect(res[0].obj_id).toBe('s2')
  })

  it('supports top parameter', () => {
    const res = computeSimilarity(nodes, edges, 's1', 2)
    expect(res).toHaveLength(2)
  })
})

describe('detectAnomalies', () => {
  const nodes: OntologyNode[] = [
    { obj_id: 's1', label: 'S1', obj_type: '시군', props: '인구=1000;종사자=200;사업체=50;순이동=30' },
    { obj_id: 's2', label: 'S2', obj_type: '시군', props: '인구=1100;종사자=210;사업체=55;순이동=35' },
    { obj_id: 's3', label: 'S3', obj_type: '시군', props: '인구=1050;종사자=205;사업체=52;순이동=32' },
    { obj_id: 's4', label: 'S4', obj_type: '시군', props: '인구=1080;종사자=208;사업체=51;순이동=33' },
    { obj_id: 's5', label: 'S5', obj_type: '시군', props: '인구=1020;종사자=202;사업체=49;순이동=31' },
    { obj_id: 's6', label: 'S6', obj_type: '시군', props: '인구=1120;종사자=215;사업체=56;순이동=36' },
    { obj_id: 's7', label: 'S7', obj_type: '시군', props: '인구=1060;종사자=207;사업체=53;순이동=34' },
    { obj_id: 's8', label: 'S8', obj_type: '시군', props: '인구=1030;종사자=203;사업체=48;순이동=29' },
    { obj_id: 's9', label: 'S9', obj_type: '시군', props: '인구=1090;종사자=211;사업체=54;순이동=37' },
    { obj_id: 's10', label: 'S10', obj_type: '시군', props: '인구=1040;종사자=204;사업체=50;순이동=28' },
    { obj_id: 'outlier', label: 'OUT', obj_type: '시군', props: '인구=1000000;종사자=10;사업체=5;순이동=-50000' },
  ]
  const edges: OntologyEdge[] = [
    e('s1', 's2'), e('s2', 's3'), e('s3', 's4'), e('s4', 's5'),
    e('s5', 's6'), e('s6', 's7'), e('s7', 's8'), e('s8', 's9'),
    e('s9', 's10'), e('s10', 's1'),
    e('outlier', 's1'), e('outlier', 's2'), e('outlier', 's3'),
  ]

  it('detects outlier as top outlier', () => {
    const res = detectAnomalies(nodes, edges)
    expect(res[0].obj_id).toBe('outlier')
    expect(res[0].zScore).toBeGreaterThan(2)
  })
})
