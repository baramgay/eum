process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
process.env.CRON_SECRET = 'test-cron-secret-32chars-long-value!!'
process.env.COLLECTION_SECRET = 'test-collection-secret-32chars!!!'

describe('lib/ai/provider', () => {
  beforeEach(() => {
    jest.resetModules()
    global.fetch = jest.fn()
  })

  it('OpenAI 호환 엔드포인트로 요청을 본인다', async () => {
    process.env.QWEN_BASE_URL = 'https://llm.example.com/v1'
    process.env.QWEN_API_KEY = 'test-api-key'
    const { chatCompletion } = require('@/lib/ai/provider')

    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'qwen-turbo',
        choices: [{ message: { content: '안녕하세요' } }],
      }),
    })

    const result = await chatCompletion({
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

  it('tools 옵션을 포함해 요청한다', async () => {
    process.env.QWEN_BASE_URL = 'https://llm.example.com/v1'
    process.env.QWEN_API_KEY = 'test-api-key'
    const { chatCompletion } = require('@/lib/ai/provider')
    const tools = [{ type: 'function', function: { name: 'query_dataset' } }]

    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: '',
            tool_calls: [{ id: '1', type: 'function', function: { name: 'query_dataset', arguments: '{}' } }],
          },
        }],
      }),
    })

    const result = await chatCompletion({
      messages: [{ role: 'user', content: 'query' }],
      tools,
      tool_choice: 'auto',
    })

    expect(result.tool_calls).toHaveLength(1)
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)
    expect(body.tools).toEqual(tools)
    expect(body.tool_choice).toBe('auto')
  })

  it('baseUrl/apiKey를 직접 지정할 수 있다', async () => {
    process.env.QWEN_BASE_URL = 'https://llm.example.com/v1'
    process.env.QWEN_API_KEY = 'test-api-key'
    const { chatCompletion } = require('@/lib/ai/provider')

    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
    })

    await chatCompletion({
      messages: [{ role: 'user', content: 'hi' }],
      baseUrl: 'https://closed-network.llm/v2',
      apiKey: 'custom-key',
      model: 'custom-model',
    })

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe('https://closed-network.llm/v2/chat/completions')
    expect(init.headers.Authorization).toBe('Bearer custom-key')
    expect(JSON.parse(init.body).model).toBe('custom-model')
  })

  it('설정이 없으면 에러를 던진다', async () => {
    delete (process.env as Record<string, string | undefined>).QWEN_BASE_URL
    delete (process.env as Record<string, string | undefined>).QWEN_API_KEY
    const { chatCompletion } = require('@/lib/ai/provider')

    await expect(chatCompletion({ messages: [{ role: 'user', content: 'hi' }] }))
      .rejects.toThrow('LLM API not configured')
  })

  it('API 응답이 ok가 아니면 에러를 던진다', async () => {
    process.env.QWEN_BASE_URL = 'https://llm.example.com/v1'
    process.env.QWEN_API_KEY = 'test-api-key'
    const { chatCompletion } = require('@/lib/ai/provider')

    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      text: async () => 'bad request',
    })

    await expect(chatCompletion({ messages: [{ role: 'user', content: 'hi' }] }))
      .rejects.toThrow('LLM API 오류: bad request')
  })
})
