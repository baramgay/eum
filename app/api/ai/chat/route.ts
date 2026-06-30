import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { answer, type QueryResult } from '@/lib/nlquery'
import { retrieveContext, type RetrievedSource } from '@/lib/ai/retriever'
import { enrichSources } from '@/lib/ai/context-builder'
import { buildSystemPrompt } from '@/lib/ai/prompts'
import { scoreAction } from '@/lib/ontology/core'
import { chatCompletionGateway, type ChatMessage, type ToolCall } from '@/lib/ai/gateway'
import { generateTraceId } from '@/lib/ai/tracing'
import { checkAndIncrementQuota } from '@/lib/ai/quotas'
import { sanitizeForLlm, sanitizeOutput } from '@/lib/ai/safety'
import { buildDynamicTools } from '@/lib/ai/tools'
import { generateSql } from '@/lib/ai/nl-to-sql'
import { SlidingWindowRateLimiter } from '@/lib/rate-limit'
import type { SupabaseClient } from '@supabase/supabase-js'

const limiter = new SlidingWindowRateLimiter(60_000, 10)

function safeJsonParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

function buildTitle(text: string): string {
  const trimmed = text.trim()
  return trimmed.length > 22 ? trimmed.slice(0, 22) + '…' : trimmed
}

async function executeToolCall(
  supabase: SupabaseClient,
  call: ToolCall,
  userId: string,
): Promise<{ content: string; result?: QueryResult }> {
  const args = safeJsonParse<Record<string, unknown>>(call.function.arguments) ?? {}
  const name = call.function.name

  if (name === 'query_dataset') {
    const intent = String(args.intent ?? '')
    const sigun = args.sigun ? String(args.sigun) : undefined
    const question = sigun ? `${sigun} ${intent}` : intent
    const result = await answer(supabase, question, [], {})
    return { content: JSON.stringify(result), result }
  }

  if (name === 'list_datasets') {
    let q = supabase
      .from('catalog')
      .select('dataset_id,title,theme,keywords,description,rows')
      .eq('ai_ready', true)
    if (args.theme) q = q.ilike('theme', `%${args.theme}%`)
    q = q.limit(typeof args.limit === 'number' ? args.limit : 20)
    const { data } = await q
    const rows = (data ?? []).map((r) => ({
      dataset_id: r.dataset_id,
      title: r.title,
      theme: r.theme,
      keywords: r.keywords,
      설명: r.description,
      행수: r.rows,
    }))
    const result: QueryResult = {
      intent: '데이터셋목록',
      columns: ['dataset_id', 'title', 'theme', 'keywords', '설명', '행수'],
      rows,
      source: 'EUM 데이터 카탈로그',
    }
    return { content: JSON.stringify(rows), result }
  }

  if (name === 'run_ontology_action') {
    const actionKey = String(args.action_key ?? '')
    const top = 10
    const scored = await scoreAction(supabase, actionKey, top)
    const rows = scored.map((r) => ({
      rank: r.rank,
      sigun: r.sigun,
      청년인구: r.youth_pop,
      순이동: r.net_migration,
      종사자: r.employees,
      청년센터: r.youth_centers,
      우선점수: r.priority_score,
    }))
    const result: QueryResult = {
      intent: '정책액션스코어',
      columns: ['rank', 'sigun', '청년인구', '순이동', '종사자', '청년센터', '우선점수'],
      rows,
      source: `온톨로지 액션: ${actionKey}`,
    }
    return { content: JSON.stringify(scored), result }
  }

  if (name === 'run_sql') {
    const question = String(args.question ?? '')

    // run_sql은 납부 generateSql 납부를 통해 추가 LLM 호출을 발생시키므로 할당량을 선차감한다
    const toolQuota = await checkAndIncrementQuota(userId, supabase)
    if (!toolQuota.allowed) {
      return { content: JSON.stringify({ error: toolQuota.reason ?? '할당량이 초과되었습니다' }) }
    }

    const generated = await generateSql(supabase, question)
    if (!generated) {
      return { content: JSON.stringify({ error: 'SQL 생성에 실패했습니다' }) }
    }

    const { data, error } = await supabase.rpc('run_select_sql_safe', { p_sql: generated.sql })
    const sqlRows = Array.isArray(data) ? data : []
    const columns = sqlRows.length > 0 ? Object.keys(sqlRows[0]) : []

    const result: QueryResult = {
      intent: 'SQL조회',
      columns,
      rows: sqlRows,
      source: generated.sql,
    }

    return {
      content: JSON.stringify({
        sql: generated.sql,
        explanation: generated.explanation,
        rows: sqlRows,
        error: error?.message ?? null,
      }),
      result: error ? undefined : result,
    }
  }

  // 동적 도구: query_dataset_<dataset_id>
  const dynamicMatch = name.match(/^query_dataset_(.+)$/)
  if (dynamicMatch) {
    const datasetId = dynamicMatch[1]
    const limit = typeof args.limit === 'number' ? Math.min(args.limit, 100) : 20

    const { data: catalogRow } = await supabase
      .from('catalog')
      .select('dataset_id,title,table_name')
      .eq('dataset_id', datasetId)
      .maybeSingle()

    if (catalogRow?.table_name && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(catalogRow.table_name)) {
      const safeTable = catalogRow.table_name
      const { data, error } = await supabase.rpc('run_select_sql_safe', {
        p_sql: `SELECT * FROM "${safeTable}" LIMIT ${limit}`,
      })
      const rows = Array.isArray(data) ? data : []
      const result: QueryResult = {
        intent: `데이터셋조회:${datasetId}`,
        columns: rows.length > 0 ? Object.keys(rows[0]) : [],
        rows,
        source: catalogRow.title ?? datasetId,
      }
      return {
        content: JSON.stringify({ rows, error: error?.message ?? null }),
        result: error ? undefined : result,
      }
    }

    const result: QueryResult = {
      intent: `데이터셋조회:${datasetId}`,
      columns: ['dataset_id', 'title'],
      rows: catalogRow ? [{ dataset_id: catalogRow.dataset_id, title: catalogRow.title }] : [],
      source: catalogRow?.title ?? datasetId,
    }
    return { content: JSON.stringify(result.rows), result }
  }

  return { content: JSON.stringify({ error: 'Unknown tool' }) }
}

