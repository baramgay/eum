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
  | { type: 'filter';    column: string; op: '>' | '<' | '>=' | '<=' | '==' | '!=' | 'contains' | 'startsWith' | 'endsWith'; value: unknown }
  | { type: 'normalize'; column: string; fn: 'trim' | 'upper' | 'lower' }
  | { type: 'derive';    target: string; expr: 'year' | 'month' | 'day' | 'quarter' | 'weekday' | 'hour' | 'dateformat'; source: string; format?: string }
  | { type: 'dedup';     keys: string[] }
  | { type: 'codemap';   column: string; map: Record<string, string>; fallback?: 'keep' | 'null' }
  | { type: 'concat';    target: string; sources: string[]; separator: string }
  | { type: 'split';     column: string; separator: string; targets: string[] }

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
      case 'dedup':     rows = applyDedup(rows, rule); break
      case 'codemap':   rows = applyCodemap(rows, rule); break
      case 'concat':    rows = applyConcat(rows, rule); break
      case 'split':     rows = applySplit(rows, rule, i, errors); break
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

// ─── Supabase 저장 연동 ────────────────────────────────────────────────────────

export interface PipelineRunResult {
  run_id:      string
  status:      'done' | 'failed'
  input_rows:  number
  output_rows: number
  error_rows:  number
  dataset_id:  string
  error_msg?:  string
}

export async function runPipelineAndSave(
  supabase: SupabaseClient,
  pipelineId: string,
): Promise<PipelineRunResult> {
  const { data: pipeline, error: pErr } = await supabase
    .from('process_pipelines')
    .select('*')
    .eq('id', pipelineId)
    .maybeSingle()
  if (pErr || !pipeline) throw new Error(pErr?.message ?? '파이프라인을 찾을 수 없습니다')

  const runId = 'prun_' + Math.random().toString(36).slice(2, 10)

  await supabase.from('process_runs').insert({
    id:          runId,
    pipeline_id: pipelineId,
    tenant_id:   pipeline.tenant_id,
    status:      'running',
    started_at:  new Date().toISOString(),
  })

  try {
    // 소스 데이터 로드
    let sourceRows: Row[] = []
    if (pipeline.source_kind === 'upload' || pipeline.source_kind === 'catalog') {
      const { data: upload } = await supabase
        .from('submission_uploads')
        .select('preview')
        .eq('table_name', pipeline.source_dataset_id)
        .maybeSingle()
      if (upload?.preview) sourceRows = upload.preview as Row[]
    }

    const result = applyRules(sourceRows, pipeline.rules as Rule[])
    const schema = inferSchema(result.rows)
    const datasetId = 'proc_' + Math.random().toString(36).slice(2, 10)

    await supabase.from('submission_uploads').insert({
      upload_id:   datasetId,
      table_name:  datasetId,
      schema_info: schema,
      preview:     result.rows.slice(0, 100),
      row_count:   result.rows.length,
      created_at:  new Date().toISOString(),
    })

    await supabase.from('process_runs').update({
      status:            'done',
      finished_at:       new Date().toISOString(),
      input_rows:        result.inputRows,
      output_rows:       result.outputRows,
      error_rows:        result.errorRows,
      result_dataset_id: datasetId,
    }).eq('id', runId)

    return {
      run_id:      runId,
      status:      'done',
      input_rows:  result.inputRows,
      output_rows: result.outputRows,
      error_rows:  result.errorRows,
      dataset_id:  datasetId,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await supabase.from('process_runs').update({
      status:      'failed',
      finished_at: new Date().toISOString(),
      error_msg:   msg,
    }).eq('id', runId)
    throw err
  }
}
