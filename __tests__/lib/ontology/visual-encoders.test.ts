import { encodeAnalyticsOverlay } from '@/lib/ontology/visual-encoders'
import type { OntologyNode, OntologyEdge } from '@/lib/ontology-utils'
import type { AnalyticsResult } from '@/lib/ontology/types'

function n(id: string, type = '시군'): OntologyNode {
  return { obj_id: id, label: id.toUpperCase(), obj_type: type, props: '' }
}

function e(src: string, dst: string, rel = '연결', weight = 1): OntologyEdge {
  return { src, dst, rel, weight }
}

const nodes = [n('a'), n('b'), n('c'), n('d')]
const edges = [e('a', 'b'), e('b', 'c'), e('c', 'd')]

describe('encodeAnalyticsOverlay', () => {
  it('encodes centrality with gradient colors and radii', () => {
    const result: AnalyticsResult = {
      type: 'centrality',
      metric: 'degree',
      results: [
        { obj_id: 'b', label: 'B', obj_type: '시군', score: 2, rank: 1 },
        { obj_id: 'a', label: 'A', obj_type: '시군', score: 1, rank: 2 },
      ],
    }
    const enc = encodeAnalyticsOverlay(nodes, edges, result)
    expect(enc.nodeColors.has('a')).toBe(true)
    expect(enc.nodeColors.has('b')).toBe(true)
    expect(enc.nodeRadii.get('b')).toBeGreaterThan(enc.nodeRadii.get('a')!)
    expect(enc.legend.length).toBe(2)
  })

  it('encodes communities with distinct colors', () => {
    const result: AnalyticsResult = {
      type: 'community',
      communities: [
        { communityId: 0, nodes: [{ obj_id: 'a', label: 'A', obj_type: '시군' }], size: 1, density: 0 },
        { communityId: 1, nodes: [{ obj_id: 'b', label: 'B', obj_type: '시군' }], size: 1, density: 0 },
      ],
    }
    const enc = encodeAnalyticsOverlay(nodes, edges, result)
    expect(enc.nodeColors.get('a')).not.toBe(enc.nodeColors.get('b'))
    expect(enc.legend.length).toBe(2)
  })

  it('encodes path nodes and edges', () => {
    const result: AnalyticsResult = {
      type: 'path',
      source: 'a',
      target: 'd',
      result: {
        path: ['a', 'b', 'c', 'd'],
        labels: ['A', 'B', 'C', 'D'],
        distance: 3,
        edges: [
          { src: 'a', rel: '연결', dst: 'b', weight: 1 },
          { src: 'b', rel: '연결', dst: 'c', weight: 1 },
          { src: 'c', rel: '연결', dst: 'd', weight: 1 },
        ],
      },
    }
    const enc = encodeAnalyticsOverlay(nodes, edges, result)
    expect(enc.nodeRadii.get('b')).toBe(16)
    expect(enc.edgeWidths.get('a|연결|b')).toBe(3.5)
    expect(enc.edgeColors.get('b|연결|c')).toBe('#F59E0B')
    expect(enc.legend.some(l => l.type === 'edge')).toBe(true)
  })

  it('encodes similarity with source node highlighted', () => {
    const result: AnalyticsResult = {
      type: 'similarity',
      nodeId: 'a',
      results: [
        { obj_id: 'b', label: 'B', obj_type: '시군', score: 0.8 },
        { obj_id: 'c', label: 'C', obj_type: '시군', score: 0.4 },
      ],
    }
    const enc = encodeAnalyticsOverlay(nodes, edges, result)
    expect(enc.nodeRadii.get('a')).toBe(18)
    expect(enc.nodeRadii.get('b')).toBeGreaterThan(enc.nodeRadii.get('c')!)
    expect(enc.legend.length).toBeGreaterThanOrEqual(2)
  })

  it('encodes anomalies with red color and scaled radii', () => {
    const result: AnalyticsResult = {
      type: 'anomaly',
      results: [
        { obj_id: 'a', label: 'A', obj_type: '시군', zScore: 3.5, reason: 'test' },
        { obj_id: 'd', label: 'D', obj_type: '시군', zScore: 2.1, reason: 'test' },
      ],
    }
    const enc = encodeAnalyticsOverlay(nodes, edges, result)
    expect(enc.nodeColors.get('a')).toBe('#EF4444')
    expect(enc.nodeRadii.get('a')).toBeGreaterThan(enc.nodeRadii.get('d')!)
    expect(enc.legend.length).toBe(1)
  })

  it('returns empty encoding for null path result', () => {
    const result: AnalyticsResult = {
      type: 'path',
      source: 'a',
      target: 'd',
      result: null,
    }
    const enc = encodeAnalyticsOverlay(nodes, edges, result)
    expect(enc.nodeColors.size).toBe(0)
    expect(enc.legend.length).toBe(0)
  })
})
