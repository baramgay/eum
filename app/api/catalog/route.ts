import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { randomHex } from '@/lib/utils'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })

  const body = await req.json() as {
    title?: string
    description?: string
    source?: string
    pipeline_id?: string
    dataset_id?: string
    table_name?: string
    row_count?: number
  }

  if (!body.title) {
    return NextResponse.json({ error: 'title이 필요합니다' }, { status: 400 })
  }

  const tenantId = user.user_metadata?.tenant_id as string
  const datasetId = body.dataset_id ?? ('cat_' + randomHex(4))
  const service = await createServiceClient()

  const { error } = await service.from('catalog').upsert({
    dataset_id:   datasetId,
    tenant_id:    tenantId,
    title:        body.title,
    description:  body.description ?? null,
    table_name:   body.table_name ?? null,
    rows:         body.row_count ?? 0,
    is_open:      false,
    ai_ready:     false,
    high_value:   false,
    updated_at:   new Date().toISOString(),
    derived_from: body.source ? { source: body.source, pipeline_id: body.pipeline_id ?? null } : null,
  }, { onConflict: 'dataset_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ dataset_id: datasetId })
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const q        = req.nextUrl.searchParams.get('q') ?? ''
  const theme    = req.nextUrl.searchParams.get('theme') ?? ''
  const isOpen   = req.nextUrl.searchParams.get('open')
  const aiReady  = req.nextUrl.searchParams.get('ai_ready')
  const tenantId = req.nextUrl.searchParams.get('tenant_id') ?? ''
  const page     = parseInt(req.nextUrl.searchParams.get('page') ?? '1', 10)
  const pageSize = 20

  let query = supabase
    .from('catalog')
    .select('*', { count: 'exact' })
    .order('updated_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1)

  if (q.trim()) {
    query = query.textSearch('search_vector', q.trim(), {
      type: 'websearch',
      config: 'simple',
    }) as typeof query
  }
  if (theme)              query = query.eq('theme', theme) as typeof query
  if (isOpen === 'true')  query = query.eq('is_open', true) as typeof query
  if (aiReady === 'true') query = query.eq('ai_ready', true) as typeof query
  if (tenantId)           query = query.eq('tenant_id', tenantId) as typeof query

  const { data, count, error } = await query

  if (error) {
    // search_vector 컬럼이 아직 없는 경우 ilike 폴백
    const term = `%${q}%`
    const { data: fallback } = await supabase
      .from('catalog')
      .select('*')
      .or(`title.ilike.${term},description.ilike.${term}`)
      .order('updated_at', { ascending: false })
      .limit(pageSize)
    return NextResponse.json({
      items: fallback ?? [],
      total: fallback?.length ?? 0,
      page,
      pageSize,
    })
  }

  // 테마 목록 (클라이언트 필터 탭용)
  const { data: themeRows } = await supabase
    .from('catalog')
    .select('theme')
    .not('theme', 'is', null)
  const uniqueThemes = Array.from(
    new Set(
      (themeRows ?? [])
        .map((t: { theme: string | null }) => t.theme)
        .filter((v): v is string => Boolean(v))
    )
  )

  return NextResponse.json({
    items: data ?? [],
    total: count ?? 0,
    page,
    pageSize,
    themes: uniqueThemes,
  })
}
