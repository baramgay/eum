process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
process.env.CRON_SECRET = 'test-cron-secret-32chars-long-value!!'
process.env.COLLECTION_SECRET = 'test-collection-secret-32chars!!!'

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: jest.fn(),
}))

describe('/api/health', () => {
  beforeEach(() => {
    jest.resetModules()
    global.fetch = jest.fn()
  })

  function mockSupabase(createServiceClient: jest.Mock, ok = true) {
    createServiceClient.mockResolvedValue({
      rpc: jest.fn().mockResolvedValue({ error: ok ? null : new Error('supabase rpc failed') }),
    })
  }

  function getMocks() {
    const { createServiceClient } = require('@/lib/supabase/server')
    const { GET } = require('@/app/api/health/route')
    return { createServiceClient: createServiceClient as jest.Mock, GET }
  }

  it('Supabase와 Qwen이 모두 정상이면 ok를 반환한다', async () => {
    process.env.QWEN_BASE_URL = 'https://llm.example.com'
    const { createServiceClient, GET } = getMocks()
    mockSupabase(createServiceClient, true)
    ;(global.fetch as jest.Mock).mockResolvedValue({ status: 200 })

    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.status).toBe('ok')
    expect(body.checks).toContainEqual(expect.objectContaining({ name: 'supabase', status: 'ok' }))
    expect(body.checks).toContainEqual(expect.objectContaining({ name: 'qwen', status: 'ok' }))
  })

  it('Supabase 연결에 실패하면 degraded를 반환한다', async () => {
    process.env.QWEN_BASE_URL = 'https://llm.example.com'
    const { createServiceClient, GET } = getMocks()
    createServiceClient.mockResolvedValue({
      rpc: jest.fn().mockResolvedValue({ error: new Error('fail') }),
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({ error: new Error('fail') }),
      }),
    })
    ;(global.fetch as jest.Mock).mockResolvedValue({ status: 200 })

    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(503)
    expect(body.status).toBe('degraded')
    expect(body.checks).toContainEqual(expect.objectContaining({ name: 'supabase', status: 'fail' }))
  })

  it('QWEN_BASE_URL이 없으면 qwen 체크를 건�다', async () => {
    delete (process.env as Record<string, string | undefined>).QWEN_BASE_URL
    const { createServiceClient, GET } = getMocks()
    mockSupabase(createServiceClient, true)

    const res = await GET()
    const body = await res.json()

    expect(body.status).toBe('ok')
    expect(body.checks).toContainEqual(expect.objectContaining({ name: 'qwen', status: 'skipped' }))
  })

  it('Qwen에 네트워크 오류가 발생하면 degraded를 반환한다', async () => {
    process.env.QWEN_BASE_URL = 'https://llm.example.com'
    const { createServiceClient, GET } = getMocks()
    mockSupabase(createServiceClient, true)
    ;(global.fetch as jest.Mock).mockRejectedValue(new Error('network error'))

    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(503)
    expect(body.status).toBe('degraded')
    expect(body.checks).toContainEqual(expect.objectContaining({ name: 'qwen', status: 'fail' }))
  })
})
