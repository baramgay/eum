/**
 * EUM 통합 통계 분석 엔진 — 순수 TypeScript (Vercel 서버리스 호환)
 * Python spawn 없이 직접 계산.
 */
import { createClient } from '@/lib/supabase/server'

// ────────────────────────────────────────────
// 타입 정의
// ────────────────────────────────────────────
type Row = Record<string, unknown>
type ColType = 'scale' | 'nominal' | 'ordinal'
type Variables = Record<string, unknown>
type Options = Record<string, unknown>

interface SessionData {
  rows: Row[]
  column_types: Record<string, string>
}

// ────────────────────────────────────────────
// 수학 유틸 (p값 계산용)
// ────────────────────────────────────────────

function erf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x))
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))))
  const result = 1 - poly * Math.exp(-x * x)
  return x >= 0 ? result : -result
}

export function normalCDF(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2))
}

// 연속 분수를 이용한 불완전 베타 함수 (Numerical Recipes 알고리즘)
function betaCF(a: number, b: number, x: number): number {
  const MAXIT = 200
  const EPS = 3e-7
  const FPMIN = 1e-30
  const qab = a + b
  const qap = a + 1
  const qam = a - 1
  let c = 1
  let d = 1 - qab * x / qap
  if (Math.abs(d) < FPMIN) d = FPMIN
  d = 1 / d
  let h = d
  for (let m = 1; m <= MAXIT; m++) {
    let m2 = 2 * m
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2))
    d = 1 + aa * d
    if (Math.abs(d) < FPMIN) d = FPMIN
    c = 1 + aa / c
    if (Math.abs(c) < FPMIN) c = FPMIN
    d = 1 / d
    h *= d * c
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
    d = 1 + aa * d
    if (Math.abs(d) < FPMIN) d = FPMIN
    c = 1 + aa / c
    if (Math.abs(c) < FPMIN) c = FPMIN
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < EPS) break
  }
  return h
}

function lnBeta(a: number, b: number): number {
  return lgamma(a) + lgamma(b) - lgamma(a + b)
}

// Stirling 급수를 이용한 lgamma
function lgamma(x: number): number {
  if (x <= 0) return Infinity
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x)
  x -= 1
  let result = 0.99999999999980993
  const c = [676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012,
    9.9843695780195716e-6, 1.5056327351493116e-7]
  for (let i = 0; i < 8; i++) result += c[i] / (x + i + 1)
  const t = x + 7.5
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(result)
}

// 정규화 불완전 베타 함수 Ix(a, b)
function incompleteBetaReg(a: number, b: number, x: number): number {
  if (x < 0 || x > 1) return NaN
  if (x === 0) return 0
  if (x === 1) return 1
  const lbeta = lnBeta(a, b)
  const bt = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lbeta)
  if (x < (a + 1) / (a + b + 2)) {
    return bt * betaCF(a, b, x) / a
  }
  return 1 - bt * betaCF(b, a, 1 - x) / b
}

// t분포 p값 (양측)
export function tPValue(t: number, df: number): number {
  if (!isFinite(t) || !isFinite(df) || df <= 0) return 1
  const x = df / (df + t * t)
  const p = incompleteBetaReg(df / 2, 0.5, x)
  return Math.min(1, Math.max(0, p))
}

// chi-square p값 (상위 꼬리)
export function chiSquarePValue(chi2: number, df: number): number {
  if (chi2 <= 0 || df <= 0) return 1
  // regularized upper incomplete gamma: Q(a, x) = 1 - P(a, x)
  return 1 - regularizedGamma(df / 2, chi2 / 2)
}

// 정규화 하위 불완전 감마 함수 P(a, x) (급수 전개)
function regularizedGamma(a: number, x: number): number {
  if (x < 0) return 0
  if (x === 0) return 0
  if (x < a + 1) {
    // 급수 전개
    let ap = a
    let sum = 1 / a
    let del = sum
    for (let n = 1; n <= 200; n++) {
      ap++
      del *= x / ap
      sum += del
      if (Math.abs(del) < Math.abs(sum) * 3e-7) break
    }
    return sum * Math.exp(-x + a * Math.log(x) - lgamma(a))
  }
  // 연속 분수
  let b = x + 1 - a
  let c = 1 / 1e-30
  let d = 1 / b
  let h = d
  for (let i = 1; i <= 200; i++) {
    const an = -i * (i - a)
    b += 2
    d = an * d + b
    if (Math.abs(d) < 1e-30) d = 1e-30
    c = b + an / c
    if (Math.abs(c) < 1e-30) c = 1e-30
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < 3e-7) break
  }
  const gamserGamcf = Math.exp(-x + a * Math.log(x) - lgamma(a)) * h
  return 1 - gamserGamcf
}

// F분포 p값 (상위 꼬리)
export function fPValue(f: number, df1: number, df2: number): number {
  if (f <= 0 || df1 <= 0 || df2 <= 0) return 1
  const x = df2 / (df2 + df1 * f)
  return incompleteBetaReg(df2 / 2, df1 / 2, x)
}

// ────────────────────────────────────────────
// 기술통계 유틸
// ────────────────────────────────────────────

function mean(arr: number[]): number {
  if (arr.length === 0) return NaN
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function variance(arr: number[], ddof = 1): number {
  const m = mean(arr)
  const n = arr.length
  if (n <= ddof) return NaN
  return arr.reduce((s, v) => s + (v - m) ** 2, 0) / (n - ddof)
}

function stdDev(arr: number[], ddof = 1): number {
  return Math.sqrt(variance(arr, ddof))
}

function sortedArr(arr: number[]): number[] {
  return [...arr].sort((a, b) => a - b)
}

function quantile(arr: number[], p: number): number {
  const s = sortedArr(arr)
  const n = s.length
  if (n === 0) return NaN
  const idx = (n - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  return s[lo] + (s[hi] - s[lo]) * (idx - lo)
}

function skewness(arr: number[]): number {
  const n = arr.length
  if (n < 3) return NaN
  const m = mean(arr)
  const s = stdDev(arr)
  if (s === 0) return 0
  const g1 = arr.reduce((sum, v) => sum + ((v - m) / s) ** 3, 0) / n
  return (g1 * n * n) / ((n - 1) * (n - 2))
}

function kurtosis(arr: number[]): number {
  const n = arr.length
  if (n < 4) return NaN
  const m = mean(arr)
  const s = stdDev(arr)
  if (s === 0) return 0
  const g2 = arr.reduce((sum, v) => sum + ((v - m) / s) ** 4, 0) / n
  return ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * g2 * (n - 1) ** 2 * ((n - 2) * (n - 3)) / ((n - 1) * (n - 2) * (n - 3)) - 3 * (n - 1) ** 2 / ((n - 2) * (n - 3))
  // 편향 보정 초과 첨도
}

function kurtosisExcess(arr: number[]): number {
  const n = arr.length
  if (n < 4) return NaN
  const m = mean(arr)
  const s = stdDev(arr, 1)
  if (s === 0) return 0
  const sum4 = arr.reduce((sum, v) => sum + ((v - m) / s) ** 4, 0)
  const g2 = sum4 / n
  return ((n + 1) / (n - 1)) * ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * sum4 / (s ** 4 / (s ** 4)) - 3 * (n - 1) ** 2 / ((n - 2) * (n - 3))
}

function sem(arr: number[]): number {
  return stdDev(arr) / Math.sqrt(arr.length)
}

function toNum(row: Row, col: string): number | null {
  const v = row[col]
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return isFinite(n) ? n : null
}

function numericCol(rows: Row[], col: string): number[] {
  const result: number[] = []
  for (const row of rows) {
    const v = toNum(row, col)
    if (v !== null) result.push(v)
  }
  return result
}

function sanitize(v: unknown): unknown {
  if (typeof v === 'number' && (!isFinite(v) || isNaN(v))) return null
  return v
}

function round4(v: number): number {
  if (!isFinite(v) || isNaN(v)) return 0
  return Math.round(v * 10000) / 10000
}

// ────────────────────────────────────────────
// 세션 관리 (Supabase)
// ────────────────────────────────────────────

async function saveSession(sessionId: string, userId: string, rows: Row[], columnTypes: Record<string, string>): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('analyze_sessions').upsert({
    id: sessionId,
    user_id: userId,
    rows: rows as unknown,
    column_types: columnTypes as unknown,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  })
  if (error) throw new Error(`세션 저장 실패: ${error.message}`)
}

async function loadSession(sessionId: string, userId: string): Promise<SessionData> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('analyze_sessions')
    .select('rows, column_types')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single()
  if (error || !data) throw new Error(`세션 없음: ${sessionId}`)
  return { rows: data.rows as Row[], column_types: data.column_types as Record<string, string> }
}

// ────────────────────────────────────────────
// 타입 추론
// ────────────────────────────────────────────

function inferColumnTypes(rows: Row[]): Record<string, string> {
  if (rows.length === 0) return {}
  const columns = Object.keys(rows[0])
  const types: Record<string, string> = {}
  for (const col of columns) {
    const vals = rows.map(r => r[col]).filter(v => v !== null && v !== undefined && v !== '')
    const total = vals.length
    if (total === 0) { types[col] = 'nominal'; continue }
    const numCount = vals.filter(v => isFinite(Number(v))).length
    const uniqueRatio = new Set(vals.map(String)).size / total
    if (numCount / total >= 0.7) {
      types[col] = 'scale'
    } else if (uniqueRatio < 0.05) {
      types[col] = 'nominal'
    } else {
      types[col] = 'nominal'
    }
  }
  return types
}

