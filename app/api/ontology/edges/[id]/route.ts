import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createPublicClient } from '@/lib/openapi'

type Params = { params: Promise<{ id: string }> }

function requireCenter(role: string) {
  return role !== 'center' && role !== 'admin'
}

// id 형식: "src|rel|dst" (URL 인코딩)
function parseEdgeId(id: string): { src: string; rel: string; dst: string } | null {
  const parts = decodeURIComponent(id).split('|')
  if (parts.length !== 3) return null
  return { src: parts[0], rel: parts[1], dst: parts[2] }
}

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params
  const edge = parseEdgeId(id)
  if (!edge) return NextResponse.json({ error: '잘못된 엣지 ID 형식입니다 (src|rel|dst)' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })
  if (requireCenter(user.user_metadata?.role as string)) {
    return NextResponse.json({ error: '센터 권한이 필요합니다' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({})) as { weight?: number }
  if (body.weight === undefined) return NextResponse.json({ error: 'weight가 필요합니다' }, { status: 400 })

  const sb = createPublicClient()
  const { data, error } = await sb
    .from('onto_links')
    .update({ weight: body.weight })
    .eq('src', edge.src).eq('rel', edge.rel).eq('dst', edge.dst)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params
  const edge = parseEdgeId(id)
  if (!edge) return NextResponse.json({ error: '잘못된 엣지 ID 형식입니다 (src|rel|dst)' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })
  if (requireCenter(user.user_metadata?.role as string)) {
    return NextResponse.json({ error: '센터 권한이 필요합니다' }, { status: 403 })
  }

  const sb = createPublicClient()
  const { error } = await sb
    .from('onto_links')
    .delete()
    .eq('src', edge.src).eq('rel', edge.rel).eq('dst', edge.dst)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
