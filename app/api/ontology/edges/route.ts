import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createPublicClient } from '@/lib/openapi'

function requireCenter(role: string) {
  return role !== 'center' && role !== 'admin'
}

export async function GET() {
  const sb = createPublicClient()
  const { data, error } = await sb
    .from('onto_links')
    .select('src, rel, dst, weight')
    .order('src')
    .limit(1000)

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
    src?: string; rel?: string; dst?: string; weight?: number
  }

  if (!body.src?.trim()) return NextResponse.json({ error: 'src가 필요합니다' }, { status: 400 })
  if (!body.rel?.trim()) return NextResponse.json({ error: 'rel이 필요합니다' }, { status: 400 })
  if (!body.dst?.trim()) return NextResponse.json({ error: 'dst가 필요합니다' }, { status: 400 })

  const sb = createPublicClient()
  const { data, error } = await sb
    .from('onto_links')
    .upsert({
      src:    body.src.trim(),
      rel:    body.rel.trim(),
      dst:    body.dst.trim(),
      weight: body.weight ?? 1,
    }, { onConflict: 'src,rel,dst' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
