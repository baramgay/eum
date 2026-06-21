/**
 * 온톨로지 그래프 레이아웃 순수 헬퍼
 * D3 의존성 없이 단위 테스트 가능한 함수들
 */

import type { OntologyNode, OntologyEdge } from '@/lib/ontology-utils'
import type { SimulationNodePosition, GraphLayoutType } from './types'

export interface Point {
  x: number
  y: number
}

/** 극좌표 → 직교좌표 변환 (d3.tree radial 좌표계용) */
export function radialToCartesian(angle: number, radius: number): Point {
  return {
    x: radius * Math.cos(angle - Math.PI / 2),
    y: radius * Math.sin(angle - Math.PI / 2),
  }
}

/** 줌 스케일 k 에 따른 LOD 레벨 */
export type LodLevel = 'full' | 'medium' | 'low' | 'minimal'

export function computeLodLevel(k: number): LodLevel {
  if (k < 0.25) return 'minimal'
  if (k < 0.5) return 'low'
  if (k < 0.85) return 'medium'
  return 'full'
}

/** k 값에 따른 노드 원 스트로크 두께 (LOD) */
export function lodStrokeWidth(k: number, focused: boolean): number {
  if (focused) return 4
  if (k < 0.25) return 0
  return 1.5
}

/** 노드 라벨 투명도를 LOD, 포커스, 타입, 사용자 설정에 따라 결정 */
export function nodeLabelOpacity(
  d: { obj_id: string; obj_type: string },
  k: number,
  showNodeLabels: boolean,
  focusId: string | null,
  focusNeighbors: Set<string> | null | undefined
): number {
  if (focusId && (d.obj_id === focusId || focusNeighbors?.has(d.obj_id))) return 1
  if (k < 0.35) return 0
  if (d.obj_type === '시군') return 1
  if (focusId && focusNeighbors?.has(d.obj_id)) return 1
  if (k >= 1.0) return 1
  if (k >= 0.65 && showNodeLabels) return 0.85
  if (showNodeLabels) return 0.55
  return 0
}

/** 관계 라벨 투명도를 LOD, 포커스, 사용자 설정에 따라 결정 */
export function linkLabelOpacity(
  d: { source: string | number | { obj_id: string }; target: string | number | { obj_id: string } },
  k: number,
  showRelLabels: boolean,
  focusId: string | null
): number {
  const s = typeof d.source === 'string' ? d.source : typeof d.source === 'number' ? String(d.source) : d.source.obj_id
  const t = typeof d.target === 'string' ? d.target : typeof d.target === 'number' ? String(d.target) : d.target.obj_id
  if (focusId && (s === focusId || t === focusId)) return 1
  if (k < 0.8) return 0
  if (k >= 1.6) return 0.85
  return showRelLabels ? 0.7 : 0
}

/** 엣지 기본 투명도를 LOD 에 따라 결정 */
export function linkBaseOpacity(k: number): number {
  if (k < 0.3) return 0.12
  if (k < 0.6) return 0.35
  return 0.7
}

/** 각 노드가 연결된 시군(부모) ID를 찾는다. 없으면 null */
export function findParentSigun(nodeId: string, edges: OntologyEdge[]): string | null {
  for (const e of edges) {
    if (e.src === nodeId && e.dst.startsWith('sigun:')) return e.dst
    if (e.dst === nodeId && e.src.startsWith('sigun:')) return e.src
  }
  return null
}

/** 시군별 클러스터 중심 좌표를 계산 (원형 배치) */
export function computeClusterCenters(
  siguns: string[],
  width: number,
  height: number,
  radius?: number
): Map<string, Point> {
  const cx = width / 2
  const cy = height / 2
  const count = siguns.length
  const r = radius ?? Math.min(width, height) * 0.36
  const map = new Map<string, Point>()
  siguns.forEach((id, i) => {
    const angle = (2 * Math.PI * i) / count - Math.PI / 2
    map.set(id, { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) })
  })
  return map
}

