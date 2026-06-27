/**
 * @jest-environment node
 */

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
process.env.EMBEDDING_API_KEY = 'test-key'
process.env.EMBEDDING_BASE_URL = 'https://embed.example.com/v1'
process.env.EMBEDDING_MODEL = 'text-embedding-v3'

import { POST } from '@/app/api/catalog/embeddings/route'
import { NextRequest } from 'next/server'

const mockGetEmbedding = jest.fn()

jest.mock('@/lib/ai/embeddings', () => ({
  getEmbedding: (...args: unknown[]) => mockGetEmbedding(...args),
}))

function createChain(initialData: unknown) {
  const state = { data: initialData, inFilter: null as string[] | null }
  const build = () => chain
  const chain: Record<string, jest.Mock> = {}
  const resolve = () => {
    let data = state.data
    if (Array.isArray(data) && Array.isArray(state.inFilter)) {
      data = data.filter((r) => state.inFilter?.includes((r as { dataset_id?: string }).dataset_id ?? ''))
    }
    return { data, error: null }
  }
  const thenable = {
    then: (onFulfilled: (v: unknown) => unknown) => Promise.resolve(resolve()).then(onFulfilled),
  }
  chain.select = jest.fn().mockImplementation(() => ({ ...chain, ...thenable }))
  chain.eq = jest.fn().mockImplementation(() => ({ ...chain, ...thenable }))
  chain.in = jest.fn().mockImplementation((_col: string, values: string[]) => {
    state.inFilter = values
    return { ...chain, ...thenable }
  })
  chain.limit = jest.fn().mockImplementation(() => ({ ...chain, ...thenable }))
  chain.not = jest.fn().mockImplementation(() => ({ ...chain, ...thenable }))
  chain.like = jest.fn().mockImplementation(() => ({ ...chain, ...thenable }))
  chain.upsert = jest.fn().mockImplementation((_payload: unknown, _options: unknown) => ({
    ...chain,
    select: jest.fn().mockImplementation(() => ({
      ...chain,
      single: jest.fn().mockResolvedValue({
        data: { id: 'job-id', dataset_id: 'ds-1' },
        error: null,
      }),
    })),
  }))
  return chain
}

const mockFrom = jest.fn()

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockImplementation(() => {
    return {
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: {
            user: {
              id: 'user-1',
              user_metadata: { role: 'center' },
            },
          },
        }),
      },
      from: mockFrom,
    }
  }),
}))

function makeRequest(body?: object): NextRequest {
  return new NextRequest('http://localhost:3001/api/catalog/embeddings', {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  })
}

describe('/api/catalog/embeddings', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetEmbedding.mockResolvedValue([0.1, 0.2, 0.3])
    mockFrom.mockImplementation((table: string) => {
      if (table === 'catalog') {
        return createChain([
          { dataset_id: 'ds-1' },
          { dataset_id: 'ds-2' },
        ])
      }
      return createChain(null)
    })
  })

  it('임베딩 API가 비활성화면 503을 반환한다', async () => {
    mockGetEmbedding.mockResolvedValue(null)
    const res = await POST(makeRequest())
    expect(res.status).toBe(503)
  })

  it('ai_ready 카탈로그 항목에 대해 임베딩 작업을 enqueue 한다', async () => {
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.count).toBe(2)
  })

  it('특정 datasetIds만 받아 enqueue 한다', async () => {
    const res = await POST(makeRequest({ datasetIds: ['ds-1'] }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.count).toBe(1)
  })
})
