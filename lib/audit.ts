import type { SupabaseClient, User } from '@supabase/supabase-js'

export type AuditAction =
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'review'
  | 'created_tenant'
  | 'deleted_tenant'
  | 'onboarded_tenant'
  | 'issued_api_key'
  | 'revoked_api_key'

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY!

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
  try {
    const ip = req?.headers?.get('x-forwarded-for')
      ?? req?.headers?.get('x-real-ip')
      ?? null
    const ua = req?.headers?.get('user-agent') ?? null

    await fetch(`${SUPABASE_URL}/rest/v1/audit_logs`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'apikey':        SERVICE_KEY,
        'Prefer':        'return=minimal',
      },
      body: JSON.stringify({
        actor_id:      actor.id,
        actor_email:   actor.email,
        action,
        resource_type: resourceType,
        resource_id:   resourceId,
        old_value:     oldValue ?? null,
        new_value:     newValue ?? null,
        ip_address:    ip,
        user_agent:    ua,
      }),
    })
  } catch {
    // fire-and-forget: 감사 로그 실패가 메인 기능을 방해하지 않음
  }
}
