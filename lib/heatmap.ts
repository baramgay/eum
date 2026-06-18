/**
 * 히트맵 계산 라이브러리
 *
 * - 격자(grid): 뷰포트를 셀로 나누어 시설 개수 또는 수용인원을 집계
 * - 커널밀도(kernel): Gaussian 커널을 적용한 부드러운 밀도 추정
 */

import { haversineMeters } from './geo-cluster'

export type HeatmapMode = 'grid' | 'kernel'
export type HeatmapValueMode = 'count' | 'capacity'
export type HeatmapPalette = 'default' | 'flame' | 'ocean'

export interface HeatmapPoint {
  lat: number
  lon: number
  capacity: number
}

export interface Bounds {
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
}

export interface HeatmapCell {
  lat: number
  lng: number
  count: number
  value: number
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
}

const METERS_PER_DEGREE = 111320

function metersToDegrees(meters: number): number {
  return meters / METERS_PER_DEGREE
}

/** 눈금에 맞는 셀 크기(m)로 반올림 */
export function snapCellSize(meters: number): number {
  const steps = [50, 100, 200, 300, 500, 1000, 2000, 3000, 5000, 10000]
  if (meters <= steps[0]) return steps[0]
  if (meters >= steps[steps.length - 1]) return steps[steps.length - 1]
  for (let i = 0; i < steps.length - 1; i++) {
    if (meters <= (steps[i] + steps[i + 1]) / 2) return steps[i]
  }
  return steps[steps.length - 1]
}

/** 뷰포트 가로 길이와 원하는 셀 개수로 적절한 셀 크기 산정 */
export function viewportCellSizeMeters(bounds: Bounds, targetCellsAcross = 30): number {
  const widthMeters = haversineMeters(
    { id: '', lat: bounds.minLat, lon: bounds.minLng },
    { id: '', lat: bounds.minLat, lon: bounds.maxLng }
  )
  return snapCellSize(widthMeters / targetCellsAcross)
}

interface ColorStop {
  t: number
  r: number
  g: number
  b: number
}

const PALETTES: Record<HeatmapPalette, ColorStop[]> = {
  default: [
    { t: 0.0, r: 59, g: 130, b: 246 },
    { t: 0.35, r: 16, g: 185, b: 129 },
    { t: 0.65, r: 245, g: 158, b: 11 },
    { t: 1.0, r: 239, g: 68, b: 68 },
  ],
  flame: [
    { t: 0.0, r: 0, g: 0, b: 0 },
    { t: 0.25, r: 128, g: 0, b: 0 },
    { t: 0.5, r: 255, g: 0, b: 0 },
    { t: 0.75, r: 255, g: 128, b: 0 },
    { t: 1.0, r: 255, g: 255, b: 200 },
  ],
  ocean: [
    { t: 0.0, r: 255, g: 255, b: 255 },
    { t: 0.3, r: 147, g: 197, b: 253 },
    { t: 0.7, r: 37, g: 99, b: 235 },
    { t: 1.0, r: 30, g: 58, b: 138 },
  ],
}

export function getHeatmapColor(intensity: number, palette: HeatmapPalette): string {
  const stops = PALETTES[palette]
  const t = Math.max(0, Math.min(1, intensity))
  let a = stops[0]
  let b = stops[stops.length - 1]
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i].t && t <= stops[i + 1].t) {
      a = stops[i]
      b = stops[i + 1]
      break
    }
  }
  const len = b.t - a.t
  const ratio = len === 0 ? 0 : (t - a.t) / len
  const r = Math.round(a.r + (b.r - a.r) * ratio)
  const g = Math.round(a.g + (b.g - a.g) * ratio)
  const bl = Math.round(a.b + (b.b - a.b) * ratio)
  return `rgba(${r},${g},${bl},0.55)`
}

export function getHeatmapStrokeColor(intensity: number, palette: HeatmapPalette): string {
  const base = getHeatmapColor(intensity, palette)
  return base.replace('0.55', '0.85')
}

function cellKey(gx: number, gy: number): string {
  return `${gx},${gy}`
}

function createCell(
  gx: number,
  gy: number,
  cellSizeDeg: number
): HeatmapCell {
  const minLat = gy * cellSizeDeg
  const maxLat = (gy + 1) * cellSizeDeg
  const minLng = gx * cellSizeDeg
  const maxLng = (gx + 1) * cellSizeDeg
  return {
    lat: minLat + cellSizeDeg / 2,
    lng: minLng + cellSizeDeg / 2,
    count: 0,
    value: 0,
    minLat,
    maxLat,
    minLng,
    maxLng,
  }
}