/** 클러스터/은하 레이아웃: 시군을 원에 배치하고 주변에 연결 노드 배치 */
export function computeClusterPositions(
  nodes: OntologyNode[],
  edges: OntologyEdge[],
  width: number,
  height: number,
  spread = 110
): Map<string, Point> {
  const siguns = nodes.filter(n => n.obj_type === '시군').map(n => n.obj_id)
  const centers = computeClusterCenters(siguns, width, height)
  const map = new Map<string, Point>()
  const parentMap = new Map<string, string>()
  nodes.forEach(n => {
    if (n.obj_type !== '시군') {
      const p = findParentSigun(n.obj_id, edges)
      if (p) parentMap.set(n.obj_id, p)
    }
  })

  const childGroups = new Map<string, string[]>()
  parentMap.forEach((sigun, childId) => {
    if (!childGroups.has(sigun)) childGroups.set(sigun, [])
    childGroups.get(sigun)!.push(childId)
  })

  siguns.forEach(id => {
    const c = centers.get(id)!
    map.set(id, { x: c.x, y: c.y })
    const children = childGroups.get(id) ?? []
    children.forEach((childId, i) => {
      const angle = (2 * Math.PI * i) / Math.max(children.length, 1) - Math.PI / 2
      const r = spread * (1 + 0.25 * Math.floor(i / 12))
      map.set(childId, {
        x: c.x + r * Math.cos(angle),
        y: c.y + r * Math.sin(angle),
      })
    })
  })

  // 연결 시군이 없는 고립 노드는 무작위 배치
  nodes.forEach(n => {
    if (!map.has(n.obj_id)) {
      map.set(n.obj_id, { x: width / 2 + (Math.random() - 0.5) * 80, y: height / 2 + (Math.random() - 0.5) * 80 })
    }
  })
  return map
}

/** 원형 레이아웃: 시군은 외곽, 도메인 노드는 내/외곽 분산 */
export function computeCircularPositions(
  nodes: OntologyNode[],
  edges: OntologyEdge[],
  width: number,
  height: number
): Map<string, Point> {
  const siguns = nodes.filter(n => n.obj_type === '시군').map(n => n.obj_id)
  const cx = width / 2
  const cy = height / 2
  const outerR = Math.min(width, height) * 0.42
  const innerR = Math.min(width, height) * 0.22
  const map = new Map<string, Point>()

  siguns.forEach((id, i) => {
    const angle = (2 * Math.PI * i) / Math.max(siguns.length, 1) - Math.PI / 2
    map.set(id, { x: cx + outerR * Math.cos(angle), y: cy + outerR * Math.sin(angle) })
  })

  const others = nodes.filter(n => n.obj_type !== '시군')
  others.forEach((n, i) => {
    const p = findParentSigun(n.obj_id, edges)
    const baseAngle = p ? Math.atan2((map.get(p)?.y ?? cy) - cy, (map.get(p)?.x ?? cx) - cx) : 0
    const offset = (i % 2 === 0 ? 1 : -1) * (Math.PI / 6) * (1 + (i % 5) * 0.15)
    const angle = baseAngle + offset
    const r = innerR + (i % 3) * 35
    map.set(n.obj_id, { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) })
  })
  return map
}

/** 노드 차수가 가장 높은 노드를 루트로 선택 (동률 시 첫 번째) */
export function findRootNodeId(nodes: OntologyNode[], edges: OntologyEdge[]): string | null {
  if (nodes.length === 0) return null
  const degree = new Map<string, number>()
  nodes.forEach(n => degree.set(n.obj_id, 0))
  edges.forEach(e => {
    degree.set(e.src, (degree.get(e.src) ?? 0) + 1)
    degree.set(e.dst, (degree.get(e.dst) ?? 0) + 1)
  })
  let rootId: string | null = null
  let max = -1
  for (const n of nodes) {
    const d = degree.get(n.obj_id) ?? 0
    if (d > max) {
      max = d
      rootId = n.obj_id
    }
  }
  return rootId
}

export interface HierarchyNode {
  id: string
  children: HierarchyNode[]
}

