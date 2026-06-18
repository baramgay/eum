import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { answer, type QueryResult } from '@/lib/nlquery'
import { retrieveContext, type RetrievedSource } from '@/lib/ai/retriever'
import { buildSystemPrompt } from '@/lib/ai/prompts'
import { scoreAction } from '@/lib/ontology/core'
import { chatCompletion, type ChatMessage, type ToolCall } from '@/lib/ai/provider'
import { buildDynamicTools } from '@/lib/ai/tools'
import { generateSql } from '@/lib/ai/nl-to-sql'
import { SlidingWindowRateLimiter } from '@/lib/rate-limit'
import type { SupabaseClient } from '@supabase/supabase-js'

const limiter = new SlidingWindowRateLimiter(60_000, 10)

const SENSITIVE_PATTERNS = [
  /\b(주민등록번호|주민번호|rrn|resident registration)\b/i,
  /\b(신용카드|카드번호|계좌번호|cvv|cvc)\b/i,
  /\b(비밀번호|password|passwd)\b/i,
  /\b(api[_-]?key|secret[_-]?key|private[_-]?key|access[_-]?token)\b/i,
  /\b(ssn|social security)\b/i,
]

function containsSensitive(text: string): boolean {
  return SENSITIVE_PATTERNS.some((p) => p.test(text))
}

function safeJsonParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

async function executeToolCall(
  supabase: SupabaseClient,
  call: ToolCall,
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
    const generated = await generateSql(supabase, question)
    if (!generated) {
      return { content: JSON.stringify({ error: 'SQL 생성에 실패했습니다' }) }
    }

    const { data, error } = await supabase.rpc('run_select_sql', { p_sql: generated.sql })
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
      const { data, error } = await supabase.rpc('run_select_sql', {
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
): Promise<{ content: string; tool_calls?: ToolCall[]; model?: string }> {
  return chatCompletion({
    messages,
    tools,
    tool_choice: 'auto',
    userId,
  })
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

  let body: { messages?: ChatMessage[] } = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON 본문을 파싱할 수 없습니다' }, { status: 400 })
  }

  const messages = (body.messages ?? []).filter(
    (m): m is ChatMessage =>
      !!m && (m.role === 'user' || m.role === 'assistant' || m.role === 'system'),
  )
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')
  if (!lastUser) {
    return NextResponse.json({ error: '사용자 메시지가 필요합니다' }, { status: 400 })
  }

  // 프롬프트 가드: 민감 키워드 차단
  if (containsSensitive(lastUser.content)) {
    return NextResponse.json(
      { error: '민감한 정보가 포함된 질문은 처리할 수 없습니다.' },
      { status: 400 },
    )
  }

  const supabase = await createServiceClient()
  const [sources, tools] = await Promise.all([
    retrieveContext(supabase, lastUser.content, 6),
    buildDynamicTools(supabase),
  ])
  const systemPrompt = buildSystemPrompt(sources)

  try {
    const first = await callLlm([{ role: 'system', content: systemPrompt }, ...messages], tools, user.id)
    let assistantContent = first.content ?? ''
    let toolResult: QueryResult | undefined

    if (first.tool_calls && Array.isArray(first.tool_calls) && first.tool_calls.length > 0) {
      const toolMessages: ChatMessage[] = []
      for (const call of first.tool_calls as ToolCall[]) {
        const { content, result } = await executeToolCall(supabase, call)
        if (result && (call.function.name === 'query_dataset' || call.function.name.startsWith('query_dataset_'))) {
          toolResult = result
        }
        toolMessages.push({
          role: 'tool',
          content,
          tool_call_id: call.id,
        })
      }

      const second = await callLlm(
        [
          { role: 'system', content: systemPrompt },
          ...messages,
          { role: 'assistant', content: assistantContent, tool_calls: first.tool_calls },
          ...toolMessages,
        ],
        tools,
        user.id,
      )
      assistantContent = second.content ?? assistantContent
    }

    return NextResponse.json({
      content: assistantContent,
      result: toolResult,
      sources,
      model: first.model,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
