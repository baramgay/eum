import { randomUUID } from 'crypto'
import { createServiceClient } from '@/lib/supabase/server'
import { redactSensitive } from './safety'

export interface LlmEvent {
  traceId?: string
  userId?: string
  model?: string
  durationMs: number
  error?: string
  tokens?: number
}

export interface LlmCallPayload {
  user_id?: string
  model?: string
  messages: unknown[]
  response?: string
  tool_calls?: unknown[]
  duration_ms: number
  error?: string | null
}

export function generateTraceId(): string {
  return randomUUID()
}

/**
 * 구조화된 콘솔 로그로 LLM 이벤트를 남긴다.
 * Pino가 설치되어 있으면 Pino를, 아니면 console.log를 사용한다.
 */
export function logLlmEvent(event: LlmEvent): void {
  try {
    const payload = {
      ...event,
      timestamp: new Date().toISOString(),
      level: event.error ? 'error' : 'info',
      service: 'llm-gateway',
    }

    console.log(JSON.stringify(payload))
  } catch {
    // 로깅 실패는 본 기능에 영향을 주지 않는다.
  }
}

/**
 * Supabase llm_calls 테이블에 호출 기록을 남긴다.
 * 기존 관측 기능을 유지하기 위한 레거시 로깅이다.
 */
function redactMessages(messages: unknown[]): unknown[] {
  return messages.map((m) => {
    if (m && typeof m === 'object' && 'content' in m && typeof m.content === 'string') {
      return { ...m, content: redactSensitive(m.content) }
    }
    return m
  })
}

export async function logLlmCall(payload: LlmCallPayload): Promise<void> {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) return
    const sb = await createServiceClient()
    await sb.from('llm_calls').insert({
      user_id: payload.user_id ?? null,
      model: payload.model ?? null,
      messages: redactMessages(payload.messages),
      response: payload.response ? redactSensitive(payload.response) : null,
      tool_calls: payload.tool_calls ?? null,
      duration_ms: payload.duration_ms,
    })
  } catch {
    // 로깅 실패는 본 기능에 영향을 주지 않는다.
  }
}