async function callLlm(
  messages: ChatMessage[],
  tools: unknown[],
  userId: string,
  traceId: string,
): Promise<{ content: string; tool_calls?: ToolCall[]; model?: string }> {
  return chatCompletionGateway({
    messages,
    tools,
    tool_choice: 'auto',
    userId,
    traceId,
  })
}

interface ChatBody {
  messages?: ChatMessage[]
  conversation_id?: string
}

async function loadConversationMessages(
  supabase: SupabaseClient,
  conversationId: string,
  userId: string,
): Promise<ChatMessage[]> {
  const { data: conv } = await supabase
    .from('conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('user_id', userId)
    .single()

  if (!conv) return []

  const { data: rows } = await supabase
    .from('conversation_messages')
    .select('role,content,tool_calls')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })

  return (rows ?? []).map((r) => ({
    role: r.role as ChatMessage['role'],
    content: r.content ?? '',
    tool_calls: r.tool_calls,
  }))
}

async function upsertConversation(
  supabase: SupabaseClient,
  userId: string,
  conversationId: string | undefined,
  messages: ChatMessage[],
): Promise<string | undefined> {
  const firstUser = messages.find((m) => m.role === 'user')
  const title = firstUser ? buildTitle(firstUser.content) : '새 대화'

  if (conversationId) {
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('user_id', userId)
      .single()

    if (existing) {
      await supabase
        .from('conversations')
        .update({ title, updated_at: new Date().toISOString() })
        .eq('id', conversationId)
      return conversationId
    }
  }

  const { data: created } = await supabase
    .from('conversations')
    .insert({ user_id: userId, title })
    .select('id')
    .single()

  return created?.id ?? undefined
}

async function saveMessages(
  supabase: SupabaseClient,
  conversationId: string,
  messages: ChatMessage[],
): Promise<void> {
  if (messages.length === 0) return
  await supabase.from('conversation_messages').insert(
    messages.map((m) => ({
      conversation_id: conversationId,
      role: m.role,
      content: m.content,
      tool_calls: m.tool_calls ?? null,
    })),
  )
}

