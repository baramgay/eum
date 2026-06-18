import { env } from '@/lib/env'
import { createServiceClient } from '@/lib/supabase/server'

export interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  name?: string
  tool_call_id?: string
  tool_calls?: ToolCall[]
}

export interface ChatCompletionOptions {
  model?: string
  messages: ChatMessage[]
  tools?: unknown[]
  tool_choice?: string
  baseUrl?: string
  apiKey?: string
  maxTokens?: number
  temperature?: number
  userId?: string
}

interface LlmLogPayload {
  user_id?: string
  model?: string
  messages: ChatMessage[]
  response?: string
  tool_calls?: ToolCall[]
  duration_ms: number
}

async function logLlmCall(payload: LlmLogPayload) {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) return
    const sb = await createServiceClient()
    await sb.from('llm_calls').insert({
      user_id: payload.user_id ?? null,
      model: payload.model ?? null,
      messages: payload.messages,
      response: payload.response ?? null,
      tool_calls: payload.tool_calls ?? null,
      duration_ms: payload.duration_ms,
    })
  } catch {
    // 로깅 실패는 본 기능에 영향을 주지 않는다.
  }
}

export async function chatCompletion({
  model,
  messages,
  tools,
  tool_choice,
  baseUrl,
  apiKey,
  maxTokens = 1024,
  temperature = 0.3,
  userId,
}: ChatCompletionOptions): Promise<{ content: string; tool_calls?: ToolCall[]; model: string }> {
  const resolvedBaseUrl = baseUrl ?? env.QWEN_BASE_URL
  const resolvedApiKey = apiKey ?? env.QWEN_API_KEY
  const resolvedModel = model ?? env.QWEN_MODEL

  if (!resolvedBaseUrl || !resolvedApiKey) {
    throw new Error('LLM API not configured')
  }

  const body: Record<string, unknown> = {
    model: resolvedModel,
    messages,
    max_tokens: maxTokens,
    temperature,
  }
  if (tools && tools.length > 0) {
    body.tools = tools
    if (tool_choice) body.tool_choice = tool_choice
  }

  const start = Date.now()

  const res = await fetch(`${resolvedBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${resolvedApiKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`LLM API 오류: ${err}`)
  }

  const data = await res.json()
  const message = data.choices?.[0]?.message ?? {}
  const result = {
    content: message.content ?? '',
    tool_calls: message.tool_calls,
    model: data.model ?? resolvedModel,
  }

  void logLlmCall({
    user_id: userId,
    model: result.model,
    messages,
    response: result.content,
    tool_calls: result.tool_calls,
    duration_ms: Date.now() - start,
  })

  return result
}