// ────────────────────────────────────────────
// 파싱 액션
// ────────────────────────────────────────────

export async function actionParse(input: {
  session_id: string
  user_id: string
  raw_json?: unknown[]
  file_text?: string
  file_ext?: string
}): Promise<Record<string, unknown>> {
  const { session_id, user_id, raw_json } = input
  let rows: Row[] = []

  if (raw_json && raw_json.length > 0) {
    rows = raw_json.slice(0, 50000) as Row[]
  } else {
    return { ok: false, error: 'raw_json 필요' }
  }

  if (rows.length === 0) return { ok: false, error: '데이터가 비어 있습니다.' }
  const columns = Object.keys(rows[0] ?? {})
  if (columns.length === 0) return { ok: false, error: '컬럼이 없습니다.' }

  const column_types = inferColumnTypes(rows)

  await saveSession(session_id, user_id, rows, column_types)

  const column_values: Record<string, string[]> = {}
  for (const col of columns) {
    if (column_types[col] !== 'scale') {
      const vals = [...new Set(rows.map(r => String(r[col] ?? '')).filter(v => v !== '' && v !== 'null' && v !== 'undefined'))]
      column_values[col] = vals.slice(0, 200)
    }
  }

  return {
    ok: true,
    session_id,
    total_rows: rows.length,
    columns,
    column_types,
    column_values,
    preview: rows.slice(0, 50),
  }
}

export async function actionParseCsv(input: {
  session_id: string
  user_id: string
  text: string
}): Promise<Record<string, unknown>> {
  const lines = input.text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return { ok: false, error: '데이터가 부족합니다.' }

  function parseLine(line: string): string[] {
    const result: string[] = []
    let current = ''
    let inQuotes = false
    for (const ch of line) {
      if (ch === '"') {
        inQuotes = !inQuotes
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
    result.push(current.trim())
    return result
  }

  const headers = parseLine(lines[0])
  const rows: Row[] = []
  for (let i = 1; i < Math.min(lines.length, 50001); i++) {
    const vals = parseLine(lines[i])
    const row: Row = {}
    headers.forEach((h, idx) => { row[h] = vals[idx] ?? '' })
    rows.push(row)
  }

  return actionParse({ session_id: input.session_id, user_id: input.user_id, raw_json: rows })
}

export async function actionUpdateTypes(input: {
  session_id: string
  user_id: string
  column_types: Record<string, string>
}): Promise<Record<string, unknown>> {
  const session = await loadSession(input.session_id, input.user_id)
  Object.assign(session.column_types, input.column_types)
  await saveSession(input.session_id, input.user_id, session.rows, session.column_types)
  return { ok: true }
}

// ────────────────────────────────────────────
// 필터 유틸
// ────────────────────────────────────────────

function applyLevelFilters(rows: Row[], variables: Variables): Row[] {
  const levelValues = (variables.level_values ?? {}) as Record<string, string[]>
  let filtered = rows
  for (const [col, levels] of Object.entries(levelValues)) {
    if (!levels || levels.length === 0) continue
    const allowed = new Set(levels.map(String))
    filtered = filtered.filter(r => allowed.has(String(r[col] ?? '')))
  }
  return filtered
}

// ────────────────────────────────────────────
// 분석 함수들
// ────────────────────────────────────────────

function runDescriptives(rows: Row[], variables: Variables): Record<string, unknown> {
  const cols = (variables.variables ?? []) as string[]
  if (cols.length === 0) return { error: '분석 변수를 선택하세요.' }
  const tableRows: unknown[][] = []
  const barData: unknown[] = []
  for (const col of cols) {
    const arr = numericCol(rows, col)
    const n = arr.length
    if (n === 0) { tableRows.push([col, 0, '-', '-', '-', '-', '-', '-', '-', '-', '-']); continue }
    const m = mean(arr)
    const sd = stdDev(arr)
    const q1 = quantile(arr, 0.25)
    const med = quantile(arr, 0.5)
    const q3 = quantile(arr, 0.75)
    const s = skewness(arr)
    const k = kurtosisExcess(arr)
    const row = [col, n, round4(m), round4(sd), round4(Math.min(...arr)), round4(q1), round4(med), round4(q3), round4(Math.max(...arr)), round4(isNaN(s) ? 0 : s), round4(isNaN(k) ? 0 : k)]
    tableRows.push(row)
    barData.push({ name: col, '평균': round4(m) })
  }
  return {
    title: '기술통계',
    tables: [{ title: '기술통계량', headers: ['변수', 'N', '평균', '표준편차', '최솟값', 'Q1', '중앙값', 'Q3', '최댓값', '왜도', '첨도'], rows: tableRows }],
    charts: barData.length > 0 ? [{ type: 'bar', title: '변수별 평균', data: barData, xKey: 'name', yKey: '평균' }] : [],
  }
}

function runFrequencies(rows: Row[], variables: Variables): Record<string, unknown> {
  const cols = (variables.variables ?? []) as string[]
  if (cols.length === 0) return { error: '분석 변수를 선택하세요.' }
  const tables: unknown[] = []
  const charts: unknown[] = []
  for (const col of cols) {
    const freq = new Map<string, number>()
    for (const row of rows) {
      const val = String(row[col] ?? 'null')
      freq.set(val, (freq.get(val) ?? 0) + 1)
    }
    const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1])
    const total = sorted.reduce((s, [, c]) => s + c, 0)
    let cumPct = 0
    const tableRows: unknown[][] = sorted.map(([val, cnt]) => {
      const pct = round4((cnt / total) * 100)
      cumPct = round4(cumPct + pct)
      return [val, cnt, pct, cumPct]
    })
    tableRows.push(['합계', total, 100.0, ''])
    tables.push({ title: `${col} — 빈도표`, headers: ['값', '빈도', '백분율(%)', '누적(%)'], rows: tableRows })
    const top20 = sorted.slice(0, 20)
    charts.push({ type: 'bar', title: `${col} — 빈도 (상위 20개)`, data: top20.map(([name, cnt]) => ({ name, '빈도': cnt })), xKey: 'name', yKey: '빈도' })
    charts.push({ type: 'pie', title: `${col} — 비율 (상위 20개)`, data: top20.map(([name, cnt]) => ({ name, value: cnt })), xKey: 'name', yKey: 'value' })
  }
  return { title: '빈도 분석', tables, charts }
}

// Shapiro-Wilk 근사 (Royston 1992)
function shapiroWilk(arr: number[]): { stat: number, p: number } {
  const n = arr.length
  if (n < 3) return { stat: NaN, p: NaN }
  if (n > 5000) {
    // KS 검정 (대표본)
    const m = mean(arr)
    const sd = stdDev(arr)
    const sorted = sortedArr(arr)
    let d = 0
    for (let i = 0; i < n; i++) {
      const theoretical = normalCDF((sorted[i] - m) / sd)
      const empirical1 = i / n
      const empirical2 = (i + 1) / n
      d = Math.max(d, Math.abs(theoretical - empirical1), Math.abs(theoretical - empirical2))
    }
    // KS 통계량 근사 p값
    const ks_stat = d * (Math.sqrt(n) + 0.12 + 0.11 / Math.sqrt(n))
    let p = 2 * Math.exp(-2 * ks_stat * ks_stat)
    p = Math.min(1, Math.max(0, p))
    return { stat: round4(d), p: round4(p) }
  }
  // Shapiro-Wilk W 통계 근사 (간소화)
  const sorted = sortedArr(arr)
  const m = mean(sorted)
  const ss = sorted.reduce((s, v) => s + (v - m) ** 2, 0)
  if (ss === 0) return { stat: 1, p: 1 }
  // W 근사 계수 (Shapiro 1965 간소화)
  let b = 0
  const m2 = Math.floor(n / 2)
  for (let i = 0; i < m2; i++) {
    const ci = (sorted[n - 1 - i] - sorted[i])
    b += ci * ci
  }
  const w = Math.min(1, b / ss)
  // p값 근사 (로그 변환 후 정규근사)
  const ln_w = Math.log(1 - w)
  const mu = -1.2725 + 1.0521 * Math.log(n)
  const sigma = 1.0308 - 0.26763 * Math.log(n)
  const z = (ln_w - mu) / sigma
  const p = 1 - normalCDF(z)
  return { stat: round4(w), p: round4(Math.min(1, Math.max(0, p))) }
}

function runNormality(rows: Row[], variables: Variables): Record<string, unknown> {
  const cols = (variables.variables ?? []) as string[]
  if (cols.length === 0) return { error: '분석 변수를 선택하세요.' }
  const tableRows: unknown[][] = []
  for (const col of cols) {
    const arr = numericCol(rows, col)
    const n = arr.length
    if (n < 3) { tableRows.push([col, n, '-', '-', '-', '판정 불가(n<3)']); continue }
    const method = n <= 5000 ? 'Shapiro-Wilk' : 'Kolmogorov-Smirnov'
    const { stat, p } = shapiroWilk(arr)
    tableRows.push([col, n, method, round4(stat), round4(p), p > 0.05 ? '정규' : '비정규'])
  }
  return {
    title: '정규성 검정',
    tables: [{
      title: 'Shapiro-Wilk / KS 정규성 검정',
      headers: ['변수', 'N', '검정 방법', '통계량', 'p값', '판정(α=0.05)'],
      rows: tableRows,
      footnotes: ['* p < 0.05: 정규분포 기각', 'N > 5,000이면 KS 검정 사용'],
    }],
  }
}

