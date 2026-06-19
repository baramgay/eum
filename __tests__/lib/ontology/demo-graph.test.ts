import {
  buildDemoGraph,
  extractNodeKpis,
  SCENARIO_META,
} from '@/lib/ontology/demo-graph'
import type { ScenarioKey } from '@/lib/ontology/demo-graph'

const SCENARIOS: ScenarioKey[] = ['youth-exodus', 'service-gap', 'industry-cluster', 'env-risk']

describe('SCENARIO_META', () => {
  it('has 4 entries', () => {
    expect(SCENARIO_META).toHaveLength(4)
  })

  it.each(SCENARIOS)('%s has required fields', (key) => {
    const meta = SCENARIO_META.find(m => m.key === key)
    expect(meta).toBeDefined()
    expect(meta!.title).toBeTruthy()
    expect(meta!.dataSources.length).toBeGreaterThan(0)
    expect(meta!.nodeCount).toBeTruthy()
    expect(meta!.edgeCount).toBeTruthy()
  })
})

describe('buildDemoGraph', () => {
  it.each(SCENARIOS)('%s returns valid graph', (key) => {
    const graph = buildDemoGraph(key)
    expect(graph.nodes.length).toBeGreaterThan(0)
    expect(graph.edges.length).toBeGreaterThan(0)
  })

  it.each(SCENARIOS)('%s nodes have required fields', (key) => {
    const { nodes } = buildDemoGraph(key)
    for (const n of nodes) {
      expect(n.obj_id).toBeTruthy()
      expect(n.label).toBeTruthy()
      expect(n.obj_type).toBeTruthy()
      expect(typeof n.props).toBe('string')
    }
  })

  it.each(SCENARIOS)('%s edges reference existing nodes', (key) => {
    const { nodes, edges } = buildDemoGraph(key)
    const ids = new Set(nodes.map(n => n.obj_id))
    for (const e of edges) {
      expect(ids.has(e.src)).toBe(true)
      expect(ids.has(e.dst)).toBe(true)
    }
  })

  it.each(SCENARIOS)('%s has no duplicate node ids', (key) => {
    const { nodes } = buildDemoGraph(key)
    const ids = nodes.map(n => n.obj_id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('youth-exodus: 18 sigun nodes', () => {
    const { nodes } = buildDemoGraph('youth-exodus')
    const sigunNodes = nodes.filter(n => n.obj_type === '시군')
    expect(sigunNodes).toHaveLength(18)
  })

  it('service-gap: has service domain hub nodes', () => {
    const { nodes } = buildDemoGraph('service-gap')
    const domainNodes = nodes.filter(n => n.obj_type === '서비스도메인')
    expect(domainNodes.length).toBeGreaterThan(0)
  })

  it('industry-cluster: has industry nodes', () => {
    const { nodes } = buildDemoGraph('industry-cluster')
    const industryNodes = nodes.filter(n => n.obj_type === '업종')
    expect(industryNodes.length).toBeGreaterThan(0)
  })

  it('env-risk: all nodes have risk_score prop', () => {
    const { nodes } = buildDemoGraph('env-risk')
    const sigunNodes = nodes.filter(n => n.obj_type === '시군')
    for (const n of sigunNodes) {
      expect(n.props).toMatch(/risk_score=/)
    }
  })

  it('env-risk: edges connect adjacent sigun nodes', () => {
    const { edges } = buildDemoGraph('env-risk')
    const neighborEdges = edges.filter(e => e.rel === '인접')
    expect(neighborEdges.length).toBeGreaterThan(0)
  })

  it('all scenarios produce non-empty graphs', () => {
    for (const key of SCENARIOS) {
      const { nodes, edges } = buildDemoGraph(key)
      expect(nodes.length).toBeGreaterThan(0)
      expect(edges.length).toBeGreaterThan(0)
    }
  })
})

describe('extractNodeKpis', () => {
  it('returns array for valid scenario/node', () => {
    const { nodes } = buildDemoGraph('youth-exodus')
    const sigun = nodes.find(n => n.obj_type === '시군')!
    const kpis = extractNodeKpis('youth-exodus', sigun.obj_id, sigun.props)
    expect(Array.isArray(kpis)).toBe(true)
    expect(kpis.length).toBeGreaterThan(0)
  })

  it('kpi items have label and value', () => {
    const { nodes } = buildDemoGraph('env-risk')
    const sigun = nodes.find(n => n.obj_type === '시군')!
    const kpis = extractNodeKpis('env-risk', sigun.obj_id, sigun.props)
    for (const kpi of kpis) {
      expect(kpi.label).toBeTruthy()
      expect(kpi.value).toBeDefined()
    }
  })

  it('returns empty for unknown scenario', () => {
    const kpis = extractNodeKpis('unknown' as ScenarioKey, 'id', '')
    expect(kpis).toEqual([])
  })

  it('highlight flag set for high-risk nodes in env-risk', () => {
    const { nodes } = buildDemoGraph('env-risk')
    const sigunNodes = nodes.filter(n => n.obj_type === '시군')
    const kpiSets = sigunNodes.map(n => extractNodeKpis('env-risk', n.obj_id, n.props))
    // at least one node should have a highlighted KPI (high risk)
    const hasHighlight = kpiSets.some(kpis => kpis.some(k => k.highlight))
    expect(hasHighlight).toBe(true)
  })
})
