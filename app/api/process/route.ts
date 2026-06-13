import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })

  const role       = user.user_metadata?.role as string
  const userTenant = user.user_metadata?.tenant_id as string

  let query = supabase.from('processing_pipelines').select('*').order('created_at', { ascending: false })

  if (role !== 'center') {
    const tenantId = searchParams.get('tenant_id') ?? userTenant
    if (!tenantId) return NextResponse.json({ error: 'tenant_id가 필요합니다' }, { status: 400 })
    query = query.eq('tenant_id', tenantId)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })

  const role       = user.user_metadata?.role as string
  const userTenant = user.user_metadata?.tenant_id as string

  const body: {
    tenant_id?: string
    name?: string
    description?: string
    source_kind?: string
    source_dataset_id?: string
    rules?: unknown[]
  } = await req.json()

  const tenantId = body.tenant_id ?? userTenant
  if (!tenantId) return NextResponse.json({ error: 'tenant_id가 필요합니다' }, { status: 400 })
  if (role === 'agency' && userTenant !== tenantId) {
    return NextResponse.json({ error: '자신의 기관 데이터만 등록할 수 있습니다' }, { status: 403 })
  }
  if (!body.name)              return NextResponse.json({ error: 'name이 필요합니다' }, { status: 400 })
  if (!body.source_kind)       return NextResponse.json({ error: 'source_kind가 필요합니다' }, { status: 400 })
  if (!body.source_dataset_id) return NextResponse.json({ error: 'source_dataset_id가 필요합니다' }, { status: 400 })

  const arr = new Uint8Array(16)
  crypto.getRandomValues(arr)
  const id = Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')

  const now = new Date().toISOString()
  const { data, error } = await supabase.from('processing_pipelines').insert({
    id,
    tenant_id:         tenantId,
    name:              body.name,
    description:       body.description ?? null,
    source_kind:       body.source_kind,
    source_dataset_id: body.source_dataset_id,
    rules:             body.rules ?? [],
    created_at:        now,
    updated_at:        now,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
