/**
 * 온톨로지 그래프 분석 알고리즘 — 순수 함수, 결정론적
 */
import type { OntologyNode, OntologyEdge } from '@/lib/ontology-utils'
import { computeDegrees, parseProps } from '@/lib/ontology-utils'
import type {
  CentralityResult,
  CommunityResult,
  PathResult,
  SimilarityResult,
  AnomalyResult,
} from './types'

/* ────────────────────────────────────────────────────────────────────────── */
// 그래프 유틸

function buildAdj(nodes: OntologyNode[], edges: OntologyEdge[]): Map<string, string[]> {
  const adj = new Map<string, string[]>()
  for (const n of nodes) adj.set(n.obj_id, [])
  for (const e of edges) {
    if (!adj.has(e.src) || !adj.has(e.dst)) continue
    adj.get(e.src)?.push(e.dst)
    adj.get(e.dst)?.push(e.src)
  }
  return adj
}

function buildWeightedAdj(nodes: OntologyNode[], edges: OntologyEdge[]): Map<string, Map<string, number>> {
  const adj = new Map<string, Map<string, number>>()
  for (const n of nodes) adj.set(n.obj_id, new Map())
  for (const e of edges) {
    const srcMap = adj.get(e.src)
    const dstMap = adj.get(e.dst)
    if (!srcMap || !dstMap) continue
    srcMap.set(e.dst, (srcMap.get(e.dst) ?? 0) + e.weight)
    dstMap.set(e.src, (dstMap.get(e.src) ?? 0) + e.weight)
  }
  return adj
}

function sortedNodeIds(nodes: OntologyNode[]): string[] {
  return nodes.map(n => n.obj_id).sort()
}

function rankScores(scores: Map<string, number>): CentralityResult[] {
  const arr = Array.from(scores.entries()).map(([obj_id, score]) => ({
    obj_id,
    score,
  }))
  arr.sort((a, b) => b.score - a.score)
  return arr.map((o, i) => ({
    obj_id: o.obj_id,
    label: '',
    obj_type: '',
    score: o.score,
    rank: i + 1,
  }))
}

function attachNodeMeta(nodes: OntologyNode[], results: CentralityResult[]): CentralityResult[] {
  const meta = new Map(nodes.map(n => [n.obj_id, n]))
  return results.map(r => {
    const n = meta.get(r.obj_id)
    return { ...r, label: n?.label ?? r.obj_id, obj_type: n?.obj_type ?? '' }
  })
}

/* ────────────────────────────────────────────────────────────────────────── */
// 중심성

export function computeCentrality(
  nodes: OntologyNode[],
  edges: OntologyEdge[],
  metric: 'degree' | 'weightedDegree' | 'betweenness' | 'closeness' | 'eigenvector',
  top?: number,
): CentralityResult[] {
  let raw: CentralityResult[]
  switch (metric) {
    case 'degree':
      raw = centralityDegree(nodes, edges)
      break
    case 'weightedDegree':
      raw = centralityWeightedDegree(nodes, edges)
      break
    case 'betweenness':
      raw = centralityBetweenness(nodes, edges)
      break
    case 'closeness':
      raw = centralityCloseness(nodes, edges)
      break
    case 'eigenvector':
      raw = centralityEigenvector(nodes, edges)
      break
    default:
      raw = []
  }
  return top ? raw.slice(0, top) : raw
}

function centralityDegree(nodes: OntologyNode[], edges: OntologyEdge[]): CentralityResult[] {
  const deg = computeDegrees(nodes, edges)
  const scores = new Map<string, number>()
  for (const n of nodes) scores.set(n.obj_id, deg.get(n.obj_id) ?? 0)
  return attachNodeMeta(nodes, rankScores(scores))
}

function centralityWeightedDegree(nodes: OntologyNode[], edges: OntologyEdge[]): CentralityResult[] {
  const scores = new Map<string, number>()
  for (const n of nodes) scores.set(n.obj_id, 0)
  for (const e of edges) {
    scores.set(e.src, (scores.get(e.src) ?? 0) + e.weight)
    scores.set(e.dst, (scores.get(e.dst) ?? 0) + e.weight)
  }
  return attachNodeMeta(nodes, rankScores(scores))
}

