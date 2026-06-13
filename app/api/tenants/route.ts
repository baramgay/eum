import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logAction } from '@/lib/audit'

export async function GET() {
  const supabase = await createClient()
  const { data } = await supabase.from('tenants').select('*')
    .order('gov_type', { ascending: false }).order('name')
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.user_metadata?.role !== 'center')
    return NextResponse.json({ error: '센터 권한이 필요합니다' }, { status: 403 })

  const body: { tenant_id?: string; name?: string; gov_type?: string; sgg_cd?: string } = await req.json()
  if (!body.tenant_id?.trim() || !body.name?.trim())
    return NextResponse.json({ error: 'tenant_id와 name은 필수입니다' }, { status: 400 })

  const { error } = await supabase.from('tenants').insert({
    tenant_id: body.tenant_id.trim(),
    name:      body.name.trim(),
    gov_type:  body.gov_type ?? null,
    sgg_cd:    body.sgg_cd ?? null,
    onboarded: false,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  void logAction(supabase, user, 'created_tenant', 'tenant', body.tenant_id!.trim(), undefined, { name: body.name, gov_type: body.gov_type }, req)
  return NextResponse.json({ ok: true })
}