function runCrosstab(rows: Row[], variables: Variables): Record<string, unknown> {
  const filtered = applyLevelFilters(rows, variables)
  const rowVar = ((variables.row ?? []) as string[])[0]
  const colVar = ((variables.column ?? []) as string[])[0]
  if (!rowVar || !colVar) return { error: '행 변수와 열 변수를 모두 선택하세요.' }

  const rowVals = [...new Set(filtered.map(r => String(r[rowVar] ?? '')))]
  const colVals = [...new Set(filtered.map(r => String(r[colVar] ?? '')))]
  const ct = new Map<string, Map<string, number>>()
  for (const rv of rowVals) {
    ct.set(rv, new Map(colVals.map(cv => [cv, 0])))
  }
  for (const r of filtered) {
    const rv = String(r[rowVar] ?? '')
    const cv = String(r[colVar] ?? '')
    const rowMap = ct.get(rv)
    if (rowMap) rowMap.set(cv, (rowMap.get(cv) ?? 0) + 1)
  }

  const headers = [`${rowVar} \\ ${colVar}`, ...colVals, '합계']
  const tableRows: unknown[][] = []
  const colTotals = new Map(colVals.map(cv => [cv, 0]))
  for (const rv of rowVals) {
    const rowMap = ct.get(rv)!
    const rowTotal = colVals.reduce((s, cv) => s + (rowMap.get(cv) ?? 0), 0)
    tableRows.push([rv, ...colVals.map(cv => rowMap.get(cv) ?? 0), rowTotal])
    colVals.forEach(cv => colTotals.set(cv, (colTotals.get(cv) ?? 0) + (rowMap.get(cv) ?? 0)))
  }
  const grandTotal = [...colTotals.values()].reduce((s, v) => s + v, 0)
  tableRows.push(['합계', ...colVals.map(cv => colTotals.get(cv) ?? 0), grandTotal])

  // 카이제곱 검정
  let chi2 = 0
  let dof = (rowVals.length - 1) * (colVals.length - 1)
  const rowTotals = new Map(rowVals.map(rv => [rv, colVals.reduce((s, cv) => s + (ct.get(rv)?.get(cv) ?? 0), 0)]))
  for (const rv of rowVals) {
    for (const cv of colVals) {
      const observed = ct.get(rv)?.get(cv) ?? 0
      const expected = ((rowTotals.get(rv) ?? 0) * (colTotals.get(cv) ?? 0)) / grandTotal
      if (expected > 0) chi2 += (observed - expected) ** 2 / expected
    }
  }
  const p = chiSquarePValue(chi2, dof)
  const cv = grandTotal > 0 && Math.min(rowVals.length, colVals.length) > 1
    ? Math.sqrt(chi2 / (grandTotal * (Math.min(rowVals.length, colVals.length) - 1)))
    : 0

  const heatmapData: unknown[] = []
  for (const rv of rowVals) {
    for (const cvv of colVals) {
      heatmapData.push({ x: rv, y: cvv, value: ct.get(rv)?.get(cvv) ?? 0 })
    }
  }

  return {
    title: '교차 분석',
    tables: [
      { title: `${rowVar} × ${colVar} 교차표`, headers, rows: tableRows },
      {
        title: '카이제곱 검정',
        headers: ['통계량', '값', '자유도', 'p값'],
        rows: [
          ['피어슨 카이제곱', round4(chi2), dof, round4(p)],
          ["Cramér's V", round4(cv), '-', '-'],
        ],
        footnotes: ['* p < 0.05: 유의한 연관성'],
      },
    ],
    charts: heatmapData.length > 0 ? [{ type: 'heatmap', title: '교차표 빈도 히트맵', data: heatmapData, xKey: 'x', yKey: 'y', valueKey: 'value' }] : [],
  }
}

function pearsonR(x: number[], y: number[]): { r: number, p: number } {
  const n = x.length
  if (n < 3) return { r: NaN, p: NaN }
  const mx = mean(x), my = mean(y)
  let num = 0, sx = 0, sy = 0
  for (let i = 0; i < n; i++) {
    num += (x[i] - mx) * (y[i] - my)
    sx += (x[i] - mx) ** 2
    sy += (y[i] - my) ** 2
  }
  const denom = Math.sqrt(sx * sy)
  if (denom === 0) return { r: 0, p: 1 }
  const r = num / denom
  const t = r * Math.sqrt((n - 2) / (1 - r * r))
  const p = tPValue(t, n - 2)
  return { r: round4(r), p: round4(p) }
}

function rankArr(arr: number[]): number[] {
  const indexed = arr.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v)
  const ranks = new Array(arr.length)
  let i = 0
  while (i < indexed.length) {
    let j = i
    while (j < indexed.length && indexed[j].v === indexed[i].v) j++
    const avgRank = (i + j + 1) / 2
    for (let k = i; k < j; k++) ranks[indexed[k].i] = avgRank
    i = j
  }
  return ranks
}

function runCorrelation(rows: Row[], variables: Variables, options: Options): Record<string, unknown> {
  const cols = (variables.variables ?? []) as string[]
  const method = (options.method ?? 'pearson') as string
  if (cols.length < 2) return { error: '상관 분석에는 2개 이상의 변수가 필요합니다.' }

  // 공통 유효 인덱스 추출
  const validIdx: number[] = []
  for (let i = 0; i < rows.length; i++) {
    if (cols.every(c => toNum(rows[i], c) !== null)) validIdx.push(i)
  }
  const n = validIdx.length
  if (n < 3) return { error: `유효 관측치 부족(n=${n})` }

  const data = cols.map(c => validIdx.map(i => toNum(rows[i], c) as number))
  const label = method === 'pearson' ? '피어슨(Pearson)' : '스피어만(Spearman)'

  const getR = (xi: number[], yi: number[]) => {
    if (method === 'spearman') {
      return pearsonR(rankArr(xi), rankArr(yi))
    }
    return pearsonR(xi, yi)
  }

  const corrRows: unknown[][] = []
  for (let i = 0; i < cols.length; i++) {
    const row: unknown[] = [cols[i]]
    for (let j = 0; j < cols.length; j++) {
      if (i === j) { row.push('1.0000'); continue }
      if (j < i) { row.push(''); continue }
      const { r, p } = getR(data[i], data[j])
      const sig = p < 0.01 ? '**' : (p < 0.05 ? '*' : '')
      row.push(`${r.toFixed(4)}${sig}`)
    }
    corrRows.push(row)
  }

  const pairRows: unknown[][] = []
  const heatmapData: unknown[] = []
  for (let i = 0; i < cols.length; i++) {
    for (let j = 0; j < cols.length; j++) {
      if (i === j) { heatmapData.push({ x: cols[i], y: cols[j], value: 1.0, p: null }); continue }
      if (j < i) { heatmapData.push({ x: cols[i], y: cols[j], value: null, p: null }); continue }
      const { r, p } = getR(data[i], data[j])
      pairRows.push([cols[i], cols[j], r, round4(p), p < 0.01 ? '**' : (p < 0.05 ? '*' : 'n.s.')])
      heatmapData.push({ x: cols[i], y: cols[j], value: r, p: round4(p) })
    }
  }

  return {
    title: `상관 분석 (${label})`,
    tables: [
      { title: `${label} 상관계수 행렬 (상삼각)`, headers: ['변수', ...cols], rows: corrRows, footnotes: ['** p<0.01, * p<0.05', `N = ${n}`] },
      { title: '쌍별 상관계수', headers: ['변수1', '변수2', '상관계수(r)', 'p값', '유의성'], rows: pairRows },
    ],
    charts: [{ type: 'heatmap', title: `${label} 상관계수 히트맵`, data: heatmapData, xKey: 'x', yKey: 'y', valueKey: 'value' }],
  }
}

function welchDF(n1: number, v1: number, n2: number, v2: number): number {
  const t1 = v1 / n1, t2 = v2 / n2
  return (t1 + t2) ** 2 / (t1 ** 2 / (n1 - 1) + t2 ** 2 / (n2 - 1))
}

function leveneTest(g1: number[], g2: number[]): { f: number, p: number } {
  const med1 = quantile(g1, 0.5), med2 = quantile(g2, 0.5)
  const z1 = g1.map(v => Math.abs(v - med1))
  const z2 = g2.map(v => Math.abs(v - med2))
  const allZ = [...z1, ...z2]
  const grand = mean(allZ)
  const m1 = mean(z1), m2 = mean(z2)
  const n1 = g1.length, n2 = g2.length, N = n1 + n2
  const ss_between = n1 * (m1 - grand) ** 2 + n2 * (m2 - grand) ** 2
  const ss_within = z1.reduce((s, v) => s + (v - m1) ** 2, 0) + z2.reduce((s, v) => s + (v - m2) ** 2, 0)
  if (ss_within === 0) return { f: 0, p: 1 }
  const f = (ss_between / 1) / (ss_within / (N - 2))
  return { f: round4(f), p: round4(fPValue(f, 1, N - 2)) }
}

function cohensD(g1: number[], g2: number[]): number {
  const pooled = Math.sqrt((variance(g1) + variance(g2)) / 2)
  return pooled > 0 ? Math.abs(mean(g1) - mean(g2)) / pooled : 0
}

