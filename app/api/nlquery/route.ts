import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { answer } from '@/lib/nlquery'
import type { QueryResult } from '@/lib/nlquery'
import { normalizeContext } from '@/lib/nlquery/context'
import type { ConversationTurn } from '@/lib/nlquery/context'
import { unstable_cache } from 'next/cache'
import { chatCompletionGateway } from '@/lib/ai/gateway'
import { checkAndIncrementQuota } from '@/lib/ai/quotas'
import { redactSensitive } from '@/lib/ai/safety'

async function addExplanation(result: QueryResult, userId: string, supabase: Awaited<ReturnType<typeof createClient>>): Promise<QueryResult & { explanation?: string }> {
  const sb = await createServiceClient()
  const quota = await checkAndIncrementQuota(userId, sb)
  if (!quota.allowed) return result

  const rawTableText = [
    result.columns.join(' | '),
    ...result.rows.slice(0, 10).map((r) => result.columns.map((c) => String(r[c] ?? '')).join(' | ')),
  ].join('\n')
  const tableText = redactSensitive(rawTableText)

  const prompt = `다음은 데이터 질의 결과입니다. 주요 인사이트를 한국어로 2~3문장으로 간결하게 요약해 주세요.\n\n${tableText}`

  try {
    const { content } = await chatCompletionGateway({
      messages: [{ role: 'user', content: prompt }],
      userId,
      maxTokens: 256,
    })
    return { ...result, explanation: content }
  } catch {
    return result
  }
}

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
  const explain = searchParams.get('explain') === '1'
  if (!q.trim()) {
    return NextResponse.json({ error: 'q 파라미터가 필요합니다' }, { status: 400 })
  }
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    return NextResponse.json({ error: '인증되지 않았습니다' }, { status: 401 })
  }
  const tenants = await getCachedTenants()
  const result = await answer(supabase, q, [], { tenants })
  if (explain && result.rows?.length > 0) {
    return NextResponse.json(await addExplanation(result, user.id, supabase))
  }
  return NextResponse.json(result)
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    return NextResponse.json({ error: '인증되지 않았습니다' }, { status: 401 })
  }

  let body: { q?: string; context?: (string | ConversationTurn)[]; explain?: boolean } = {}
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
  const result = await answer(supabase, q, context, { tenants })
  if (body.explain && result.rows?.length > 0) {
    return NextResponse.json(await addExplanation(result, user.id, supabase))
  }
  return NextResponse.json(result)
}
