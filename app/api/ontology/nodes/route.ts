import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createPublicClient } from '@/lib/openapi'

function requireCenter(role: string) {
  return role !== 'center' && role !== 'admin'
}

export async function GET() {
  const sb = createPublicClient()
  const { data, error } = await sb
    .from('onto_objects')
    .select('obj_id, label, obj_type, props, props_jsonb')
    .order('obj_type')
    .order('label')
    .limit(500)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })
  if (requireCenter(user.user_metadata?.role as string)) {
    return NextResponse.json({ error: '센터 권한이 필요합니다' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({})) as {
    obj_id?: string
    label?: string
    obj_type?: string
    props?: string
    props_jsonb?: Record<string, unknown>
  }

  if (!body.label?.trim()) return NextResponse.json({ error: 'label이 필요합니다' }, { status: 400 })
  if (!body.obj_type?.trim()) return NextResponse.json({ error: 'obj_type이 필요합니다' }, { status: 400 })

  const id = body.obj_id?.trim() || `custom_${Date.now()}`
  const sb = createPublicClient()
  const { data, error } = await sb
    .from('onto_objects')
    .upsert({
      obj_id:     id,
      label:      body.label.trim(),
      obj_type:   body.obj_type.trim(),
      props:      body.props ?? '',
      props_jsonb: body.props_jsonb ?? {},
    }, { onConflict: 'obj_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
