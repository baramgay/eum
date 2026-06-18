import type { ConnectorResult, ApiConfig } from './types'
import { apiSchema } from './types'

export async function checkApi(config: unknown): Promise<ConnectorResult> {
  const parsed = apiSchema.safeParse(config)
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues.map((i) => i.message).join(', ') }
  }
  const cfg = parsed.data as ApiConfig

  const headers: Record<string, string> = { ...cfg.headers }
  if (cfg.authType === 'bearer' && cfg.authValue) {
    headers.Authorization = `Bearer ${cfg.authValue}`
  } else if (cfg.authType === 'api_key' && cfg.authKey && cfg.authValue) {
    headers[cfg.authKey] = cfg.authValue
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    const res = await fetch(cfg.url, {
      method: cfg.method,
      headers,
      signal: controller.signal,
    })
    clearTimeout(timeout)
    return {
      ok: res.status > 0,
      message: `status ${res.status}`,
    }
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      return { ok: false, message: 'API 요청 시간 초과' }
    }
    return { ok: false, message: e instanceof Error ? e.message : 'API 연결 실패' }
  }
}
