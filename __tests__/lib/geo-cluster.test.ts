import {
  haversineKm,
  haversineMeters,
  convexHull,
  dbscan,
  kmeans,
  clusterTypeBreakdown,
  type GeoPoint,
} from '@/lib/geo-cluster'

type P = GeoPoint & { ftype: string }

function p(id: string, lat: number, lon: number, ftype = '기타'): P {
  return { id, lat, lon, ftype }
}

describe('geo-cluster 기하 유틸', () => {
  it('haversineKm: 경남 ↔ 서울 거리가 300km 내외', () => {
    const d = haversineKm(35.22, 128.44, 37.57, 126.98)
    expect(d).toBeGreaterThan(250)
    expect(d).toBeLessThan(350)
  })

  it('haversineMeters: 1km 이내 점은 미터 단위로 반환', () => {
    const d = haversineMeters(p('a', 35.22, 128.44), p('b', 35.229, 128.44))
    expect(d).toBeGreaterThan(900)
    expect(d).toBeLessThan(1100)
  })

  it('convexHull: 삼각형 점들은 3개 꼭짓점 반환', () => {
    const hull = convexHull([
      { lat: 0, lon: 0 },
      { lat: 1, lon: 0 },
      { lat: 0.5, lon: 1 },
      { lat: 0.5, lon: 0.3 },
    ])
    expect(hull.length).toBe(3)
  })

  it('convexHull: 2개 이하 점은 그대로 반환', () => {
    expect(convexHull([{ lat: 0, lon: 0 }])).toHaveLength(1)
    expect(convexHull([{ lat: 0, lon: 0 }, { lat: 1, lon: 1 }])).toHaveLength(2)
  })
})

describe('dbscan', () => {
  it('밀집한 두 그룹과 노이즈를 구분한다', () => {
    const points: P[] = [
      ...[0, 1, 2].map((i) => p(`a${i}`, 35.22, 128.44 + i * 0.001, 'A')),
      ...[0, 1, 2].map((i) => p(`b${i}`, 35.25, 129.0 + i * 0.001, 'B')),
      p('noise', 36.0, 130.0, 'A'),
    ]
    const { clusters, noise } = dbscan(points, 500, 3)
    expect(clusters.length).toBe(2)
    expect(noise.length).toBe(1)
    expect(noise[0].id).toBe('noise')
  })

  it('minPoints 미만이면 전부 노이즈', () => {
    const points = [p('a', 35.22, 128.44), p('b', 35.221, 128.441)]
    const { clusters, noise } = dbscan(points, 1000, 3)
    expect(clusters).toHaveLength(0)
    expect(noise).toHaveLength(2)
  })

  it('eps=0 이면 전부 노이즈', () => {
    const points = [p('a', 35.22, 128.44), p('b', 35.22, 128.44)]
    const { clusters, noise } = dbscan(points, 0, 2)
    expect(clusters).toHaveLength(0)
    expect(noise).toHaveLength(2)
  })

  it('클로스터는 center, bounds, hull을 포함한다', () => {
    const points = [
      p('a', 35.22, 128.44),
      p('b', 35.221, 128.441),
      p('c', 35.222, 128.442),
    ]
    const { clusters } = dbscan(points, 500, 3)
    expect(clusters.length).toBe(1)
    const c = clusters[0]
    expect(c.points.length).toBe(3)
    expect(c.center.lat).toBeGreaterThan(35.21)
    expect(c.bounds.minLat).toBeLessThan(c.bounds.maxLat)
    expect(c.hull.length).toBeGreaterThanOrEqual(3)
  })
})

describe('kmeans', () => {
  it('k개 클러스터로 분할한다', () => {
    const points: P[] = [
      ...Array.from({ length: 10 }, (_, i) => p(`a${i}`, 35.22 + i * 0.001, 128.44, 'A')),
      ...Array.from({ length: 10 }, (_, i) => p(`b${i}`, 35.8 + i * 0.001, 129.0, 'B')),
    ]
    const clusters = kmeans(points, 2)
    expect(clusters.length).toBe(2)
    const total = clusters.reduce((s, c) => s + c.points.length, 0)
    expect(total).toBe(20)
  })

  it('k가 점 개수보다 많으면 빈 배열', () => {
    const clusters = kmeans([p('a', 35, 128)], 5)
    expect(clusters).toHaveLength(0)
  })
})

describe('clusterTypeBreakdown', () => {
  it('클로스터 내 ftype 비율을 계산한다', () => {
    const c = {
      id: 1,
      points: [p('a', 0, 0, '도서관'), p('b', 0, 0, '도서관'), p('c', 0, 0, '체육관')],
      center: { lat: 0, lon: 0 },
      bounds: { minLat: 0, maxLat: 0, minLon: 0, maxLon: 0 },
      hull: [],
    }
    const breakdown = clusterTypeBreakdown(c)
    expect(breakdown[0].ftype).toBe('도서관')
    expect(breakdown[0].count).toBe(2)
    expect(breakdown[0].ratio).toBeCloseTo(0.667, 1)
    expect(breakdown[1].ftype).toBe('체육관')
  })
})
