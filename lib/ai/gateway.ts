import { env } from '@/lib/env'
import { generateTraceId, logLlmCall, logLlmEvent } from './tracing'

export type LlmProviderName = 'qwen' | 'local'

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

export type ResponseFormat = 'json' | { schema: object }

export interface GatewayCompletionOptions {
  model?: string
  messages: ChatMessage[]
  tools?: unknown[]
  tool_choice?: string
  baseUrl?: string
  apiKey?: string
  maxTokens?: number
  temperature?: number
  userId?: string
  preferred?: LlmProviderName
  responseFormat?: ResponseFormat
  traceId?: string
}

export interface GatewayCompletionResult {
  content: string
  tool_calls?: ToolCall[]
  model: string
}

interface ProviderConfig {
  name: LlmProviderName
  apiKey?: string
  baseUrl: string
  model: string
  isConfigured: boolean
}

function getProviderConfig(
  name: LlmProviderName,
  overrides: { baseUrl?: string; apiKey?: string; model?: string } = {},
): ProviderConfig | null {
  switch (name) {
    case 'qwen':
      return {
        name,
        apiKey: overrides.apiKey ?? env.QWEN_API_KEY,
        baseUrl: overrides.baseUrl ?? env.QWEN_BASE_URL ?? '',
        model: overrides.model ?? env.QWEN_MODEL,
        isConfigured: !!(env.QWEN_API_KEY && env.QWEN_BASE_URL),
      }
    case 'local':
      return {
        name,
        apiKey: overrides.apiKey,
        baseUrl: overrides.baseUrl ?? env.LOCAL_LLM_BASE_URL ?? '',
        model: overrides.model ?? env.LOCAL_LLM_MODEL ?? 'local-model',
        isConfigured: !!env.LOCAL_LLM_BASE_URL,
      }
    default:
      return null
  }
}

function injectJsonInstruction(
  messages: ChatMessage[],
  responseFormat?: ResponseFormat,
): ChatMessage[] {
  if (!responseFormat) return messages
  let instruction = 'You must respond with valid JSON only.'
  if (typeof responseFormat === 'object' && responseFormat.schema) {
    instruction += ` Follow this JSON schema: ${JSON.stringify(responseFormat.schema)}`
  }

  const hasSystem = messages.some((m) => m.role === 'system')
  if (hasSystem) {
    return messages.map((m) =>
      m.role === 'system' ? { ...m, content: `${m.content}\n\n${instruction}` } : m,
    )
  }
  return [{ role: 'system', content: instruction }, ...messages]
}

async function callOpenAiCompatible(
  config: ProviderConfig,
  options: GatewayCompletionOptions,
): Promise<GatewayCompletionResult> {
  const messages = injectJsonInstruction(options.messages, options.responseFormat)
  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    max_tokens: options.maxTokens ?? 1024,
    temperature: options.temperature ?? 0.3,
  }

  if (options.tools && options.tools.length > 0) {
    body.tools = options.tools
    if (options.tool_choice) body.tool_choice = options.tool_choice
  }

  if (options.responseFormat) {
    body.response_format = { type: 'json_object' }
  }

  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`LLM API 오류: ${err}`)
  }

  const data = await res.json()
  const message = data.choices?.[0]?.message ?? {}
  return {
    content: message.content ?? '',
    tool_calls: message.tool_calls,
    model: data.model ?? config.model,
  }
}

function buildProviderOrder(preferred: LlmProviderName): LlmProviderName[] {
  const fixed: LlmProviderName[] = ['qwen', 'local']
  const rest = fixed.filter((p) => p !== preferred)
  return [preferred, ...rest]
}

export async function chatCompletionGateway(
  options: GatewayCompletionOptions,
): Promise<GatewayCompletionResult> {
  const traceId = options.traceId ?? generateTraceId()
  const primary = options.preferred ?? env.PRIMARY_LLM_PROVIDER ?? 'qwen'
  const order = buildProviderOrder(primary)

  let lastError: Error | undefined
  const start = Date.now()

  const logDuration = () => Date.now() - start

  for (const name of order) {
    const isPrimary = name === primary
    const config = getProviderConfig(name, {
      baseUrl: isPrimary ? options.baseUrl : undefined,
      apiKey: isPrimary ? options.apiKey : undefined,
      model: isPrimary ? options.model : undefined,
    })

    if (!config || !config.isConfigured) continue

    try {
      const result = await callOpenAiCompatible(config, options)
      const duration = logDuration()

      void logLlmEvent({
        traceId,
        userId: options.userId,
        model: result.model,
        durationMs: duration,
        tokens: undefined,
      })
      void logLlmCall({
        user_id: options.userId,
        model: result.model,
        messages: options.messages,
        response: result.content,
        tool_calls: result.tool_calls,
        duration_ms: duration,
        error: null,
      })

      return result
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      void logLlmEvent({
        traceId,
        userId: options.userId,
        model: config.model,
        durationMs: logDuration(),
        error: lastError.message,
      })
    }
  }

  void logLlmEvent({
    traceId,
    userId: options.userId,
    model: options.model,
    durationMs: logDuration(),
    error: lastError?.message ?? 'LLM API not configured',
  })
  throw lastError ?? new Error('LLM API not configured')
}
