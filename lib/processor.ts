/**
 * 데이터 가공 규칙 엔진
 * 변환 실패는 throw 하지 않고 errors 배열에 기록 — 부분 실패 허용
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { inferSchema } from '@/lib/submission'
import { randomHex } from './utils'

export type Row = Record<string, unknown>

export type AggFunc = 'sum' | 'count' | 'mean' | 'max' | 'min'

export const RULE_TYPES = [
  'select', 'rename', 'cast', 'nullfill', 'nulldrop', 'filter',
  'normalize', 'derive', 'dedup', 'codemap', 'concat', 'split',
  'aggregate', 'join', 'pivot',
] as const

export type RuleType = (typeof RULE_TYPES)[number]

export type Rule =
  | { type: 'select';    mode: 'include' | 'exclude'; columns: string[] }
  | { type: 'rename';    from: string; to: string }
  | { type: 'cast';      column: string; to: 'number' | 'string' | 'date' }
  | { type: 'nullfill';  column: string; value: unknown }
  | { type: 'nulldrop';  columns: string[] }
  | { type: 'filter';    column: string; op: '>' | '<' | '>=' | '<=' | '==' | '!=' | 'contains' | 'startsWith' | 'endsWith'; value: unknown }
  | { type: 'normalize'; column: string; fn: 'trim' | 'upper' | 'lower' }
  | { type: 'derive';    target: string; expr: 'year' | 'month' | 'day' | 'quarter' | 'weekday' | 'hour' | 'dateformat'; source: string; format?: string }
  | { type: 'dedup';     keys: string[] }
  | { type: 'codemap';   column: string; map: Record<string, string>; fallback?: 'keep' | 'null' }
  | { type: 'concat';    target: string; sources: string[]; separator: string }
  | { type: 'split';     column: string; separator: string; targets: string[] }
  | { type: 'aggregate'; groupBy: string[]; column: string; agg: AggFunc; target?: string }
  | { type: 'join';      datasetId: string; on: string; how: 'left' | 'inner' | 'right' }
  | { type: 'pivot';     index: string; columns: string; values: string; agg: AggFunc }

export interface ProcessError {
  rowIndex: number
  ruleIndex: number
  column?: string
  message: string
}

export interface ProcessResult {
  rows: Row[]
  errors: ProcessError[]
  inputRows: number
  outputRows: number
  errorRows: number
}

export interface RuleValidationError {
  index: number
  type: string
  message: string
}

const VALID_CAST_TARGETS = ['number', 'string', 'date'] as const
const VALID_FILTER_OPS = ['>', '<', '>=', '<=', '==', '!=', 'contains', 'startsWith', 'endsWith'] as const
const VALID_NORMALIZE_FNS = ['trim', 'upper', 'lower'] as const
const VALID_DERIVE_EXPRS = ['year', 'month', 'day', 'quarter', 'weekday', 'hour', 'dateformat'] as const
const VALID_AGG_FUNCS = ['sum', 'count', 'mean', 'max', 'min'] as const
const VALID_JOIN_HOWS = ['left', 'inner', 'right'] as const

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every(i => typeof i === 'string')
}

const SAFE_TABLE_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/

export function isSafeTableName(name: string): boolean {
  return SAFE_TABLE_NAME_RE.test(name)
}

/**
 * 단일 규칙의 필수 필드와 타입을 검증한다.
 * 오류가 있으면 설명 문자열을, 없으면 null을 반환한다.
 */