/** Brandes 알고리즘 (비가중 묵향 그래프) */
function centralityBetweenness(nodes: OntologyNode[], edges: OntologyEdge[]): CentralityResult[] {
  const ids = sortedNodeIds(nodes)
  const adj = buildAdj(nodes, edges)
  const C = new Map<string, number>()
  for (const v of ids) C.set(v, 0)

  for (const s of ids) {
    const S: string[] = []
    const P = new Map<string, string[]>()
    const sigma = new Map<string, number>()
    const d = new Map<string, number>()
    for (const v of ids) {
      P.set(v, [])
      sigma.set(v, 0)
      d.set(v, -1)
    }
    sigma.set(s, 1)
    d.set(s, 0)
    const Q: string[] = [s]

    while (Q.length) {
      const v = Q.shift()!
      S.push(v)
      for (const w of adj.get(v) ?? []) {
        if (d.get(w) === -1) {
          d.set(w, d.get(v)! + 1)
          Q.push(w)
        }
        if (d.get(w) === d.get(v)! + 1) {
          sigma.set(w, sigma.get(w)! + sigma.get(v)!)
          P.get(w)!.push(v)
        }
      }
    }

    const delta = new Map<string, number>()
    for (const v of ids) delta.set(v, 0)
    while (S.length) {
      const w = S.pop()!
      for (const v of P.get(w) ?? []) {
        delta.set(v, delta.get(v)! + (sigma.get(v)! / sigma.get(w)!) * (1 + delta.get(w)!))
      }
      if (w !== s) C.set(w, C.get(w)! + delta.get(w)!)
    }
  }

  // 묵향 그래프에서는 중간값이 2배로 계산되므로 정규화
  for (const v of ids) C.set(v, C.get(v)! / 2)

  // 0~1 정규화 (최대값으로 나눔)
  const max = Math.max(...Array.from(C.values()), 1e-12)
  for (const v of ids) C.set(v, C.get(v)! / max)

  return attachNodeMeta(nodes, rankScores(C))
}

/**
 * Closeness: 연결된 노드까지의 평균 최단거리의 역수.
 * 단절 그래프에서는 닿지 않는 노드는 무시(조화 중심성과 유사)하여 안정적으로 처리.
 */
function centralityCloseness(nodes: OntologyNode[], edges: OntologyEdge[]): CentralityResult[] {
  const ids = sortedNodeIds(nodes)
  const adj = buildAdj(nodes, edges)
  const scores = new Map<string, number>()

  for (const s of ids) {
    const dist = new Map<string, number>()
    for (const v of ids) dist.set(v, Infinity)
    dist.set(s, 0)
    const Q: string[] = [s]
    let head = 0
    while (head < Q.length) {
      const v = Q[head++]
      for (const w of adj.get(v) ?? []) {
        if (dist.get(w) === Infinity) {
          dist.set(w, dist.get(v)! + 1)
          Q.push(w)
        }
      }
    }
    let sum = 0
    let reachable = 0
    for (const v of ids) {
      if (v !== s && dist.get(v)! !== Infinity) {
        sum += dist.get(v)!
        reachable++
      }
    }
    scores.set(s, sum > 0 ? reachable / sum : 0)
  }

  return attachNodeMeta(nodes, rankScores(scores))
}