/** 방향 그래프를 루트 기반 트리로 변환 (사이클은 이미 방문한 노드 무시) */
export function buildHierarchy(
  nodes: OntologyNode[],
  edges: OntologyEdge[],
  rootId?: string | null
): HierarchyNode {
  const root = rootId ?? findRootNodeId(nodes, edges) ?? nodes[0].obj_id
  const nodeSet = new Set(nodes.map(n => n.obj_id))
  const adj = new Map<string, string[]>()
  nodes.forEach(n => adj.set(n.obj_id, []))
  edges.forEach(e => {
    if (nodeSet.has(e.src) && nodeSet.has(e.dst)) {
      adj.get(e.src)?.push(e.dst)
      adj.get(e.dst)?.push(e.src)
    }
  })

  const visited = new Set<string>()
  function walk(id: string): { id: string; children: ReturnType<typeof walk>[] } {
    visited.add(id)
    const children = (adj.get(id) ?? [])
      .filter(child => !visited.has(child))
      .map(child => walk(child))
    return { id, children }
  }

  const tree = walk(root)

  // 루트에서 닿지 않은 노드는 루트의 형제(자식)로 편입
  nodes.forEach(n => {
    if (!visited.has(n.obj_id)) {
      tree.children.push({ id: n.obj_id, children: [] })
      visited.add(n.obj_id)
    }
  })

  return tree
}

/** props 문자열에서 geo 좌표(lat/lng) 추출 */
export function extractGeoCoord(props: string): { lat: number; lng: number } | null {
  const m = props.match(/lat=(-?\d+\.?\d*)/i)
  const n = props.match(/lng=(-?\d+\.?\d*)/i)
  if (!m || !n) return null
  const lat = parseFloat(m[1])
  const lng = parseFloat(n[1])
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null
  return { lat, lng }
}

/** props 문자열에서 연도(year) 추출 */
export function extractYear(props: string): number | null {
  const m = props.match(/year=(\d{4})/i) ?? props.match(/(\d{4})/)
  if (!m) return null
  const y = parseInt(m[1], 10)
  if (Number.isNaN(y)) return null
  return y
}

/** 특정 레이아웃이 데이터를 요구하는지, 충족 여부 */
export function supportsLayout(
  layout: GraphLayoutType,
  nodes: OntologyNode[]
): boolean {
  if (layout === 'geo') return nodes.some(n => extractGeoCoord(n.props) !== null)
  if (layout === 'time') return nodes.some(n => extractYear(n.props) !== null)
  return true
}

/** Geo 레이아웃용 격자/배경선 (D3 의존성 없음) */
export interface GeoGridLine {
  x1: number
  y1: number
  x2: number
  y2: number
}
export interface GeoGridLabel {
  x: number
  y: number
  text: string
}
export function buildGeoGrid(width: number, height: number, steps = 5): { lines: GeoGridLine[]; labels: GeoGridLabel[] } {
  const lines: GeoGridLine[] = []
  const labels: GeoGridLabel[] = []
  const xStep = width / steps
  const yStep = height / steps
  for (let i = 1; i < steps; i++) {
    const x = i * xStep
    const y = i * yStep
    lines.push({ x1: x, y1: 0, x2: x, y2: height })
    lines.push({ x1: 0, y1: y, x2: width, y2: y })
  }
  labels.push({ x: width - 12, y: height - 12, text: 'Geo' })
  return { lines, labels }
}

/** Time 레이아웃용 연도 눈금/타입 눈금 */
export interface TimeTick {
  x: number
  y: number
  text: string
  type: 'year' | 'type'
}
export function buildTimeAxis(
  width: number,
  height: number,
  years: number[],
  types: string[]
): { ticks: TimeTick[]; xScale: (y: number) => number; yScale: (t: string) => number } {
  const uniqueYears = Array.from(new Set(years)).sort((a, b) => a - b)
  const uniqueTypes = Array.from(new Set(types)).sort((a, b) => a.localeCompare(b, 'ko'))
  const xScale = (y: number) => {
    if (uniqueYears.length <= 1) return width / 2
    const [min, max] = [uniqueYears[0], uniqueYears[uniqueYears.length - 1]]
    return 100 + ((y - min) / (max - min)) * (width - 200)
  }
  const bandHeight = uniqueTypes.length > 0 ? (height - 160) / uniqueTypes.length : height - 160
  const yScale = (t: string) => {
    const i = uniqueTypes.indexOf(t)
    if (i === -1) return height / 2
    return 80 + i * bandHeight
  }
  const ticks: TimeTick[] = []
  uniqueYears.forEach(y => {
    ticks.push({ x: xScale(y), y: height - 40, text: String(y), type: 'year' })
  })
  uniqueTypes.forEach(t => {
    ticks.push({ x: 40, y: yScale(t) + bandHeight / 2, text: t, type: 'type' })
  })
  return { ticks, xScale, yScale }
}

