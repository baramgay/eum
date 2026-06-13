import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logAction } from '@/lib/audit'

async function requireCenter(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.user_metadata?.role !== 'center') return null
  return user
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  if (!await requireCenter(supabase))
    return NextResponse.json({ error: '센터 권한이 필요합니다' }, { status: 403 })

  const body: { onboarded?: boolean; name?: string; sgg_cd?: string } = await req.json()
  const update: Record<string, unknown> = {}
  if (body.onboarded !== undefined) update.onboarded = body.onboarded
  if (body.name !== undefined)      update.name      = body.name
  if (body.sgg_cd !== undefined)    update.sgg_cd    = body.sgg_cd

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