export function validateRule(rule: unknown, index: number): RuleValidationError | null {
  if (!rule || typeof rule !== 'object') {
    return { index, type: 'unknown', message: '규칙이 객체가 아닙니다' }
  }
  const r = rule as Record<string, unknown>
  const type = r.type
  if (!isNonEmptyString(type) || !RULE_TYPES.includes(type as RuleType)) {
    return { index, type: String(type), message: `지원하지 않는 규칙 타입입니다: ${type}` }
  }

  switch (type) {
    case 'select': {
      if (!isStringArray(r.columns) || r.columns.length === 0) {
        return { index, type, message: '선택할 컬럼을 1개 이상 지정해야 합니다' }
      }
      if (r.mode !== 'include' && r.mode !== 'exclude') {
        return { index, type, message: 'mode는 include 또는 exclude여야 합니다' }
      }
      break
    }
    case 'rename': {
      if (!isNonEmptyString(r.from)) return { index, type, message: 'from 컬럼명을 입력해야 합니다' }
      if (!isNonEmptyString(r.to)) return { index, type, message: 'to 컬럼명을 입력해야 합니다' }
      break
    }
    case 'cast': {
      if (!isNonEmptyString(r.column)) return { index, type, message: '컬럼명을 입력해야 합니다' }
      if (!VALID_CAST_TARGETS.includes(r.to as typeof VALID_CAST_TARGETS[number])) {
        return { index, type, message: 'to는 number/string/date 중 하나여야 합니다' }
      }
      break
    }
    case 'nullfill': {
      if (!isNonEmptyString(r.column)) return { index, type, message: '컬럼명을 입력해야 합니다' }
      break
    }
    case 'nulldrop': {
      if (!isStringArray(r.columns) || r.columns.length === 0) {
        return { index, type, message: '제거 기준 컬럼을 1개 이상 지정해야 합니다' }
      }
      break
    }
    case 'filter': {
      if (!isNonEmptyString(r.column)) return { index, type, message: '컬럼명을 입력해야 합니다' }
      if (!VALID_FILTER_OPS.includes(r.op as typeof VALID_FILTER_OPS[number])) {
        return { index, type, message: '지원하지 않는 비교 연산자입니다' }
      }
      break
    }
    case 'normalize': {
      if (!isNonEmptyString(r.column)) return { index, type, message: '컬럼명을 입력해야 합니다' }
      if (!VALID_NORMALIZE_FNS.includes(r.fn as typeof VALID_NORMALIZE_FNS[number])) {
        return { index, type, message: 'fn은 trim/upper/lower 중 하나여야 합니다' }
      }
      break
    }
    case 'derive': {
      if (!isNonEmptyString(r.source)) return { index, type, message: '소스 컬럼명을 입력해야 합니다' }
      if (!isNonEmptyString(r.target)) return { index, type, message: '대상 컬럼명을 입력해야 합니다' }
      if (!VALID_DERIVE_EXPRS.includes(r.expr as typeof VALID_DERIVE_EXPRS[number])) {
        return { index, type, message: '지원하지 않는 파생 표현식입니다' }
      }
      break
    }
    case 'dedup': {
      if (!isStringArray(r.keys)) {
        return { index, type, message: 'keys는 문자열 배열이어야 합니다' }
      }
      break
    }
    case 'codemap': {
      if (!isNonEmptyString(r.column)) return { index, type, message: '컬럼명을 입력해야 합니다' }
      if (!r.map || typeof r.map !== 'object' || Array.isArray(r.map)) {
        return { index, type, message: 'map은 객체여야 합니다' }
      }
      break
    }
    case 'concat': {
      if (!isNonEmptyString(r.target)) return { index, type, message: '결과 컬럼명을 입력해야 합니다' }
      if (!isStringArray(r.sources) || r.sources.length === 0) {
        return { index, type, message: '합칠 컬럼을 1개 이상 지정해야 합니다' }
      }
      break
    }
    case 'split': {
      if (!isNonEmptyString(r.column)) return { index, type, message: '분리할 컬럼명을 입력해야 합니다' }
      if (!isStringArray(r.targets) || r.targets.length === 0) {
        return { index, type, message: '결과 컬럼을 1개 이상 지정해야 합니다' }
      }
      break
    }
    case 'aggregate': {
      if (!isStringArray(r.groupBy)) {
        return { index, type, message: 'groupBy는 문자열 배열이어야 합니다' }
      }
      if (!isNonEmptyString(r.column)) return { index, type, message: '집계할 컬럼명을 입력해야 합니다' }
      if (!VALID_AGG_FUNCS.includes(r.agg as typeof VALID_AGG_FUNCS[number])) {
        return { index, type, message: '지원하지 않는 집계 함수입니다' }
      }
      break
    }
    case 'join': {
      if (!isNonEmptyString(r.datasetId)) return { index, type, message: '조인할 데이터셋 ID를 입력해야 합니다' }
      if (!isNonEmptyString(r.on)) return { index, type, message: '조인 키 컬럼을 입력해야 합니다' }
      if (!VALID_JOIN_HOWS.includes(r.how as typeof VALID_JOIN_HOWS[number])) {
        return { index, type, message: 'how는 left/inner/right 중 하나여야 합니다' }
      }
      break
    }
    case 'pivot': {
      if (!isNonEmptyString(r.index)) return { index, type, message: '인덱스 컬럼명을 입력해야 합니다' }
      if (!isNonEmptyString(r.columns)) return { index, type, message: '피벗 컬럼명을 입력해야 합니다' }
      if (!isNonEmptyString(r.values)) return { index, type, message: '값 컬럼명을 입력해야 합니다' }
      if (!VALID_AGG_FUNCS.includes(r.agg as typeof VALID_AGG_FUNCS[number])) {
        return { index, type, message: '지원하지 않는 집계 함수입니다' }
      }
      break
    }
  }
  return null
}