/**
 * Kahn's topological sort → left-to-right DAG layout (Sugiyama-style)
 * Handles cycles by falling back to degree-based ordering
 */
export function computeLineageLayout(
  nodes: OntologyNode[],
  edges: OntologyEdge[],
  width: number,
  height: number
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>()
  if (nodes.length === 0) return positions

  // Build adjacency + in-degree
  const inDegree = new Map<string, number>()
  const outAdj = new Map<string, string[]>()
  nodes.forEach(n => { inDegree.set(n.obj_id, 0); outAdj.set(n.obj_id, []) })
  edges.forEach(e => {
    if (!inDegree.has(e.dst) || !outAdj.has(e.src)) return
    inDegree.set(e.dst, (inDegree.get(e.dst) ?? 0) + 1)
    outAdj.get(e.src)!.push(e.dst)
  })

  // Kahn's BFS topological sort
  const layer = new Map<string, number>()
  const queue: string[] = []
  inDegree.forEach((deg, id) => { if (deg === 0) queue.push(id) })

  let processed = 0
  while (queue.length > 0) {
    const id = queue.shift()!
    processed++
    const currentLayer = layer.get(id) ?? 0
    outAdj.get(id)?.forEach(dst => {
      layer.set(dst, Math.max(layer.get(dst) ?? 0, currentLayer + 1))
      inDegree.set(dst, (inDegree.get(dst) ?? 1) - 1)
      if (inDegree.get(dst) === 0) queue.push(dst)
    })
  }

  // Fallback for cycle nodes: assign layer 0
  if (processed < nodes.length) {
    nodes.forEach(n => {
      if (!layer.has(n.obj_id)) layer.set(n.obj_id, 0)
    })
  }

  // Group by layer
  const byLayer = new Map<number, string[]>()
  nodes.forEach(n => {
    const l = layer.get(n.obj_id) ?? 0
    if (!byLayer.has(l)) byLayer.set(l, [])
    byLayer.get(l)!.push(n.obj_id)
  })

  const maxLayer = Math.max(...Array.from(byLayer.keys()), 0)
  const xPadding = 80
  const yPadding = 60
  const layerWidth = maxLayer > 0 ? (width - xPadding * 2) / maxLayer : width - xPadding * 2

  byLayer.forEach((ids, l) => {
    const count = ids.length
    const x = xPadding + l * layerWidth
    ids.forEach((id, i) => {
      const y = yPadding + ((i + 0.5) / count) * (height - yPadding * 2)
      positions.set(id, { x, y })
    })
  })

  return positions
}

/** BFS shortest path between two nodes (undirected) */
export function bfsPath(srcId: string, dstId: string, edges: OntologyEdge[]): string[] | null {
  if (srcId === dstId) return [srcId]
  const adj = new Map<string, string[]>()
  edges.forEach(e => {
    if (!adj.has(e.src)) adj.set(e.src, [])
    if (!adj.has(e.dst)) adj.set(e.dst, [])
    adj.get(e.src)!.push(e.dst)
    adj.get(e.dst)!.push(e.src)
  })
  const visited = new Set<string>([srcId])
  const parent = new Map<string, string>()
  const queue = [srcId]
  while (queue.length > 0) {
    const curr = queue.shift()!
    for (const next of adj.get(curr) ?? []) {
      if (visited.has(next)) continue
      visited.add(next)
      parent.set(next, curr)
      if (next === dstId) {
        const path: string[] = []
        let c: string | undefined = dstId
        while (c !== undefined) { path.unshift(c); c = parent.get(c) }
        return path
      }
      queue.push(next)
    }
  }
  return null
}

/** Worker 결과/기타 초기 위치를 SimNode 포맷으로 변환 */
export function normalizePositions(
  nodes: OntologyNode[],
  positions?: SimulationNodePosition[]
): Map<string, SimulationNodePosition> {
  const map = new Map<string, SimulationNodePosition>()
  positions?.forEach(p => map.set(p.obj_id, p))
  return map
}
