/**
 * 공간 클러스터링 유틸리티
 *
 * 분석 관점에서의 클러스터 = 공간적으로 밀집된 지점들의 집단.
 * 시각적 마커 묶음(marker clustering)이 아닌, 위치 데이터를 기반으로 한
 * 비지도 클러스터링(DBSCAN, K-Means)을 지원한다.
 */

export interface GeoPoint {
  id: string
  lat: number
  lon: number
}

export interface Cluster<T extends GeoPoint> {
  id: number
  points: T[]
  center: { lat: number; lon: number }
  bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number }
  hull: { lat: number; lon: number }[]
}

const EARTH_RADIUS_KM = 6371
const METERS_PER_DEGREE = 111320

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (v: number) => (v * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return EARTH_RADIUS_KM * c
}

export function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  return haversineKm(a.lat, a.lon, b.lat, b.lon) * 1000
}

function meanCenter(points: GeoPoint[]): { lat: number; lon: number } {
  const n = points.length
  if (n === 0) return { lat: 0, lon: 0 }
  const lat = points.reduce((s, p) => s + p.lat, 0) / n
  const lon = points.reduce((s, p) => s + p.lon, 0) / n
  return { lat, lon }
}

function boundsOf<T extends GeoPoint>(points: T[]) {
  let minLat = Infinity
  let maxLat = -Infinity
  let minLon = Infinity
  let maxLon = -Infinity
  for (const p of points) {
    minLat = Math.min(minLat, p.lat)
    maxLat = Math.max(maxLat, p.lat)
    minLon = Math.min(minLon, p.lon)
    maxLon = Math.max(maxLon, p.lon)
  }
  return { minLat, maxLat, minLon, maxLon }
}

/**
 * 2D 좌표계에서의 볼록껍질(Andrew monotone chain).
 * 위도/경도 직교 좌표 근사를 사용하며, 작은 지역(수십 km 이내)에서 충분하다.
 */
export function convexHull(points: { lat: number; lon: number }[]): { lat: number; lon: number }[] {
  if (points.length < 3) return points.slice()
  const pts = points
    .map((p) => ({ x: p.lon, y: p.lat, lat: p.lat, lon: p.lon }))
    .sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x))

  const cross = (o: typeof pts[0], a: typeof pts[0], b: typeof pts[0]) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)

  const lower: typeof pts = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop()
    }
    lower.push(p)
  }

  const upper: typeof pts = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop()
    }
    upper.push(p)
  }

  lower.pop()
  upper.pop()
  return [...lower, ...upper].map((p) => ({ lat: p.lat, lon: p.lon }))
}

/** 격자 인덱스 — 대규모 점 집합에서 이웃 탐색 가속화 */
function buildGrid<T extends GeoPoint>(points: T[], epsMeters: number): Map<string, T[]> {
  const cellSizeDeg = epsMeters / METERS_PER_DEGREE
  const grid = new Map<string, T[]>()
  for (const p of points) {
    const gx = Math.floor(p.lon / cellSizeDeg)
    const gy = Math.floor(p.lat / cellSizeDeg)
    const key = `${gx},${gy}`
    const bucket = grid.get(key) ?? []
    bucket.push(p)
    grid.set(key, bucket)
  }
  return grid
}

function rangeQuery<T extends GeoPoint>(
  point: T,
  points: T[],
  grid: Map<string, T[]>,
  epsMeters: number
): T[] {
  const cellSizeDeg = epsMeters / METERS_PER_DEGREE
  const gx = Math.floor(point.lon / cellSizeDeg)
  const gy = Math.floor(point.lat / cellSizeDeg)
  const result: T[] = []
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const bucket = grid.get(`${gx + dx},${gy + dy}`)
      if (!bucket) continue
      for (const other of bucket) {
        if (other.id === point.id) continue
        if (haversineMeters(point, other) <= epsMeters) {
          result.push(other)
        }
      }
    }
  }
  return result
}

function makeCluster<T extends GeoPoint>(id: number, points: T[]): Cluster<T> {
  return {
    id,
    points,
    center: meanCenter(points),
    bounds: boundsOf(points),
    hull: convexHull(points),
  }
}

/**
 * DBSCAN (Density-Based Spatial Clustering of Applications with Noise).
 *
 * @param epsMeters 이웃 반경 (m)
 * @param minPoints 핵심점이 되기 위한 최소 점 수 (자기 자신 포함)
 */
