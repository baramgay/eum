/**
 * @jest-environment node
 */
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'

import {
  logAction,
  logApiKeyCreated,
  logApiKeyRevoked,
  logSubmissionDecided,
  logTenantStatusChanged,
} from '@/lib/audit'

const fetchMock = jest.fn()
global.fetch = fetchMock as unknown as typeof fetch

const actor = { id: 'actor-1', email: 'actor@eum.kr' } as never
const req = new Request('http://localhost:3001/api/test', {
  headers: { 'x-forwarded-for': '1.2.3.4', 'user-agent': 'jest' },
})

describe('audit', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    fetchMock.mockReset()
  })

  it('정상 응답 시 fetch를 1회 호출한다', async () => {
    fetchMock.mockResolvedValue({ ok: true } as unknown as Response)
    await logAction({} as never, actor, 'created_user', 'user', 'u1', {}, {}, req)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const call = fetchMock.mock.calls[0] as [string, { method: string; body: string; headers: Record<string, string> }]
    expect(call[1].method).toBe('POST')
    const body = JSON.parse(call[1].body)
    expect(body.action).toBe('created_user')
    expect(body.ip_address).toBe('1.2.3.4')
  })

  it('실패 시 최대 3회 재시도하고 console.warn을 호출한다', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    fetchMock.mockResolvedValue({ ok: false, status: 500, statusText: 'Internal Server Error' } as unknown as Response)

    await logAction({} as never, actor, 'created_user', 'user', 'u1')

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('logApiKeyCreated는 issued_api_key 액션으로 전송한다', async () => {
    fetchMock.mockResolvedValue({ ok: true } as unknown as Response)
    await logApiKeyCreated({} as never, actor, 'k1', { tenant_id: 't1', name: 'dev' }, req)
    const call = fetchMock.mock.calls[0] as [string, { body: string }]
    const body = JSON.parse(call[1].body)
    expect(body.action).toBe('issued_api_key')
    expect(body.resource_id).toBe('k1')
  })

  it('logApiKeyRevoked는 revoked_api_key 액션으로 전송한다', async () => {
    fetchMock.mockResolvedValue({ ok: true } as unknown as Response)
    await logApiKeyRevoked({} as never, actor, 'k1', { name: 'dev', is_active: true }, req)
    const call = fetchMock.mock.calls[0] as [string, { body: string }]
    const body = JSON.parse(call[1].body)
    expect(body.action).toBe('revoked_api_key')
    expect(body.old_value.is_active).toBe(true)
  })

  it('logSubmissionDecided는 approved 액션으로 전송한다', async () => {
    fetchMock.mockResolvedValue({ ok: true } as unknown as Response)
    await logSubmissionDecided({} as never, actor, 's1', 'approved', { status: 'submitted' }, { status: 'approved' }, req)
    const call = fetchMock.mock.calls[0] as [string, { body: string }]
    const body = JSON.parse(call[1].body)
    expect(body.action).toBe('approved')
  })

  it('logTenantStatusChanged는 rejected 액션으로 전송한다', async () => {
    fetchMock.mockResolvedValue({ ok: true } as unknown as Response)
    await logTenantStatusChanged({} as never, actor, 't1', 'pending', 'rejected', req)
    const call = fetchMock.mock.calls[0] as [string, { body: string }]
    const body = JSON.parse(call[1].body)
    expect(body.action).toBe('rejected')
    expect(body.old_value.status).toBe('pending')
    expect(body.new_value.status).toBe('rejected')
  })
})