/**
 * 규칙 배열 전체를 검증한다.
 * 오류가 있으면 오류 배열을, 없으면 빈 배열을 반환한다.
 */
export function validateRules(rules: unknown[]): RuleValidationError[] {
  if (!Array.isArray(rules)) return [{ index: 0, type: 'unknown', message: 'rules는 배열이어야 합니다' }]
  const errors: RuleValidationError[] = []
  rules.forEach((rule, index) => {
    const err = validateRule(rule, index)
    if (err) errors.push(err)
  })
  return errors
}

// ─── 규칙별 처리 함수 ──────────────────────────────────────────────────────────

function applySelect(rows: Row[], rule: Extract<Rule, { type: 'select' }>): Row[] {
  return rows.map(row => {
    if (rule.mode === 'include') {
      return Object.fromEntries(rule.columns.map(c => [c, row[c]]))
    }
    const out: Row = { ...row }
    for (const c of rule.columns) delete out[c]
    return out
  })
}

function applyRename(rows: Row[], rule: Extract<Rule, { type: 'rename' }>): Row[] {
  return rows.map(row => {
    const out: Row = { ...row }
    if (Object.prototype.hasOwnProperty.call(out, rule.from)) {
      out[rule.to] = out[rule.from]
      delete out[rule.from]
    }
    return out
  })
}

function applyCast(
  rows: Row[],
  rule: Extract<Rule, { type: 'cast' }>,
  ruleIndex: number,
  errors: ProcessError[],
): Row[] {
  return rows.map((row, rowIndex) => {
    const val = row[rule.column]
    if (val == null) return row
    let casted: unknown = null
    try {
      if (rule.to === 'number') {
        const n = Number(val)
        if (isNaN(n)) throw new Error(`'${val}'을 숫자로 변환할 수 없습니다`)
        casted = n
      } else if (rule.to === 'string') {
        casted = String(val)
      } else {
        const d = new Date(String(val))
        if (isNaN(d.getTime())) throw new Error(`'${val}'을 날짜로 변환할 수 없습니다`)
        casted = d.toISOString()
      }
    } catch (e) {
      errors.push({ rowIndex, ruleIndex, column: rule.column, message: (e as Error).message })
      return { ...row, [rule.column]: null }
    }
    return { ...row, [rule.column]: casted }
  })
}

function applyNullfill(rows: Row[], rule: Extract<Rule, { type: 'nullfill' }>): Row[] {
  return rows.map(row => {
    if (row[rule.column] == null) return { ...row, [rule.column]: rule.value }
    return row
  })
}

function applyNulldrop(rows: Row[], rule: Extract<Rule, { type: 'nulldrop' }>): Row[] {
  return rows.filter(row => !rule.columns.some(c => row[c] == null))
}

