/**
 * 온톨로지 공용 유틸리티 — 클라이언트·서버 양쪽에서 사용
 */

export interface OntologyNode {
  obj_id: string
  label: string
  obj_type: string
  props: string
  /** DB props_jsonb 컬럼에 쓰일 JSONB 표현 (선택) */
  props_jsonb?: Record<string, unknown>
}

export interface OntologyEdge {
  src: string
  rel: string
  dst: string
  weight: number
}

export type NodeBadgeVariant = 'blue' | 'green' | 'amber' | 'purple' | 'gray'

export const TYPE_PALETTE = [
  '#4F46E5', '#EC4899', '#F59E0B', '#10B981', '#8B5CF6', '#EF4444',
  '#06B6D4', '#84CC16', '#F97316', '#6366F1', '#14B8A6', '#D946EF',
  '#0EA5E9', '#F43F5E', '#A855F7', '#22C55E',
]

export const NODE_TYPE_META: Record<
  string,
  { color: string; badge: NodeBadgeVariant }
> = {
  시군: { color: '#4F46E5', badge: 'blue' },
  청년인구: { color: '#EC4899', badge: 'purple' },
  사업체: { color: '#F59E0B', badge: 'amber' },
  청년인프라: { color: '#10B981', badge: 'green' },
}

export function buildTypeColorMap(types: string[]): Record<string, string> {
  const map: Record<string, string> = {}
  const used = new Set<string>()

  // 핵심 타입은 고정 색상 우선 적용
  const fixed: Record<string, string> = {
    시군: '#4F46E5',
    청년인구: '#EC4899',
    사업체: '#F59E0B',
    청년인프라: '#10B981',
  }
  for (const t of types) {
    if (fixed[t]) {
      map[t] = fixed[t]
      used.add(fixed[t])
    }
  }

  // 나머지 타입은 사용되지 않은 팔레트 색상부터 순차 할당
  const remaining = [...types].filter(t => !map[t]).sort((a, b) => a.localeCompare(b, 'ko'))
  let paletteIndex = 0
  for (const t of remaining) {
    while (paletteIndex < TYPE_PALETTE.length && used.has(TYPE_PALETTE[paletteIndex])) {
      paletteIndex++
    }
    const color = TYPE_PALETTE[paletteIndex % TYPE_PALETTE.length]
    map[t] = color
    used.add(color)
    paletteIndex++
  }
  return map
}

export function getNodeTypeMeta(type: string) {
  return NODE_TYPE_META[type] ?? { color: '#94A3B8', badge: 'gray' as NodeBadgeVariant }
}

/**
 * `키=값;키=값` 형태의 속성 문자열을 객체로 파싱한다.
 */
export function parseProps(raw: string): Record<string, string> {
  if (!raw) return {}
  return Object.fromEntries(
    raw.split(';').filter(Boolean).map(kv => {
      const i = kv.indexOf('=')
      return i === -1 ? [kv, ''] : [kv.slice(0, i).trim(), kv.slice(i + 1).trim()]
    })
  )
}

/**
 * 각 노드의 연결 차수(degree)를 계산한다.
 */
export function computeDegrees(nodes: OntologyNode[], edges: OntologyEdge[]): Map<string, number> {
  const deg = new Map<string, number>()
  nodes.forEach(n => deg.set(n.obj_id, 0))
  edges.forEach(e => {
    deg.set(e.src, (deg.get(e.src) ?? 0) + 1)
    deg.set(e.dst, (deg.get(e.dst) ?? 0) + 1)
  })
  return deg
}

/**
 * 특정 노드와 연결된 모든 엣지를 반환한다.
 */
export function getNeighborEdges(nodeId: string, edges: OntologyEdge[]): OntologyEdge[] {
  return edges.filter(e => e.src === nodeId || e.dst === nodeId)
}

/**
 * 특정 노드의 이웃 노드 ID 집합을 반환한다.
 */
export function getNeighborIds(nodeId: string, edges: OntologyEdge[]): Set<string> {
  const set = new Set<string>()
  edges.forEach(e => {
    if (e.src === nodeId) set.add(e.dst)
    if (e.dst === nodeId) set.add(e.src)
  })
  return set
}
