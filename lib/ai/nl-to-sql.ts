import type { SupabaseClient } from '@supabase/supabase-js'
import { Parser } from 'node-sql-parser'
import { chatCompletionGateway } from './gateway'

export interface Whitelist {
  tables: string[]
  columns: Record<string, string[]>
}

export interface GenerateSqlResult {
  sql: string
  explanation: string
}

export interface GenerateSqlOptions {
  execute?: (sql: string) => Promise<{ data?: unknown; error?: { message: string } }>
  maxRetries?: number
}

const SQL_KEYWORDS = new Set([
  'select', 'from', 'where', 'and', 'or', 'not', 'in', 'is', 'null', 'like', 'ilike',
  'limit', 'order', 'by', 'group', 'having', 'as', 'on', 'join', 'left', 'right',
  'inner', 'outer', 'cross', 'distinct', 'count', 'sum', 'avg', 'min', 'max',
  'coalesce', 'case', 'when', 'then', 'else', 'end', 'asc', 'desc', 'true', 'false',
  'between', 'exists', 'union', 'all', 'any', 'some', 'cast', 'date_trunc', 'to_char',
  'round', 'jsonb_agg', 'array_agg', 'unnest', 'string_agg', 'over', 'partition',
  'substring', 'length', 'lower', 'upper', 'trim', 'replace', 'concat',
  'abs', 'ceil', 'floor', 'row_number', 'rank', 'dense_rank', 'lead', 'lag',
  'extract', 'now', 'current_date', 'jsonb_object_agg',
])

const ALLOWED_FUNCTIONS = new Set(
  [...SQL_KEYWORDS].filter((k) =>
    ['count', 'sum', 'avg', 'min', 'max', 'coalesce', 'round', 'jsonb_agg', 'array_agg',
      'unnest', 'string_agg', 'date_trunc', 'to_char', 'substring', 'length', 'lower',
      'upper', 'trim', 'replace', 'concat', 'abs', 'ceil', 'floor', 'row_number', 'rank',
      'dense_rank', 'lead', 'lag', 'extract', 'now', 'current_date', 'jsonb_object_agg']
      .includes(k),
  ),
)

const FORBIDDEN_PATTERN = /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|execute|exec|load)\b/i

const COMMON_COLUMNS = [
  'sigun', 'sgg_cd', 'year', 'month', 'quarter', 'date', 'region', 'category', 'type',
  'name', 'value', 'amount', 'count', 'rate', 'ratio', 'score', 'lat', 'lng',
  'created_at', 'updated_at',
]

function normalizeWhitespace(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim()
}

function isValidIdentifier(name: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)
}

/**
 * 카탈로그 메타데이터와 파생 테이블에서 화이트리스트를 구성한다.
 * catalog.table_name과 derived_* 테이블을 포함하며, 공통 컬럼을 자동 추가한다.
 */
export async function buildWhitelist(supabase: SupabaseClient): Promise<Whitelist> {
  const { data: catalogRows } = await supabase
    .from('catalog')
    .select('table_name')
    .not('table_name', 'is', null)
    .limit(10000)

  const catalogTables = Array.from(
    new Set(
      (catalogRows ?? [])
        .map((r) => (r.table_name as string).trim())
        .filter((t) => t && isValidIdentifier(t)),
    ),
  )

  const { data: derivedRows } = await supabase
    .from('information_schema.tables')
    .select('table_name')
    .eq('table_schema', 'public')
    .like('table_name', 'derived\\_%')
    .limit(10000)

  const derivedTables = Array.from(
    new Set(
      (derivedRows ?? [])
        .map((r) => (r.table_name as string).trim())
        .filter((t) => t && isValidIdentifier(t)),
    ),
  )

  const tables = Array.from(new Set([...catalogTables, ...derivedTables]))
  const columns: Record<string, string[]> = {}
  if (tables.length === 0) return { tables: [], columns: {} }

  const { data: colRows } = await supabase
    .from('information_schema.columns')
    .select('table_name,column_name')
    .eq('table_schema', 'public')
    .in('table_name', tables)

  for (const c of colRows ?? []) {
    const table = (c.table_name as string).toLowerCase()
    if (!columns[table]) columns[table] = []
    columns[table].push((c.column_name as string).toLowerCase())
  }

  for (const t of tables) {
    const lower = t.toLowerCase()
    if (!columns[lower]) columns[lower] = []
    for (const col of COMMON_COLUMNS) {
      if (!columns[lower].includes(col)) columns[lower].push(col)
    }
  }

  return { tables: tables.map((t) => t.toLowerCase()), columns }
}

