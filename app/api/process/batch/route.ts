import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })

  const role       = user.user_metadata?.role as string
  const userTenant = user.user_metadata?.tenant_id as string

  let body: { pipeline_ids?: string[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '요청 본문을 JSON으로 파싱할 수 없습니다' }, { status: 400 })
  }

  const ids = body.pipeline_ids
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'pipeline_ids 배열이 필요합니다' }, { status: 400 })
  }
  if (ids.length > 20) {
    return NextResponse.json({ error: '한 번에 최대 20개까지 실행할 수 있습니다' }, { status: 400 })
  }

  // verify ownership for agency role
  if (role === 'agency') {
    const { data: pipelines } = await supabase
      .from('processing_pipelines')
      .select('id, tenant_id')
      .in('id', ids)
    const forbidden = (pipelines ?? []).find(p => p.tenant_id !== userTenant)
    if (forbidden) {
      return NextResponse.json({ error: '자신의 기관 파이프라인만 실행할 수 있습니다' }, { status: 403 })
    }
  }

  const results = await Promise.allSettled(
    ids.map(id =>
      fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'}/api/process/${id}/run`, {
        method: 'POST',
        headers: { cookie: req.headers.get('cookie') ?? '' },
      }).then(async r => {
        const data = await r.json()
        return { id, ok: r.ok, data }
      })
    )
  )

  const response = results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value
    return { id: ids[i], ok: false, data: { error: r.reason instanceof Error ? r.reason.message : String(r.reason) } }
  })

  const failCount = response.filter(r => !r.ok).length
  const status = failCount === ids.length ? 500 : failCount > 0 ? 207 : 200
  return NextResponse.json({ results: response }, { status })
}