/** PageRank-style power iteration (damping 0.85) */
function centralityEigenvector(nodes: OntologyNode[], edges: OntologyEdge[]): CentralityResult[] {
  const ids = sortedNodeIds(nodes)
  const N = ids.length
  if (N === 0) return []
  const adj = buildWeightedAdj(nodes, edges)

  let scores = new Map<string, number>()
  for (const v of ids) scores.set(v, 1 / N)

  const damping = 0.85
  const maxIter = 100
  const tol = 1e-9

  for (let iter = 0; iter < maxIter; iter++) {
    const next = new Map<string, number>()
    let total = 0
    for (const v of ids) {
      let s = 0
      for (const [u, w] of adj.get(v) ?? []) {
        const deg = Array.from(adj.get(u)?.values() ?? []).reduce((a, b) => a + b, 0)
        if (deg > 0) s += w * (scores.get(u)! / deg)
      }
      const val = (1 - damping) / N + damping * s
      next.set(v, val)
      total += val
    }
    // normalize
    let diff = 0
    for (const v of ids) {
      const normalized = (next.get(v)! / total) * N
      diff += Math.abs(normalized - scores.get(v)!)
      scores.set(v, normalized)
    }
    if (diff < tol) break
  }

  return attachNodeMeta(nodes, rankScores(scores))
}

/* ────────────────────────────────────────────────────────────────────────── */
// 커뮤니티 (간이 Louvain-style greedy modularity optimization)
// 결정론적 흐름: 엣지를 가중치 내림차순으로 병합하며 modularity 개선만 수용

export function detectCommunities(nodes: OntologyNode[], edges: OntologyEdge[]): CommunityResult[] {
  const ids = sortedNodeIds(nodes)
  if (ids.length === 0) return []

  const m = edges.reduce((sum, e) => sum + e.weight, 0)
  if (m === 0) {
    return nodes.map((n, i) => ({
      communityId: i,
      nodes: [{ obj_id: n.obj_id, label: n.label, obj_type: n.obj_type }],
      size: 1,
      density: 0,
    }))
  }

  const weightedAdj = buildWeightedAdj(nodes, edges)

  // 노드 가중 차수
  const degree = new Map<string, number>()
  for (const id of ids) {
    degree.set(id, Array.from(weightedAdj.get(id)?.values() ?? []).reduce((a, b) => a + b, 0))
  }

  // 초기: 각 노드가 자신의 커뮤니티
  const comm = new Map<string, number>()
  ids.forEach((id, i) => comm.set(id, i))

  // 커뮤니티별 internal 가중치, total 가중 차수
  const internal = new Map<number, number>()
  const total = new Map<number, number>()
  for (const id of ids) {
    internal.set(comm.get(id)!, 0)
    total.set(comm.get(id)!, degree.get(id)!)
  }

  function commOf(id: string) { return comm.get(id)! }
  function modTerm(c: number) {
    return (internal.get(c) ?? 0) / m - Math.pow((total.get(c) ?? 0) / (2 * m), 2)
  }
  function mergeGain(c1: number, c2: number, crossWeight: number) {
    return (
      (internal.get(c1)! + internal.get(c2)! + crossWeight) / m
      - Math.pow((total.get(c1)! + total.get(c2)!) / (2 * m), 2)
      - modTerm(c1)
      - modTerm(c2)
    )
  }

  // 엣지를 가중치 내림차순, 동률 시 src/dst 오름차순으로 정렬
  const sortedEdges = [...edges].sort((a, b) => {
    if (b.weight !== a.weight) return b.weight - a.weight
    if (a.src !== b.src) return a.src.localeCompare(b.src)
    return a.dst.localeCompare(b.dst)
  })

  let changed = true
  const maxIter = 100
  for (let iter = 0; iter < maxIter && changed; iter++) {
    changed = false
    for (const edge of sortedEdges) {
      const c1 = commOf(edge.src)
      const c2 = commOf(edge.dst)
      if (c1 === c2) continue

      // 두 커뮤니티 사이의 총 가중치
      let cross = 0
      for (const [u, w] of weightedAdj.get(edge.src) ?? []) {
        if (commOf(u) === c2) cross += w
      }

      if (mergeGain(c1, c2, cross) > 0) {
        // c2를 c1에 병합 (작은 ID를 유지하여 결정론적)
        const keep = Math.min(c1, c2)
        const drop = Math.max(c1, c2)
        for (const id of ids) {
          if (comm.get(id) === drop) comm.set(id, keep)
        }
        internal.set(keep, internal.get(keep)! + internal.get(drop)! + cross)
        total.set(keep, total.get(keep)! + total.get(drop)!)
        internal.set(drop, 0)
        total.set(drop, 0)
        changed = true
      }
    }
  }

  // 커뮤니티 ID 재번호 매김
  const unique = Array.from(new Set(comm.values())).sort((a, b) => a - b)
  const remap = new Map<number, number>()
  unique.forEach((c, i) => remap.set(c, i))

  const communities = new Map<number, OntologyNode[]>()
  for (const n of nodes) {
    const cid = remap.get(comm.get(n.obj_id)!)!
    if (!communities.has(cid)) communities.set(cid, [])
    communities.get(cid)!.push(n)
  }

  return Array.from(communities.entries())
    .sort(([a], [b]) => a - b)
    .map(([communityId, members]) => {
      const memberIds = new Set(members.map(n => n.obj_id))
      const internalWeight = edges
        .filter(e => memberIds.has(e.src) && memberIds.has(e.dst))
        .reduce((sum, e) => sum + e.weight, 0)
      const possible = members.length * (members.length - 1) / 2
      const density = possible > 0 ? internalWeight / possible : 0
      return {
        communityId,
        nodes: members.map(n => ({
          obj_id: n.obj_id,
          label: n.label,
          obj_type: n.obj_type,
        })),
        size: members.length,
        density,
      }
    })
}

