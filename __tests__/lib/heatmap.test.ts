import {
  getHeatmapColor,
  computeGridCells,
  computeKernelCells,
  capForCells,
  formatHeatmapValue,
  snapCellSize,
  viewportCellSizeMeters,
  type HeatmapPoint,
} from '@/lib/heatmap'

function p(lat: number, lon: number, capacity = 100): HeatmapPoint {
  return { lat, lon, capacity }
}

const bounds = { minLat: 35.0, maxLat: 36.0, minLng: 128.0, maxLng: 129.0 }

describe('getHeatmapColor', () => {
  it('0~1 사이 강도에 대해 rgba 문자열 반환', () => {
    expect(getHeatmapColor(0, 'default')).toMatch(/^rgba\(/)
    expect(getHeatmapColor(1, 'default')).toMatch(/^rgba\(/)
  })

  it('음수/1 초과값은 클램핑', () => {
    const low = getHeatmapColor(-0.5, 'default')
    const high = getHeatmapColor(1.5, 'default')
    expect(low).toBe(getHeatmapColor(0, 'default'))
    expect(high).toBe(getHeatmapColor(1, 'default'))
  })
})

describe('computeGridCells', () => {
  it('bounds 내 점을 셀로 집계한다', () => {
    const points = [
      p(35.22, 128.44, 100),
      p(35.221, 128.441, 200),
      p(35.23, 128.45, 300),
    ]
    const { cells } = computeGridCells(points, bounds, 1000, 'count')
    expect(cells.length).toBeGreaterThan(0)
    const totalCount = cells.reduce((s, c) => s + c.count, 0)
    expect(totalCount).toBe(3)
  })

  it('valueMode=capacity 이면 value는 수용인원 합계', () => {
    const points = [p(35.22, 128.44, 100), p(35.221, 128.441, 200)]
    const { cells } = computeGridCells(points, bounds, 1000, 'capacity')
    const totalValue = cells.reduce((s, c) => s + c.value, 0)
    expect(totalValue).toBe(300)
  })

  it('bounds 밖 점은 제외된다', () => {
    const points = [p(34.0, 128.44), p(35.22, 128.44)]
    const { valid } = computeGridCells(points, bounds, 1000, 'count')
    expect(valid).toHaveLength(1)
  })
})

describe('computeKernelCells', () => {
  it('인접 셀에 가우시안 가중치를 분산한다', () => {
    const points = [p(35.22, 128.44, 100)]
    const { cells } = computeKernelCells(points, bounds, 500, 1000, 'count')
    // 하나의 점이 여러 셀에 기여해야 한다
    expect(cells.length).toBeGreaterThan(1)
    const totalWeight = cells.reduce((s, c) => s + c.count, 0)
    expect(totalWeight).toBeGreaterThan(0)
  })

  it('bandwidth보다 먼 셀에는 기여하지 않는다', () => {
    const points = [p(35.22, 128.44, 100)]
    const { cells } = computeKernelCells(points, bounds, 100, 300, 'count')
    for (const c of cells) {
      const d = Math.sqrt((c.lat - 35.22) ** 2 + (c.lng - 128.44) ** 2)
      expect(d).toBeLessThan(0.015) // 대략 1.7km 이내
    }
  })
})

describe('capForCells', () => {
  it('p95 값을 cap으로 반환', () => {
    const cells = Array.from({ length: 20 }, (_, i) => ({
      lat: 0,
      lng: 0,
      count: i + 1,
      value: i + 1,
      minLat: 0,
      maxLat: 1,
      minLng: 0,
      maxLng: 1,
    }))
    expect(capForCells(cells, 'count')).toBe(20)
  })

  it('빈 배열이면 1', () => {
    expect(capForCells([], 'count')).toBe(1)
  })
})

describe('formatHeatmapValue', () => {
  it('count 모드는 개수', () => {
    expect(formatHeatmapValue(12, 'count')).toBe('12개')
  })
  it('capacity 모드는 인원', () => {
    expect(formatHeatmapValue(1234, 'capacity')).toBe('1,234명')
  })
})

describe('셀 크기 산정', () => {
  it('snapCellSize는 미리 정한 단계로 반올림', () => {
    expect(snapCellSize(80)).toBe(100)
    expect(snapCellSize(260)).toBe(300)
    expect(snapCellSize(4500)).toBe(5000)
    expect(snapCellSize(20)).toBe(50)
    expect(snapCellSize(20000)).toBe(10000)
  })

  it('viewportCellSizeMeters는 뷰포트 가로 크기를 기준으로 셀 크기 산정', () => {
    const b = { minLat: 35.0, maxLat: 36.0, minLng: 128.0, maxLng: 129.0 }
    const size = viewportCellSizeMeters(b, 30)
    expect(size).toBeGreaterThanOrEqual(50)
    expect(size).toBeLessThanOrEqual(10000)
  })
})
