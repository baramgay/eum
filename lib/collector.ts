/**
 * 데이터 수집(Collection) 모듈 — 외부 API/파일 자동 수집 워크플로우
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { inferSchema } from './submission'
import { randomHex } from './utils'
import { runAll } from './quality'

// ─── auth_value 암호화/복호화 ──────────────────────────────────────────────
const SECRET = (process.env.COLLECTION_SECRET ?? 'eum_default_secret_key_32bytes!!').padEnd(32, '!').slice(0, 32)

export function encryptAuthValue(plain: string): string {
  const iv = randomBytes(16)
  const cipher = createCipheriv('aes-256-cbc', Buffer.from(SECRET), iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return iv.toString('hex') + ':' + enc.toString('hex')
}

export function decryptAuthValue(encrypted: string): string {
  const [ivHex, encHex] = encrypted.split(':')
  if (!ivHex || !encHex) return encrypted  // 평문이면 그대로 반환 (하위 호환)
  try {
    const decipher = createDecipheriv('aes-256-cbc', Buffer.from(SECRET), Buffer.from(ivHex, 'hex'))
    return Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]).toString('utf8')
  } catch {
    return encrypted  // 복호화 실패 시 원본 반환 (하위 호환)
  }
}

export type AuthType     = 'none' | 'api_key' | 'bearer'
export type RespFormat   = 'json' | 'csv'
export type ScheduleType = 'manual' | 'daily' | 'weekly' | 'monthly'
export type JobStatus    = 'idle' | 'running' | 'success' | 'failed'

export interface CollectionSource {
  source_id:    string
  tenant_id:    string
  title:        string
  description:  string | null
  url:          string
  method:       string
  auth_type:    AuthType
  auth_key:     string | null
  auth_value:   string | null
  query_params: Record<string, string>
  resp_format:  RespFormat
  json_path:    string | null
  theme:        string | null
  keywords:     string | null
  license:      string | null
  created_at:   string
  updated_at:   string
}

export interface CollectionJob {
  job_id:        string
  source_id:     string
  tenant_id:     string
  schedule_type: ScheduleType
  status:        JobStatus
  enabled:       boolean
  last_run_at:   string | null
  next_run_at:   string | null
  last_log_id:   string | null
  created_at:    string
}

export const newCollectId      = () => 'csrc_' + randomHex(4)
export const newJobId          = () => 'cjob_' + randomHex(4)
export const newLogId          = () => 'clog_' + randomHex(4)
export const newCollectTableName = (tenantId: string) =>
  'col_' + tenantId.slice(0, 8) + '_' + randomHex(4)

/** $.a.b.c 경로로 중첩 객체 탐색, 배열이면 그대로, 객체면 래핑, null이면 [] */
export function extractByJsonPath(
  payload: unknown,
  path: string,
): Record<string, unknown>[] {
  if (!path || path === '$') {
    if (Array.isArray(payload)) return payload as Record<string, unknown>[]
    if (payload && typeof payload === 'object') return [payload as Record<string, unknown>]
    return []
  }

  // $.a.b.c → ['a','b','c']
  const parts = path.replace(/^\$\.?/, '').split('.')
  let cur: unknown = payload
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return []
    cur = (cur as Record<string, unknown>)[part]
  }

  if (Array.isArray(cur)) return cur as Record<string, unknown>[]
  if (cur && typeof cur === 'object') return [cur as Record<string, unknown>]
  return []
}

/** 첫 줄 헤더, 큰따옴표 필드 처리 포함 CSV 파싱 */
export function parseCsv(text: string): Record<string, unknown>[] {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return []

  function splitLine(line: string): string[] {
    const result: string[] = []
    let current = ''
    let inQuote = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        // 이중 따옴표 escape 처리
        if (inQuote && line[i + 1] === '"') { current += '"'; i++ }
        else inQuote = !inQuote
      } else if (ch === ',' && !inQuote) {
        result.push(current); current = ''
      } else {
        current += ch
      }
    }
    result.push(current)
    return result
  }

  const headers = splitLine(lines[0])
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const vals = splitLine(line)
    return Object.fromEntries(headers.map((h, i) => {
      const v = vals[i] ?? ''
      const n = Number(v)
      return [h, v === '' ? null : isNaN(n) ? v : n]
    }))
  })
}

