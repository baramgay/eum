/**
 * 데이터 활용(Utilization) 강화 모듈 — 순수 함수 모음
 * 마이그레이션 불필요, 외부 의존 없음
 */

export type ColType = 'number' | 'date' | 'text' | 'boolean'

export interface ColumnStat {
  name: string
  type: ColType
  count: number
  nullCount: number
  uniqueCount: number
  min: number | null
  max: number | null
  mean: number | null
  histogram?: { bin: string; lo: number; hi: number; count: number }[]
}

export interface DatasetStats {
  datasetId: string
  source: 'gold' | 'upload'
  rowCount: number
  sampled: boolean
  columns: ColumnStat[]
  dateColumn: string | null
  timeseries?: { t: string; count: number }[]
  correlation?: { cols: string[]; matrix: number[][] }
}

export interface UsageAggregate {
  topDownloads: { datasetId: string; title: string; count: number }[]
  recentDatasets: { datasetId: string; title: string; updatedAt: string }[]
  coverage: { sgg_cd: string; sigun: string; datasetCount: number }[]
  period: 'month' | 'q' | 'year'
}

// ─── 타입 감지 ────────────────────────────────────────────────────────────────

export function detectColType(values: unknown[]): ColType {
  const sample = values.filter(v => v != null).slice(0, 100)
  if (sample.length === 0) return 'text'

  if (sample.every(v => typeof v === 'boolean')) return 'boolean'

  if (sample.every(v => {
    if (typeof v === 'number') return true
    if (typeof v === 'string') return !isNaN(Number(v)) && v.trim() !== ''
    return false
  })) return 'number'

  if (sample.every(v => {
    if (typeof v === 'string') {
      const d = new Date(v)
      return !isNaN(d.getTime()) && /\d{4}/.test(v)
    }
    return false
  })) return 'date'

  return 'text'
}

// ─── 컬럼 기초통계 ────────────────────────────────────────────────────────────

export function computeColumnStat(
  name: string,
  values: unknown[],
  bins = 10,
): ColumnStat {
  const count = values.length
  const nullCount = values.filter(v => v == null || v === '').length
  const nonNull = values.filter(v => v != null && v !== '')
  const uniqueCount = new Set(nonNull.map(String)).size

  const type = detectColType(nonNull)

  if (type === 'number') {
    const nums = nonNull.map(v => Number(v)).filter(n => !isNaN(n))
    if (nums.length === 0) {
      return { name, type, count, nullCount, uniqueCount, min: null, max: null, mean: null }
    }
    const min = Math.min(...nums)
    const max = Math.max(...nums)
    const mean = nums.reduce((a, b) => a + b, 0) / nums.length

    // 히스토그램 생성
    const step = (max - min) / bins || 1
    const histogram: ColumnStat['histogram'] = []
    for (let i = 0; i < bins; i++) {
      const lo = min + i * step
      const hi = min + (i + 1) * step
      const binCount = nums.filter(n => n >= lo && (i === bins - 1 ? n <= hi : n < hi)).length
      histogram.push({
        bin: lo >= 1000 ? `${(lo / 1000).toFixed(1)}k` : lo.toFixed(1),
        lo,
        hi,
        count: binCount,
      })
    }

    return { name, type, count, nullCount, uniqueCount, min, max, mean, histogram }
  }

  return { name, type, count, nullCount, uniqueCount, min: null, max: null, mean: null }
}

// ─── 피어슨 상관계수 ──────────────────────────────────────────────────────────

export function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length)
  if (n === 0) return 0
  const meanA = a.slice(0, n).reduce((s, v) => s + v, 0) / n
  const meanB = b.slice(0, n).reduce((s, v) => s + v, 0) / n
  let num = 0, da2 = 0, db2 = 0
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA
    const db = b[i] - meanB
    num += da * db
    da2 += da * da
    db2 += db * db
  }
  const denom = Math.sqrt(da2 * db2)
  return denom === 0 ? 0 : num / denom
}

export function correlationMatrix(
  cols: { name: string; values: number[] }[],
): number[][] {
  return cols.map(r =>
    cols.map(c => pearson(r.values, c.values))
  )
}

// ─── CSV 직렬화 ───────────────────────────────────────────────────────────────

export function toCSV(
  rows: Record<string, unknown>[],
  columns: string[],
): string {
  const escape = (v: unknown): string => {
    const s = v == null ? '' : String(v)
    if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
      return `"${s.replace(/"/g, '""')}"`
    }
    return s
  }
  const header = columns.map(escape).join(',')
  const body = rows.map(r => columns.map(c => escape(r[c])).join(',')).join('\r\n')
  return header + '\r\n' + body
}

// ─── 날짜 컬럼 감지 ───────────────────────────────────────────────────────────

export function detectDateColumn(
  cols: ColumnStat[],
  sample: Record<string, unknown>[],
): string | null {
  const dateCols = cols.filter(c => c.type === 'date')
  if (dateCols.length === 0) return null

  // 연·월 단위 집계에 적합한 컬럼 우선 (값 예시가 YYYY-MM 패턴)
  for (const col of dateCols) {
    const val = sample[0]?.[col.name]
    if (typeof val === 'string' && /^\d{4}(-\d{2})?/.test(val)) return col.name
  }
  return dateCols[0].name
}

// ─── 소스 종류 판별 ───────────────────────────────────────────────────────────

export function resolveSourceKind(
  tableName: string,
): 'gold' | 'upload' | 'unknown' {
  if (tableName.startsWith('gold_')) return 'gold'
  if (tableName.startsWith('sub_')) return 'upload'
  return 'unknown'
}
