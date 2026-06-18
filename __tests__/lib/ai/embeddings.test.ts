process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'

import { getEmbedding } from '@/lib/ai/embeddings'

describe('getEmbedding', () => {
  beforeEach(() => {
    jest.resetModules()
    delete process.env.EMBEDDING_API_KEY
    delete process.env.EMBEDDING_BASE_URL
    delete process.env.QWEN_BASE_URL
  })

  it('EMBEDDING_API_KEY가 없으면 null을 반환한다', async () => {
    process.env.EMBEDDING_BASE_URL = 'https://llm.example.com/v1'
    const { getEmbedding } = require('@/lib/ai/embeddings')
    const result = await getEmbedding('테스트 문장')
    expect(result).toBeNull()
  })

  it('빈 문자열이면 null을 반환한다', async () => {
    process.env.EMBEDDING_API_KEY = 'key'
    process.env.EMBEDDING_BASE_URL = 'https://llm.example.com/v1'
    const { getEmbedding } = require('@/lib/ai/embeddings')
    expect(await getEmbedding('')).toBeNull()
    expect(await getEmbedding('   ')).toBeNull()
  })
})
