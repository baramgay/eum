import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchSource } from '@/lib/collector'
import type { CollectionSource, PaginationType } from '@/lib/collector'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })

  const body = await req.json()

  // 임시 source 객체 구성 (DB 저장 없이 즉시 실행)
  const src: CollectionSource = {
    source_id:    'test_preview',
    tenant_id:    user.user_metadata?.tenant_id ?? '',
    title:        body.title ?? '미리보기 테스트',
    description:  null,
    url:          body.url ?? '',
    method:       body.method ?? 'GET',
    auth_type:    body.auth_type ?? 'none',
    auth_key:     body.auth_key ?? null,
    auth_value:   body.auth_value ?? null,
    query_params: body.query_params ?? {},
    request_body: body.request_body ?? null,
    resp_format:  body.resp_format ?? 'json',
    json_path:    body.json_path ?? null,
    theme:        null,
    keywords:     null,
    license:      null,
    pagination_type:       (body.pagination_type as PaginationType) ?? 'none',
    pagination_page_param: body.pagination_page_param ?? 'pageNo',
    pagination_size_param: body.pagination_size_param ?? 'numOfRows',
    pagination_size:       body.pagination_size ? Number(body.pagination_size) : 10,
    pagination_total_path: body.pagination_total_path ?? '$.totalCount',
    created_at:   new Date().toISOString(),
    updated_at:   new Date().toISOString(),
  }

  if (!src.url) return NextResponse.json({ error: 'URL이 필요합니다' }, { status: 400 })

  try {
    const { rows, rawCount, pagesFetched } = await fetchSource(src)
    return NextResponse.json({
      ok:           true,
      rows_fetched: rawCount,
      pages_fetched: pagesFetched ?? 1,
      preview:      rows.slice(0, 10),
      columns:      rows.length > 0 ? Object.keys(rows[0]) : [],
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: msg }, { status: 400 })
  }
}
