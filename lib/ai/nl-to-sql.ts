import type { SupabaseClient } from '@supabase/supabase-js'
import { chatCompletion } from './provider'

export interface Whitelist {
  tables: string[]
  columns: Record<string, string[]>
}

export interface GenerateSqlResult {
  sql: string
  explanation: string
}

const SQL_KEYWORDS = new Set([
  'select', 'from', 'where', 'and', 'or', 'not', 'in', 'is', 'null', 'like', 'ilike',
  'limit', 'order', 'by', 'group', 'having', 'as', 'on', 'join', 'left', 'right',
  'inner', 'outer', 'cross', 'distinct', 'count', 'sum', 'avg', 'min', 'max',
  'coalesce', 'case', 'when', 'then', 'else', 'end', 'asc', 'desc', 'true', 'false',
  'between', 'exists', 'union', 'all', 'any', 'some', 'cast', 'date_trunc', 'to_char',
  'round', 'jsonb_agg', 'array_agg', 'unnest', 'string_agg', 'over', 'partition',
])

const FORBIDDEN_PATTERN = /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|execute|exec|load)\b/i

function normalizeWhitespace(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim()
}

/**
 * 카탈로그 메타데이터에서 table_name이 지정된 테이블들의 화이트리스트를 구성한다.
 */
export async function buildWhitelist(supabase: SupabaseClient): Promise<Whitelist> {
  const { data: catalogRows } = await supabase
    .from('catalog')
    .select('table_name')
    .not('table_name', 'is', null)

  const tables = Array.from(
    new Set(
      (catalogRows ?? [])
        .map((r) => r.table_name as string)
        .filter(Boolean),
    ),
  )

  const columns: Record<string, string[]> = {}
  if (tables.length === 0) return { tables: [], columns: {} }

  const { data: colRows } = await supabase
    .from('information_schema.columns')
    .select('table_name,column_name')
    .eq('table_schema', 'public')
    .in('table_name', tables)

  for (const c of colRows ?? []) {
    if (!columns[c.table_name]) columns[c.table_name] = []
    columns[c.table_name].push((c.column_name as string).toLowerCase())
  }

  return { tables: tables.map((t) => t.toLowerCase()), columns }
}

/**
 * SQL이 화이트리스트를 준수하는지 검증한다.
 */
export function validateSql(sql: string, whitelist: Whitelist): { ok: boolean; reason?: string } {
  const normalized = normalizeWhitespace(sql)

  if (!/^select\s/i.test(normalized)) {
    return { ok: false, reason: 'SELECT 문이 아닙니다' }
  }

  if (FORBIDDEN_PATTERN.test(normalized)) {
    return { ok: false, reason: '금지된 키워드가 포함되어 있습니다' }
  }

  const tableSet = new Set(whitelist.tables)
  const tablePattern = new RegExp(`\\b(${whitelist.tables.join('|')})\\b`, 'gi')
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

  const allowedColumns = new Set(
    whitelist.tables.flatMap((t) => whitelist.columns[t] ?? []),
  )
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

/**
 * SQL에 LIMIT 절이 없으면 기본값을 추가한다.
 */
export function ensureLimit(sql: string, limit = 100): string {
  const normalized = normalizeWhitespace(sql)
  if (/\blimit\s+\d+\b/i.test(normalized)) return normalized
  return `${normalized} LIMIT ${limit}`
}

/**
 * 자연어 질문을 안전한 SELECT SQL로 변환한다.
 *
 * - 화이트리스트에 없는 테이블/컬럼은 사용할 수 없다.
 * - 항상 LIMIT 절을 포함한다.
 * - LLM 파싱/검증 실패 시 null을 반환한다.
 */
export async function generateSql(
  supabase: SupabaseClient,
  question: string,
): Promise<GenerateSqlResult | null> {
  const whitelist = await buildWhitelist(supabase)
  if (whitelist.tables.length === 0) return null

  const prompt = `사용자 질문: "${question}"

허용된 테이블과 컬럼:
${whitelist.tables
  .map((t) => `- ${t}: ${(whitelist.columns[t] ?? []).join(', ')}`)
  .join('\n')}

위 정볼만 사용하여 안전한 PostgreSQL SELECT 문을 작성하세요.
- 반드시 SELECT로 시작하고, DML/DDL 키워드(INSERT/UPDATE/DELETE/DROP 등)를 사용하지 마세요.
- 반드시 LIMIT 절을 포함하세요.
- 허용된 테이블과 컬럼만 사용하세요.
- 답변은 JSON {"sql": "...", "explanation": "..."} 형태만 반환하세요.`

  try {
    const { content } = await chatCompletion({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
    })

    const jsonMatch = content.match(/\{[\s\S]*\}/)
    const parsed = jsonMatch ? (JSON.parse(jsonMatch[0]) as { sql?: string; explanation?: string }) : null
    if (!parsed?.sql) return null

    const sql = ensureLimit(String(parsed.sql))
    const validation = validateSql(sql, whitelist)
    if (!validation.ok) return null

    return { sql, explanation: String(parsed.explanation ?? '') }
  } catch {
    return null
  }
}
