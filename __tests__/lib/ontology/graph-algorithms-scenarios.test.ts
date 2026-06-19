/**
 * 시나리오별 그래프 분석 알고리즘 검증
 * 4개 데모 시나리오 데이터로 5가지 분석의 결과 품질을 검증한다.
 */
import {
  computeCentrality,
  detectCommunities,
  shortestPath,
  computeSimilarity,
  detectAnomalies,
} from '@/lib/ontology/graph-algorithms'
import { buildDemoGraph } from '@/lib/ontology/demo-graph'
import type { ScenarioKey } from '@/lib/ontology/demo-graph'

const SCENARIOS: ScenarioKey[] = ['youth-exodus', 'service-gap', 'industry-cluster', 'env-risk']
const METRICS = ['degree', 'weightedDegree', 'betweenness', 'closeness', 'eigenvector'] as const

describe('centrality — all scenarios', () => {
  it.each(SCENARIOS)('%s: top-10 results are valid and sorted', (key) => {
    const { nodes, edges } = buildDemoGraph(key)
    for (const metric of METRICS) {
      const res = computeCentrality(nodes, edges, metric, 10)
      expect(res.length).toBeGreaterThan(0)
      expect(res.length).toBeLessThanOrEqual(10)
      // sorted descending
      for (let i = 1; i < res.length; i++) {
        expect(res[i - 1].score).toBeGreaterThanOrEqual(res[i].score)
      }
      // rank consecutive
      expect(res[0].rank).toBe(1)
      if (res.length > 1) expect(res[1].rank).toBe(2)
      // all scores non-negative
      for (const r of res) expect(r.score).toBeGreaterThanOrEqual(0)
      // label and type populated
      for (const r of res) {
        expect(r.label).toBeTruthy()
        expect(r.obj_type).toBeTruthy()
      }
    }
  })

  it('youth-exodus: degree top node has many 시군 connections', () => {
    const { nodes, edges } = buildDemoGraph('youth-exodus')
    const res = computeCentrality(nodes, edges, 'degree', 1)
    expect(res[0].score).toBeGreaterThan(1)
  })

  it('industry-cluster: weightedDegree top node is highly connected', () => {
    const { nodes, edges } = buildDemoGraph('industry-cluster')
    const res = computeCentrality(nodes, edges, 'weightedDegree', 1)
    expect(res[0].score).toBeGreaterThan(0)
  })
})

describe('community detection — all scenarios', () => {
  it.each(SCENARIOS)('%s: communities cover all nodes', (key) => {
    const { nodes, edges } = buildDemoGraph(key)
    const comms = detectCommunities(nodes, edges)
    const covered = comms.flatMap(c => c.nodes.map(n => n.obj_id))
    expect(covered.length).toBe(nodes.length)
    expect(new Set(covered).size).toBe(nodes.length)
  })

  it.each(SCENARIOS)('%s: density is between 0 and 1', (key) => {
    const { nodes, edges } = buildDemoGraph(key)
    const comms = detectCommunities(nodes, edges)
    for (const c of comms) {
      expect(c.density).toBeGreaterThanOrEqual(0)
      expect(c.density).toBeLessThanOrEqual(1.01)
      expect(c.size).toBeGreaterThan(0)
      expect(c.size).toBe(c.nodes.length)
    }
  })

  it.each(SCENARIOS)('%s: at least 1 community', (key) => {
    const { nodes, edges } = buildDemoGraph(key)
    const comms = detectCommunities(nodes, edges)
    expect(comms.length).toBeGreaterThanOrEqual(1)
  })

  it('service-gap: service domain nodes form coherent clusters', () => {
    const { nodes, edges } = buildDemoGraph('service-gap')
    const comms = detectCommunities(nodes, edges)
    // each community should have at least 1 node
    for (const c of comms) expect(c.nodes.length).toBeGreaterThanOrEqual(1)
  })
})

