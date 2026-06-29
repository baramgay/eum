/**
 * @jest-environment node
 */
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'

import { POST } from '@/app/api/feedback/rag/route'
import { createClient, createServiceClient } from '@/lib/supabase/server'

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
  createServiceClient: jest.fn(),
}))

function mockAuth(userId: string | null) {
  return {
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: userId ? { id: userId } : null },
      }),
    },
  }
}

function mockService(insertError: unknown = null) {
  return {
    from: jest.fn().mockReturnValue({
      insert: jest.fn().mockResolvedValue({ error: insertError }),
    }),
  }
}

describe('POST /api/feedback/rag', () => {
  beforeEach(() => jest.clearAllMocks())

  it('인증 없음 → 401', async () => {
    ;(createClient as jest.Mock).mockResolvedValue(mockAuth(null))
    const res = await POST(new Request('http://localhost/api/feedback/rag', {
      method: 'POST',
      body: JSON.stringify({ question: 'q', helpful: true }),
    }))
    expect(res.status).toBe(401)
  })

  it('helpful 누락 → 400', async () => {
    ;(createClient as jest.Mock).mockResolvedValue(mockAuth('u1'))
    const res = await POST(new Request('http://localhost/api/feedback/rag', {
      method: 'POST',
      body: JSON.stringify({ question: '사용법?' }),
    }))
    expect(res.status).toBe(400)
  })

  it('question 누락 → 400', async () => {
    ;(createClient as jest.Mock).mockResolvedValue(mockAuth('u1'))
    const res = await POST(new Request('http://localhost/api/feedback/rag', {
      method: 'POST',
      body: JSON.stringify({ helpful: true }),
    }))
    expect(res.status).toBe(400)
  })

  it('빈 question → 400', async () => {
    ;(createClient as jest.Mock).mockResolvedValue(mockAuth('u1'))
    const res = await POST(new Request('http://localhost/api/feedback/rag', {
      method: 'POST',
      body: JSON.stringify({ question: '   ', helpful: true }),
    }))
    expect(res.status).toBe(400)
  })

  it('정상 피드백 → 200 ok', async () => {
    ;(createClient as jest.Mock).mockResolvedValue(mockAuth('u1'))
    ;(createServiceClient as jest.Mock).mockResolvedValue(mockService())
    const res = await POST(new Request('http://localhost/api/feedback/rag', {
      method: 'POST',
      body: JSON.stringify({ question: '사용법은?', sources_used: [{ source: 's', title: 't' }], helpful: true }),
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })

  it('DB 저장 실패 → 500', async () => {
    ;(createClient as jest.Mock).mockResolvedValue(mockAuth('u1'))
    ;(createServiceClient as jest.Mock).mockResolvedValue(mockService({ code: '23505', message: 'duplicate' }))
    const res = await POST(new Request('http://localhost/api/feedback/rag', {
      method: 'POST',
      body: JSON.stringify({ question: '사용법은?', helpful: false }),
    }))
    expect(res.status).toBe(500)
  })
})
