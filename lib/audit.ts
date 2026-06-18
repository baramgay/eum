import type { SupabaseClient, User } from '@supabase/supabase-js'

export type AuditAction =
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'review'
  | 'created_tenant'
  | 'updated_tenant'
  | 'deleted_tenant'
  | 'onboarded_tenant'
  | 'issued_api_key'
  | 'revoked_api_key'
  | 'created_user'
  | 'updated_user'
  | 'deleted_user'
  | 'banned_user'
  | 'unbanned_user'

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY!

const MAX_RETRIES = 3

async function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

export async function logAction(
  _supabase: SupabaseClient,
  actor: User,
  action: AuditAction,
  resourceType: string,
  resourceId: string,
  oldValue?: unknown,
  newValue?: unknown,
  req?: Request,
): Promise<void> {
  const ip = req?.headers?.get('x-forwarded-for')
    ?? req?.headers?.get('x-real-ip')
    ?? null
  const ua = req?.headers?.get('user-agent') ?? null

  const payload = {
    actor_id:      actor.id,
    actor_email:   actor.email,
    action,
    resource_type: resourceType,
    resource_id:   resourceId,
    old_value:     oldValue ?? null,
    new_value:     newValue ?? null,
    ip_address:    ip,
    user_agent:    ua,
  }

  let lastError: unknown
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/audit_logs`, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${SERVICE_KEY}`,
          'apikey':        SERVICE_KEY,
          'Prefer':        'return=minimal',
        },
        body: JSON.stringify(payload),
      })
      if (res.ok) return
      lastError = new Error(`audit_logs insert failed: ${res.status} ${res.statusText}`)
    } catch (e) {
      lastError = e
    }
    if (attempt < MAX_RETRIES) {
      await sleep(2 ** attempt * 200)
    }
  }

  // 재시도 실패 시 동기 경고: 메인 기능은 차단하지 않지만 운영자가 알 수 있어야 함
  console.warn('[audit] 감사 로그 기록 실패 (재시도 후):', lastError, { action, resourceType, resourceId })
}

/** API 키 발급 감사 로그 */
export async function logApiKeyCreated(
  supabase: SupabaseClient,
  actor: User,
  keyId: string,
  details: { tenant_id?: string | null; name?: string; prefix?: string },
  req?: Request,
): Promise<void> {
  return logAction(supabase, actor, 'issued_api_key', 'api_key', keyId, undefined, details, req)
}

/** API 키 폐기(비활성화/삭제) 감사 로그 */
export async function logApiKeyRevoked(
  supabase: SupabaseClient,
  actor: User,
  keyId: string,
  before?: { tenant_id?: string | null; name?: string; is_active?: boolean },
  req?: Request,
): Promise<void> {
  return logAction(supabase, actor, 'revoked_api_key', 'api_key', keyId, before, undefined, req)
}

/** 제출물 결정(승인/반려/검토) 감사 로그 */
export async function logSubmissionDecided(
  supabase: SupabaseClient,
  actor: User,
  submissionId: string,
  decision: 'approved' | 'rejected' | 'review',
  before?: unknown,
  after?: unknown,
  req?: Request,
): Promise<void> {
  const action: AuditAction = decision === 'approved' ? 'approved' : decision === 'rejected' ? 'rejected' : 'review'
  return logAction(supabase, actor, action, 'submission', submissionId, before, after, req)
}

/** 기관 상태 변경 감사 로그 */
export async function logTenantStatusChanged(
  supabase: SupabaseClient,
  actor: User,
  tenantId: string,
  oldStatus: string,
  newStatus: string,
  req?: Request,
): Promise<void> {
  const action: AuditAction =
    newStatus === 'approved' ? 'approved' :
    newStatus === 'rejected' ? 'rejected' :
    'updated_tenant'
  return logAction(
    supabase,
    actor,
    action,
    'tenant',
    tenantId,
    { status: oldStatus },
    { status: newStatus },
    req,
  )
}
