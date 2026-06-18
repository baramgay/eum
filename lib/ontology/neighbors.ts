/**
 * 온톨로지 이웃 확장 헬퍼
 * 중심 노드로부터 지정된 hop 수 내의 부분 그래프를 추출한다.
 */
import type { OntologyNode, OntologyEdge } from '@/lib/ontology-utils'

export interface NeighborSubgraph {
  nodes: OntologyNode[]
  edges: OntologyEdge[]
  centerId: string
  hops: number
}

export function extractNeighborSubgraph(
  nodes: OntologyNode[],
  edges: OntologyEdge[],
  centerId: string,
  hops = 1,
): NeighborSubgraph {
  const nodeMap = new Map(nodes.map(n => [n.obj_id, n]))
  if (!nodeMap.has(centerId)) {
    return { nodes: [], edges: [], centerId, hops }
  }

  const visited = new Set<string>([centerId])
  const frontier = new Set<string>([centerId])

  for (let i = 0; i < hops; i++) {
    const nextFrontier = new Set<string>()
    for (const e of edges) {
      if (frontier.has(e.src) && !visited.has(e.dst)) {
        nextFrontier.add(e.dst)
        visited.add(e.dst)
      }
      if (frontier.has(e.dst) && !visited.has(e.src)) {
        nextFrontier.add(e.src)
        visited.add(e.src)
      }
    }
    frontier.clear()
    nextFrontier.forEach(id => frontier.add(id))
  }

  const visitedIds = new Set(visited)
  const filteredNodes = nodes.filter(n => visitedIds.has(n.obj_id))
  const filteredEdges = edges.filter(e => visitedIds.has(e.src) && visitedIds.has(e.dst))

  return { nodes: filteredNodes, edges: filteredEdges, centerId, hops }
}
