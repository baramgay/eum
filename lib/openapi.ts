export const runtime = 'nodejs'

import { createHash, randomUUID } from 'crypto'
import { createClient as createRaw, type SupabaseClient } from '@supabase/supabase-js'

export type ApiKeyScope = { type: 'all' } | { type: 'datasets'; ids: string[] }

export interface ValidateResult {
  valid: boolean
  keyId?: string
  tenantId?: string
  scope?: ApiKeyScope
  reason?: 'missing' | 'not_found' | 'inactive' | 'expired'
}

/** 쿠키 없는 service-role 클라이언트 (공개 API용) */
export function createPublicClient(): SupabaseClient {
  return createRaw(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export function hashKey(plain: string): string {
  return createHash('sha256').update(plain).digest('hex')
}

export function generateApiKey(): { plain: string; prefix: string; hash: string } {
  const raw = randomUUID().replace(/-/g, '')
  const plain = `eum_${raw}`
  return { plain, prefix: `eum_${raw.slice(0, 8)}`, hash: hashKey(plain) }
}

export async function validateApiKey(
  sb: SupabaseClient,
  key: string | null
): Promise<ValidateResult> {
  if (!key) return { valid: false, reason: 'missing' }
  const { data } = await sb
    .from('api_keys')
    .select('key_id, tenant_id, scope, is_active, expires_at')
    .eq('key_hash', hashKey(key))
    .maybeSingle()
  if (!data) return { valid: false, reason: 'not_found' }
  if (!data.is_active) return { valid: false, reason: 'inactive' }
  if (data.expires_at && new Date(data.expires_at) < new Date())
    return { valid: false, reason: 'expired' }
  return {
    valid: true,
    keyId: data.key_id,
    tenantId: data.tenant_id,
    scope: data.scope as ApiKeyScope,
  }
}

export async function logApiAccess(
  sb: SupabaseClient,
  keyId: string,
  endpoint: string,
  method: string,
  status: number,
  startMs?: number
): Promise<void> {
  const response_ms = startMs != null ? Date.now() - startMs : undefined
  await sb.from('api_access_logs').insert({
    key_id: keyId,
    endpoint,
    method,
    status_code: status,
    ...(response_ms != null ? { response_ms } : {}),
  })
  // call_count는 별도 업데이트 (RPC 없이 raw increment는 동시성 문제 있으므로 last_used_at만 업데이트)
  await sb
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('key_id', keyId)
}

export function scopeAllows(scope: ApiKeyScope, datasetId: string): boolean {
  return (
    scope.type === 'all' ||
    (scope.type === 'datasets' && scope.ids.includes(datasetId))
  )
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return ''
  const cols = Object.keys(rows[0])
  const esc = (v: unknown): string => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [
    cols.join(','),
    ...rows.map(r => cols.map(c => esc(r[c])).join(',')),
  ].join('\n')
}

export function buildDcatCatalog(
  datasets: Array<Record<string, unknown>>,
  baseUrl: string
) {
  return {
    '@context': 'https://www.w3.org/ns/dcat3',
    '@type': 'dcat:Catalog',
    'dct:title': 'EUM 경남 공공데이터 개방 카탈로그',
    'dcat:dataset': datasets.map((d: Record<string, unknown>) => ({
      '@type': 'dcat:Dataset',
      '@id': `${baseUrl}/api/v1/datasets/${d.dataset_id}`,
      'dct:title': d.title,
      'dct:description': d.description,
      'dcat:theme': d.theme,
      'dct:license': d.license,
      'dct:modified': d.updated_at,
      'dcat:keyword': ((d.keywords as string) ?? '')
        .split(',')
        .map((s: string) => s.trim())
        .filter(Boolean),
      'dcat:distribution': [
        {
          '@type': 'dcat:Distribution',
          'dcat:accessURL': `${baseUrl}/api/v1/datasets/${d.dataset_id}/data`,
          'dct:format': d.format,
        },
      ],
    })),
  }
}

export async function sendWebhook(
  sb: SupabaseClient,
  event: string,
  payload: unknown
): Promise<void> {
  const { data: hooks } = await sb
    .from('webhooks')
    .select('webhook_id, url')
    .eq('is_active', true)
    .contains('events', [event])

  for (const h of hooks ?? []) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      let status = 0
      try {
        const res = await fetch(h.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event,
            data: payload,
            sent_at: new Date().toISOString(),
          }),
        })
        status = res.status
      } catch {
        /* 네트워크 오류 — 재시도 */
      }
      await sb.from('webhook_logs').insert({
        webhook_id: h.webhook_id,
        event,
        payload,
        status_code: status,
        attempt,
      })
      if (status >= 200 && status < 300) break
      if (attempt < 3)
        await new Promise(r => setTimeout(r, 2 ** attempt * 500))
    }
  }
}

/** 공개 API용 래퍼: X-API-Key 헤더 검증 + 비동기 로깅 */
export async function withApiKey(
  req: Request,
  handler: (ctx: { sb: SupabaseClient; auth: ValidateResult }) => Promise<Response>
): Promise<Response> {
  const sb = createPublicClient()
  const key = req.headers.get('x-api-key')
  const auth = await validateApiKey(sb, key)
  if (!auth.valid) {
    const code =
      auth.reason === 'missing' || auth.reason === 'not_found' ? 401 : 403
    return Response.json(
      { error: 'API 키가 유효하지 않습니다', reason: auth.reason },
      { status: code }
    )
  }
  const startMs = Date.now()
  const res = await handler({ sb, auth })
  const { pathname } = new URL(req.url)
  void logApiAccess(sb, auth.keyId!, pathname, req.method, res.status, startMs)
  return res
}
