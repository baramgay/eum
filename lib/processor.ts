/**
 * 데이터 가공 규칙 엔진
 * 변환 실패는 throw 하지 않고 errors 배열에 기록 — 부분 실패 허용
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { inferSchema } from '@/lib/submission'

export type Row = Record<string, unknown>

export type Rule =
  | { type: 'select';    mode: 'include' | 'exclude'; columns: string[] }
  | { type: 'rename';    from: string; to: string }
  | { type: 'cast';      column: string; to: 'number' | 'string' | 'date' }
  | { type: 'nullfill';  column: string; value: unknown }
  | { type: 'nulldrop';  columns: string[] }
  | { type: 'filter';    column: string; op: '>' | '<' | '>=' | '<=' | '==' | '!='; value: unknown }
  | { type: 'normalize'; column: string; fn: 'trim' | 'upper' | 'lower' }
  | { type: 'derive';    target: string; expr: 'year' | 'month' | 'day'; source: string }

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

// ─── 규칙별 처리 함수 ──────────────────────────────────────────────────────────

type RuleApplier = (
  rows: Row[],
  rule: Rule,
  ruleIndex: number,
  errors: ProcessError[],
) => Row[]

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
      const d = new Date(String(src))
      if (isNaN(d.getTime())) throw new Error(`'${src}'를 날짜로 파싱할 수 없습니다`)
      let derived: number
      if (rule.expr === 'year')       derived = d.getFullYear()
      else if (rule.expr === 'month') derived = d.getMonth() + 1
      else                            derived = d.getDate()
      return { ...row, [rule.target]: derived }
    } catch (e) {
      errors.push({ rowIndex, ruleIndex, column: rule.source, message: (e as Error).message })
      return { ...row, [rule.target]: null }
    }
  })
}

// ─── 메인 함수 ─────────────────────────────────────────────────────────────────

export function applyRules(data: Row[], rules: Rule[]): ProcessResult {
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
    }
  }

  const errorRows = new Set(errors.map(e => e.rowIndex)).size

  return {
    rows,
    errors,
    inputRows: data.length,
    outputRows: rows.length,
    errorRows,
  }
}

// ─── 결과 저장 ─────────────────────────────────────────────────────────────────

export async function persistResult(
  supabase: SupabaseClient,
  tenantId: string,
  pipeline: { id: string; name: string; source_dataset_id: string },
  result: ProcessResult,
): Promise<{ datasetId: string; uploadId: string; tableName: string }> {
  const arr4 = new Uint8Array(4)
  crypto.getRandomValues(arr4)
  const hex8 = Array.from(arr4).map(b => b.toString(16).padStart(2, '0')).join('')
  const tenantSlice = tenantId.slice(0, 8).replace(/[^a-z0-9]/gi, '_')
  const tableName = `proc_${tenantSlice}_${hex8}`

  const arr16 = new Uint8Array(16)
  crypto.getRandomValues(arr16)
  const uploadId = Array.from(arr16).map(b => b.toString(16).padStart(2, '0')).join('')

  await supabase.from('submission_uploads').insert({
    upload_id:   uploadId,
    table_name:  tableName,
    schema_info: inferSchema(result.rows),
    preview:     result.rows.slice(0, 20),
    row_count:   result.outputRows,
    created_at:  new Date().toISOString(),
  })

  const datasetId = `ds-proc-${pipeline.id}`
  await supabase.from('catalog').upsert({
    dataset_id:  datasetId,
    tenant_id:   tenantId,
    title:       `[가공] ${pipeline.name}`,
    description: `파이프라인 ${pipeline.id} 실행 결과`,
    theme:       '',
    keywords:    '',
    license:     '',
    format:      'JSON',
    table_name:  tableName,
    rows:        result.outputRows,
    is_open:     false,
    ai_ready:    false,
    high_value:  false,
    layer:       'silver',
    updated_at:  new Date().toISOString(),
  }, { onConflict: 'dataset_id' })

  return { datasetId, uploadId, tableName }
}
