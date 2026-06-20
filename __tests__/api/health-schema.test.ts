import { GET } from '@/app/api/health/route'

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: jest.fn().mockResolvedValue({
    rpc: jest.fn().mockResolvedValue({ error: null }),
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue({ data: [], error: null }),
      }),
    }),
  }),
}))

jest.mock('@/lib/env', () => ({
  env: { QWEN_BASE_URL: '' },
}))

describe('GET /api/health', () => {
  it('returns status ok', async () => {
    const res = await GET()
    const data = await res.json()
    expect(data.status).toBe('ok')
  })
})