function applyFilter(
  rows: Row[],
  rule: Extract<Rule, { type: 'filter' }>,
  ruleIndex: number,
  errors: ProcessError[],
): Row[] {
  const out: Row[] = []
  rows.forEach((row, rowIndex) => {
    const cellVal = row[rule.column]
    if (cellVal == null) { out.push(row); return }
    try {
      // 문자열 연산자
      if (rule.op === 'contains' || rule.op === 'startsWith' || rule.op === 'endsWith') {
        const strVal = String(cellVal)
        const strCmp = String(rule.value)
        const pass =
          rule.op === 'contains'   ? strVal.includes(strCmp) :
          rule.op === 'startsWith' ? strVal.startsWith(strCmp) :
                                     strVal.endsWith(strCmp)
        if (pass) out.push(row)
        return
      }
      const a = typeof rule.value === 'number' ? Number(cellVal) : cellVal
      const b = rule.value
      if (typeof a === 'number' && isNaN(a)) throw new Error(`비교 불가 값: ${cellVal}`)
      let pass = false
      switch (rule.op) {
        case '>':  pass = (a as number) >  (b as number); break
        case '<':  pass = (a as number) <  (b as number); break
        case '>=': pass = (a as number) >= (b as number); break
        case '<=': pass = (a as number) <= (b as number); break
        case '==': pass = a === b; break
        case '!=': pass = a !== b; break
      }
      if (pass) out.push(row)
    } catch (e) {
      errors.push({ rowIndex, ruleIndex, column: rule.column, message: (e as Error).message })
      out.push(row)
    }
  })
  return out
}

function applyNormalize(rows: Row[], rule: Extract<Rule, { type: 'normalize' }>): Row[] {
  return rows.map(row => {
    const v = row[rule.column]
    if (typeof v !== 'string') return row
    let normalized: string
    if (rule.fn === 'trim')       normalized = v.trim()
    else if (rule.fn === 'upper') normalized = v.toUpperCase()
    else                          normalized = v.toLowerCase()
    return { ...row, [rule.column]: normalized }
  })
}

function applyDerive(
  rows: Row[],
  rule: Extract<Rule, { type: 'derive' }>,
  ruleIndex: number,
  errors: ProcessError[],
): Row[] {
  return rows.map((row, rowIndex) => {
    const src = row[rule.source]
    if (src == null) return { ...row, [rule.target]: null }
    try {
      // dateformat은 문자열 포맷 변환 (YYYYMMDD → YYYY-MM-DD 등)
      if (rule.expr === 'dateformat') {
        const s = String(src).trim()
        // YYYYMMDD → ISO
        if (/^\d{8}$/.test(s)) {
          const iso = `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`
          const d = new Date(iso)
          if (isNaN(d.getTime())) throw new Error(`'${src}'를 날짜로 파싱할 수 없습니다`)
          return { ...row, [rule.target]: rule.format ? formatDate(d, rule.format) : iso }
        }
        const d = new Date(s)
        if (isNaN(d.getTime())) throw new Error(`'${src}'를 날짜로 파싱할 수 없습니다`)
        return { ...row, [rule.target]: rule.format ? formatDate(d, rule.format) : d.toISOString().slice(0, 10) }
      }

      const d = new Date(String(src))
      if (isNaN(d.getTime())) throw new Error(`'${src}'를 날짜로 파싱할 수 없습니다`)

      let derived: number | string
      switch (rule.expr) {
        case 'year':    derived = d.getFullYear(); break
        case 'month':   derived = d.getMonth() + 1; break
        case 'day':     derived = d.getDate(); break
        case 'quarter': derived = Math.ceil((d.getMonth() + 1) / 3); break
        case 'weekday': derived = d.getDay(); break  // 0=일, 6=토
        case 'hour':    derived = d.getHours(); break
        default:        derived = d.getFullYear()
      }
      return { ...row, [rule.target]: derived }
    } catch (e) {
      errors.push({ rowIndex, ruleIndex, column: rule.source, message: (e as Error).message })
      return { ...row, [rule.target]: null }
    }
  })
}

function formatDate(d: Date, fmt: string): string {
  return fmt
    .replace('YYYY', String(d.getFullYear()))
    .replace('MM',   String(d.getMonth() + 1).padStart(2, '0'))
    .replace('DD',   String(d.getDate()).padStart(2, '0'))
    .replace('HH',   String(d.getHours()).padStart(2, '0'))
}