/* ────────────────────────────────────────────────────────────────────────── */
// 최단 경로 (Dijkstra, cost = 1 / weight)

export function shortestPath(
  nodes: OntologyNode[],
  edges: OntologyEdge[],
  source: string,
  target: string,
): PathResult | null {
  const nodeSet = new Set(nodes.map(n => n.obj_id))
  if (!nodeSet.has(source) || !nodeSet.has(target)) return null

  const adj = new Map<string, Array<{ to: string; rel: string; weight: number }>>()
  for (const n of nodes) adj.set(n.obj_id, [])
  for (const e of edges) {
    const cost = e.weight > 0 ? 1 / e.weight : Infinity
    adj.get(e.src)!.push({ to: e.dst, rel: e.rel, weight: cost })
    adj.get(e.dst)!.push({ to: e.src, rel: e.rel, weight: cost })
  }

  const dist = new Map<string, number>()
  const prev = new Map<string, { node: string; rel: string; weight: number } | null>()
  for (const n of nodes) {
    dist.set(n.obj_id, Infinity)
    prev.set(n.obj_id, null)
  }
  dist.set(source, 0)

  const visited = new Set<string>()
  const pq: Array<{ id: string; d: number }> = [{ id: source, d: 0 }]

  while (pq.length) {
    pq.sort((a, b) => a.d - b.d)
    const { id: u } = pq.shift()!
    if (visited.has(u)) continue
    visited.add(u)
    if (u === target) break

    for (const e of adj.get(u) ?? []) {
      if (visited.has(e.to)) continue
      const alt = dist.get(u)! + e.weight
      if (alt < dist.get(e.to)!) {
        dist.set(e.to, alt)
        prev.set(e.to, { node: u, rel: e.rel, weight: e.weight })
        pq.push({ id: e.to, d: alt })
      }
    }
  }

  if (dist.get(target) === Infinity) return null

  const path: string[] = [target]
  const edgeDetails: Array<{ src: string; rel: string; dst: string; weight: number }> = []
  let cur = target
  while (cur !== source) {
    const p = prev.get(cur)
    if (!p) return null
    edgeDetails.push({ src: p.node, rel: p.rel, dst: cur, weight: 1 / p.weight })
    path.unshift(p.node)
    cur = p.node
  }
  edgeDetails.reverse()

  const labelMap = new Map(nodes.map(n => [n.obj_id, n.label]))
  return {
    path,
    labels: path.map(id => labelMap.get(id) ?? id),
    distance: dist.get(target)!,
    edges: edgeDetails,
  }
}

/* ────────────────────────────────────────────────────────────────────────── */
// 유사도

const SIM_PROPS = ['인구', '종사자', '사업체', '순이동']

