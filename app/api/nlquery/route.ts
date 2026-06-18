import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { answer } from '@/lib/nlquery'
import { normalizeContext } from '@/lib/nlquery/context'
import type { ConversationTurn } from '@/lib/nlquery/context'
import { unstable_cache } from 'next/cache'

// tenants는 사용자별 데이터가 아니므로 Service Role 클라이언트를 사용해
// unstable_cache 콜백 내에서 Dynamic data source(cookies)에 접근하지 않는다.
const getCachedTenants = unstable_cache(
  async () => {
    const supabase = await createServiceClient()
    const { data } = await supabase.from('tenants').select('name,sgg_cd')
    return (data ?? []) as { name: string; sgg_cd: string }[]
  },
  ['nlquery-tenants'],
  { tags: ['nlquery-tenants'] },
)

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') ?? ''
  if (!q.trim()) {
    return NextResponse.json({ error: 'q 파라미터가 필요합니다' }, { status: 400 })
  }
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    return NextResponse.json({ error: '인증되지 않았습니다' }, { status: 401 })
  }
  const tenants = await getCachedTenants()
  return NextResponse.json(await answer(supabase, q, [], { tenants }))
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    return NextResponse.json({ error: '인증되지 않았습니다' }, { status: 401 })
  }

  let body: { q?: string; context?: (string | ConversationTurn)[] } = {}
  try {
    body = await req.json()
  } catch {
    // 본문 파싱 실패 시 빈 객체로 진행, q 검증에서 걸림
  }

  const q = (body.q ?? '').trim()
  if (!q) {
    return NextResponse.json({ error: 'q 파라미터가 필요합니다' }, { status: 400 })
  }

  const context = normalizeContext(body.context)
  const tenants = await getCachedTenants()
  return NextResponse.json(await answer(supabase, q, context, { tenants }))
}