function runIndependentTtest(rows: Row[], variables: Variables): Record<string, unknown> {
  const depVar = ((variables.dependent ?? []) as string[])[0]
  const groupVar = ((variables.group ?? []) as string[])[0]
  const groupValues = (variables.group_values ?? []) as string[]
  if (!depVar || !groupVar) return { error: '종속 변수와 집단 변수를 선택하세요.' }

  const allGroups = [...new Set(rows.map(r => String(r[groupVar] ?? '')))]
  let groups: string[]
  if (groupValues.length === 2) {
    groups = allGroups.filter(g => groupValues.map(String).includes(g))
    if (groups.length !== 2) return { error: `선택한 범주를 찾을 수 없습니다: ${groupValues}` }
  } else if (allGroups.length === 2) {
    groups = allGroups
  } else {
    return { error: `집단 변수는 정확히 2개 집단이어야 합니다 (현재 ${allGroups.length}개).` }
  }

  const g1 = numericCol(rows.filter(r => String(r[groupVar] ?? '') === groups[0]), depVar)
  const g2 = numericCol(rows.filter(r => String(r[groupVar] ?? '') === groups[1]), depVar)
  if (g1.length < 2 || g2.length < 2) return { error: '각 집단에 최소 2개의 유효 관측치가 필요합니다.' }

  const { f: levF, p: levP } = leveneTest(g1, g2)
  const equalVar = levP > 0.05
  const v1 = variance(g1), v2 = variance(g2)
  const n1 = g1.length, n2 = g2.length
  const pooledSE = equalVar
    ? Math.sqrt(((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2) * (1 / n1 + 1 / n2))
    : Math.sqrt(v1 / n1 + v2 / n2)
  const df = equalVar ? n1 + n2 - 2 : welchDF(n1, v1, n2, v2)
  const meanDiff = mean(g1) - mean(g2)
  const t = meanDiff / (pooledSE || 1e-10)
  const p = tPValue(t, df)
  const d = cohensD(g1, g2)
  const dLabel = d < 0.5 ? '소(small)' : (d < 0.8 ? '중(medium)' : '대(large)')

  // CI
  const tCrit = 1.96 // 근사
  const ciLo = round4(meanDiff - tCrit * pooledSE)
  const ciHi = round4(meanDiff + tCrit * pooledSE)

  return {
    title: '독립표본 t-검정',
    tables: [
      {
        title: '집단별 기술통계',
        headers: ['집단', 'N', '평균', '표준편차', '표준오차'],
        rows: [
          [groups[0], n1, round4(mean(g1)), round4(stdDev(g1)), round4(sem(g1))],
          [groups[1], n2, round4(mean(g2)), round4(stdDev(g2)), round4(sem(g2))],
        ],
        footnotes: [`비교 대상: ${groups[0]} vs ${groups[1]}`],
      },
      {
        title: '독립표본 t-검정 결과',
        headers: ['검정 방식', 'Levene F', 'Levene p', 't', '자유도', 'p값', '평균차이', '95% CI 하한', '95% CI 상한'],
        rows: [[equalVar ? '등분산' : 'Welch', levF, levP, round4(t), round4(df), round4(p), round4(meanDiff), ciLo, ciHi]],
        footnotes: [`Levene p=${levP} → ${equalVar ? '등분산 가정' : 'Welch 보정 사용'}`, `Cohen's d = ${round4(d)} (${dLabel})`],
      },
    ],
  }
}

function runPairedTtest(rows: Row[], variables: Variables): Record<string, unknown> {
  const v1 = ((variables.variable1 ?? []) as string[])[0]
  const v2 = ((variables.variable2 ?? []) as string[])[0]
  if (!v1 || !v2) return { error: '두 변수를 선택하세요.' }
  if (v1 === v2) return { error: '서로 다른 두 변수를 선택해야 합니다.' }

  const pairs: [number, number][] = []
  for (const row of rows) {
    const a = toNum(row, v1), b = toNum(row, v2)
    if (a !== null && b !== null) pairs.push([a, b])
  }
  const n = pairs.length
  if (n < 3) return { error: `대응된 유효 쌍이 3개 이상 필요합니다 (현재 ${n}개).` }

  const x1 = pairs.map(p => p[0])
  const x2 = pairs.map(p => p[1])
  const diff = pairs.map(p => p[0] - p[1])
  const diffMean = mean(diff)
  const diffSD = stdDev(diff)
  const seDiff = diffSD / Math.sqrt(n)
  const t = diffMean / (seDiff || 1e-10)
  const p = tPValue(t, n - 1)
  const d = diffSD > 0 ? Math.abs(diffMean) / diffSD : 0
  const dLabel = d < 0.2 ? '소(small)' : (d < 0.5 ? '중(medium)' : '대(large)')
  const tCrit = 1.96
  const ciLo = round4(diffMean - tCrit * seDiff)
  const ciHi = round4(diffMean + tCrit * seDiff)

  return {
    title: '대응표본 t-검정',
    tables: [
      { title: '변수별 기술통계', headers: ['변수', 'N(쌍)', '평균', '표준편차'], rows: [[v1, n, round4(mean(x1)), round4(stdDev(x1))], [v2, n, round4(mean(x2)), round4(stdDev(x2))]] },
      {
        title: '대응표본 t-검정 결과',
        headers: ['t', '자유도', 'p값', '평균차이', '95% CI 하한', '95% CI 상한'],
        rows: [[round4(t), n - 1, round4(p), round4(diffMean), ciLo, ciHi]],
        footnotes: [`Cohen's d = ${round4(d)} (${dLabel})`, `차이 평균 = ${round4(diffMean)}, 차이 표준편차 = ${round4(diffSD)}`],
      },
    ],
  }
}

function runOneWayAnova(rows: Row[], variables: Variables): Record<string, unknown> {
  const filtered = applyLevelFilters(rows, variables)
  const depVar = ((variables.dependent ?? []) as string[])[0]
  const factorVar = ((variables.factor ?? []) as string[])[0]
  if (!depVar || !factorVar) return { error: '종속 변수와 요인 변수를 선택하세요.' }

  const groupNames = [...new Set(filtered.map(r => String(r[factorVar] ?? '')))].sort()
  if (groupNames.length < 2) return { error: '요인 변수에 2개 이상의 집단이 필요합니다.' }

  const groupsData = groupNames.map(g => numericCol(filtered.filter(r => String(r[factorVar] ?? '') === g), depVar))
  const allVals = numericCol(filtered, depVar)
  const N = allVals.length
  const k = groupNames.length
  const grandMean = mean(allVals)
  const ssBetween = groupsData.reduce((s, g) => s + g.length * (mean(g) - grandMean) ** 2, 0)
  const ssWithin = groupsData.reduce((s, g) => { const m = mean(g); return s + g.reduce((ss, v) => ss + (v - m) ** 2, 0) }, 0)
  const ssTotal = ssBetween + ssWithin
  const dfB = k - 1, dfW = N - k
  const msB = ssBetween / dfB, msW = ssWithin / dfW
  const f = msW > 0 ? msB / msW : 0
  const p = fPValue(f, dfB, dfW)
  const eta2 = ssTotal > 0 ? ssBetween / ssTotal : 0
  const etaLabel = eta2 < 0.06 ? '소' : (eta2 < 0.14 ? '중' : '대')

  const descRows = groupNames.map((g, i) => [g, groupsData[i].length, round4(mean(groupsData[i])), round4(stdDev(groupsData[i]))])
  const anovaRows = [
    ['집단 간(Between)', round4(ssBetween), dfB, round4(msB), round4(f), round4(p), round4(eta2)],
    ['집단 내(Within)', round4(ssWithin), dfW, round4(msW), '', '', ''],
    ['전체(Total)', round4(ssTotal), N - 1, '', '', '', ''],
  ]

  const tables: unknown[] = [
    { title: '집단별 기술통계', headers: ['집단', 'N', '평균', '표준편차'], rows: descRows },
    { title: '분산분석표(ANOVA)', headers: ['소스', '제곱합(SS)', '자유도(df)', '평균제곱(MS)', 'F', 'p값', 'η²'], rows: anovaRows, footnotes: [`η² = ${round4(eta2)} (${etaLabel} 효과크기)`] },
  ]

  // Tukey HSD 간소화 (p < 0.05일 때)
  if (p < 0.05 && k >= 2 && dfW > 0) {
    const tuKeyRows: unknown[][] = []
    for (let i = 0; i < k; i++) {
      for (let j = i + 1; j < k; j++) {
        const g1 = groupsData[i], g2 = groupsData[j]
        const diff = mean(g1) - mean(g2)
        const se = Math.sqrt(msW * (1 / g1.length + 1 / g2.length))
        const q = se > 0 ? Math.abs(diff) / se : 0
        // Studentized range approximation: p ≈ tPValue(q/sqrt(2), dfW) * (k*(k-1)/2)
        const pAdj = Math.min(1, tPValue(q / Math.SQRT2, dfW) * k * (k - 1) / 2)
        tuKeyRows.push([groupNames[i], groupNames[j], round4(diff), round4(pAdj), pAdj < 0.05 ? '유의' : 'n.s.'])
      }
    }
    tables.push({ title: 'Tukey HSD 사후 검정 (근사)', headers: ['집단1', '집단2', '평균차이', 'p-adj', '판정(α=0.05)'], rows: tuKeyRows })
  }

  const barData = groupNames.map((g, i) => ({ name: g, '평균': round4(mean(groupsData[i])) }))
  return {
    title: '일원분산분석(One-Way ANOVA)',
    tables,
    charts: barData.length > 0 ? [{ type: 'bar', title: `${factorVar} 집단별 ${depVar} 평균`, data: barData, xKey: 'name', yKey: '평균' }] : [],
  }
}

// OLS 선형 회귀 (행렬 계산)
function matMul(A: number[][], B: number[][]): number[][] {
  const m = A.length, n = B[0].length, k = B.length
  const C = Array.from({ length: m }, () => new Array(n).fill(0))
  for (let i = 0; i < m; i++)
    for (let j = 0; j < n; j++)
      for (let l = 0; l < k; l++)
        C[i][j] += A[i][l] * B[l][j]
  return C
}

function matTranspose(A: number[][]): number[][] {
  return A[0].map((_, j) => A.map(row => row[j]))
}

function matInverse2x2(A: number[][]): number[][] | null {
  const det = A[0][0] * A[1][1] - A[0][1] * A[1][0]
  if (Math.abs(det) < 1e-10) return null
  return [[A[1][1] / det, -A[0][1] / det], [-A[1][0] / det, A[0][0] / det]]
}

// Gauss-Jordan 역행렬
function matInverse(A: number[][]): number[][] | null {
  const n = A.length
  const aug = A.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => i === j ? 1 : 0)])
  for (let col = 0; col < n; col++) {
    let pivot = -1
    for (let row = col; row < n; row++) {
      if (Math.abs(aug[row][col]) > 1e-10) { pivot = row; break }
    }
    if (pivot === -1) return null
    ;[aug[col], aug[pivot]] = [aug[pivot], aug[col]]
    const scale = aug[col][col]
    aug[col] = aug[col].map(v => v / scale)
    for (let row = 0; row < n; row++) {
      if (row === col) continue
      const factor = aug[row][col]
      aug[row] = aug[row].map((v, j) => v - factor * aug[col][j])
    }
  }
  return aug.map(row => row.slice(n))
}

