import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { retrieveContext } from '@/lib/ai/retriever'
import { buildSystemPrompt } from '@/lib/ai/prompts'
import { chatCompletionGateway } from '@/lib/ai/gateway'
import { sanitizeForLlm, sanitizeOutput } from '@/lib/ai/safety'
import { checkQuota, recordUsage } from '@/lib/ai/quotas'

const GUIDE_SYSTEM_PREFIX =
  '당신은 경남 공공데이터 평가 지원 AI 안내원입니다. ' +
  '공공데이터 제공기관 담당자가 데이터 품질 평가, 제출 절차, AI 준비도 항목에 대해 궁금한 점을 물어볼 때 도움을 드립니다. ' +
  '아래 검색된 컨텍스트를 우선 참고하되, 없으면 일반적인 공공데이터 관리 원칙에 따라 안내하세요. ' +
  '답변은 한국어로 간결하게, 핵심 사항을 번호 목록으로 정리해 주세요.\n'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })

  let body: { message?: string; history?: { role: string; content: string }[] } = {}
  try { body = await req.json() } catch { /* 빈 body 허용 */ }

  const message = (body.message ?? '').trim()
  if (!message) return NextResponse.json({ error: '메시지가 필요합니다' }, { status: 400 })

  const quota = await checkQuota(user.id, supabase)
  if (!quota.allowed) return NextResponse.json({ error: quota.reason }, { status: 429 })

  const { sanitized, injection } = sanitizeForLlm(message)
  if (injection) return NextResponse.json({ error: '잘못된 입력이 감지되었습니다' }, { status: 400 })

  const sb = await createServiceClient()
  const sources = await retrieveContext(sb, sanitized, 4)
  const systemPrompt = GUIDE_SYSTEM_PREFIX + buildSystemPrompt(sources).replace(/^당신은.*?\n/, '')

  const history = (body.history ?? []).slice(-8)
  const messages = [
    { role: 'system' as const, content: systemPrompt },
    ...history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user' as const, content: sanitized },
  ]

  try {
    const result = await chatCompletionGateway({ messages, userId: user.id, maxTokens: 512 })
    const { sanitized: safeContent } = sanitizeOutput(result.content)
    await recordUsage(user.id, supabase, { calls: 1 })
    return NextResponse.json({ content: safeContent, sources, model: result.model })
  } catch {
    return NextResponse.json({ error: 'AI 응답 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.' }, { status: 500 })
  }
}
