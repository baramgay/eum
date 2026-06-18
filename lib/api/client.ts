import { ApiError } from './errors'

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  body?: unknown
  headers?: Record<string, string>
  credentials?: RequestCredentials
  /**
   * 서버가 error 메시지를 담은 본문을 남기지 않았을 때 사용할 안내 메시지.
   * - 문자열: 뒤에 HTTP 상태 코드를 붙여 "{message} ({status})" 형태로 사용한다.
   * - 함수: 상태 코드를 받아 전체 메시지를 직접 반환한다.
   */
  fallbackMessage?: string | ((status: number) => string)
  /**
   * 네트워크 오류 및 5xx 응답 시 재시도 횟수. 기본값은 1회 재시도(최대 2회 시도)이다.
   * 0으로 설정하면 재시도하지 않는다.
   */
  retry?: number
  /**
   * 재시도 시 지수 백오프의 기본 대기 시간(밀리초). 기본값 500ms.
   */
  retryDelayMs?: number
}

function resolveErrorMessage(
  status: number,
  data: unknown,
  fallbackMessage?: ApiRequestOptions['fallbackMessage'],
  method = 'GET'
): string {
  if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') {
    return data.error
  }
  if (typeof fallbackMessage === 'function') {
    return fallbackMessage(status)
  }
  if (typeof fallbackMessage === 'string') {
    return `${fallbackMessage} (${status})`
  }
  return `${method} 요청 실패 (${status})`
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof TypeError) {
    // fetch 네트워크 오류(AbortError 제외)
    return true
  }
  if (error instanceof ApiError && error.status >= 500) {
    return true
  }
  return false
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 공통 API 클라이언트.
 * - credentials: 'same-origin' 기본값
 * - body 전달 시 JSON 직렬화 및 Content-Type 자동 설정
 * - 비정상 응답 시 ApiError 발생
 * - 네트워크 오류 및 5xx에 대해 지수 백오프 재시도
 */
export async function apiClient<T>(url: string, options: ApiRequestOptions = {}): Promise<T> {
  const {
    method = 'GET',
    body,
    headers: customHeaders = {},
    credentials = 'same-origin',
    fallbackMessage,
    retry = 1,
    retryDelayMs = 500,
  } = options

  const maxAttempts = Math.max(1, (retry ?? 1) + 1)
  const baseDelay = Math.max(0, retryDelayMs ?? 500)

  const headers: Record<string, string> = { ...customHeaders }
  const init: RequestInit = { method, credentials, headers }

  if (body !== undefined) {
    init.body = JSON.stringify(body)
    if (!headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = 'application/json'
    }
  }

  let lastError: unknown
  const startMs = Date.now()

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(url, init)

      let data: unknown
      try {
        data = await response.json()
      } catch {
        data = null
      }

      if (!response.ok) {
        const message = resolveErrorMessage(response.status, data, fallbackMessage, method)
        throw new ApiError(message, response.status, data)
      }

      const duration = Date.now() - startMs
      if (duration > 1000) {
        // eslint-disable-next-line no-console
        console.warn(`[apiClient] 느린 요청 경고: ${method} ${url} — ${duration}ms`)
      } else {
        // eslint-disable-next-line no-console
        console.log(`[apiClient] ${method} ${url} — ${duration}ms`)
      }

      return data as T
    } catch (error) {
      lastError = error
      const isLastAttempt = attempt === maxAttempts
      if (isLastAttempt || !isRetryableError(error)) {
        break
      }
      const delay = baseDelay * 2 ** (attempt - 1)
      // eslint-disable-next-line no-console
      console.warn(`[apiClient] 재시도 ${attempt}/${retry} — ${method} ${url} (${delay}ms 후)`)
      await sleep(delay)
    }
  }

  const duration = Date.now() - startMs
  // eslint-disable-next-line no-console
  console.warn(`[apiClient] 요청 실패: ${method} ${url} — ${duration}ms`)
  throw lastError
}
