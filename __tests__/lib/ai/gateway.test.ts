process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
process.env.CRON_SECRET = 'test-cron-secret-32chars-long-value!!'
process.env.COLLECTION_SECRET = 'test-collection-secret-32chars!!!'

describe('lib/ai/gateway', () => {
  beforeEach(() => {
    jest.resetModules()
    global.fetch = jest.fn()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('기본적으로 Qwen 호환 엔드포인트를 사용한다', async () => {
    process.env.QWEN_BASE_URL = 'https://llm.example.com/v1'
    process.env.QWEN_API_KEY = 'test-api-key'
    process.env.PRIMARY_LLM_PROVIDER = 'qwen'
    delete process.env.LOCAL_LLM_BASE_URL

    const { chatCompletionGateway } = require('@/lib/ai/gateway')
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'qwen-turbo',
        choices: [{ message: { content: '안녕하세요' } }],
      }),
    })

    const result = await chatCompletionGateway({
      messages: [{ role: 'user', content: 'hello' }],
    })

    expect(result.content).toBe('안녕하세요')
    expect(result.model).toBe('qwen-turbo')

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe('https://llm.example.com/v1/chat/completions')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer test-api-key')
    const body = JSON.parse(init.body)
    expect(body.model).toBe('qwen-turbo')
    expect(body.messages).toEqual([{ role: 'user', content: 'hello' }])
  })

  it('Local LLM fallback을 사용한다', async () => {
    delete process.env.QWEN_API_KEY
    delete process.env.QWEN_BASE_URL
    process.env.LOCAL_LLM_BASE_URL = 'http://localhost:11434/v1'
    process.env.LOCAL_LLM_MODEL = 'qwen2.5'
    process.env.PRIMARY_LLM_PROVIDER = 'qwen'

    const { chatCompletionGateway } = require('@/lib/ai/gateway')
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'qwen2.5',
        choices: [{ message: { content: 'local answer' } }],
      }),
    })

    const result = await chatCompletionGateway({
      messages: [{ role: 'user', content: 'hi' }],
    })

    expect(result.content).toBe('local answer')
    const [url] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe('http://localhost:11434/v1/chat/completions')
  })

  it('responseFormat이 json이면 response_format을 추가한다', async () => {
    process.env.QWEN_BASE_URL = 'https://llm.example.com/v1'
    process.env.QWEN_API_KEY = 'test-api-key'
    process.env.PRIMARY_LLM_PROVIDER = 'qwen'
    delete process.env.LOCAL_LLM_BASE_URL

    const { chatCompletionGateway } = require('@/lib/ai/gateway')
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{}' } }] }),
    })

    await chatCompletionGateway({
      messages: [{ role: 'user', content: 'give me json' }],
      responseFormat: 'json',
    })

    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)
    expect(body.response_format).toEqual({ type: 'json_object' })
    expect(body.messages[0].role).toBe('system')
    expect(body.messages[0].content).toContain('valid JSON')
  })

  it('responseFormat에 schema가 있으면 시스템 메시지에 schema를 포함한다', async () => {
    process.env.QWEN_BASE_URL = 'https://llm.example.com/v1'
    process.env.QWEN_API_KEY = 'test-api-key'
    process.env.PRIMARY_LLM_PROVIDER = 'qwen'
    delete process.env.LOCAL_LLM_BASE_URL

    const { chatCompletionGateway } = require('@/lib/ai/gateway')
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{}' } }] }),
    })

    const schema = { type: 'object', properties: { answer: { type: 'string' } } }
    await chatCompletionGateway({
      messages: [{ role: 'user', content: 'give me json' }],
      responseFormat: { schema },
    })

    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)
    expect(body.messages[0].content).toContain(JSON.stringify(schema))
  })

  it('설정된 공급자가 없으면 에러를 던진다', async () => {
    delete process.env.QWEN_API_KEY
    delete process.env.QWEN_BASE_URL
    delete process.env.LOCAL_LLM_BASE_URL
    process.env.PRIMARY_LLM_PROVIDER = 'qwen'

    const { chatCompletionGateway } = require('@/lib/ai/gateway')

    await expect(
      chatCompletionGateway({ messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toThrow('LLM API not configured')
  })
})
