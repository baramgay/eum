import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { encryptAuthValue, calcNextRunAt, type ScheduleType } from '@/lib/collector'

type Params = { params: Promise<{ id: string }> }

const SOURCE_SELECT = 'source_id,tenant_id,title,description,url,method,auth_type,auth_key,query_params,request_body,resp_format,json_path,theme,keywords,license,pagination_type,pagination_page_param,pagination_size_param,pagination_size,pagination_total_path,connector_config,created_at,updated_at'

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })

  const role       = user.user_metadata?.role as string
  const userTenant = user.user_metadata?.tenant_id as string

  const { data: src, error } = await supabase
    .from('collection_sources')
    .select(SOURCE_SELECT)
    .eq('source_id', id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!src)  return NextResponse.json({ error: '소스를 찾을 수 없습니다' }, { status: 404 })

  if (role === 'agency' && src.tenant_id !== userTenant) {
    return NextResponse.json({ error: '접근 권한이 없습니다' }, { status: 403 })
  }

  const { data: logs } = await supabase
    .from('collection_logs')
    .select('log_id,started_at,finished_at,duration_ms,status,rows_fetched,rows_new,rows_changed,rows_deleted,error_msg')
    .eq('source_id', id)
    .order('started_at', { ascending: false })
    .limit(5)

  return NextResponse.json({ source: src, logs: logs ?? [] })
}

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })

  const role       = user.user_metadata?.role as string
  const userTenant = user.user_metadata?.tenant_id as string

  const { data: existing } = await supabase
    .from('collection_sources').select('tenant_id').eq('source_id', id).maybeSingle()
  if (!existing) return NextResponse.json({ error: '소스를 찾을 수 없습니다' }, { status: 404 })

  if (role === 'agency' && existing.tenant_id !== userTenant) {
    return NextResponse.json({ error: '접근 권한이 없습니다' }, { status: 403 })
  }

  const body = await req.json() as Record<string, unknown>

  const allowed = [
    'title','description','url','method','auth_type','auth_key','auth_value',
    'query_params','request_body','resp_format','json_path','theme','keywords','license',
    'pagination_type','pagination_page_param','pagination_size_param','pagination_size','pagination_total_path',
    'connector_config',
  ]
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (!(key in body)) continue
    let value = body[key]
    if (key === 'auth_value') {
      value = typeof value === 'string' && value.length > 0 ? encryptAuthValue(value) : null
    }
    if (key === 'auth_key') {
      value = typeof value === 'string' && value.length > 0 ? value : null
    }
    if (key === 'pagination_size') {
      value = value ? Number(value) : 1000
    }
    if (key === 'request_body') {
      value = value && typeof value === 'object' ? value : null
    }
    updates[key] = value
  }

  const { error } = await supabase
    .from('collection_sources').update(updates).eq('source_id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 스케줄 변경 시 job도 업데이트
  if (body.schedule_type) {
    const scheduleType = body.schedule_type as ScheduleType
    await supabase.from('collection_jobs')
      .update({
        schedule_type: scheduleType,
        next_run_at:   calcNextRunAt(scheduleType),
      })
      .eq('source_id', id)
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })

  const role       = user.user_metadata?.role as string
  const userTenant = user.user_metadata?.tenant_id as string

  const { data: existing } = await supabase
    .from('collection_sources').select('tenant_id').eq('source_id', id).maybeSingle()
  if (!existing) return NextResponse.json({ error: '소스를 찾을 수 없습니다' }, { status: 404 })

  if (role === 'agency' && existing.tenant_id !== userTenant) {
    return NextResponse.json({ error: '접근 권한이 없습니다' }, { status: 403 })
  }

  const { error } = await supabase.from('collection_sources').delete().eq('source_id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
