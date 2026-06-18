import { apiClient } from '@/lib/api/client'
import { ApiError } from '@/lib/api/errors'

describe('apiClient', () => {
  let requests: { url: string; init: RequestInit }[] = []

  beforeEach(() => {
    requests = []
    jest.resetAllMocks()
  })

  function mockFetch(response: Response) {
    global.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: url.toString(), init: init ?? {} })
      return response
    })
  }

  function mockFetchSequence(responses: (() => Response)[]) {
    let index = 0
    global.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: url.toString(), init: init ?? {} })
      const response = responses[index++] ?? responses[responses.length - 1]
      return response()
    })
  }

  function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  it('GET 요청이 정상 응답을 반환한다', async () => {
    mockFetch(jsonResponse({ items: [1, 2, 3] }))

    const result = await apiClient<{ items: number[] }>('/api/items')

    expect(result).toEqual({ items: [1, 2, 3] })
    expect(requests).toHaveLength(1)
    expect(requests[0].init.method).toBe('GET')
    expect(requests[0].url).toBe('/api/items')
  })

  it('POST 요청 시 body를 JSON 직렬화하고 Content-Type을 설정한다', async () => {
    mockFetch(jsonResponse({ id: '1' }))

    await apiClient('/api/items', { method: 'POST', body: { name: 'test' } })

    expect(requests[0].init.method).toBe('POST')
    expect(requests[0].init.headers).toMatchObject({ 'Content-Type': 'application/json' })
    expect(requests[0].init.body).toBe(JSON.stringify({ name: 'test' }))
  })

  it('에러 응답 본문의 error 필드를 메시지로 사용한다', async () => {
    mockFetch(jsonResponse({ error: '인증이 필요합니다' }, 401))

    await expect(apiClient('/api/items')).rejects.toThrow('인증이 필요합니다')
  })

  it('에러 응답 본문에 메시지가 없으면 fallbackMessage를 사용한다', async () => {
    mockFetch(new Response('', { status: 500 }))

    await expect(
      apiClient('/api/items', { fallbackMessage: '목록 조회 실패', retryDelayMs: 10 })
    ).rejects.toThrow('목록 조회 실패 (500)')
  })

  it('fallbackMessage가 함수이면 상태 코드를 받아 메시지를 반환한다', async () => {
    mockFetch(new Response('', { status: 503 }))

    await expect(
      apiClient('/api/items', { fallbackMessage: status => `서비스 불가 (${status})`, retryDelayMs: 10 })
    ).rejects.toThrow('서비스 불가 (503)')
  })

  it('throw된 오류는 ApiError 인스턴스이다', async () => {
    mockFetch(jsonResponse({ error: 'bad request' }, 400))

    await expect(apiClient('/api/items')).rejects.toMatchObject({
      name: 'ApiError',
      status: 400,
      details: { error: 'bad request' },
    })
  })

  it('5xx 응답 시 기본적으로 1회 재시도한다', async () => {
    mockFetchSequence([
      () => jsonResponse({ error: 'server error' }, 500),
      () => jsonResponse({ ok: true }),
    ])

    const result = await apiClient('/api/items', { retryDelayMs: 10 })

    expect(result).toEqual({ ok: true })
    expect(requests).toHaveLength(2)
  })

  it('retry 옵션을 0으로 설정하면 재시도하지 않는다', async () => {
    mockFetch(jsonResponse({ error: 'server error' }, 500))

    await expect(apiClient('/api/items', { retry: 0 })).rejects.toThrow('server error')
    expect(requests).toHaveLength(1)
  })

  it('4xx 응답은 재시도하지 않는다', async () => {
    mockFetch(jsonResponse({ error: 'bad request' }, 400))

    await expect(apiClient('/api/items')).rejects.toThrow('bad request')
    expect(requests).toHaveLength(1)
  })

  it('fetch 네트워크 오류 시 재시도한다', async () => {
    mockFetchSequence([
      () => { throw new TypeError('fetch failed') },
      () => jsonResponse({ ok: true }),
    ])

    const result = await apiClient('/api/items', { retryDelayMs: 10 })

    expect(result).toEqual({ ok: true })
    expect(requests).toHaveLength(2)
  })

  it('최대 재시도 횟수를 초과하면 마지막 오류를 던진다', async () => {
    mockFetchSequence([
      () => jsonResponse({ error: 'first' }, 500),
      () => jsonResponse({ error: 'second' }, 500),
      () => jsonResponse({ error: 'third' }, 500),
    ])

    await expect(apiClient('/api/items', { retry: 2, retryDelayMs: 10 })).rejects.toThrow('third')
    expect(requests).toHaveLength(3)
  })
})
