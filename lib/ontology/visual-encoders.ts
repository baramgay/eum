/**
 * 온톨로지 분석 결과 → D3 그래프 시각적 인코딩
 * lib/ontology/graph-algorithms.ts 의 분석 결과를 받아
 * 노드/엣지의 색상·크기·두께를 결정한다.
 */

import type { OntologyNode, OntologyEdge } from '@/lib/ontology-utils'
import type { AnalyticsResult, VisualEncoding } from './types'

const CENTRALITY_LOW = '#93C5FD' // blue-300
const CENTRALITY_HIGH = '#DC2626' // red-600
const SIMILARITY_LOW = '#60A5FA' // blue-400
const SIMILARITY_HIGH = '#EF4444' // red-500

const COMMUNITY_PALETTE = [
  '#22C55E', // green-500
  '#3B82F6', // blue-500
  '#F59E0B', // amber-500
  '#EF4444', // red-500
  '#8B5CF6', // violet-500
  '#EC4899', // pink-500
  '#14B8A6', // teal-500
  '#F97316', // orange-500
  '#6366F1', // indigo-500
  '#84CC16', // lime-500
]

const PATH_COLOR = '#F59E0B'
const PATH_STROKE = '#FDE68A'
const SOURCE_COLOR = '#F59E0B'
const SOURCE_STROKE = '#FDE68A'
const ANOMALY_COLOR = '#EF4444'
const ANOMALY_STROKE = '#FCA5A5'

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace('#', '')
  const bigint = parseInt(normalized, 16)
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255,
  }
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function interpolateColor(low: string, high: string, t: number): string {
  const clamped = Math.max(0, Math.min(1, t))
  const a = hexToRgb(low)
  const b = hexToRgb(high)
  return rgbToHex(
    a.r + (b.r - a.r) * clamped,
    a.g + (b.g - a.g) * clamped,
    a.b + (b.b - a.b) * clamped,
  )
}

function edgeKey(e: { src: string; rel: string; dst: string }): string {
  return `${e.src}|${e.rel}|${e.dst}`
}

export function encodeAnalyticsOverlay(
  _nodes: OntologyNode[],
  _edges: OntologyEdge[],
  result: AnalyticsResult,
): VisualEncoding {
  const enc: VisualEncoding = {
    nodeColors: new Map(),
    nodeRadii: new Map(),
    nodeStrokes: new Map(),
    edgeColors: new Map(),
    edgeWidths: new Map(),
    legend: [],
  }

  switch (result.type) {
    case 'centrality': {
      const maxScore = Math.max(...result.results.map(r => r.score), 1e-12)
      for (const r of result.results) {
        const t = r.score / maxScore
        enc.nodeColors.set(r.obj_id, interpolateColor(CENTRALITY_LOW, CENTRALITY_HIGH, t))
        enc.nodeRadii.set(r.obj_id, 8 + t * 18)
      }
      enc.legend = [
        { color: CENTRALITY_LOW, label: '낮은 중심성', type: 'node' },
        { color: CENTRALITY_HIGH, label: '높은 중심성', type: 'node' },
      ]
      break
    }

    case 'community': {
      for (const c of result.communities) {
        const color = COMMUNITY_PALETTE[c.communityId % COMMUNITY_PALETTE.length]
        for (const n of c.nodes) {
          enc.nodeColors.set(n.obj_id, color)
        }
        enc.legend.push({ color, label: `커뮤니티 ${c.communityId} (${c.size})`, type: 'node' })
      }
      break
    }

    case 'path': {
      if (result.result) {
        for (const id of result.result.path) {
          enc.nodeColors.set(id, PATH_COLOR)
          enc.nodeRadii.set(id, 16)
          enc.nodeStrokes.set(id, PATH_STROKE)
        }
        for (const e of result.result.edges) {
          enc.edgeColors.set(edgeKey(e), PATH_COLOR)
          enc.edgeWidths.set(edgeKey(e), 3.5)
        }
        enc.legend = [
          { color: PATH_COLOR, label: '최단 경로 노드', type: 'node' },
          { color: PATH_COLOR, label: '최단 경로 엣지', type: 'edge' },
        ]
      }
      break
    }

    case 'similarity': {
      const maxScore = Math.max(...result.results.map(r => r.score), 1e-12)
      enc.nodeColors.set(result.nodeId, SOURCE_COLOR)
      enc.nodeRadii.set(result.nodeId, 18)
      enc.nodeStrokes.set(result.nodeId, SOURCE_STROKE)
      for (const r of result.results) {
        const t = r.score / maxScore
        enc.nodeColors.set(r.obj_id, interpolateColor(SIMILARITY_LOW, SIMILARITY_HIGH, t))
        enc.nodeRadii.set(r.obj_id, 8 + t * 12)
      }
      enc.legend = [
        { color: SOURCE_COLOR, label: '기준 노드', type: 'node' },
        { color: SIMILARITY_LOW, label: '낮은 유사도', type: 'node' },
        { color: SIMILARITY_HIGH, label: '높은 유사도', type: 'node' },
      ]
      break
    }

    case 'anomaly': {
      const maxZ = Math.max(...result.results.map(r => r.zScore), 1e-12)
      for (const r of result.results) {
        const t = r.zScore / maxZ
        enc.nodeColors.set(r.obj_id, ANOMALY_COLOR)
        enc.nodeRadii.set(r.obj_id, 8 + t * 14)
        enc.nodeStrokes.set(r.obj_id, ANOMALY_STROKE)
      }
      enc.legend = [{ color: ANOMALY_COLOR, label: '이상 노드', type: 'node' }]
      break
    }
  }

  return enc
}
