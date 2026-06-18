export interface AccessLog {
  log_id?: number
  endpoint: string
  method: string
  status_code: number
  response_ms?: number | null
  ts?: string
  user_id?: string | null
  error?: boolean
}

export interface TelemetrySummary {
  total: number
  errorCount: number
  errorRate: number
  avgResponseMs: number
  p95ResponseMs: number
}

function nowIso() {
  return new Date().toISOString()
}

/**
 * 미들웨어에서 호출하는 접근 로그 기록 (fire-and-forget).
 * 실패핏 무시한다.
 */
export function recordAccessLog(log: Omit<AccessLog, 'log_id' | 'ts'>): void {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) return

  const payload: Record<string, unknown> = {
    endpoint: log.endpoint,
    method: log.method,
    status_code: log.status_code,
    response_ms: log.response_ms ?? null,
    user_id: log.user_id ?? null,
    error: log.status_code >= 500 || log.error === true,
    ts: nowIso(),
  }

  void fetch(`${supabaseUrl}/rest/v1/api_access_logs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(payload),
  }).catch(() => {
    // 운영 지표 기록 실패는 메인 요청을 중단시키지 않는다.
  })
}

function parseTs(ts?: string): number {
  return ts ? new Date(ts).getTime() : Date.now()
}

export function filterByWindow<T extends { ts?: string }>(rows: T[], windowMs: number): T[] {
  const cutoff = Date.now() - windowMs
  return rows.filter(r => parseTs(r.ts) >= cutoff)
}

export function getErrorRate(logs: AccessLog[], thresholdStatus = 500): number {
  if (!logs.length) return 0
  const errors = logs.filter(l => l.status_code >= thresholdStatus || l.error).length
  return errors / logs.length
}

export function getAvgResponseTime(logs: AccessLog[]): number {
  const valid = logs.filter(l => typeof l.response_ms === 'number' && l.response_ms >= 0)
  if (!valid.length) return 0
  return valid.reduce((sum, l) => sum + (l.response_ms ?? 0), 0) / valid.length
}

export function getP95ResponseTime(logs: AccessLog[]): number {
  const valid = logs
    .filter(l => typeof l.response_ms === 'number' && l.response_ms >= 0)
    .map(l => l.response_ms ?? 0)
    .sort((a, b) => a - b)
  if (!valid.length) return 0
  const idx = Math.ceil(valid.length * 0.95) - 1
  return valid[Math.max(0, idx)]
}

export function summarizeAccessLogs(logs: AccessLog[], windowMs?: number): TelemetrySummary {
  const target = windowMs ? filterByWindow(logs, windowMs) : logs
  const total = target.length
  const errorCount = target.filter(l => l.status_code >= 500 || l.error).length
  return {
    total,
    errorCount,
    errorRate: total ? errorCount / total : 0,
    avgResponseMs: getAvgResponseTime(target),
    p95ResponseMs: getP95ResponseTime(target),
  }
}

export function getRecentErrors(logs: AccessLog[], windowMs: number, limit = 20): AccessLog[] {
  return filterByWindow(logs, windowMs)
    .filter(l => l.status_code >= 500 || l.error)
    .slice(0, limit)
}
