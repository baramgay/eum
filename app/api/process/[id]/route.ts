import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })

  const role       = user.user_metadata?.role as string
  const userTenant = user.user_metadata?.tenant_id as string

  const { data: pipeline, error } = await supabase
    .from('processing_pipelines').select('*').eq('id', id).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!pipeline) return NextResponse.json({ error: '파이프라인을 찾을 수 없습니다' }, { status: 404 })

  if (role !== 'center' && pipeline.tenant_id !== userTenant) {
    return NextResponse.json({ error: '접근 권한이 없습니다' }, { status: 403 })
  }

  const { data: runs } = await supabase
    .from('processing_runs')
    .select('*')
    .eq('pipeline_id', id)
    .order('started_at', { ascending: false })
    .limit(5)

  return NextResponse.json({ pipeline, runs: runs ?? [] })
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })

  const role       = user.user_metadata?.role as string
  const userTenant = user.user_metadata?.tenant_id as string

  const { data: existing } = await supabase
    .from('processing_pipelines').select('tenant_id').eq('id', id).maybeSingle()
  if (!existing) return NextResponse.json({ error: '파이프라인을 찾을 수 없습니다' }, { status: 404 })
  if (role !== 'center' && existing.tenant_id !== userTenant) {
    return NextResponse.json({ error: '접근 권한이 없습니다' }, { status: 403 })
  }

  const body: { name?: string; description?: string; rules?: unknown[] } = await req.json()
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.name        !== undefined) patch.name        = body.name
  if (body.description !== undefined) patch.description = body.description
  if (body.rules       !== undefined) patch.rules       = body.rules

  const { data, error } = await supabase
    .from('processing_pipelines').update(patch).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })

  const role       = user.user_metadata?.role as string
  const userTenant = user.user_metadata?.tenant_id as string

  const { data: existing } = await supabase
    .from('processing_pipelines').select('tenant_id').eq('id', id).maybeSingle()
  if (!existing) return NextResponse.json({ error: '파이프라인을 찾을 수 없습니다' }, { status: 404 })
  if (role !== 'center' && existing.tenant_id !== userTenant) {
    return NextResponse.json({ error: '접근 권한이 없습니다' }, { status: 403 })
  }

  const { error } = await supabase.from('processing_pipelines').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
