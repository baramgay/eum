import {
  radialToCartesian,
  computeLodLevel,
  lodStrokeWidth,
  nodeLabelOpacity,
  linkLabelOpacity,
  findRootNodeId,
  buildHierarchy,
  extractGeoCoord,
  extractYear,
  supportsLayout,
  computeClusterPositions,
  computeCircularPositions,
  buildGeoGrid,
  buildTimeAxis,
} from '@/lib/ontology/layout-helpers'
import type { OntologyNode, OntologyEdge } from '@/lib/ontology-utils'
import type { GraphLayoutType } from '@/lib/ontology/types'

function makeNode(obj_id: string, obj_type = '개체', props = '', label = obj_id): OntologyNode {
  return { obj_id, label, obj_type, props }
}

function makeEdge(src: string, dst: string, rel = '연결', weight = 1): OntologyEdge {
  return { src, dst, rel, weight }
}

describe('radialToCartesian', () => {
  it('0 radian maps to top center', () => {
    const p = radialToCartesian(0, 100)
    expect(p.x).toBeCloseTo(0)
    expect(p.y).toBeCloseTo(-100)
  })

  it('π/2 radian maps to right center', () => {
    const p = radialToCartesian(Math.PI / 2, 100)
    expect(p.x).toBeCloseTo(100)
    expect(p.y).toBeCloseTo(0)
  })

  it('π radian maps to bottom center', () => {
    const p = radialToCartesian(Math.PI, 50)
    expect(p.x).toBeCloseTo(0)
    expect(p.y).toBeCloseTo(50)
  })

  it('scales with radius', () => {
    const p = radialToCartesian(Math.PI / 4, 10)
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(10)
  })
})

describe('computeLodLevel', () => {
  it.each([
    [0.1, 'minimal'],
    [0.24, 'minimal'],
    [0.25, 'low'],
    [0.3, 'low'],
    [0.45, 'low'],
    [0.5, 'medium'],
    [0.84, 'medium'],
    [0.85, 'full'],
    [1.5, 'full'],
  ])('k=%s → %s', (k, expected) => {
    expect(computeLodLevel(k)).toBe(expected)
  })
})

describe('lodStrokeWidth', () => {
  it('focused node keeps 4 regardless of zoom', () => {
    expect(lodStrokeWidth(0.1, true)).toBe(4)
    expect(lodStrokeWidth(2, true)).toBe(4)
  })

  it('non-focused node loses stroke below 0.25', () => {
    expect(lodStrokeWidth(0.2, false)).toBe(0)
    expect(lodStrokeWidth(0.25, false)).toBe(1.5)
    expect(lodStrokeWidth(1, false)).toBe(1.5)
  })
})

describe('nodeLabelOpacity', () => {
  const baseNode = { obj_id: 'a', obj_type: '개체' }
  const sggNode = { obj_id: 'b', obj_type: '시군' }

  it('focus overrides LOD', () => {
    expect(nodeLabelOpacity(baseNode, 0.1, false, 'a', new Set())).toBe(1)
  })

  it('neighbor overrides LOD', () => {
    expect(nodeLabelOpacity(baseNode, 0.1, false, 'x', new Set(['a']))).toBe(1)
  })

  it('hides all labels below k=0.35 even for 시군', () => {
    expect(nodeLabelOpacity(sggNode, 0.34, false, null, null)).toBe(0)
  })

  it('shows 시군 labels from k=0.35', () => {
    expect(nodeLabelOpacity(sggNode, 0.35, false, null, null)).toBe(1)
    expect(nodeLabelOpacity(baseNode, 0.35, false, null, null)).toBe(0)
  })

  it('shows 시군 labels at normal zoom', () => {
    expect(nodeLabelOpacity(sggNode, 1, false, null, null)).toBe(1)
  })

  it('shows labels when zoom is high', () => {
    expect(nodeLabelOpacity(baseNode, 1, false, null, null)).toBe(1)
  })

  it('shows labels when user toggles them at medium zoom', () => {
    expect(nodeLabelOpacity(baseNode, 0.7, true, null, null)).toBe(0.85)
  })
})

describe('linkLabelOpacity', () => {
  const link = { source: 'a', target: 'b' }

  it('focus overrides LOD', () => {
    expect(linkLabelOpacity(link, 0.1, false, 'a')).toBe(1)
  })

  it('hides all link labels below k=0.8', () => {
    expect(linkLabelOpacity(link, 0.79, true, null)).toBe(0)
  })

  it('shows link labels when toggled at normal zoom', () => {
    expect(linkLabelOpacity(link, 1, true, null)).toBe(0.7)
  })

  it('shows link labels at high zoom', () => {
    expect(linkLabelOpacity(link, 1.6, false, null)).toBe(0.85)
  })
})

describe('findRootNodeId', () => {
  it('returns null for empty nodes', () => {
    expect(findRootNodeId([], [])).toBeNull()
  })

  it('selects highest-degree node', () => {
    const nodes = [makeNode('a'), makeNode('b'), makeNode('c')]
    const edges = [makeEdge('a', 'b'), makeEdge('a', 'c'), makeEdge('b', 'c')]
    expect(findRootNodeId(nodes, edges)).toBe('a')
  })

  it('falls back to first node when no edges', () => {
    const nodes = [makeNode('x'), makeNode('y')]
    expect(findRootNodeId(nodes, [])).toBe('x')
  })
})