function runLinearRegression(rows: Row[], variables: Variables): Record<string, unknown> {
  const depVar = ((variables.dependent ?? []) as string[])[0]
  const predVars = (variables.predictors ?? []) as string[]
  if (!depVar || predVars.length === 0) return { error: '종속 변수와 예측 변수를 선택하세요.' }

  const validRows = rows.filter(r => [depVar, ...predVars].every(c => toNum(r, c) !== null))
  const n = validRows.length
  if (n < predVars.length + 2) return { error: `관측치(${n})가 너무 적습니다.` }

  const y = validRows.map(r => toNum(r, depVar) as number)
  const X = validRows.map(r => [1, ...predVars.map(c => toNum(r, c) as number)])

  const Xt = matTranspose(X)
  const XtX = matMul(Xt, X)
  const XtXinv = matInverse(XtX)
  if (!XtXinv) return { error: '행렬 역산 실패 (다중공선성 의심).' }
  const XtY = matMul(Xt, y.map(v => [v]))
  const beta = matMul(XtXinv, XtY).map(r => r[0])

  const fitted = X.map(row => row.reduce((s, v, i) => s + v * beta[i], 0))
  const residuals = y.map((v, i) => v - fitted[i])
  const yMean = mean(y)
  const ssTot = y.reduce((s, v) => s + (v - yMean) ** 2, 0)
  const ssRes = residuals.reduce((s, v) => s + v ** 2, 0)
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0
  const k = predVars.length
  const r2adj = 1 - (1 - r2) * (n - 1) / (n - k - 1)
  const mse = ssRes / (n - k - 1)
  const fStat = ((ssTot - ssRes) / k) / (mse || 1e-10)
  const fP = fPValue(fStat, k, n - k - 1)

  // 표준오차
  const se = XtXinv.map((row, i) => Math.sqrt(Math.abs(row[i] * mse)))
  const names = ['const', ...predVars]
  const coefRows = beta.map((b, i) => {
    const t = se[i] > 0 ? b / se[i] : 0
    const p = tPValue(t, n - k - 1)
    const sig = p < 0.001 ? '***' : (p < 0.01 ? '**' : (p < 0.05 ? '*' : ''))
    return [names[i], round4(b), round4(se[i]), round4(t), round4(p), sig]
  })

  // VIF
  const vifRows = predVars.length > 1
    ? predVars.map((pred, idx) => {
        const others = predVars.filter((_, j) => j !== idx)
        const vifData = validRows.filter(r => others.every(c => toNum(r, c) !== null))
        const yv = vifData.map(r => toNum(r, pred) as number)
        const Xv = vifData.map(r => [1, ...others.map(c => toNum(r, c) as number)])
        const XvT = matTranspose(Xv)
        const XvTXv = matMul(XvT, Xv)
        const inv = matInverse(XvTXv)
        if (!inv) return [pred, '-', '-']
        const bv = matMul(matMul(inv, XvT), yv.map(v => [v])).map(r => r[0])
        const fv = Xv.map(row => row.reduce((s, v, i) => s + v * bv[i], 0))
        const rv = yv.map((v, i) => v - fv[i])
        const ymv = mean(yv)
        const ssTv = yv.reduce((s, v) => s + (v - ymv) ** 2, 0)
        const ssRv = rv.reduce((s, v) => s + v ** 2, 0)
        const r2v = ssTv > 0 ? 1 - ssRv / ssTv : 0
        const vif = r2v < 1 ? 1 / (1 - r2v) : 999
        return [pred, round4(vif), vif > 10 ? '문제' : (vif > 5 ? '경계' : '양호')]
      })
    : [[predVars[0], 1.0, '양호']]

  const scatterData = fitted.slice(0, 200).map((fv, i) => ({ '실제값': round4(y[i]), '예측값': round4(fv), '잔차': round4(residuals[i]) }))

  return {
    title: '선형 회귀분석',
    tables: [
      { title: '모델 요약', headers: ['지표', '값'], rows: [['R²', round4(r2)], ['수정 R²', round4(r2adj)], ['F통계량', round4(fStat)], ['F p값', round4(fP)], ['N', n]] },
      { title: '회귀계수', headers: ['변수', '계수(B)', '표준오차(SE)', 't', 'p값', '유의성'], rows: coefRows, footnotes: ['*** p<0.001, ** p<0.01, * p<0.05'] },
      { title: '다중공선성 진단(VIF)', headers: ['변수', 'VIF', '판정'], rows: vifRows, footnotes: ['VIF<5: 양호, 5~10: 경계, >10: 문제'] },
    ],
    charts: [{ type: 'scatter', title: '실제값 vs 예측값', data: scatterData, xKey: '실제값', yKey: '예측값' }],
  }
}

// 생존분석 (순수 구현 - Python에서 포팅)
function kmCompute(durations: number[], events: number[]): { times: number[], survival: number[], ciLo: number[], ciHi: number[] } {
  const pairs = durations.map((t, i) => ({ t, e: events[i] })).sort((a, b) => a.t - b.t)
  const times: number[] = [], survival: number[] = [], ciLo: number[] = [], ciHi: number[] = []
  let nAtRisk = pairs.length, s = 1.0, greenwood = 0.0, prevT: number | null = null
  for (const { t, e } of pairs) {
    if (t !== prevT) {
      if (prevT !== null) {
        const se = s * Math.sqrt(greenwood)
        const z = 1.959964
        times.push(prevT); survival.push(round4(s))
        ciLo.push(round4(Math.max(0, s - z * se))); ciHi.push(round4(Math.min(1, s + z * se)))
      }
      prevT = t
    }
    const d = Math.round(e)
    if (d > 0 && nAtRisk > 0) {
      s = s * (1 - d / nAtRisk)
      greenwood += nAtRisk > d ? d / (nAtRisk * (nAtRisk - d)) : 0
    }
    nAtRisk--
  }
  if (prevT !== null) {
    const se = s * Math.sqrt(greenwood)
    const z = 1.959964
    times.push(prevT); survival.push(round4(s))
    ciLo.push(round4(Math.max(0, s - z * se))); ciHi.push(round4(Math.min(1, s + z * se)))
  }
  return { times, survival, ciLo, ciHi }
}

function logRankTest(t1: number[], e1: number[], t2: number[], e2: number[]): { chi2: number, p: number } | null {
  const allTimes = [...new Set([...t1, ...t2])].sort((a, b) => a - b)
  let o1Total = 0, e1Total = 0, varSum = 0
  for (const t of allTimes) {
    const d1 = t1.filter((tt, i) => tt === t && e1[i]).length
    const d2 = t2.filter((tt, i) => tt === t && e2[i]).length
    const n1t = t1.filter(tt => tt >= t).length
    const n2t = t2.filter(tt => tt >= t).length
    const n = n1t + n2t, d = d1 + d2
    if (n < 2 || d === 0) continue
    const e1t = n1t * d / n
    o1Total += d1; e1Total += e1t
    const v = n > 1 ? n1t * n2t * d * (n - d) / (n * n * (n - 1)) : 0
    varSum += v
  }
  if (varSum <= 0) return null
  const chi2 = (o1Total - e1Total) ** 2 / varSum
  const p = chiSquarePValue(chi2, 1)
  return { chi2: round4(chi2), p: round4(p) }
}