function applyDedup(rows: Row[], rule: Extract<Rule, { type: 'dedup' }>): Row[] {
  const seen = new Set<string>()
  return rows.filter(row => {
    const key = rule.keys.length > 0
      ? rule.keys.map(k => JSON.stringify(row[k])).join('|')
      : JSON.stringify(row)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function applyCodemap(
  rows: Row[],
  rule: Extract<Rule, { type: 'codemap' }>,
): Row[] {
  return rows.map(row => {
    const v = row[rule.column]
    if (v == null) return row
    const key = String(v)
    if (Object.prototype.hasOwnProperty.call(rule.map, key)) {
      return { ...row, [rule.column]: rule.map[key] }
    }
    // fallback: 'null'이면 null, 'keep'(기본)이면 원본 유지
    if (rule.fallback === 'null') return { ...row, [rule.column]: null }
    return row
  })
}

function applyConcat(rows: Row[], rule: Extract<Rule, { type: 'concat' }>): Row[] {
  return rows.map(row => {
    const parts = rule.sources.map(s => (row[s] != null ? String(row[s]) : ''))
    return { ...row, [rule.target]: parts.join(rule.separator) }
  })
}

function applySplit(
  rows: Row[],
  rule: Extract<Rule, { type: 'split' }>,
  ruleIndex: number,
  errors: ProcessError[],
): Row[] {
  return rows.map((row, rowIndex) => {
    const v = row[rule.column]
    if (v == null) {
      return { ...row, ...Object.fromEntries(rule.targets.map(t => [t, null])) }
    }
    try {
      const parts = String(v).split(rule.separator)
      const additions = Object.fromEntries(
        rule.targets.map((t, i) => [t, parts[i] != null ? parts[i].trim() : null])
      )
      return { ...row, ...additions }
    } catch (e) {
      errors.push({ rowIndex, ruleIndex, column: rule.column, message: (e as Error).message })
      return { ...row, ...Object.fromEntries(rule.targets.map(t => [t, null])) }
    }
  })
}

function applyAggregate(rows: Row[], rule: Extract<Rule, { type: 'aggregate' }>): Row[] {
  const groups = new Map<string, Row[]>()
  for (const row of rows) {
    const key = rule.groupBy.map(k => JSON.stringify(row[k])).join('|')
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(row)
  }
  const targetCol = rule.target ?? `${rule.agg}_${rule.column}`
  const result: Row[] = []
  for (const gRows of groups.values()) {
    const baseRow: Row = Object.fromEntries(rule.groupBy.map(k => [k, gRows[0][k]]))
    if (rule.agg === 'count') {
      baseRow[targetCol] = gRows.length
    } else {
      const vals = gRows.map(r => Number(r[rule.column])).filter(n => !isNaN(n))
      switch (rule.agg) {
        case 'sum':  baseRow[targetCol] = vals.reduce((a, b) => a + b, 0); break
        case 'mean': baseRow[targetCol] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null; break
        case 'max':  baseRow[targetCol] = vals.length ? Math.max(...vals) : null; break
        case 'min':  baseRow[targetCol] = vals.length ? Math.min(...vals) : null; break
      }
    }
    result.push(baseRow)
  }
  return result
}

function applyPivot(rows: Row[], rule: Extract<Rule, { type: 'pivot' }>): Row[] {
  const groups = new Map<string, Row>()
  const sumMap = new Map<string, Map<string, { sum: number; cnt: number }>>()
  for (const row of rows) {
    const idx = String(row[rule.index] ?? '')
    const colKey = String(row[rule.columns] ?? '')
    const val = Number(row[rule.values])
    if (!groups.has(idx)) { groups.set(idx, { [rule.index]: row[rule.index] }); sumMap.set(idx, new Map()) }
    const g = groups.get(idx)!
    const sm = sumMap.get(idx)!
    if (!sm.has(colKey)) sm.set(colKey, { sum: 0, cnt: 0 })
    const acc = sm.get(colKey)!
    const n = isNaN(val) ? 0 : val
    switch (rule.agg) {
      case 'count': g[colKey] = (Number(g[colKey]) || 0) + 1; break
      case 'sum':   g[colKey] = (Number(g[colKey]) || 0) + n; break
      case 'max':   g[colKey] = g[colKey] == null ? n : Math.max(Number(g[colKey]), n); break
      case 'min':   g[colKey] = g[colKey] == null ? n : Math.min(Number(g[colKey]), n); break
      case 'mean':  acc.sum += n; acc.cnt += 1; break
    }
  }
  if (rule.agg === 'mean') {
    for (const [idx, sm] of sumMap) {
      const g = groups.get(idx)!
      for (const [colKey, { sum, cnt }] of sm) { g[colKey] = cnt ? sum / cnt : null }
    }
  }
  return Array.from(groups.values())
}

function applyJoin(
  rows: Row[],
  rule: Extract<Rule, { type: 'join' }>,
  targetRows: Row[],
): Row[] {
  if (!targetRows.length) return rows

  const joinKey = rule.on
  const prefix = 'right_'

  // 타겟 컬럼명 충돌 방지를 위해 접두어를 붙인다
  const prefixedTarget = (row: Row): Row => {
    const out: Row = {}
    for (const [k, v] of Object.entries(row)) {
      out[k === joinKey ? k : `${prefix}${k}`] = v
    }
    return out
  }

  const index = new Map<unknown, Row[]>()
  for (const t of targetRows) {
    const key = t[joinKey]
    if (!index.has(key)) index.set(key, [])
    index.get(key)!.push(prefixedTarget(t))
  }

  const result: Row[] = []

  if (rule.how === 'right') {
    // right join: 타겟의 모든 행을 출력, 매칭되는 왼쪽 행이 없으면 NULL
    const leftIndex = new Map<unknown, Row[]>()
    for (const r of rows) {
      const key = r[joinKey]
      if (!leftIndex.has(key)) leftIndex.set(key, [])
      leftIndex.get(key)!.push(r)
    }
    for (const t of targetRows) {
      const key = t[joinKey]
      const leftMatches = leftIndex.get(key) ?? [null]
      for (const l of leftMatches) {
        result.push({ ...(l ?? {}), ...prefixedTarget(t) })
      }
    }
    return result
  }

  for (const r of rows) {
    const key = r[joinKey]
    const matches = index.get(key)
    if (matches && matches.length > 0) {
      for (const m of matches) {
        result.push({ ...r, ...m })
      }
    } else if (rule.how === 'left') {
      // left join: 매칭 없어도 왼쪽 행은 출력, 타겟 컬럼은 NULL
      const nullRow: Row = {}
      for (const k of Object.keys(targetRows[0])) {
        if (k !== joinKey) nullRow[`${prefix}${k}`] = null
      }
      result.push({ ...r, ...nullRow })
    }
    // inner: 매칭 없으면 제외
  }
  return result
}

// ─── 메인 함수 ─────────────────────────────────────────────────────────────────

export function applyRules(data: Row[], rules: Rule[], joinData: Record<string, Row[]> = {}): ProcessResult {
  const errors: ProcessError[] = []
  let rows: Row[] = [...data]

  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i]
    switch (rule.type) {
      case 'select':    rows = applySelect(rows, rule); break
      case 'rename':    rows = applyRename(rows, rule); break
      case 'cast':      rows = applyCast(rows, rule, i, errors); break
      case 'nullfill':  rows = applyNullfill(rows, rule); break
      case 'nulldrop':  rows = applyNulldrop(rows, rule); break
      case 'filter':    rows = applyFilter(rows, rule, i, errors); break
      case 'normalize': rows = applyNormalize(rows, rule); break
      case 'derive':    rows = applyDerive(rows, rule, i, errors); break
      case 'dedup':     rows = applyDedup(rows, rule); break
      case 'codemap':   rows = applyCodemap(rows, rule); break
      case 'concat':    rows = applyConcat(rows, rule); break
      case 'split':     rows = applySplit(rows, rule, i, errors); break
      case 'aggregate': rows = applyAggregate(rows, rule); break
      case 'join':      rows = applyJoin(rows, rule, joinData[rule.datasetId] ?? []); break
      case 'pivot':     rows = applyPivot(rows, rule); break
    }
  }

  const errorRows = new Set(errors.map(e => e.rowIndex)).size

  return {
    rows,
    errors,
    inputRows:  data.length,
    outputRows: rows.length,
    errorRows,
  }
}

// ─── 데이터셋 로드 ─────────────────────────────────────────────────────────────

const DATASET_PAGE_SIZE = 1000

export async function loadDatasetRows(
  supabase: SupabaseClient,
  datasetId: string,
  options?: { limit?: number },
): Promise<Row[]> {
  const limit = options?.limit ?? Infinity

  // 1) catalog 에 등록된 테이블인지 확인
  const { data: cat } = await supabase
    .from('catalog')
    .select('table_name')
    .eq('dataset_id', datasetId)
    .maybeSingle()

  const tableName = cat?.table_name

  if (tableName && tableName.startsWith('gold_')) {
    // Gold 테이블은 직접 쿼리
    let rows: Row[] = []
    let from = 0
    while (true) {
      const pageLimit = Math.min(DATASET_PAGE_SIZE, limit - rows.length)
      if (pageLimit <= 0) break
      const { data: page } = await supabase
        .from(tableName)
        .select('*')
        .range(from, from + pageLimit - 1)
      if (!page || page.length === 0) break
      rows = rows.concat(page as Row[])
      if (page.length < pageLimit) break
      from += pageLimit
      if (rows.length >= limit) break
    }
    return rows.slice(0, limit === Infinity ? undefined : limit)
  }

  // 2) submission_uploads.preview (JSONB) 로드
  if (tableName) {
    const { data: upload } = await supabase
      .from('submission_uploads')
      .select('preview')
      .eq('table_name', tableName)
      .maybeSingle()
    if (upload?.preview) return (upload.preview as Row[]).slice(0, limit === Infinity ? undefined : limit)
  }

  // 3) datasetId 자체가 table_name 인 경우
  const { data: upload } = await supabase
    .from('submission_uploads')
    .select('preview')
    .eq('table_name', datasetId)
    .maybeSingle()
  if (upload?.preview) return (upload.preview as Row[]).slice(0, limit === Infinity ? undefined : limit)

  return []
}

export async function collectJoinTargets(
  supabase: SupabaseClient,
  rules: Rule[],
  options?: { limit?: number },
): Promise<Record<string, Row[]>> {
  const joinRules = rules.filter((r): r is Extract<Rule, { type: 'join' }> => r.type === 'join')
  const targets: Record<string, Row[]> = {}
  await Promise.all(
    joinRules.map(async rule => {
      targets[rule.datasetId] = await loadDatasetRows(supabase, rule.datasetId, options)
    })
  )
  return targets
}

// ─── 결과 영속화 / 계보 기록 ───────────────────────────────────────────────────

export interface PipelineRunResult {
  run_id:       string
  status:       'done' | 'failed'
  input_rows:   number
  output_rows:  number
  error_rows:   number
  dataset_id:   string
  result_table?: string
  error_msg?:   string
}

export async function createDerivedTable(
  supabase: SupabaseClient,
  tableName: string,
  rows: Row[],
  schema?: Array<{ name: string; type: string }>,
): Promise<void> {
  if (!isSafeTableName(tableName)) {
    throw new Error(`유효하지 않은 파생 테이블명입니다: ${tableName}`)
  }
  if (!rows.length) {
    // RPC 는 비어 있는 행 배열에도 테이블을 생성해야 하므로 빈 스키마를 허용하지 않는다.
    // 0행 결과는 카탈로그/업로드 미리보기만 남기고 파생 테이블은 생성하지 않는다.
    return
  }

  const { error } = await supabase.rpc('create_derived_table', {
    p_table_name: tableName,
    p_columns:    schema ?? inferSchema(rows),
    p_rows:       rows,
  })

  if (error) throw new Error(`파생 테이블 생성 실패: ${error.message}`)
}

export async function registerCatalogEntry(
  supabase: SupabaseClient,
  params: {
    datasetId: string
    tenantId: string
    title: string
    description?: string
    tableName: string
    rowCount: number
    derivedFrom: Record<string, unknown>
    lineageIds: string[]
  },
): Promise<void> {
  const { error } = await supabase.from('catalog').upsert({
    dataset_id:    params.datasetId,
    tenant_id:     params.tenantId,
    title:         params.title,
    description:   params.description ?? null,
    table_name:    params.tableName,
    rows:          params.rowCount,
    is_open:       false,
    ai_ready:      false,
    high_value:    false,
    updated_at:    new Date().toISOString(),
    derived_from:  params.derivedFrom,
    lineage_ids:   params.lineageIds,
  }, { onConflict: 'dataset_id' })

  if (error) throw new Error(`카탈로그 등록 실패: ${error.message}`)
}

export async function recordLineage(
  supabase: SupabaseClient,
  params: {
    runType: string
    runId: string
    sourceIds: string[]
    targetTable: string
  },
): Promise<string> {
  const { data, error } = await supabase
    .from('data_lineage')
    .insert({
      run_type:     params.runType,
      run_id:       params.runId,
      source_ids:   params.sourceIds,
      target_table: params.targetTable,
    })
    .select('id')
    .single()

  if (error) throw new Error(`계보 기록 실패: ${error.message}`)
  return data.id as string
}

// ─── Supabase 저장 연동 ────────────────────────────────────────────────────────

export async function runPipelineAndSave(
  supabase: SupabaseClient,
  pipelineId: string,
  options?: { createDerivedTable?: boolean },
): Promise<PipelineRunResult> {
  const { data: pipeline, error: pErr } = await supabase
    .from('processing_pipelines')
    .select('*')
    .eq('id', pipelineId)
    .maybeSingle()
  if (pErr || !pipeline) throw new Error(pErr?.message ?? '파이프라인을 찾을 수 없습니다')

  const runId = 'prun_' + randomHex(4)

  await supabase.from('processing_runs').insert({
    id:          runId,
    pipeline_id: pipelineId,
    tenant_id:   pipeline.tenant_id,
    status:      'running',
    started_at:  new Date().toISOString(),
  })

  try {
    // 소스 데이터 로드
    const sourceRows = await loadDatasetRows(supabase, pipeline.source_dataset_id)

    // 조인 대상 데이터셋 로드
    const joinTargets = await collectJoinTargets(supabase, pipeline.rules as Rule[])

    const result = applyRules(sourceRows, pipeline.rules as Rule[], joinTargets)
    const schema = inferSchema(result.rows)
    const datasetId = 'proc_' + randomHex(4)
    const resultTable = `derived_${runId}`

    // 미리보기/행 수는 기존 submission_uploads 에도 유지해 하위호환성 보장
    await supabase.from('submission_uploads').insert({
      upload_id:   datasetId,
      table_name:  datasetId,
      schema_info: schema,
      preview:     result.rows.slice(0, 100),
      row_count:   result.rows.length,
      created_at:  new Date().toISOString(),
    })

    // 전체 결과를 실제 테이블로 영속화 (0행일 때는 테이블 생성 생략)
    const persistDerived = options?.createDerivedTable !== false && result.rows.length > 0
    if (persistDerived) {
      await createDerivedTable(supabase, resultTable, result.rows, schema)

      const lineageId = await recordLineage(supabase, {
        runType:     'process',
        runId,
        sourceIds:   [pipeline.source_dataset_id],
        targetTable: resultTable,
      })

      await registerCatalogEntry(supabase, {
        datasetId,
        tenantId:    pipeline.tenant_id,
        title:       `파생 데이터: ${pipeline.name}`,
        description: `파이프라인 ${pipeline.id} 실행 결과`,
        tableName:   resultTable,
        rowCount:    result.rows.length,
        derivedFrom: {
          pipeline_id:       pipeline.id,
          run_id:            runId,
          source_dataset_id: pipeline.source_dataset_id,
        },
        lineageIds: [lineageId],
      })
    }

    await supabase.from('processing_runs').update({
      status:            'done',
      finished_at:       new Date().toISOString(),
      input_rows:        result.inputRows,
      output_rows:       result.outputRows,
      error_rows:        result.errorRows,
      result_dataset_id: datasetId,
      result_table:      persistDerived ? resultTable : null,
    }).eq('id', runId)

    return {
      run_id:       runId,
      status:       'done',
      input_rows:   result.inputRows,
      output_rows:  result.outputRows,
      error_rows:   result.errorRows,
      dataset_id:   datasetId,
      result_table: persistDerived ? resultTable : undefined,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await supabase.from('processing_runs').update({
      status:      'failed',
      finished_at: new Date().toISOString(),
      error_msg:   msg,
    }).eq('id', runId)
    throw err
  }
}
