/**
 * @jest-environment node
 */
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'

import { GET } from '@/app/api/user/quota/route'
import { createClient } from '@/lib/supabase/server'

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}))

function buildClient(
  userId: string | null,
  dailyData: { calls: number; tokens: number } | null,
  monthlyData: { calls: number }[]
) {
  const dailyBuilder = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: dailyData, error: null }),
  }
  const monthlyBuilder = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    then: (
      resolve: (v: { data: { calls: number }[]; error: null }) => unknown,
      reject?: (e: unknown) => unknown
    ) => Promise.resolve({ data: monthlyData, error: null }).then(resolve, reject),
  }
  return {
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: userId ? { id: userId } : null },
      }),
    },
    from: jest.fn()
      .mockReturnValueOnce(dailyBuilder)
      .mockReturnValueOnce(monthlyBuilder),
  }
}

describe('GET /api/user/quota', () => {
  beforeEach(() => jest.clearAllMocks())

  it('인증 없음 → 401', async () => {
    ;(createClient as jest.Mock).mockResolvedValue(buildClient(null, null, []))
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('사용 없음 → 잔여 = 한도 전량', async () => {
    ;(createClient as jest.Mock).mockResolvedValue(buildClient('u1', null, []))
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.daily_calls).toBe(0)
    expect(body.daily_remaining).toBe(100)
    expect(body.daily_limit).toBe(100)
    expect(body.monthly_calls).toBe(0)
    expect(body.monthly_remaining).toBe(2000)
    expect(body.monthly_limit).toBe(2000)
  })

  it('기존 사용량 일별·월별 합산', async () => {
    ;(createClient as jest.Mock).mockResolvedValue(
      buildClient('u1', { calls: 10, tokens: 500 }, [{ calls: 10 }, { calls: 15 }])
    )
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.daily_calls).toBe(10)
    expect(body.daily_remaining).toBe(90)
    expect(body.monthly_calls).toBe(25)
    expect(body.monthly_remaining).toBe(1975)
  })

  it('일별 한도 초과 시 remaining = 0 (음수 방지)', async () => {
    ;(createClient as jest.Mock).mockResolvedValue(
      buildClient('u1', { calls: 110, tokens: 9000 }, [{ calls: 110 }])
    )
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.daily_remaining).toBe(0)
    expect(body.monthly_remaining).toBe(1890)
  })
})