function runSurvival(rows: Row[], variables: Variables): Record<string, unknown> {
  const durVar = ((variables.duration ?? []) as string[])[0]
  const eventVar = ((variables.event ?? []) as string[])[0]
  const groupVar = ((variables.group ?? []) as string[])[0]
  if (!durVar || !eventVar) return { error: '기간(duration) 변수와 이벤트(event) 변수를 선택하세요.' }

  const validRows = rows.filter(r => toNum(r, durVar) !== null && toNum(r, eventVar) !== null)
  if (validRows.length < 5) return { error: `유효 관측치 부족(n=${validRows.length}, 최소 5개 필요)` }

  const groupsList = groupVar ? [...new Set(validRows.map(r => String(r[groupVar] ?? '')))] : [null]
  const tables: unknown[] = []
  const kmRows: unknown[][] = []
  const chartData: unknown[] = []

  for (const g of groupsList) {
    const subset = g === null ? validRows : validRows.filter(r => String(r[groupVar] ?? '') === g)
    const label = g ?? '전체'
    const durations = subset.map(r => toNum(r, durVar) as number)
    const events = subset.map(r => toNum(r, eventVar) as number)
    const { times, survival, ciLo, ciHi } = kmCompute(durations, events)
    const step = Math.max(1, Math.floor(times.length / 20))
    for (let i = 0; i < times.length; i += step) {
      kmRows.push([label, round4(times[i]), survival[i], ciLo[i], ciHi[i]])
    }
    for (let i = 0; i < times.length; i++) {
      chartData.push({ '시간': round4(times[i]), [label]: survival[i] })
    }
  }

  tables.push({ title: '카플란-마이어 생존 함수 (주요 시점)', headers: ['집단', '시간', 'S(t)', '95% CI 하한', '95% CI 상한'], rows: kmRows, footnotes: ['S(t): 시간 t까지 생존 확률'] })

  const medRows = groupsList.map(g => {
    const subset = g === null ? validRows : validRows.filter(r => String(r[groupVar] ?? '') === g)
    const label = g ?? '전체'
    const durations = subset.map(r => toNum(r, durVar) as number)
    const events = subset.map(r => toNum(r, eventVar) as number)
    const { times, survival } = kmCompute(durations, events)
    const medT = times.find((t, i) => survival[i] <= 0.5) ?? '미도달'
    return [label, subset.length, events.filter(e => e > 0).length, medT]
  })
  tables.push({ title: '중앙 생존 시간', headers: ['집단', 'N', '이벤트 수', '중앙생존시간'], rows: medRows })

  if (groupVar && groupsList.length === 2 && groupsList[0] !== null && groupsList[1] !== null) {
    const g0 = validRows.filter(r => String(r[groupVar] ?? '') === groupsList[0])
    const g1 = validRows.filter(r => String(r[groupVar] ?? '') === groupsList[1])
    const lr = logRankTest(
      g0.map(r => toNum(r, durVar) as number), g0.map(r => toNum(r, eventVar) as number),
      g1.map(r => toNum(r, durVar) as number), g1.map(r => toNum(r, eventVar) as number),
    )
    if (lr) {
      tables.push({ title: 'Log-rank 검정', headers: ['항목', '값'], rows: [['카이제곱 통계량', lr.chi2], ['p값', lr.p], ['판정(α=0.05)', lr.p < 0.05 ? '유의' : 'n.s.']], footnotes: ['귀무가설: 두 집단의 생존 함수가 동일하다'] })
    }
  }

  return { title: '생존 분석 (Kaplan-Meier)', tables, charts: chartData.length > 0 ? [{ type: 'line', title: 'Kaplan-Meier 생존 곡선', data: chartData, xKey: '시간' }] : [] }
}

function runTimeseriesDecompose(rows: Row[], variables: Variables, options: Options): Record<string, unknown> {
  const varName = ((variables.variable ?? []) as string[])[0]
  const dateCol = ((variables.date_col ?? []) as string[])[0]
  const period = parseInt(String(options.period ?? 12))
  if (!varName) return { error: '시계열 값 변수를 선택하세요.' }

  let sorted = rows.filter(r => toNum(r, varName) !== null)
  if (dateCol) sorted = [...sorted].sort((a, b) => String(a[dateCol] ?? '').localeCompare(String(b[dateCol] ?? '')))
  const s = sorted.map(r => toNum(r, varName) as number)
  const n = s.length
  if (n < period * 2) return { error: `관측치(${n})가 부족합니다(주기 ${period}에 최소 ${period * 2}개 필요).` }

  // 이동평균 추세
  const halfP = Math.floor(period / 2)
  const trend = s.map((_, i) => {
    if (i < halfP || i >= n - halfP) return null
    const window = s.slice(i - halfP, i + halfP + 1)
    return mean(window)
  })

  // 계절성 (평균 계절 패턴)
  const detrended = s.map((v, i) => trend[i] !== null ? v - trend[i]! : null)
  const seasonal = new Array(n).fill(0)
  const seasonalAvg = Array.from({ length: period }, (_, p) => {
    const vals = detrended.filter((v, i) => v !== null && i % period === p) as number[]
    return vals.length > 0 ? mean(vals) : 0
  })
  for (let i = 0; i < n; i++) seasonal[i] = seasonalAvg[i % period]

  // 잔차
  const residual = s.map((v, i) => trend[i] !== null ? v - (trend[i]! + seasonal[i]) : v - seasonal[i])

  const step = Math.max(1, Math.floor(n / 24))
  const sampleRows: unknown[][] = []
  const trendData: unknown[] = []
  const seasonalData: unknown[] = []
  const residData: unknown[] = []

  for (let i = 0; i < n; i++) {
    const lbl = dateCol && sorted[i][dateCol] ? String(sorted[i][dateCol]) : String(i)
    trendData.push({ '시점': lbl, '원래값': round4(s[i]), '추세': trend[i] !== null ? round4(trend[i]!) : null })
    seasonalData.push({ '시점': lbl, '계절성': round4(seasonal[i]) })
    residData.push({ '시점': lbl, '잔차': round4(residual[i]) })
    if (i % step === 0) {
      sampleRows.push([lbl, round4(s[i]), trend[i] !== null ? round4(trend[i]!) : '-', round4(seasonal[i]), round4(residual[i])])
    }
  }

  return {
    title: '시계열 분해 (이동평균)',
    tables: [
      { title: `성분별 분해 수치 (표시간격=${step})`, headers: ['시점', '원래값', '추세', '계절성', '잔차'], rows: sampleRows },
    ],
    charts: [
      { type: 'line', title: '원래값 및 추세', data: trendData, xKey: '시점' },
      { type: 'line', title: '계절성', data: seasonalData, xKey: '시점' },
      { type: 'line', title: '잔차', data: residData, xKey: '시점' },
    ],
  }
}

function runChiSquareTest(rows: Row[], variables: Variables): Record<string, unknown> {
  const filtered = applyLevelFilters(rows, variables)
  const v1 = ((variables.variable1 ?? []) as string[])[0]
  const v2 = ((variables.variable2 ?? []) as string[])[0]
  if (!v1 || !v2) return { error: '두 범주 변수를 선택하세요.' }

  const rowVals = [...new Set(filtered.map(r => String(r[v1] ?? '')))]
  const colVals = [...new Set(filtered.map(r => String(r[v2] ?? '')))]
  const ct = new Map<string, Map<string, number>>()
  for (const rv of rowVals) ct.set(rv, new Map(colVals.map(cv => [cv, 0])))
  for (const r of filtered) {
    const rv = String(r[v1] ?? ''), cv = String(r[v2] ?? '')
    ct.get(rv)?.set(cv, (ct.get(rv)?.get(cv) ?? 0) + 1)
  }

  const rowTotals = new Map(rowVals.map(rv => [rv, colVals.reduce((s, cv) => s + (ct.get(rv)?.get(cv) ?? 0), 0)]))
  const colTotals = new Map(colVals.map(cv => [cv, rowVals.reduce((s, rv) => s + (ct.get(rv)?.get(cv) ?? 0), 0)]))
  const N = [...rowTotals.values()].reduce((s, v) => s + v, 0)
  let chi2 = 0
  const dof = (rowVals.length - 1) * (colVals.length - 1)
  for (const rv of rowVals) for (const cv of colVals) {
    const obs = ct.get(rv)?.get(cv) ?? 0
    const exp = ((rowTotals.get(rv) ?? 0) * (colTotals.get(cv) ?? 0)) / N
    if (exp > 0) chi2 += (obs - exp) ** 2 / exp
  }
  const p = chiSquarePValue(chi2, dof)
  const cramerV = N > 0 && Math.min(rowVals.length, colVals.length) > 1 ? Math.sqrt(chi2 / (N * (Math.min(rowVals.length, colVals.length) - 1))) : 0

  const headers = [`${v1} \\ ${v2}`, ...colVals]
  const tableRows: unknown[][] = rowVals.map(rv => [rv, ...colVals.map(cv => ct.get(rv)?.get(cv) ?? 0)])
  const heatmapData: unknown[] = []
  const stackedData: unknown[] = rowVals.map(rv => {
    const item: Record<string, unknown> = { name: rv }
    colVals.forEach(cv => {
      item[cv] = ct.get(rv)?.get(cv) ?? 0
      heatmapData.push({ x: rv, y: cv, value: ct.get(rv)?.get(cv) ?? 0 })
    })
    return item
  })

  return {
    title: '카이제곱 독립성 검정',
    tables: [
      { title: `${v1} × ${v2} 교차표`, headers, rows: tableRows },
      { title: '검정 결과', headers: ['통계량', '값', '자유도', 'p값'], rows: [['Pearson Chi-square', round4(chi2), dof, round4(p)], ["Cramér's V", round4(cramerV), '-', '-']], footnotes: ['* p < 0.05: 두 변수 간 독립성 기각(연관성 있음)'] },
    ],
    charts: [
      { type: 'heatmap', title: '관측 빈도 히트맵', data: heatmapData, xKey: 'x', yKey: 'y', valueKey: 'value' },
      { type: 'bar', title: '누적 막대 차트', data: stackedData, xKey: 'name', stackKeys: colVals },
    ],
  }
}

