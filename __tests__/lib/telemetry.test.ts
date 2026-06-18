/**
 * @jest-environment node
 */
import {
  recordAccessLog,
  getErrorRate,
  getAvgResponseTime,
  getP95ResponseTime,
  summarizeAccessLogs,
  filterByWindow,
} from '@/lib/telemetry'

const fetchMock = jest.fn()
global.fetch = fetchMock as unknown as typeof fetch

describe('telemetry', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    fetchMock.mockReset()
  })

  it('recordAccessLog는 Supabase REST에 접근 로그를 기록한다', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
    fetchMock.mockResolvedValue({ ok: true } as unknown as Response)

    recordAccessLog({ endpoint: '/api/test', method: 'GET', status_code: 200, response_ms: 12, user_id: 'u1' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, opts] = fetchMock.mock.calls[0] as [string, { method: string; body: string }]
    expect(url).toContain('/rest/v1/api_access_logs')
    expect(opts.method).toBe('POST')
    const body = JSON.parse(opts.body)
    expect(body.endpoint).toBe('/api/test')
    expect(body.status_code).toBe(200)
    expect(body.error).toBe(false)
  })

  it('5xx 상태면 error 플래그를 true로 기록한다', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
    fetchMock.mockResolvedValue({ ok: true } as unknown as Response)

    recordAccessLog({ endpoint: '/api/test', method: 'GET', status_code: 500 })
    const [, opts] = fetchMock.mock.calls[0] as [unknown, { body: string }]
    expect(JSON.parse(opts.body).error).toBe(true)
  })

  it('환경 변수가 없으면 fetch를 호출하지 않는다', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    recordAccessLog({ endpoint: '/api/test', method: 'GET', status_code: 200 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('getErrorRate는 오류율을 계산한다', () => {
    const logs = [
      { endpoint: '/', method: 'GET', status_code: 200 },
      { endpoint: '/', method: 'GET', status_code: 500 },
      { endpoint: '/', method: 'GET', status_code: 200 },
    ]
    expect(getErrorRate(logs as never)).toBeCloseTo(1 / 3)
  })

  it('getAvgResponseTime은 응답 시간 평균을 계산한다', () => {
    const logs = [
      { endpoint: '/', method: 'GET', status_code: 200, response_ms: 10 },
      { endpoint: '/', method: 'GET', status_code: 200, response_ms: 30 },
    ]
    expect(getAvgResponseTime(logs as never)).toBe(20)
  })

  it('getP95ResponseTime은 p95 응답 시간을 계산한다', () => {
    const logs = Array.from({ length: 20 }, (_, i) => ({
      endpoint: '/',
      method: 'GET',
      status_code: 200,
      response_ms: (i + 1) * 10,
    }))
    expect(getP95ResponseTime(logs as never)).toBe(190)
  })

  it('summarizeAccessLogs은 요약을 반환한다', () => {
    const logs = [
      { endpoint: '/', method: 'GET', status_code: 200, response_ms: 100 },
      { endpoint: '/', method: 'GET', status_code: 500, response_ms: 200 },
    ]
    const s = summarizeAccessLogs(logs as never)
    expect(s.total).toBe(2)
    expect(s.errorCount).toBe(1)
    expect(s.errorRate).toBe(0.5)
    expect(s.avgResponseMs).toBe(150)
  })

  it('filterByWindow는 윈도우를 기준으로 필터링한다', () => {
    const now = Date.now()
    const rows = [
      { ts: new Date(now - 1000).toISOString() },
      { ts: new Date(now - 100_000).toISOString() },
    ]
    expect(filterByWindow(rows, 60_000)).toHaveLength(1)
  })
})
