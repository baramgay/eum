export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })

  const role     = user.user_metadata?.role as string
  const tenantId = user.user_metadata?.tenant_id as string

  // 권한 확인: 해당 키가 본인 tenant 것인지 확인
  const { data: existing } = await supabase
    .from('api_keys')
    .select('tenant_id')
    .eq('key_id', id)
    .maybeSingle()

  if (!existing) return NextResponse.json({ error: '키를 찾을 수 없습니다' }, { status: 404 })
  if (role !== 'center' && existing.tenant_id !== tenantId) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  }

  const body: {
    is_active?: boolean
    name?: string
    scope?: { type: string; ids?: string[] }
    expires_at?: string | null
  } = await req.json()

  const updates: Record<string, unknown> = {}
  if (body.is_active !== undefined) updates.is_active = body.is_active
  if (body.name !== undefined)      updates.name = body.name
  if (body.scope !== undefined)     updates.scope = body.scope
  if ('expires_at' in body)         updates.expires_at = body.expires_at

  if (!Object.keys(updates).length) {
    return NextResponse.json({ error: '수정할 필드가 없습니다' }, { status: 400 })
  }

  const sb = await createServiceClient()
  const { error } = await sb.from('api_keys').update(updates).eq('key_id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true })
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })

  const role     = user.user_metadata?.role as string
  const tenantId = user.user_metadata?.tenant_id as string

  const { data: existing } = await supabase
    .from('api_keys')
    .select('tenant_id')
    .eq('key_id', id)
    .maybeSingle()

  if (!existing) return NextResponse.json({ error: '키를 찾을 수 없습니다' }, { status: 404 })
  if (role !== 'center' && existing.tenant_id !== tenantId) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  }

  const sb = await createServiceClient()
  const { error } = await sb.from('api_keys').delete().eq('key_id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true })
}