// 로지스틱 회귀 (Gradient Descent)
function sigmoid(x: number): number { return 1 / (1 + Math.exp(-Math.max(-500, Math.min(500, x)))) }

function runLogisticRegression(rows: Row[], variables: Variables): Record<string, unknown> {
  const depVar = ((variables.dependent ?? []) as string[])[0]
  const predVars = (variables.predictors ?? []) as string[]
  if (!depVar || predVars.length === 0) return { error: '종속 변수와 예측 변수를 선택하세요.' }

  const validRows = rows.filter(r => [depVar, ...predVars].every(c => r[c] !== null && r[c] !== undefined && r[c] !== ''))
  const n = validRows.length
  if (n < predVars.length + 2) return { error: `관측치(${n})가 너무 적습니다.` }

  // y 인코딩
  const yRaw = validRows.map(r => r[depVar])
  const unique = [...new Set(yRaw.map(String))]
  if (unique.length !== 2) return { error: `종속 변수는 0/1 또는 2개 값을 가져야 합니다 (현재 ${unique.length}개).` }
  const y = yRaw.map(v => String(v) === unique[0] ? 0 : 1)
  const X = validRows.map(r => [1, ...predVars.map(c => Number(r[c]))])

  // Newton-Raphson 최적화 (간소화 GD)
  const p = X[0].length
  let beta = new Array(p).fill(0)
  const lr = 0.01
  for (let iter = 0; iter < 200; iter++) {
    const grad = new Array(p).fill(0)
    for (let i = 0; i < n; i++) {
      const pred = sigmoid(X[i].reduce((s, v, j) => s + v * beta[j], 0))
      const err = pred - y[i]
      for (let j = 0; j < p; j++) grad[j] += err * X[i][j]
    }
    beta = beta.map((b, j) => b - lr * grad[j] / n)
  }

  // 표준오차 (Fisher information matrix diagonal)
  const probs = X.map(row => sigmoid(row.reduce((s, v, j) => s + v * beta[j], 0)))
  const fisher = Array.from({ length: p }, () => new Array(p).fill(0))
  for (let i = 0; i < n; i++) {
    const w = probs[i] * (1 - probs[i])
    for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) fisher[a][b] += w * X[i][a] * X[i][b]
  }
  const fisherInv = matInverse(fisher)
  const se = fisherInv ? beta.map((_, j) => Math.sqrt(Math.abs(fisherInv[j][j]))) : new Array(p).fill(0.1)

  const names = ['const', ...predVars]
  const coefRows = beta.map((b, i) => {
    const z = se[i] > 0 ? b / se[i] : 0
    const p_val = tPValue(z, n - p)  // z근사
    const or = round4(Math.exp(b))
    const sig = p_val < 0.001 ? '***' : (p_val < 0.01 ? '**' : (p_val < 0.05 ? '*' : ''))
    return [names[i], round4(b), round4(se[i]), round4(z), round4(p_val), or, sig]
  })

  const roc = probs.slice(0, 200).map((prob, i) => ({ index: i, actual: y[i], prob: round4(prob) }))

  return {
    title: '이항 로지스틱 회귀분석',
    tables: [
      { title: '모델 정보', headers: ['지표', '값'], rows: [['관측치(N)', n], ['예측변수', predVars.length]] },
      { title: '회귀계수 (Odds Ratio 포함)', headers: ['변수', 'B', 'SE', 'z', 'p값', 'Odds Ratio', '유의성'], rows: coefRows, footnotes: ['*** p<0.001, ** p<0.01, * p<0.05'] },
    ],
    charts: [{ type: 'scatter', title: '예측 확률 분포', data: roc, xKey: 'index', yKey: 'prob', groupKey: 'actual' }],
  }
}

// PCA (공분산 행렬 → 멱승법 eigen decomposition)
function runPCA(rows: Row[], variables: Variables, options: Options): Record<string, unknown> {
  const cols = (variables.variables ?? []) as string[]
  const nComp = Math.min(parseInt(String(options.n_components ?? 2)), cols.length)
  if (cols.length < 2) return { error: 'PCA는 2개 이상의 연속 변수가 필요합니다.' }

  const validRows = rows.filter(r => cols.every(c => toNum(r, c) !== null))
  const n = validRows.length
  if (n < 3) return { error: `유효 관측치 부족(n=${n})` }

  const data = cols.map(c => validRows.map(r => toNum(r, c) as number))
  const means = data.map(arr => mean(arr))
  const stds = data.map(arr => stdDev(arr))
  const scaled = data.map((arr, i) => arr.map(v => stds[i] > 0 ? (v - means[i]) / stds[i] : 0))

  // 공분산 행렬
  const p = cols.length
  const cov = Array.from({ length: p }, (_, i) => Array.from({ length: p }, (_, j) => {
    let s = 0
    for (let k = 0; k < n; k++) s += scaled[i][k] * scaled[j][k]
    return s / (n - 1)
  }))

  // Jacobi eigen decomposition (대칭 행렬)
  const eigenVectors: number[][] = Array.from({ length: p }, (_, i) => Array.from({ length: p }, (_, j) => i === j ? 1 : 0))
  const A = cov.map(row => [...row])
  for (let iter = 0; iter < 100; iter++) {
    let maxVal = 0, pi = 0, pj = 1
    for (let i = 0; i < p; i++) for (let j = i + 1; j < p; j++) {
      if (Math.abs(A[i][j]) > maxVal) { maxVal = Math.abs(A[i][j]); pi = i; pj = j }
    }
    if (maxVal < 1e-10) break
    const theta = 0.5 * Math.atan2(2 * A[pi][pj], A[pi][pi] - A[pj][pj])
    const c = Math.cos(theta), s = Math.sin(theta)
    const newA = A.map(row => [...row])
    for (let k = 0; k < p; k++) {
      if (k !== pi && k !== pj) {
        newA[pi][k] = newA[k][pi] = c * A[pi][k] - s * A[pj][k]
        newA[pj][k] = newA[k][pj] = s * A[pi][k] + c * A[pj][k]
      }
    }
    newA[pi][pi] = c ** 2 * A[pi][pi] - 2 * s * c * A[pi][pj] + s ** 2 * A[pj][pj]
    newA[pj][pj] = s ** 2 * A[pi][pi] + 2 * s * c * A[pi][pj] + c ** 2 * A[pj][pj]
    newA[pi][pj] = newA[pj][pi] = 0
    for (let k = 0; k < p; k++) {
      const vi = eigenVectors[k][pi], vj = eigenVectors[k][pj]
      eigenVectors[k][pi] = c * vi - s * vj
      eigenVectors[k][pj] = s * vi + c * vj
    }
    for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) A[i][j] = newA[i][j]
  }
  const eigenValues = A.map((_, i) => A[i][i])
  const order = eigenValues.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v)
  const totalVar = eigenValues.reduce((s, v) => s + Math.max(0, v), 0)

  const eigenRows: unknown[][] = []
  const screeData: unknown[] = []
  let cumExp = 0
  for (let k = 0; k < nComp; k++) {
    const { v, i } = order[k]
    const exp = totalVar > 0 ? Math.max(0, v) / totalVar : 0
    cumExp += exp
    eigenRows.push([`PC${k + 1}`, round4(Math.max(0, v)), round4(exp), round4(cumExp)])
    screeData.push({ name: `PC${k + 1}`, '기여율': round4(exp * 100) })
  }

  const loadingsRows: unknown[][] = cols.map((col, j) => [col, ...Array.from({ length: nComp }, (_, k) => round4(eigenVectors[j][order[k].i]))])
  const scores = Array.from({ length: n }, (_, row) =>
    Array.from({ length: nComp }, (_, k) => cols.reduce((s, _, j) => s + scaled[j][row] * eigenVectors[j][order[k].i], 0))
  )
  const scatterData = scores.slice(0, 200).map(s => ({ 'PC1': round4(s[0]), 'PC2': round4(s[1] ?? 0) }))

  return {
    title: `주성분분석(PCA) — ${nComp}개 성분`,
    tables: [
      { title: '고유값 및 분산 기여율', headers: ['성분', '고유값', '기여율', '누적기여율'], rows: eigenRows },
      { title: '주성분 적재량(Loadings)', headers: ['변수', ...Array.from({ length: nComp }, (_, k) => `PC${k + 1}`)], rows: loadingsRows },
    ],
    charts: [
      { type: 'bar', title: 'Scree Plot (분산 기여율 %)', data: screeData, xKey: 'name', yKey: '기여율' },
      { type: 'scatter', title: 'PC1 vs PC2 점수 산점도', data: scatterData, xKey: 'PC1', yKey: 'PC2' },
    ],
  }
}

