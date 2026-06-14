import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logAction } from '@/lib/audit'

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
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })

  const { data, error } = await supabase
    .from('tenants')
    .select('tenant_id,name,gov_type,sgg_cd,onboarded,status')
    .eq('tenant_id', id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: '기관을 찾을 수 없습니다' }, { status: 404 })
  return NextResponse.json(data)
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  if (!await requireCenter(supabase))
    return NextResponse.json({ error: '센터 권한이 필요합니다' }, { status: 403 })

  const body: { onboarded?: boolean; name?: string; sgg_cd?: string; status?: 'pending' | 'approved' | 'rejected' } = await req.json()
  const update: Record<string, unknown> = {}
  if (body.onboarded !== undefined) update.onboarded = body.onboarded
  if (body.name !== undefined)      update.name      = body.name
  if (body.sgg_cd !== undefined)    update.sgg_cd    = body.sgg_cd
  if (body.status !== undefined) {
    update.status = body.status
    // 승인/반려 상태와 입주 여부 동기화
    if (body.status === 'approved') update.onboarded = true
    if (body.status === 'pending' || body.status === 'rejected') update.onboarded = false
  }

  const { error } = await supabase.from('tenants').update(update).eq('tenant_id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const user = await requireCenter(supabase)
  if (!user)
    return NextResponse.json({ error: '센터 권한이 필요합니다' }, { status: 403 })

  const { error } = await supabase.from('tenants').delete().eq('tenant_id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  void logAction(supabase, user, 'deleted_tenant', 'tenant', id)
  return NextResponse.json({ ok: true })
}
