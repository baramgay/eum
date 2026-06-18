import { createClient } from '@/lib/supabase/server'
import { logAction, logTenantStatusChanged } from '@/lib/audit'
import { jsonError, jsonOk } from '@/lib/api'

export const dynamic = 'force-dynamic'

async function requireCenter(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.user_metadata?.role !== 'center') return null
  return user
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return jsonError('인증이 필요합니다', 401)

  const { data, error } = await supabase
    .from('tenants')
    .select('tenant_id,name,gov_type,sgg_cd,onboarded,status')
    .eq('tenant_id', id)
    .maybeSingle()

  if (error) return jsonError(error.message, 500)
  if (!data) return jsonError('기관을 찾을 수 없습니다', 404)
  return jsonOk(data)
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const user = await requireCenter(supabase)
  if (!user) return jsonError('센터 권한이 필요합니다', 403)

  const body: {
    onboarded?: boolean
    name?: string
    sgg_cd?: string
    status?: 'pending' | 'approved' | 'rejected'
    reject_reason?: string
    notes?: string
  } = await req.json()

  const { data: before } = await supabase
    .from('tenants')
    .select('tenant_id,name,gov_type,sgg_cd,onboarded,status,reject_reason,notes')
    .eq('tenant_id', id)
    .maybeSingle()

  const update: Record<string, unknown> = {}
  if (body.onboarded !== undefined) update.onboarded = body.onboarded
  if (body.name !== undefined)      update.name      = body.name
  if (body.sgg_cd !== undefined)    update.sgg_cd    = body.sgg_cd
  if (body.reject_reason !== undefined) update.reject_reason = body.reject_reason.trim() || null
  if (body.notes !== undefined)     update.notes     = body.notes.trim() || null
  if (body.status !== undefined) {
    update.status = body.status
    // 승인/반려 상태와 입주 여부 동기화
    if (body.status === 'approved') update.onboarded = true
    if (body.status === 'pending' || body.status === 'rejected') update.onboarded = false
  }

  const { error } = await supabase.from('tenants').update(update).eq('tenant_id', id)
  if (error) return jsonError(error.message, 400)

  if (body.status !== undefined && before && before.status !== body.status) {
    void logTenantStatusChanged(supabase, user, id, before.status ?? '', body.status, req)
  }

  let action: import('@/lib/audit').AuditAction = 'updated_tenant'
  if (body.onboarded !== undefined && before && before.onboarded !== body.onboarded) {
    action = body.onboarded ? 'onboarded_tenant' : 'updated_tenant'
  }

  // 상태 변경 외 수정은 기존 감사 로그로 기록
  if (body.status === undefined) {
    void logAction(
      supabase,
      user,
      action,
      'tenant',
      id,
      before ?? undefined,
      { ...update, tenant_id: id },
      req,
    )
  }

  return jsonOk({ ok: true })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const user = await requireCenter(supabase)
  if (!user)
    return jsonError('센터 권한이 필요합니다', 403)

  const { error } = await supabase.from('tenants').delete().eq('tenant_id', id)
  if (error) return jsonError(error.message, 400)
  void logAction(supabase, user, 'deleted_tenant', 'tenant', id)
  return jsonOk({ ok: true })
}
