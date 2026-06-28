import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })

  let body: { question?: string; sources_used?: unknown; helpful?: boolean } = {}
  try { body = await req.json() } catch { /* 빈 body 허용 */ }

  if (typeof body.helpful !== 'boolean' || !body.question?.trim()) {
    return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 400 })
  }

  const sb = await createServiceClient()
  const { error } = await sb.from('rag_feedback').insert({
    question: body.question.trim(),
    sources_used: body.sources_used ?? null,
    helpful: body.helpful,
    created_by: user.id,
  })

  if (error) return NextResponse.json({ error: '저장 실패' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
