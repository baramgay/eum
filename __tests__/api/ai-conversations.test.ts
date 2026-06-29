/**
 * @jest-environment node
 */
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'

import { GET } from '@/app/api/ai/conversations/route'
import { createClient } from '@/lib/supabase/server'

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}))

const CONV_LIST = [
  { id: 'c1', title: '첫 대화', updated_at: '2026-06-28T10:00:00Z', created_at: '2026-06-28T10:00:00Z' },
  { id: 'c2', title: '두 번째 대화', updated_at: '2026-06-27T09:00:00Z', created_at: '2026-06-27T09:00:00Z' },
]

const MSG_LIST = [
  { id: 'm1', role: 'user', content: '안녕하세요', tool_calls: null, created_at: '2026-06-28T10:00:01Z' },
  { id: 'm2', role: 'assistant', content: '안녕하세요! 무엇을 도와드릴까요?', tool_calls: null, created_at: '2026-06-28T10:00:02Z' },
]

function makeUrl(path = '', params: Record<string, string> = {}) {
  const url = new URL(`http://localhost/api/ai/conversations${path}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return url
}

function mockAnon() {
  return {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }) },
  }
}

function mockUser(userId: string, convList = CONV_LIST, msgList = MSG_LIST) {
  const convBuilder = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue({ data: convList }),
    single: jest.fn().mockResolvedValue({ data: convList[0] }),
  }
  const msgBuilder = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockResolvedValue({ data: msgList }),
  }
  return {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: userId } }, error: null }) },
    from: jest.fn((table: string) => table === 'conversation_messages' ? msgBuilder : convBuilder),
  }
}

describe('GET /api/ai/conversations', () => {
  beforeEach(() => jest.clearAllMocks())

  it('인증 없음 → 401', async () => {
    ;(createClient as jest.Mock).mockResolvedValue(mockAnon())
    const res = await GET(new Request(makeUrl()) as never)
    expect(res.status).toBe(401)
  })

  it('대화 목록 조회 → 200 with conversations', async () => {
    ;(createClient as jest.Mock).mockResolvedValue(mockUser('u1'))
    const res = await GET(new Request(makeUrl()) as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.conversations).toHaveLength(2)
    expect(body.conversations[0].id).toBe('c1')
  })

  it('?id=c1 → 메시지 목록 반환', async () => {
    ;(createClient as jest.Mock).mockResolvedValue(mockUser('u1'))
    const res = await GET(new Request(makeUrl('', { id: 'c1' })) as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.messages).toHaveLength(2)
    expect(body.messages[0].role).toBe('user')
  })

  it('존재하지 않는 ?id → 404', async () => {
    const convBuilder = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null }),
    }
    ;(createClient as jest.Mock).mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
      from: jest.fn().mockReturnValue(convBuilder),
    })
    const res = await GET(new Request(makeUrl('', { id: 'no-such-id' })) as never)
    expect(res.status).toBe(404)
  })
})