export async function POST(req: NextRequest) {
  const authClient = await createClient()
  const { data: { user }, error: userError } = await authClient.auth.getUser()
  if (userError || !user) {
    return NextResponse.json({ error: '인증되지 않았습니다' }, { status: 401 })
  }

  // 분당 10회 속도 제한
  const rate = limiter.isAllowed(user.id)
  if (!rate.allowed) {
    return NextResponse.json(
      { error: '너무 많은 요청입니다. 잠시 후 다시 시도해 주세요.' },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': '10',
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(rate.resetAt),
        },
      },
    )
  }

  let body: ChatBody = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON 본문을 파싱할 수 없습니다' }, { status: 400 })
  }

  const clientMessages = (body.messages ?? []).filter(
    (m): m is ChatMessage =>
      !!m && (m.role === 'user' || m.role === 'assistant' || m.role === 'system' || m.role === 'tool'),
  )
  const lastUser = [...clientMessages].reverse().find((m) => m.role === 'user')
  if (!lastUser) {
    return NextResponse.json({ error: '사용자 메시지가 필요합니다' }, { status: 400 })
  }

  // 안전 레이어: 민감정보 마스킹 + 프롬프트 인젝션 탐지
  const { sanitized: sanitizedUserContent, injection } = sanitizeForLlm(lastUser.content)
  if (injection) {
    return NextResponse.json(
      { error: '부적절한 프롬프트가 감지되어 처리할 수 없습니다.' },
      { status: 400 },
    )
  }

  const supabase = await createServiceClient()

  // 원자적 할당량 체크 + 첫 번째 LLM 호출 카운터 증가 (TOCTOU 방지)
  const quota = await checkAndIncrementQuota(user.id, supabase)
  if (!quota.allowed) {
    return NextResponse.json({ error: quota.reason }, { status: 429 })
  }

  const traceId = generateTraceId()

  // 서버 측 대화 기록 로드 및 병합
  let conversationId: string | null | undefined = body.conversation_id
  const serverMessages = conversationId
    ? await loadConversationMessages(supabase, conversationId, user.id)
    : []

  const conversationMessages = serverMessages.length > 0
    ? [...serverMessages, { ...lastUser, content: sanitizedUserContent }]
    : clientMessages.map((m) =>
        m.role === 'user' && m === lastUser ? { ...m, content: sanitizedUserContent } : m,
      )

  conversationId = await upsertConversation(supabase, user.id, conversationId, conversationMessages)

  const [sources, tools] = await Promise.all([
    retrieveContext(supabase, sanitizedUserContent, 6),
    buildDynamicTools(supabase),
  ])
  const enrichedSources = await enrichSources(supabase, sources)
  const systemPrompt = buildSystemPrompt(enrichedSources)

  try {
    // checkAndIncrementQuota가 이미 첫 번째 호출을 카운트했으므로 recordUsage 불필요
    const first = await callLlm(
      [{ role: 'system', content: systemPrompt }, ...conversationMessages],
      tools,
      user.id,
      traceId,
    )
    let assistantContent = first.content ?? ''
    let toolResult: QueryResult | undefined

    if (first.tool_calls && Array.isArray(first.tool_calls) && first.tool_calls.length > 0) {
      const toolMessages: ChatMessage[] = []
      for (const call of first.tool_calls as ToolCall[]) {
        const { content, result } = await executeToolCall(supabase, call, user.id)
        if (result && (call.function.name === 'query_dataset' || call.function.name.startsWith('query_dataset_'))) {
          toolResult = result
        }
        toolMessages.push({
          role: 'tool',
          content,
          tool_call_id: call.id,
        })
      }

      // 두 번째 LLM 호출 전 할당량 재확인 + 카운터 증가
      const quota2 = await checkAndIncrementQuota(user.id, supabase)
      if (quota2.allowed) {
        const second = await callLlm(
          [
            { role: 'system', content: systemPrompt },
            ...conversationMessages,
            { role: 'assistant', content: assistantContent, tool_calls: first.tool_calls },
            ...toolMessages,
          ],
          tools,
          user.id,
          traceId,
        )
        assistantContent = second.content ?? assistantContent
      }
    }

    const { sanitized: sanitizedOutput, toxic } = sanitizeOutput(assistantContent)
    if (toxic) {
      return NextResponse.json(
        { error: '부적절한 응답이 생성되어 반환할 수 없습니다.' },
        { status: 500 },
      )
    }

    // 대화 메시지 저장
    if (conversationId) {
      await saveMessages(supabase, conversationId, [
        { role: 'user', content: sanitizedUserContent },
        { role: 'assistant', content: sanitizedOutput, tool_calls: first.tool_calls },
      ])
      await supabase
        .from('conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', conversationId)
    }

    return NextResponse.json({
      content: sanitizedOutput,
      result: toolResult,
      sources: enrichedSources,
      model: first.model,
      conversation_id: conversationId,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
