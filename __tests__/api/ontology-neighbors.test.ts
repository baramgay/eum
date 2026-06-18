import { extractNeighborSubgraph } from '@/lib/ontology/neighbors'
import type { OntologyNode, OntologyEdge } from '@/lib/ontology-utils'

function node(id: string, type = '시군', props = ''): OntologyNode {
  return { obj_id: id, label: id.toUpperCase(), obj_type: type, props }
}

function edge(src: string, dst: string, rel = '연결', weight = 1): OntologyEdge {
  return { src, dst, rel, weight }
}

describe('extractNeighborSubgraph', () => {
  const nodes: OntologyNode[] = [
    node('a'),
    node('b'),
    node('c'),
    node('d'),
    node('e'),
  ]
  const edges: OntologyEdge[] = [
    edge('a', 'b'),
    edge('b', 'c'),
    edge('c', 'd'),
    edge('e', 'd'),
  ]

  it('1-hop 이웃을 반환한다', () => {
    const result = extractNeighborSubgraph(nodes, edges, 'b', 1)
    expect(result.centerId).toBe('b')
    expect(result.hops).toBe(1)
    expect(result.nodes.map(n => n.obj_id).sort()).toEqual(['a', 'b', 'c'])
    expect(result.edges).toHaveLength(2)
  })

  it('2-hop 이웃을 반환한다', () => {
    const result = extractNeighborSubgraph(nodes, edges, 'b', 2)
    expect(result.nodes.map(n => n.obj_id).sort()).toEqual(['a', 'b', 'c', 'd'])
    expect(result.edges).toHaveLength(3)
  })

  it('존재하지 않는 노드는 빈 그래프를 반환한다', () => {
    const result = extractNeighborSubgraph(nodes, edges, 'z', 1)
    expect(result.nodes).toHaveLength(0)
    expect(result.edges).toHaveLength(0)
  })

  it('묵향 엣지를 양방향으로 탐색한다', () => {
    const result = extractNeighborSubgraph(nodes, edges, 'a', 2)
    expect(result.nodes.map(n => n.obj_id).sort()).toEqual(['a', 'b', 'c'])
  })

  it('3-hop이면 경로 끝 노드까지 포함한다', () => {
    const result = extractNeighborSubgraph(nodes, edges, 'a', 3)
    expect(result.nodes.map(n => n.obj_id).sort()).toEqual(['a', 'b', 'c', 'd'])
  })
})