/** 스케줄 유형에 따라 다음 실행 시각 계산 */
export function calcNextRunAt(scheduleType: ScheduleType): string | null {
  if (scheduleType === 'manual') return null
  const now = new Date()

  if (scheduleType === 'daily') {
    const next = new Date(now)
    next.setDate(next.getDate() + 1)
    next.setHours(0, 0, 0, 0)
    return next.toISOString()
  }

  if (scheduleType === 'weekly') {
    const next = new Date(now)
    // 다음 월요일 자정
    const daysUntilMonday = (8 - next.getDay()) % 7 || 7
    next.setDate(next.getDate() + daysUntilMonday)
    next.setHours(0, 0, 0, 0)
    return next.toISOString()
  }

  // monthly: 다음달 1일
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0)
  return next.toISOString()
}

interface FetchResult {
  rows:     Record<string, unknown>[]
  rawCount: number
}

const MAX_ROWS = 100_000
const FETCH_TIMEOUT_MS = 5_000

/** auth_type별 헤더 구성, resp_format별 파싱 */
export async function fetchSource(src: CollectionSource): Promise<FetchResult> {
  const headers: Record<string, string> = {}

  if (src.auth_type === 'api_key' && src.auth_key && src.auth_value) {
    headers[src.auth_key] = decryptAuthValue(src.auth_value)
  } else if (src.auth_type === 'bearer' && src.auth_value) {
    headers['Authorization'] = `Bearer ${decryptAuthValue(src.auth_value)}`
  }

  const url = new URL(src.url)
  if (src.query_params) {
    Object.entries(src.query_params).forEach(([k, v]) => url.searchParams.set(k, v))
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  let rows: Record<string, unknown>[]
  try {
    const res = await fetch(url.toString(), {
      method:  src.method,
      headers,
      signal:  controller.signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)

    if (src.resp_format === 'csv') {
      const text = await res.text()
      rows = parseCsv(text)
    } else {
      const json = await res.json()
      rows = src.json_path ? extractByJsonPath(json, src.json_path) : (
        Array.isArray(json) ? json as Record<string, unknown>[] : [json as Record<string, unknown>]
      )
    }
  } finally {
    clearTimeout(timer)
  }

  const rawCount = rows.length
  if (rows.length > MAX_ROWS) rows = rows.slice(0, MAX_ROWS)
  return { rows, rawCount }
}

interface DiffResult {
  rows_new:     number
  rows_changed: number
  rows_deleted: number
}

/** JSON.stringify 해시 기반 행 집합 비교 */
export function diffRows(
  prev: Record<string, unknown>[],
  next: Record<string, unknown>[],
): DiffResult {
  const prevSet = new Set(prev.map(r => JSON.stringify(r)))
  const nextSet = new Set(next.map(r => JSON.stringify(r)))

  let rows_new = 0
  let rows_deleted = 0

  Array.from(nextSet).forEach(s => { if (!prevSet.has(s)) rows_new++ })
  Array.from(prevSet).forEach(s => { if (!nextSet.has(s)) rows_deleted++ })

  // 키 컬럼 식별 불가이므로 changed는 0 (추가/삭제로만 판별)
  return { rows_new, rows_changed: 0, rows_deleted }
}

/** 수집 실행: 로그 시작 → fetch → 저장 → diff → catalog upsert → 로그 종료 */
export async function runCollection(
  supabase: SupabaseClient,
  job: CollectionJob,
): Promise<string> {
  const logId    = newLogId()
  const srcId    = job.source_id
  const tenantId = job.tenant_id
  const tableName = newCollectTableName(tenantId)
  const startedAt = new Date().toISOString()

  // 로그 레코드 먼저 생성 (status=running)
  await supabase.from('collection_logs').insert({
    log_id:    logId,
    job_id:    job.job_id,
    source_id: srcId,
    tenant_id: tenantId,
    started_at: startedAt,
    status:    'running',
    table_name: tableName,
  })

  // job을 running 상태로 전환
  await supabase.from('collection_jobs').update({ status: 'running' }).eq('job_id', job.job_id)

  try {
    // 소스 메타데이터 조회
    const { data: srcData, error: srcErr } = await supabase
      .from('collection_sources')
      .select('*')
      .eq('source_id', srcId)
      .maybeSingle()
    if (srcErr || !srcData) throw new Error(srcErr?.message ?? '소스를 찾을 수 없습니다')

    const src = srcData as CollectionSource

    // 외부 API 호출
    const { rows, rawCount } = await fetchSource(src)

    // 이전 수집 행 조회 (diff용) — 마지막 성공 로그의 테이블명 기반
    let prevRows: Record<string, unknown>[] = []
    const { data: prevLog } = await supabase
      .from('collection_logs')
      .select('table_name')
      .eq('source_id', srcId)
      .eq('status', 'success')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (prevLog?.table_name) {
      const { data: prevUpload } = await supabase
        .from('submission_uploads')
        .select('preview')
        .eq('table_name', prevLog.table_name)
        .maybeSingle()
      if (prevUpload?.preview) prevRows = prevUpload.preview as Record<string, unknown>[]
    }

    const diff = diffRows(prevRows, rows)
    const schema = inferSchema(rows)

    // submission_uploads에 수집 결과 저장 (재사용 가능한 저장소)
    const uploadId = randomHex(8)

    await supabase.from('submission_uploads').insert({
      upload_id:   uploadId,
      table_name:  tableName,
      schema_info: schema,
      preview:     rows.slice(0, 100),
      row_count:   rows.length,
      created_at:  new Date().toISOString(),
    })

    // catalog upsert — 수집 데이터셋을 개방 목록에 노출
    await supabase.from('catalog').upsert({
      dataset_id:  srcId,
      tenant_id:   tenantId,
      title:       src.title,
      description: src.description ?? '',
      theme:       src.theme ?? '',
      keywords:    src.keywords ?? '',
      license:     src.license ?? '공공누리 1유형',
      format:      src.resp_format.toUpperCase(),
      table_name:  tableName,
      rows:        rows.length,
      updated_at:  new Date().toISOString(),
    }, { onConflict: 'dataset_id' })

    const finishedAt  = new Date().toISOString()
    const durationMs  = Date.now() - new Date(startedAt).getTime()

    // 로그 성공 처리
    await supabase.from('collection_logs').update({
      finished_at:  finishedAt,
      duration_ms:  durationMs,
      status:       'success',
      rows_fetched: rawCount,
      rows_new:     diff.rows_new,
      rows_changed: diff.rows_changed,
      rows_deleted: diff.rows_deleted,
    }).eq('log_id', logId)

    // job 상태 갱신
    await supabase.from('collection_jobs').update({
      status:      'success',
      last_run_at: finishedAt,
      last_log_id: logId,
      next_run_at: calcNextRunAt(job.schedule_type),
    }).eq('job_id', job.job_id)

    // 품질 진단 자동 연계 (직접 호출 — self-fetch 제거)
    try {
      await runAll(supabase)
    } catch {
      // 품질 진단 실패는 수집 성공 결과에 영향을 주지 않음
    }

    return logId
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)

    await supabase.from('collection_logs').update({
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - new Date(startedAt).getTime(),
      status:      'failed',
      error_msg:   msg,
    }).eq('log_id', logId)

    await supabase.from('collection_jobs').update({
      status:      'failed',
      last_run_at: new Date().toISOString(),
      last_log_id: logId,
    }).eq('job_id', job.job_id)

    throw err
  }
}
