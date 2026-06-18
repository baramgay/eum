/**
 * 온톨로지 분석 오케스트레이션 — payload에 따라 순수 분석 함수를 호출한다.
 */
import type { OntologyNode, OntologyEdge } from '@/lib/ontology-utils'
import type { AnalyticsPayload, AnalyticsResult } from './types'
import {
  computeCentrality,
  detectCommunities,
  shortestPath,
  computeSimilarity,
  detectAnomalies,
} from './graph-algorithms'

export function runAnalytics(
  nodes: OntologyNode[],
  edges: OntologyEdge[],
  payload: AnalyticsPayload,
): AnalyticsResult {
  switch (payload.type) {
    case 'centrality': {
      const metric = payload.metric ?? 'degree'
      return {
        type: 'centrality',
        metric,
        results: computeCentrality(nodes, edges, metric, payload.top),
      }
    }
    case 'community':
      return { type: 'community', communities: detectCommunities(nodes, edges) }
    case 'path': {
      const source = payload.source ?? ''
      const target = payload.target ?? ''
      return {
        type: 'path',
        source,
        target,
        result: shortestPath(nodes, edges, source, target),
      }
    }
    case 'similarity': {
      const nodeId = payload.nodeId ?? ''
      return {
        type: 'similarity',
        nodeId,
        results: computeSimilarity(nodes, edges, nodeId, payload.top),
      }
    }
    case 'anomaly':
      return { type: 'anomaly', results: detectAnomalies(nodes, edges) }
    default:
      throw new Error(`지원하지 않는 분석 유형입니다: ${(payload as any).type}`)
  }
}