function runKmeansClustering(rows: Row[], variables: Variables, options: Options): Record<string, unknown> {
  const cols = (variables.variables ?? []) as string[]
  const k = Math.min(parseInt(String(options.k ?? 3)), 10)
  if (cols.length === 0) return { error: '최소 1개 이상의 연속 변수를 선택하세요.' }

  const validRows = rows.filter(r => cols.every(c => toNum(r, c) !== null))
  const n = validRows.length
  if (n < k + 1) return { error: `관측치(${n})가 클러스터 수(${k})보다 적습니다.` }

  const data = validRows.map(r => cols.map(c => toNum(r, c) as number))
  const means2 = cols.map((_, j) => mean(data.map(d => d[j])))
  const stds2 = cols.map((_, j) => stdDev(data.map(d => d[j])))
  const scaled = data.map(row => row.map((v, j) => stds2[j] > 0 ? (v - means2[j]) / stds2[j] : 0))

  // 초기 중심: 균등 간격 샘플링
  let centers = Array.from({ length: k }, (_, i) => scaled[Math.floor(i * n / k)])
  let labels = new Array(n).fill(0)

  for (let iter = 0; iter < 100; iter++) {
    const newLabels = scaled.map(point => {
      let minDist = Infinity, minIdx = 0
      for (let c = 0; c < k; c++) {
        const dist = centers[c].reduce((s, v, j) => s + (v - point[j]) ** 2, 0)
        if (dist < minDist) { minDist = dist; minIdx = c }
      }
      return minIdx
    })
    const changed = newLabels.some((l, i) => l !== labels[i])
    labels = newLabels
    if (!changed) break
    centers = Array.from({ length: k }, (_, c) => {
      const members = scaled.filter((_, i) => labels[i] === c)
      if (members.length === 0) return centers[c]
      return cols.map((_, j) => mean(members.map(m => m[j])))
    })
  }

  const clusterScatter: unknown[] = []
  const summaryRows: unknown[][] = Array.from({ length: k }, (_, c) => {
    const members = data.filter((_, i) => labels[i] === c)
    const centroid = centers[c].map(v => round4(v))
    members.slice(0, 50).forEach((row, idx) => {
      const point: Record<string, unknown> = { cluster: `Cluster ${c + 1}` }
      cols.forEach((col, j) => { point[col] = round4(row[j]) })
      if (cols.length >= 2) { point['x'] = round4(row[0]); point['y'] = round4(row[1]) }
      clusterScatter.push(point)
    })
    return [`Cluster ${c + 1}`, members.length, ...centroid]
  })

  return {
    title: `K-Means 클러스터링 (k=${k})`,
    tables: [{ title: '클러스터별 크기 및 표준화 중심', headers: ['클러스터', 'N', ...cols], rows: summaryRows }],
    charts: [{ type: 'scatter', title: '클러스터 산점도', data: clusterScatter, xKey: cols[0], yKey: cols[1] ?? cols[0], groupKey: 'cluster' }],
  }
}

function runMannWhitneyU(rows: Row[], variables: Variables): Record<string, unknown> {
  const depVar = ((variables.dependent ?? []) as string[])[0]
  const groupVar = ((variables.group ?? []) as string[])[0]
  const groupValues = (variables.group_values ?? []) as string[]
  if (!depVar || !groupVar) return { error: '종속 변수와 집단 변수를 선택하세요.' }

  const allGroups = [...new Set(rows.map(r => String(r[groupVar] ?? '')))]
  let groups: string[]
  if (groupValues.length === 2) {
    groups = allGroups.filter(g => groupValues.map(String).includes(g))
    if (groups.length !== 2) return { error: `선택한 범주를 찾을 수 없습니다.` }
  } else if (allGroups.length === 2) {
    groups = allGroups
  } else {
    return { error: `집단 변수는 정확히 2개 집단이어야 합니다 (현재 ${allGroups.length}개).` }
  }

  const g1 = numericCol(rows.filter(r => String(r[groupVar] ?? '') === groups[0]), depVar)
  const g2 = numericCol(rows.filter(r => String(r[groupVar] ?? '') === groups[1]), depVar)
  if (g1.length === 0 || g2.length === 0) return { error: '유효 관측치가 없습니다.' }

  let u = 0
  for (const a of g1) for (const b of g2) {
    if (a > b) u++
    else if (a === b) u += 0.5
  }
  const n1 = g1.length, n2 = g2.length
  const muU = n1 * n2 / 2
  const sigmaU = Math.sqrt(n1 * n2 * (n1 + n2 + 1) / 12)
  const z = sigmaU > 0 ? (u - muU) / sigmaU : 0
  const p = 2 * (1 - normalCDF(Math.abs(z)))
  const r = n1 * n2 > 0 ? Math.abs(1 - 2 * u / (n1 * n2)) : 0

  return {
    title: 'Mann-Whitney U 검정',
    tables: [
      { title: '집단별 기술통계', headers: ['집단', 'N', '중앙값', '평균'], rows: [[groups[0], n1, round4(quantile(g1, 0.5)), round4(mean(g1))], [groups[1], n2, round4(quantile(g2, 0.5)), round4(mean(g2))]] },
      { title: 'Mann-Whitney U 검정 결과', headers: ['U 통계량', 'z(근사)', 'p값', '효과크기 r', '판정(α=0.05)'], rows: [[round4(u), round4(z), round4(p), round4(r), p < 0.05 ? '유의' : 'n.s.']] },
    ],
    charts: [{ type: 'bar', title: '집단별 중앙값 비교', data: [{ name: groups[0], '중앙값': round4(quantile(g1, 0.5)) }, { name: groups[1], '중앙값': round4(quantile(g2, 0.5)) }], xKey: 'name', yKey: '중앙값' }],
  }
}

function runWilcoxonSignedRank(rows: Row[], variables: Variables): Record<string, unknown> {
  const v1 = ((variables.variable1 ?? []) as string[])[0]
  const v2 = ((variables.variable2 ?? []) as string[])[0]
  if (!v1 || !v2) return { error: '두 변수를 선택하세요.' }
  if (v1 === v2) return { error: '서로 다른 두 변수를 선택해야 합니다.' }

  const pairs: [number, number][] = rows
    .map(r => [toNum(r, v1), toNum(r, v2)] as [number | null, number | null])
    .filter(([a, b]) => a !== null && b !== null) as [number, number][]
  const n = pairs.length
  if (n < 3) return { error: `대응된 유효 쌍이 3개 이상 필요합니다 (현재 ${n}개).` }

  const diffs = pairs.map(([a, b]) => a - b).filter(d => d !== 0)
  const absDiffs = diffs.map(d => Math.abs(d))
  const signs = diffs.map(d => Math.sign(d))
  const ranks = rankArr(absDiffs)
  let wPlus = 0, wMinus = 0
  for (let i = 0; i < diffs.length; i++) {
    if (signs[i] > 0) wPlus += ranks[i]
    else wMinus += ranks[i]
  }
  const w = Math.min(wPlus, wMinus)
  const nD = diffs.length
  const muW = nD * (nD + 1) / 4
  const sigmaW = Math.sqrt(nD * (nD + 1) * (2 * nD + 1) / 24)
  const z = sigmaW > 0 ? (w - muW) / sigmaW : 0
  const p = 2 * (1 - normalCDF(Math.abs(z)))
  const r = sigmaW > 0 ? Math.abs(z) / Math.sqrt(nD) : 0

  const x1 = pairs.map(([a]) => a), x2 = pairs.map(([, b]) => b)
  return {
    title: 'Wilcoxon Signed-Rank 검정',
    tables: [
      { title: '변수별 기술통계', headers: ['변수', 'N(쌍)', '중앙값'], rows: [[v1, n, round4(quantile(x1, 0.5))], [v2, n, round4(quantile(x2, 0.5))]] },
      { title: 'Wilcoxon Signed-Rank 검정 결과', headers: ['W 통계량', 'p값', '효과크기 r', '판정(α=0.05)'], rows: [[round4(w), round4(p), round4(r), p < 0.05 ? '유의' : 'n.s.']], footnotes: [`차이 중앙값 = ${round4(quantile(diffs, 0.5))}`] },
    ],
    charts: [{ type: 'bar', title: '변수별 중앙값 비교', data: [{ name: v1, '중앙값': round4(quantile(x1, 0.5)) }, { name: v2, '중앙값': round4(quantile(x2, 0.5)) }], xKey: 'name', yKey: '중앙값' }],
  }
}

// ────────────────────────────────────────────
// 디스패처
// ────────────────────────────────────────────

const ANALYSIS_FNS: Record<string, (rows: Row[], variables: Variables, options: Options) => Record<string, unknown>> = {
  descriptives: (rows, v) => runDescriptives(rows, v),
  frequencies: (rows, v) => runFrequencies(rows, v),
  normality: (rows, v) => runNormality(rows, v),
  crosstab: (rows, v) => runCrosstab(rows, v),
  correlation: (rows, v, o) => runCorrelation(rows, v, o),
  independent_ttest: (rows, v) => runIndependentTtest(rows, v),
  paired_ttest: (rows, v) => runPairedTtest(rows, v),
  one_way_anova: (rows, v) => runOneWayAnova(rows, v),
  linear_regression: (rows, v) => runLinearRegression(rows, v),
  survival: (rows, v) => runSurvival(rows, v),
  timeseries_decompose: (rows, v, o) => runTimeseriesDecompose(rows, v, o),
  chi_square_test: (rows, v) => runChiSquareTest(rows, v),
  logistic_regression: (rows, v) => runLogisticRegression(rows, v),
  pca: (rows, v, o) => runPCA(rows, v, o),
  kmeans_clustering: (rows, v, o) => runKmeansClustering(rows, v, o),
  mann_whitney_u: (rows, v) => runMannWhitneyU(rows, v),
  wilcoxon_signed_rank: (rows, v) => runWilcoxonSignedRank(rows, v),
}

export async function runAnalyze(input: {
  session_id: string
  user_id: string
  analysis_type: string
  variables?: Variables
  options?: Options
}): Promise<Record<string, unknown>> {
  const { session_id, user_id, analysis_type, variables = {}, options = {} } = input
  const session = await loadSession(session_id, user_id)
  const fn = ANALYSIS_FNS[analysis_type]
  if (!fn) return { ok: false, error: `지원하지 않는 분석: ${analysis_type}` }
  try {
    const result = fn(session.rows, variables, options)
    return { ...result, ok: !('error' in result) }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}
