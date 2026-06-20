import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createPublicClient } from '@/lib/openapi'

type Params = { params: Promise<{ id: string }> }

function requireCenter(role: string) {
  return role !== 'center' && role !== 'admin'
}

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })
  if (requireCenter(user.user_metadata?.role as string)) {
    return NextResponse.json({ error: '센터 권한이 필요합니다' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({})) as {
    label?: string
    obj_type?: string
    props?: string
    props_jsonb?: Record<string, unknown>
  }

  const patch: Record<string, unknown> = {}
  if (body.label !== undefined)      patch.label      = body.label
  if (body.obj_type !== undefined)   patch.obj_type   = body.obj_type
  if (body.props !== undefined)      patch.props      = body.props
  if (body.props_jsonb !== undefined) patch.props_jsonb = body.props_jsonb

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: '변경할 필드가 없습니다' }, { status: 400 })
  }

  const sb = createPublicClient()
  const { data, error } = await sb
    .from('onto_objects')
    .update(patch)
    .eq('obj_id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })
  if (requireCenter(user.user_metadata?.role as string)) {
    return NextResponse.json({ error: '센터 권한이 필요합니다' }, { status: 403 })
  }

  const sb = createPublicClient()
  const { error } = await sb.from('onto_objects').delete().eq('obj_id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
