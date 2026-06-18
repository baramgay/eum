process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'

import type { SupabaseClient } from '@supabase/supabase-js'
import { retrieveContext } from '@/lib/ai/retriever'

interface MockChain {
  select: jest.Mock
  eq: jest.Mock
  or: jest.Mock
  ilike: jest.Mock
  limit: jest.Mock
}

function createMockSupabase(catalog: Record<string, unknown>[], onto: Record<string, unknown>[]): SupabaseClient {
  const mockFrom = (table: string): MockChain => {
    const chain = {} as MockChain
    chain.select = jest.fn().mockReturnValue(chain)
    chain.eq = jest.fn().mockReturnValue(chain)
    chain.or = jest.fn().mockReturnValue(chain)
    chain.ilike = jest.fn().mockReturnValue(chain)
    chain.limit = jest.fn().mockResolvedValue({ data: table === 'catalog' ? catalog : onto })
    return chain
  }

  return { from: mockFrom } as unknown as SupabaseClient
}

describe('retrieveContext', () => {
  it('빈 질문이면 빈 배열을 반환한다', async () => {
    const supabase = createMockSupabase([], [])
    const res = await retrieveContext(supabase, '')
    expect(res).toEqual([])
  })

  it('질문에서 1글자 이하인 토큰은 무시한다', async () => {
    const supabase = createMockSupabase([], [])
    const res = await retrieveContext(supabase, 'a b')
    expect(res).toEqual([])
  })

  it('catalog 결과를 RetrievedSource 형태로 반환한다', async () => {
    const supabase = createMockSupabase(
      [
        {
          dataset_id: 'ds-1',
          title: '청년 정착잠재지수',
          theme: '정착',
          keywords: '청년,정착,순위',
          description: 'KT/KB/KCB 통합 분석',
          format: 'csv',
        },
      ],
      [],
    )
    const res = await retrieveContext(supabase, '청년 정착 순위')
    expect(res).toHaveLength(1)
    expect(res[0]).toMatchObject({
      source: 'catalog',
      title: '청년 정착잠재지수',
      url: '/catalog/ds-1',
    })
    expect(res[0].snippet).toContain('정착')
    expect(res[0].snippet).toContain('KT/KB/KCB 통합 분석')
  })

  it('ontology 결과를 RetrievedSource 형태로 반환한다', async () => {
    const supabase = createMockSupabase(
      [],
      [
        {
          obj_id: 'sigun:48121',
          obj_type: '시군',
          label: '창원시',
          props: '유형=일반구;lat=35.2;lng=128.6',
        },
      ],
    )
    const res = await retrieveContext(supabase, '창원시 정보')
    expect(res).toHaveLength(1)
    expect(res[0]).toMatchObject({
      source: 'ontology',
      title: '창원시',
      url: '/ontology?node=sigun%3A48121',
    })
    expect(res[0].snippet).toContain('시군')
    expect(res[0].snippet).toContain('유형=일반구')
  })

  it('catalog와 ontology 결과를 합쳐 limit 개수만큼 반환한다', async () => {
    const catalog = Array.from({ length: 5 }, (_, i) => ({
      dataset_id: `ds-${i}`,
      title: `데이터 ${i}`,
      theme: '테마',
      keywords: '키워드',
      description: '설명',
      format: 'csv',
    }))
    const onto = Array.from({ length: 5 }, (_, i) => ({
      obj_id: `obj-${i}`,
      obj_type: '시군',
      label: `지역 ${i}`,
      props: '',
    }))
    const supabase = createMockSupabase(catalog, onto)
    const res = await retrieveContext(supabase, '경남 데이터', 6)
    expect(res).toHaveLength(6)
  })
})
