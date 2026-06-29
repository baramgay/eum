/**
 * @jest-environment node
 */
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'

import { POST } from '@/app/api/analyze/narrate/route'
import { createClient } from '@/lib/supabase/server'
import { chatCompletion } from '@/lib/ai/provider'

jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/ai/provider', () => ({ chatCompletion: jest.fn() }))

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/analyze/narrate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/analyze/narrate', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.QWEN_API_KEY = 'test-key'
  })

  afterEach(() => {
    delete process.env.QWEN_API_KEY
  })

  it('인증 없음 → 401', async () => {
    ;(createClient as jest.Mock).mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }) },
    })
    const res = await POST(makeRequest({ analysis_type: 'descriptive', summary_data: {} }) as never)
    expect(res.status).toBe(401)
  })

  it('QWEN_API_KEY 미설정 → 503', async () => {
    delete process.env.QWEN_API_KEY
    ;(createClient as jest.Mock).mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    })
    const res = await POST(makeRequest({ analysis_type: 'descriptive', summary_data: { count: 1 } }) as never)
    expect(res.status).toBe(503)
  })

  it('analysis_type 누락 → 400', async () => {
    ;(createClient as jest.Mock).mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    })
    const res = await POST(makeRequest({ summary_data: { count: 1 } }) as never)
    expect(res.status).toBe(400)
  })

  it('summary_data 누락 → 400', async () => {
    ;(createClient as jest.Mock).mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    })
    const res = await POST(makeRequest({ analysis_type: 'descriptive' }) as never)
    expect(res.status).toBe(400)
  })

  it('정상 요청 → 200, narration 트림 후 반환', async () => {
    ;(createClient as jest.Mock).mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    })
    ;(chatCompletion as jest.Mock).mockResolvedValue({ content: '  분석 결과 통계 해설입니다.  ' })
    const res = await POST(makeRequest({
      analysis_type: 'descriptive',
      dataset_title: '테스트 데이터',
      summary_data: { title: '기술통계', mean: 3.5, count: 100 },
    }) as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.narration).toBe('분석 결과 통계 해설입니다.')
    expect(chatCompletion as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', maxTokens: 300 }),
    )
  })
})