export function dbscan<T extends GeoPoint>(
  points: T[],
  epsMeters: number,
  minPoints: number
): { clusters: Cluster<T>[]; noise: T[] } {
  if (points.length === 0) return { clusters: [], noise: [] }
  if (epsMeters <= 0 || minPoints <= 0) {
    return { clusters: [], noise: points.slice() }
  }

  const grid = buildGrid(points, epsMeters)
  const visited = new Set<string>()
  const clustered = new Set<string>()
  const clusters: Cluster<T>[] = []
  const noise: T[] = []

  for (const p of points) {
    if (visited.has(p.id)) continue
    visited.add(p.id)

    const neighbors = rangeQuery(p, points, grid, epsMeters)
    if (neighbors.length + 1 < minPoints) {
      noise.push(p)
      continue
    }

    const clusterPoints: T[] = [p]
    clustered.add(p.id)

    const seeds = neighbors.slice()
    for (let i = 0; i < seeds.length; i++) {
      const q = seeds[i]
      if (!visited.has(q.id)) {
        visited.add(q.id)
        const qNeighbors = rangeQuery(q, points, grid, epsMeters)
        if (qNeighbors.length + 1 >= minPoints) {
          seeds.push(...qNeighbors)
        }
      }
      if (!clustered.has(q.id)) {
        clusterPoints.push(q)
        clustered.add(q.id)
      }
    }

    clusters.push(makeCluster(clusters.length + 1, clusterPoints))
  }

  // 노이즈 중 실제로는 다른 클러스터의 이웃으로 재할당 가능한 점 제거
  return { clusters, noise }
}

function pickCentroids<T extends GeoPoint>(points: T[], k: number): { lat: number; lon: number }[] {
  const n = points.length
  const step = Math.max(1, Math.floor(n / k))
  const centroids: { lat: number; lon: number }[] = []
  for (let i = 0; i < k; i++) {
    const idx = Math.min(n - 1, i * step)
    centroids.push({ lat: points[idx].lat, lon: points[idx].lon })
  }
  return centroids
}

function nearestCentroidIndex(p: GeoPoint, centroids: { lat: number; lon: number }[]): number {
  let best = 0
  let bestDist = Infinity
  for (let i = 0; i < centroids.length; i++) {
    const d = haversineMeters(p, { id: '', lat: centroids[i].lat, lon: centroids[i].lon })
    if (d < bestDist) {
      bestDist = d
      best = i
    }
  }
  return best
}

/**
 * K-Means 공간 클러스터링 (haversine 거리 기반).
 * 위치 좌표를 평면에 투영해 사용하므로 작은 지역에서 적합하다.
 */
export function kmeans<T extends GeoPoint>(points: T[], k: number, maxIter = 50): Cluster<T>[] {
  if (k < 2 || points.length < k) return []

  let centroids = pickCentroids(points, k)
  const assignments = new Array<number>(points.length).fill(-1)

  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false
    for (let i = 0; i < points.length; i++) {
      const c = nearestCentroidIndex(points[i], centroids)
      if (assignments[i] !== c) {
        assignments[i] = c
        changed = true
      }
    }
    if (!changed) break

    const sums = new Array(k).fill(null).map(() => ({ lat: 0, lon: 0, count: 0 }))
    for (let i = 0; i < points.length; i++) {
      const c = assignments[i]
      sums[c].lat += points[i].lat
      sums[c].lon += points[i].lon
      sums[c].count += 1
    }
    for (let c = 0; c < k; c++) {
      if (sums[c].count > 0) {
        centroids[c] = { lat: sums[c].lat / sums[c].count, lon: sums[c].lon / sums[c].count }
      }
    }
  }

  const groups: T[][] = new Array(k).fill(null).map(() => [])
  for (let i = 0; i < points.length; i++) {
    groups[assignments[i]].push(points[i])
  }

  return groups
    .filter((g) => g.length > 0)
    .map((g, idx) => makeCluster(idx + 1, g))
}

/** 클러스터 내 시설유형별 비율 */
export function clusterTypeBreakdown<T extends GeoPoint & { ftype?: string }>(
  cluster: Cluster<T>
): { ftype: string; count: number; ratio: number }[] {
  const map = new Map<string, number>()
  for (const p of cluster.points) {
    const key = p.ftype ?? '기타'
    map.set(key, (map.get(key) ?? 0) + 1)
  }
  const total = cluster.points.length
  return Array.from(map.entries())
    .map(([ftype, count]) => ({ ftype, count, ratio: total > 0 ? count / total : 0 }))
    .sort((a, b) => b.count - a.count)
}