function addToCell(cell: HeatmapCell, point: HeatmapPoint, weight = 1): void {
  cell.count += weight
  cell.value += weight * (point.capacity ?? 0)
}

function valueOf(cell: HeatmapCell, valueMode: HeatmapValueMode): number {
  return valueMode === 'capacity' ? cell.value : cell.count
}

export function computeGridCells<T extends HeatmapPoint>(
  points: T[],
  bounds: Bounds,
  cellSizeMeters: number,
  valueMode: HeatmapValueMode
): { cells: HeatmapCell[]; valid: T[] } {
  const cellSizeDeg = metersToDegrees(cellSizeMeters)
  const grid = new Map<string, HeatmapCell>()
  const valid = points.filter(
    (p) =>
      typeof p.lat === 'number' &&
      typeof p.lon === 'number' &&
      p.lat >= bounds.minLat &&
      p.lat <= bounds.maxLat &&
      p.lon >= bounds.minLng &&
      p.lon <= bounds.maxLng
  )

  valid.forEach((p) => {
    const gx = Math.floor(p.lon / cellSizeDeg)
    const gy = Math.floor(p.lat / cellSizeDeg)
    const key = cellKey(gx, gy)
    let cell = grid.get(key)
    if (!cell) {
      cell = createCell(gx, gy, cellSizeDeg)
      grid.set(key, cell)
    }
    addToCell(cell, p)
  })

  const cells = Array.from(grid.values())
  return { cells, valid }
}

/**
 * Gaussian 커널 밀도 추정.
 *
 * @param bandwidthMeters 커널 표준편차에 해당하는 반경(m). 약 68%의 기여가 이 안에 집중.
 */
export function computeKernelCells<T extends HeatmapPoint>(
  points: T[],
  bounds: Bounds,
  cellSizeMeters: number,
  bandwidthMeters: number,
  valueMode: HeatmapValueMode
): { cells: HeatmapCell[]; valid: T[] } {
  const cellSizeDeg = metersToDegrees(cellSizeMeters)
  const bandwidthDeg = metersToDegrees(bandwidthMeters)
  const radiusCells = Math.max(1, Math.ceil(bandwidthDeg / cellSizeDeg))
  const grid = new Map<string, HeatmapCell>()

  const valid = points.filter(
    (p) =>
      typeof p.lat === 'number' &&
      typeof p.lon === 'number' &&
      p.lat >= bounds.minLat &&
      p.lat <= bounds.maxLat &&
      p.lon >= bounds.minLng &&
      p.lon <= bounds.maxLng
  )

  valid.forEach((p) => {
    const cx = Math.floor(p.lon / cellSizeDeg)
    const cy = Math.floor(p.lat / cellSizeDeg)

    for (let dx = -radiusCells; dx <= radiusCells; dx++) {
      for (let dy = -radiusCells; dy <= radiusCells; dy++) {
        const gx = cx + dx
        const gy = cy + dy
        const cellLat = gy * cellSizeDeg + cellSizeDeg / 2
        const cellLng = gx * cellSizeDeg + cellSizeDeg / 2
        const d = haversineMeters(
          { id: '', lat: p.lat, lon: p.lon },
          { id: '', lat: cellLat, lon: cellLng }
        )
        if (d > bandwidthMeters) continue
        const w = Math.exp(-0.5 * (d / bandwidthMeters) ** 2)
        const key = cellKey(gx, gy)
        let cell = grid.get(key)
        if (!cell) {
          cell = createCell(gx, gy, cellSizeDeg)
          grid.set(key, cell)
        }
        addToCell(cell, p, w)
      }
    }
  })

  const cells = Array.from(grid.values())
  return { cells, valid }
}

export function capForCells(cells: HeatmapCell[], valueMode: HeatmapValueMode): number {
  if (cells.length === 0) return 1
  const values = cells.map((c) => valueOf(c, valueMode))
  const max = Math.max(...values)
  const sorted = [...values].sort((a, b) => a - b)
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? max
  return Math.max(1, p95)
}

export function formatHeatmapValue(value: number, valueMode: HeatmapValueMode): string {
  if (valueMode === 'capacity') return `${Math.round(value).toLocaleString()}명`
  return `${Math.round(value)}개`
}