export function computeSimilarity(
  nodes: OntologyNode[],
  edges: OntologyEdge[],
  nodeId: string,
  top?: number,
): SimilarityResult[] {
  const nodeMap = new Map(nodes.map(n => [n.obj_id, n]))
  const source = nodeMap.get(nodeId)
  if (!source) return []

  const adj = buildAdj(nodes, edges)
  const sourceNeighbors = new Set(adj.get(nodeId) ?? [])
  const sourceProps = source.obj_type === '시군' ? parseNumericProps(source.props) : null

  const results: SimilarityResult[] = []
  for (const n of nodes) {
    if (n.obj_id === nodeId) continue
    const targetNeighbors = new Set(adj.get(n.obj_id) ?? [])
    const intersection = new Set([...sourceNeighbors].filter(x => targetNeighbors.has(x)))
    const union = new Set([...sourceNeighbors, ...targetNeighbors])
    const jaccard = union.size > 0 ? intersection.size / union.size : 0

    let score = jaccard
    if (source.obj_type === '시군' && n.obj_type === '시군' && sourceProps) {
      const targetProps = parseNumericProps(n.props)
      const cosine = cosineSimilarity(sourceProps, targetProps)
      score = (jaccard + cosine) / 2
    }

    results.push({
      obj_id: n.obj_id,
      label: n.label,
      obj_type: n.obj_type,
      score: Number(score.toFixed(6)),
    })
  }

  results.sort((a, b) => b.score - a.score)
  return top ? results.slice(0, top) : results
}

function parseNumericProps(props: string): Record<string, number> {
  const parsed = parseProps(props)
  const out: Record<string, number> = {}
  for (const key of SIM_PROPS) {
    const v = Number(parsed[key])
    out[key] = Number.isFinite(v) ? v : 0
  }
  return out
}

function cosineSimilarity(a: Record<string, number>, b: Record<string, number>): number {
  const keys = Object.keys(a)
  let dot = 0
  let normA = 0
  let normB = 0
  for (const k of keys) {
    const av = a[k] ?? 0
    const bv = b[k] ?? 0
    dot += av * bv
    normA += av * av
    normB += bv * bv
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

/* ────────────────────────────────────────────────────────────────────────── */
// 이상탐지

const ANOMALY_PROPS = ['인구', '종사자', '사업체', '순이동']

export function detectAnomalies(nodes: OntologyNode[], edges: OntologyEdge[]): AnomalyResult[] {
  const deg = computeDegrees(nodes, edges)
  const degrees = nodes.map(n => deg.get(n.obj_id) ?? 0)
  const degreeZ = zScores(degrees)

  const propValues: Record<string, number[]> = {}
  const propParsed = nodes.map(n => parseProps(n.props))
  for (const key of ANOMALY_PROPS) {
    propValues[key] = propParsed.map(p => {
      const v = Number(p[key])
      return Number.isFinite(v) ? v : 0
    })
  }
  const propZ: Record<string, number[]> = {}
  for (const key of ANOMALY_PROPS) {
    propZ[key] = zScores(propValues[key])
  }

  const results: AnomalyResult[] = []
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]
    let maxZ = Math.abs(degreeZ[i])
    let reason = `degree Z-score=${formatZ(degreeZ[i])}`

    for (const key of ANOMALY_PROPS) {
      const z = propZ[key][i]
      if (Math.abs(z) > maxZ) {
        maxZ = Math.abs(z)
        reason = `${key} Z-score=${formatZ(z)}`
      }
    }

    if (maxZ > 2) {
      results.push({
        obj_id: n.obj_id,
        label: n.label,
        obj_type: n.obj_type,
        zScore: Number(maxZ.toFixed(4)),
        reason,
      })
    }
  }

  results.sort((a, b) => b.zScore - a.zScore)
  return results
}

function zScores(values: number[]): number[] {
  const mean = values.reduce((a, b) => a + b, 0) / values.length || 0
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length || 0
  const std = Math.sqrt(variance) || 1
  return values.map(v => (v - mean) / std)
}

function formatZ(z: number): string {
  return (z > 0 ? '+' : '') + z.toFixed(2)
}