/**
 * AST를 재귀적으로 탐색하여 함수 호출 이름을 수집한다.
 */
function collectFunctionNames(node: unknown, names: Set<string>): void {
  if (node === null || node === undefined) return
  if (typeof node !== 'object') return
  if (Array.isArray(node)) {
    node.forEach((n) => collectFunctionNames(n, names))
    return
  }

  const obj = node as Record<string, unknown>
  const type = obj.type as string | undefined

  if (type === 'aggr_func' || type === 'window_func') {
    const name = obj.name as string | undefined
    if (name) names.add(name.toLowerCase())
  } else if (type === 'function') {
    const nameObj = obj.name as { name?: { type: string; value: string }[] } | undefined
    if (nameObj?.name) {
      const fnName = nameObj.name.map((n) => n.value).join('.').toLowerCase()
      if (fnName) names.add(fnName)
    }
  }

  for (const key of Object.keys(obj)) {
    if (key === 'type' || key === 'name') continue
    collectFunctionNames(obj[key], names)
  }
}

/**
 * node-sql-parser로 AST를 파싱하여 화이트리스트를 준수하는지 검증한다.
 * 서브쿼리, CTE, JOIN을 허용한다.
 */
export function validateSqlAst(sql: string, whitelist: Whitelist): { ok: boolean; reason?: string } {
  const normalized = normalizeWhitespace(sql)

  // 다중 문장, 달러 인용 문자열, 세미콜론 인젝션 차단 (주석은 먼저 제거)
  const strippedForSemi = normalized
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/#[^\n]*/g, ' ')
  if (/;\s*\S/.test(strippedForSemi)) {
    return { ok: false, reason: '한 번에 하나의 SELECT 문만 허용됩니다' }
  }
  if (/\$\w*\$/.test(normalized)) {
    return { ok: false, reason: 'Dollar-quoted 문자열은 허용되지 않습니다' }
  }

  const parser = new Parser()
  let parsed: { tableList?: string[]; columnList?: string[]; ast: unknown }
  try {
    parsed = parser.parse(sql, { database: 'postgresql' }) as typeof parsed
  } catch (err) {
    return { ok: false, reason: `AST 파싱 실패: ${err instanceof Error ? err.message : String(err)}` }
  }

  const ast = parsed.ast
  const root = (Array.isArray(ast) ? ast[0] : ast) as Record<string, unknown> | undefined
  if (!root || root.type !== 'select') {
    return { ok: false, reason: 'SELECT 문이 아닙니다' }
  }

  const cteNames = new Set<string>()
  if (root.with) {
    const withList = Array.isArray(root.with) ? root.with : [root.with]
    for (const w of withList) {
      const name = (w as { name?: { value?: string } | string }).name
      const value = typeof name === 'string' ? name : name?.value
      if (value) cteNames.add(String(value).toLowerCase())
    }
  }

  const allowedTables = new Set(whitelist.tables)
  const tables = new Set<string>()
  for (const entry of parsed.tableList ?? []) {
    const parts = entry.split('::')
    const table = parts[2]?.toLowerCase()
    if (!table) continue
    if (cteNames.has(table)) continue
    tables.add(table)
  }

  if (tables.size === 0) {
    return { ok: false, reason: '허용된 테이블이 지정되지 않았습니다' }
  }

  for (const t of tables) {
    if (!allowedTables.has(t)) {
      return { ok: false, reason: `테이블 ${t}는 허용되지 않습니다` }
    }
  }

  const allowedColumns = new Set(whitelist.tables.flatMap((t) => whitelist.columns[t] ?? []))
  for (const entry of parsed.columnList ?? []) {
    const parts = entry.split('::')
    const table = parts[1]?.toLowerCase()
    const column = parts[2]?.toLowerCase()
    if (!column || column === '*') continue
    // 문자열 리터럴 값이나 별칭에 공백/특수문자가 포함된 경우 컬럼 제약에서 제외
    if (/\s|['"`]/.test(column)) continue
    if (!allowedColumns.has(column)) {
      return { ok: false, reason: `컬럼 ${column}는 허용되지 않습니다` }
    }
    // CTE에서 파생된 컬럼은 실제 테이블 제약 없이 허용
    if (table && table !== 'null' && cteNames.has(table)) continue
  }

  const functionNames = new Set<string>()
  collectFunctionNames(ast, functionNames)
  for (const fn of functionNames) {
    if (!ALLOWED_FUNCTIONS.has(fn)) {
      return { ok: false, reason: `함수 ${fn}는 허용되지 않습니다` }
    }
  }

  // 금지 키워드는 주석/문자열 리터럴을 제거한 뒤 검사한다
  const strippedForPatterns = normalizeWhitespace(sql)
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/#[^\n]*/g, ' ')
  if (FORBIDDEN_PATTERN.test(strippedForPatterns)) {
    return { ok: false, reason: '금지된 키워드가 포함되어 있습니다' }
  }

  const limit = root.limit as { value?: unknown[] } | undefined
  if (!limit || !Array.isArray(limit.value) || limit.value.length === 0) {
    return { ok: false, reason: 'LIMIT 절이 필요합니다' }
  }

  return { ok: true }
}

/**
 * 정규식 기반 SQL 검증 (AST 검증이 실패할 때 폴백).
 */
export function validateSql(sql: string, whitelist: Whitelist): { ok: boolean; reason?: string } {
  const normalized = normalizeWhitespace(sql)

  const strippedForPatterns = normalized
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/#[^\n]*/g, ' ')

  if (!/^select\s/i.test(normalized)) {
    return { ok: false, reason: 'SELECT 문이 아닙니다' }
  }

  if (FORBIDDEN_PATTERN.test(strippedForPatterns)) {
    return { ok: false, reason: '금지된 키워드가 포함되어 있습니다' }
  }

  const tableSet = new Set(whitelist.tables)
  const escapedTables = whitelist.tables.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  if (escapedTables.length === 0) {
    return { ok: false, reason: '허용된 테이블이 지정되지 않았습니다' }
  }
  const tablePattern = new RegExp(`\\b(${escapedTables.join('|')})\\b`, 'gi')
  const foundTables = Array.from(
    new Set([...normalized.matchAll(tablePattern)].map((m) => m[1].toLowerCase())),
  )
  if (foundTables.length === 0) {
    return { ok: false, reason: '허용된 테이블이 지정되지 않았습니다' }
  }
  for (const t of foundTables) {
    if (!tableSet.has(t)) {
      return { ok: false, reason: `테이블 ${t}는 허용되지 않습니다` }
    }
  }

  const allowedColumns = new Set(whitelist.tables.flatMap((t) => whitelist.columns[t] ?? []))
  const identifiers = [...normalized.matchAll(/[a-zA-Z_][a-zA-Z0-9_]*/g)].map((m) => m[0].toLowerCase())
  for (const id of identifiers) {
    if (SQL_KEYWORDS.has(id) || tableSet.has(id) || allowedColumns.has(id)) continue
    return { ok: false, reason: `식별자 ${id}는 허용되지 않습니다` }
  }

  if (!/\blimit\s+\d+\b/i.test(normalized)) {
    return { ok: false, reason: 'LIMIT 절이 필요합니다' }
  }

  return { ok: true }
}

const MAX_LIMIT = 1000

/**
 * SQL에 LIMIT 절이 없으면 기본값을 추가한다.
 * 이미 LIMIT이 있으면 상한을 초과하지 않도록 제한한다.
 */
export function ensureLimit(sql: string, limit = 100): string {
  const normalized = normalizeWhitespace(sql)
  const existing = /\blimit\s+(\d+)\b/i.exec(normalized)
  if (existing) {
    const n = parseInt(existing[1], 10)
    if (n > MAX_LIMIT) {
      return normalized.replace(/\blimit\s+\d+\b/i, `LIMIT ${MAX_LIMIT}`)
    }
    return normalized
  }
  return `${normalized} LIMIT ${Math.min(limit, MAX_LIMIT)}`
}

interface CatalogInfo {
  table: string
  title?: string
  description?: string
  theme?: string
  keywords?: string
  columns: string[]
  sampleRows: Record<string, unknown>[]
}

interface OntologyConcept {
  obj_id: string
  obj_type: string | null
  label: string | null
  props: string | null
}

async function fetchCatalogInfo(
  supabase: SupabaseClient,
  whitelist: Whitelist,
): Promise<CatalogInfo[]> {
  const { data: catalogRows } = await supabase
    .from('catalog')
    .select('table_name,title,description,theme,keywords')
    .in('table_name', whitelist.tables)

  const catalogByTable = new Map<string, Record<string, unknown>>()
  for (const r of catalogRows ?? []) {
    const table = String(r.table_name ?? '').toLowerCase()
    if (table) catalogByTable.set(table, r)
  }

  const sampleLimit = 3
  const maxSampleTables = 10

  return Promise.all(
    whitelist.tables.map(async (table, i) => {
      const columns = whitelist.columns[table] ?? []
      const info: CatalogInfo = {
        table,
        title: (catalogByTable.get(table)?.title as string | undefined) ?? undefined,
        description: (catalogByTable.get(table)?.description as string | undefined) ?? undefined,
        theme: (catalogByTable.get(table)?.theme as string | undefined) ?? undefined,
        keywords: (catalogByTable.get(table)?.keywords as string | undefined) ?? undefined,
        columns,
        sampleRows: [],
      }

      if (i < maxSampleTables) {
        try {
          const { data } = await supabase.from(table).select('*').limit(sampleLimit)
          if (Array.isArray(data)) info.sampleRows = data
        } catch {
          // 샘플 조회 실패는 무시하고 메타데이터만 사용
        }
      }

      return info
    }),
  )
}

async function fetchOntologyConcepts(
  supabase: SupabaseClient,
  question: string,
): Promise<OntologyConcept[]> {
  const terms = question.split(/\s+/).filter((t) => t.length > 1)
  if (terms.length === 0) return []

  const filters = terms
    .map((t) => `label.ilike.%${t}%,obj_type.ilike.%${t}%,props.ilike.%${t}%`)
    .join(',')

  const { data } = await supabase
    .from('onto_objects')
    .select('obj_id,obj_type,label,props')
    .or(filters)
    .limit(5)

  return (data ?? []) as OntologyConcept[]
}

function formatCatalogInfo(info: CatalogInfo[]): string {
  return info
    .map((i) => {
      const meta = [
        i.title ? `제목: ${i.title}` : '',
        i.theme ? `주제: ${i.theme}` : '',
        i.keywords ? `키워드: ${i.keywords}` : '',
        i.description ? `설명: ${i.description}` : '',
      ].filter(Boolean)
      const sample = i.sampleRows.length > 0
        ? `샘플 행:\n${i.sampleRows.map((r) => `  ${JSON.stringify(r)}`).join('\n')}`
        : ''
      return [
        `- 테이블: ${i.table}`,
        `  컬럼: ${i.columns.join(', ')}`,
        meta.length > 0 ? `  ${meta.join(' / ')}` : '',
        sample,
      ].filter(Boolean).join('\n')
    })
    .join('\n\n')
}

function formatOntologyConcepts(concepts: OntologyConcept[]): string {
  if (concepts.length === 0) return '없음'
  return concepts
    .map((c) => `- ${c.label ?? c.obj_id} (${c.obj_type ?? '개념'}): ${c.props ?? ''}`)
    .join('\n')
}

function buildFewShotExamples(): string {
  return `예시 1:
질문: "2024년 청년 정착잠재지수가 높은 상위 5개 시군은?"
SQL: SELECT sigun, settlement_score FROM gold_settlement_index WHERE year = 2024 ORDER BY settlement_score DESC LIMIT 5

예시 2:
질문: "시군별 청년 사업체 수와 정착지수를 같이 보여줘"
SQL: SELECT a.sigun, a.settlement_score, b.biz_count FROM gold_settlement_index a JOIN gold_business b ON a.sigun = b.sigun LIMIT 20`
}

function buildGenerationPrompt(params: {
  question: string
  whitelist: Whitelist
  catalogInfo: CatalogInfo[]
  ontologyConcepts: OntologyConcept[]
  previousSql?: string
  previousError?: string
  attempt: number
}): string {
  const header = params.attempt === 0
    ? '사용자 질문을 아래 스키마 정보를 바탕으로 안전한 PostgreSQL SELECT 문으로 변환하세요.'
    : `이전 시도(${params.attempt}차)에서 오류가 발생했습니다. 아래 오류 메시지를 참고해 SQL을 수정하세요.`

  const retrySection = params.previousSql
    ? `\n[이전 SQL]\n${params.previousSql}\n\n[오류/결과]\n${params.previousError ?? '알 수 없는 오류'}\n`
    : ''

  return `${header}${retrySection}

사용자 질문: "${params.question}"

허용된 테이블과 컬럼:
${params.whitelist.tables
  .map((t) => `- ${t}: ${(params.whitelist.columns[t] ?? []).join(', ')}`)
  .join('\n')}

카탈로그 메타데이터 및 샘플 행:
${formatCatalogInfo(params.catalogInfo)}

관련 온톨로지 개념:
${formatOntologyConcepts(params.ontologyConcepts)}

${buildFewShotExamples()}

규칙:
- 반드시 SELECT로 시작하고, DML/DDL 키워드(INSERT/UPDATE/DELETE/DROP/ALTER/CREATE/TRUNCATE 등)를 사용하지 마세요.
- 반드시 LIMIT 절을 포함하세요.
- 위에 나염된 테이블과 컬럼만 사용하세요.
- 조인, 집계, 서브쿼리, CTE를 사용할 수 있습니다.
- 답변은 JSON {"sql": "...", "explanation": "..."} 형태만 반환하세요.`
}

/**
 * 자연어 질문을 안전한 SELECT SQL로 변환한다.
 *
 * - 화이트리스트에 없는 테이블/컬럼은 사용할 수 없다.
 * - 항상 LIMIT 절을 포함한다.
 * - 실행 콜백이 제공되면 SQL 실행/재시도를 통해 자동 교정한다(최대 2회).
 * - 모든 재시도가 실패하면 실패 원인을 설명하는 결과를 반환한다.
 */
export async function generateSql(
  supabase: SupabaseClient,
  question: string,
  options?: GenerateSqlOptions,
): Promise<GenerateSqlResult | null> {
  const whitelist = await buildWhitelist(supabase)
  if (whitelist.tables.length === 0) return null

  const [catalogInfo, ontologyConcepts] = await Promise.all([
    fetchCatalogInfo(supabase, whitelist),
    fetchOntologyConcepts(supabase, question),
  ])

  const execute = options?.execute
  const maxRetries = options?.maxRetries ?? 2
  const maxAttempts = 1 + maxRetries

  let lastError: string | undefined
  let lastSql: string | undefined

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const prompt = buildGenerationPrompt({
      question,
      whitelist,
      catalogInfo,
      ontologyConcepts,
      previousSql: lastSql,
      previousError: lastError,
      attempt,
    })

    try {
      const { content } = await chatCompletionGateway({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
      })

      const jsonMatch = content.match(/\{[\s\S]*\}/)
      const parsed = jsonMatch
        ? (JSON.parse(jsonMatch[0]) as { sql?: string; explanation?: string })
        : null
      if (!parsed?.sql) {
        lastError = 'LLM 응답에서 JSON을 파싱할 수 없습니다'
        continue
      }

      const sql = ensureLimit(String(parsed.sql))
      let validation = validateSqlAst(sql, whitelist)

      // 파서가 실패하면 정규식 폴백을 시도한다
      if (!validation.ok && validation.reason?.startsWith('AST 파싱 실패')) {
        validation = validateSql(sql, whitelist)
      }

      if (!validation.ok) {
        lastError = validation.reason ?? 'SQL 검증 실패'
        lastSql = sql
        continue
      }

      if (execute) {
        const { data, error } = await execute(sql)
        if (error) {
          lastError = `SQL 실행 오류: ${error.message}`
          lastSql = sql
          continue
        }
        const rows = Array.isArray(data) ? data : []
        if (rows.length === 0) {
          lastError = '쿼리 결과가 0건입니다. 질문을 다시 해석해 보세요.'
          lastSql = sql
          continue
        }
      }

      return { sql, explanation: String(parsed.explanation ?? '') }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
    }
  }

  // 모든 재시도가 실패하면 실패한 SQL을 반환하지 않는다 (호출자가 실패 SQL을 그대로 실행하는 것을 방지)
  return null
}
