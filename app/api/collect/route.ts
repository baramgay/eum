import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { newCollectId, newJobId, encryptAuthValue } from '@/lib/collector'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })

  const role       = user.user_metadata?.role as string
  const userTenant = user.user_metadata?.tenant_id as string

  let query = supabase
    .from('collection_sources')
    .select('source_id,tenant_id,title,description,url,method,auth_type,auth_key,query_params,resp_format,json_path,theme,keywords,license,created_at,updated_at')
    .order('created_at', { ascending: false })

  if (role !== 'center') {
    query = query.eq('tenant_id', userTenant)
  }

  const { data: sources, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!sources || sources.length === 0) return NextResponse.json([])

  const sourceIds = sources.map((s: { source_id: string }) => s.source_id)
  const { data: jobs } = await supabase
    .from('collection_jobs')
    .select('job_id,source_id,schedule_type,status,last_run_at,next_run_at,enabled')
    .in('source_id', sourceIds)

  const jobMap = new Map((jobs ?? []).map((j: { source_id: string }) => [j.source_id, j]))
  return NextResponse.json(sources.map((s: { source_id: string }) => ({ ...s, job: jobMap.get(s.source_id) ?? null })))
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })

  const role       = user.user_metadata?.role as string
  const userTenant = user.user_metadata?.tenant_id as string

  const body = await req.json() as Record<string, unknown>
  const tenantId = (body.tenant_id as string) || userTenant

  if (!body.title || !body.url) {
    return NextResponse.json({ error: 'title, url은 필수입니다' }, { status: 400 })
  }

  if (role === 'agency' && userTenant !== tenantId) {
    return NextResponse.json({ error: '자신의 기관 데이터만 등록할 수 있습니다' }, { status: 403 })
  }

  const { data: known } = await supabase
    .from('tenants').select('tenant_id').eq('tenant_id', tenantId).maybeSingle()
  if (!known) return NextResponse.json({ error: '알 수 없는 tenant_id' }, { status: 400 })

  const sourceId = newCollectId()
  const jobId    = newJobId()

  const rawAuthValue = (body.auth_value as string) ?? null
  const storedAuthValue = rawAuthValue ? encryptAuthValue(rawAuthValue) : null

  const { error: srcErr } = await supabase.from('collection_sources').insert({
    source_id:    sourceId,
    tenant_id:    tenantId,
    title:        body.title,
    description:  body.description ?? null,
    url:          body.url,
    method:       (body.method as string) ?? 'GET',
    auth_type:    (body.auth_type as string) ?? 'none',
    auth_key:     (body.auth_key as string) ?? null,
    auth_value:   storedAuthValue,
    query_params: (body.query_params as object) ?? {},
    request_body: (body.request_body as object) ?? null,
    resp_format:  (body.resp_format as string) ?? 'json',
    json_path:    (body.json_path as string) ?? null,
    theme:        (body.theme as string) ?? null,
    keywords:     (body.keywords as string) ?? null,
    license:      (body.license as string) ?? '공공누리 1유형',
    pagination_type:       (body.pagination_type as string) ?? 'none',
    pagination_page_param: (body.pagination_page_param as string) ?? 'pageNo',
    pagination_size_param: (body.pagination_size_param as string) ?? 'numOfRows',
    pagination_size:       body.pagination_size ? Number(body.pagination_size) : 1000,
    pagination_total_path: (body.pagination_total_path as string) ?? '$.totalCount',
  })
  if (srcErr) return NextResponse.json({ error: srcErr.message }, { status: 500 })

  const { error: jobErr } = await supabase.from('collection_jobs').insert({
    job_id:        jobId,
    source_id:     sourceId,
    tenant_id:     tenantId,
    schedule_type: (body.schedule_type as string) ?? 'manual',
    status:        'idle',
    enabled:       true,
  })
  if (jobErr) return NextResponse.json({ error: jobErr.message }, { status: 500 })

  return NextResponse.json({ source_id: sourceId, job_id: jobId }, { status: 201 })
}