describe('buildHierarchy', () => {
  it('builds a tree from connected graph', () => {
    const nodes = [makeNode('a'), makeNode('b'), makeNode('c'), makeNode('d')]
    const edges = [makeEdge('a', 'b'), makeEdge('a', 'c'), makeEdge('c', 'd')]
    const tree = buildHierarchy(nodes, edges, 'a')
    expect(tree.id).toBe('a')
    const childIds = tree.children.map(c => c.id)
    expect(childIds).toContain('b')
    expect(childIds).toContain('c')
    const cTree = tree.children.find(c => c.id === 'c')
    expect(cTree?.children.map(c => c.id)).toContain('d')
  })

  it('attaches disconnected nodes as root children', () => {
    const nodes = [makeNode('a'), makeNode('b'), makeNode('c')]
    const edges = [makeEdge('a', 'b')]
    const tree = buildHierarchy(nodes, edges, 'a')
    const childIds = tree.children.map(c => c.id)
    expect(childIds).toContain('b')
    expect(childIds).toContain('c')
  })
})

describe('extractGeoCoord', () => {
  it.each([
    ['lat=37.5;lng=127.0', 37.5, 127.0],
    ['LAT=35.1;LNG=129.0', 35.1, 129.0],
    ['name=foo;lat=33;lng=120', 33, 120],
  ])('parses %s', (props, lat, lng) => {
    expect(extractGeoCoord(props)).toEqual({ lat, lng })
  })

  it('returns null when missing', () => {
    expect(extractGeoCoord('year=2020')).toBeNull()
  })
})

describe('extractYear', () => {
  it.each([
    ['year=2020', 2020],
    ['created=2021-01-01', 2021],
  ])('parses %s', (props, year) => {
    expect(extractYear(props)).toBe(year)
  })

  it('returns null when missing', () => {
    expect(extractYear('lat=37.5')).toBeNull()
  })
})

describe('cluster layouts', () => {
  const siguns = [makeNode('sigun:A', '시군'), makeNode('sigun:B', '시군')]
  const children = [makeNode('child:A1', '도메인'), makeNode('child:B1', '도메인'), makeNode('child:A2', '도메인')]
  const edges: OntologyEdge[] = [
    makeEdge('sigun:A', 'child:A1'),
    makeEdge('sigun:A', 'child:A2'),
    makeEdge('sigun:B', 'child:B1'),
  ]
  const nodes = [...siguns, ...children]

  it('computeClusterPositions places 시군 apart and children around them', () => {
    const pos = computeClusterPositions(nodes, edges, 800, 600, 100)
    const a = pos.get('sigun:A')!
    const b = pos.get('sigun:B')!
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(100)
    const a1 = pos.get('child:A1')!
    expect(Math.hypot(a1.x - a.x, a1.y - a.y)).toBeGreaterThan(50)
  })

  it('computeCircularPositions places 시군 on outer ring', () => {
    const pos = computeCircularPositions(nodes, edges, 800, 600)
    const a = pos.get('sigun:A')!
    const cx = 400
    const cy = 300
    expect(Math.abs(Math.hypot(a.x - cx, a.y - cy) - Math.min(800, 600) * 0.42)).toBeLessThan(1)
  })
})

describe('supportsLayout', () => {
  it('returns true for force/hierarchical/radial regardless of data', () => {
    const nodes = [makeNode('a')]
    ;(['force', 'hierarchical', 'radial', 'cluster', 'galaxy', 'circular'] as GraphLayoutType[]).forEach(layout => {
      expect(supportsLayout(layout, nodes)).toBe(true)
    })
  })

  it('detects geo support', () => {
    const noGeo = [makeNode('a')]
    const withGeo = [makeNode('b', '개체', 'lat=37.5;lng=127.0')]
    expect(supportsLayout('geo', noGeo)).toBe(false)
    expect(supportsLayout('geo', withGeo)).toBe(true)
  })

  it('detects time support', () => {
    const noTime = [makeNode('a')]
    const withTime = [makeNode('b', '개체', 'year=2020')]
    expect(supportsLayout('time', noTime)).toBe(false)
    expect(supportsLayout('time', withTime)).toBe(true)
  })
})

describe('buildGeoGrid', () => {
  it('returns grid lines and a label', () => {
    const { lines, labels } = buildGeoGrid(800, 600)
    expect(lines.length).toBeGreaterThan(0)
    expect(labels.length).toBe(1)
    expect(labels[0].text).toBe('Geo')
  })

  it('grid lines stay inside bounds', () => {
    const { lines } = buildGeoGrid(800, 600)
    lines.forEach(l => {
      expect(l.x1).toBeGreaterThanOrEqual(0)
      expect(l.x2).toBeLessThanOrEqual(800)
      expect(l.y1).toBeGreaterThanOrEqual(0)
      expect(l.y2).toBeLessThanOrEqual(600)
    })
  })
})

describe('buildTimeAxis', () => {
  it('creates year ticks and type ticks', () => {
    const { ticks, xScale, yScale } = buildTimeAxis(800, 600, [2020, 2021, 2022], ['A', 'B'])
    expect(ticks.some(t => t.type === 'year')).toBe(true)
    expect(ticks.some(t => t.type === 'type')).toBe(true)
    expect(xScale(2020)).toBe(100)
    expect(xScale(2022)).toBe(700)
    expect(yScale('A')).toBeGreaterThan(0)
    expect(yScale('B')).toBeGreaterThan(0)
  })

  it('handles single year', () => {
    const { xScale } = buildTimeAxis(800, 600, [2022], ['A'])
    expect(xScale(2022)).toBe(400)
  })
})