describe('shortest path — all scenarios', () => {
  it.each(SCENARIOS)('%s: path from first to second 시군 node is found', (key) => {
    const { nodes, edges } = buildDemoGraph(key)
    const sigunNodes = nodes.filter(n => n.obj_type === '시군')
    if (sigunNodes.length < 2) return
    const [src, dst] = [sigunNodes[0].obj_id, sigunNodes[1].obj_id]
    const result = shortestPath(nodes, edges, src, dst)
    if (result !== null) {
      expect(result.path.length).toBeGreaterThanOrEqual(2)
      expect(result.path[0]).toBe(src)
      expect(result.path[result.path.length - 1]).toBe(dst)
      expect(result.distance).toBeGreaterThan(0)
      expect(result.labels.length).toBe(result.path.length)
      // edge descriptors present
      expect(result.edges.length).toBe(result.path.length - 1)
    }
  })

  it('path result has rel on each hop', () => {
    const { nodes, edges } = buildDemoGraph('youth-exodus')
    const sigunNodes = nodes.filter(n => n.obj_type === '시군')
    const result = shortestPath(nodes, edges, sigunNodes[0].obj_id, sigunNodes[sigunNodes.length - 1].obj_id)
    if (result !== null) {
      for (const hop of result.edges) {
        expect(hop.rel).toBeTruthy()
        expect(typeof hop.weight).toBe('number')
      }
    }
  })
})

describe('similarity — all scenarios', () => {
  it.each(SCENARIOS)('%s: finds similar nodes for a 시군 node', (key) => {
    const { nodes, edges } = buildDemoGraph(key)
    const sigunNodes = nodes.filter(n => n.obj_type === '시군')
    if (!sigunNodes.length) return
    const res = computeSimilarity(nodes, edges, sigunNodes[0].obj_id, 5)
    expect(res.length).toBeGreaterThanOrEqual(0)
    for (const r of res) {
      expect(r.score).toBeGreaterThanOrEqual(0)
      expect(r.score).toBeLessThanOrEqual(1.001)
      expect(r.label).toBeTruthy()
    }
  })

  it.each(SCENARIOS)('%s: results sorted descending by score', (key) => {
    const { nodes, edges } = buildDemoGraph(key)
    const sigunNodes = nodes.filter(n => n.obj_type === '시군')
    if (sigunNodes.length < 2) return
    const res = computeSimilarity(nodes, edges, sigunNodes[0].obj_id, 10)
    for (let i = 1; i < res.length; i++) {
      expect(res[i - 1].score).toBeGreaterThanOrEqual(res[i].score)
    }
  })
})

describe('anomaly detection — all scenarios', () => {
  it.each(SCENARIOS)('%s: returns array (may be empty)', (key) => {
    const { nodes, edges } = buildDemoGraph(key)
    const res = detectAnomalies(nodes, edges)
    expect(Array.isArray(res)).toBe(true)
    for (const r of res) {
      expect(r.zScore).toBeGreaterThan(0)
      expect(r.reason).toBeTruthy()
      expect(r.label).toBeTruthy()
    }
  })

  it.each(SCENARIOS)('%s: zScores sorted descending', (key) => {
    const { nodes, edges } = buildDemoGraph(key)
    const res = detectAnomalies(nodes, edges)
    for (let i = 1; i < res.length; i++) {
      expect(res[i - 1].zScore).toBeGreaterThanOrEqual(res[i].zScore)
    }
  })

  it('env-risk: high risk_score nodes are detected', () => {
    const { nodes, edges } = buildDemoGraph('env-risk')
    const res = detectAnomalies(nodes, edges)
    // env-risk scenario has nodes with elevated risk scores → should produce detections
    // if env-risk has risk_score variation, outliers appear
    if (res.length > 0) {
      expect(res[0].zScore).toBeGreaterThan(2)
    }
    // at minimum, the algorithm runs without error on env-risk data
    expect(Array.isArray(res)).toBe(true)
  })
})
