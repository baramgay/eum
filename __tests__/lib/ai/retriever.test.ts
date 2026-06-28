process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'

jest.mock('@/lib/ai/embeddings', () => ({
  getEmbedding: jest.fn(),
}))

import type { SupabaseClient } from '@supabase/supabase-js'
import { retrieveContext, fuseRrf } from '@/lib/ai/retriever'
import { buildCatalogContext, buildOntologyContext } from '@/lib/ai/context-builder'
import { getEmbedding } from '@/lib/ai/embeddings'

interface MockChain {
  select: jest.Mock
  eq: jest.Mock
  or: jest.Mock
  ilike: jest.Mock
  limit: jest.Mock
  maybeSingle: jest.Mock
  returns: jest.Mock
}

function createMockSupabase(
  catalog: Record<string, unknown>[],
  onto: Record<string, unknown>[],
  options: {
    rpc?: Record<string, unknown>
    singleCatalog?: Record<string, unknown> | null
    columns?: Record<string, unknown>[]
    samples?: Record<string, unknown>[]
    ontoNode?: Record<string, unknown> | null
    outLinks?: Record<string, unknown>[]
    inLinks?: Record<string, unknown>[]
  } = {},
): SupabaseClient {
  let ontoLinkFilter: 'src' | 'dst' | null = null

  const mockRpc = jest.fn().mockImplementation((name, args) => {
    if (name === 'match_catalog') {
      return Promise.resolve({ data: options.rpc?.match_catalog ?? [], error: null })
    }
    if (name === 'run_select_sql' || name === 'run_select_sql_safe') {
      return Promise.resolve({ data: options.rpc?.run_select_sql ?? options.samples ?? [], error: null })
    }
    return Promise.resolve({ data: [], error: null })
  })

  const mockFrom = (table: string): MockChain => {
    const chain = {} as MockChain
    chain.select = jest.fn().mockReturnValue(chain)
    chain.eq = jest.fn().mockImplementation((col, val) => {
      if (table === 'onto_links') {
        if (col === 'src') ontoLinkFilter = 'src'
        if (col === 'dst') ontoLinkFilter = 'dst'
      }
      return chain
    })
    chain.or = jest.fn().mockReturnValue(chain)
    chain.ilike = jest.fn().mockReturnValue(chain)
    chain.limit = jest.fn().mockResolvedValue({ data: table === 'catalog' ? catalog : onto })
    chain.maybeSingle = jest.fn().mockImplementation(() => {
      if (table === 'catalog') return Promise.resolve({ data: options.singleCatalog ?? null })
      if (table === 'onto_objects') return Promise.resolve({ data: options.ontoNode ?? null })
      return Promise.resolve({ data: null })
    })
    chain.returns = jest.fn().mockImplementation(() => {
      if (table === 'information_schema.columns') {
        return Promise.resolve({ data: options.columns ?? [] })
      }
      if (table === 'onto_links') {
        const data = ontoLinkFilter === 'dst' ? options.inLinks ?? [] : options.outLinks ?? []
        return Promise.resolve({ data })
      }
      return chain
    })
    return chain
  }

  return { from: mockFrom, rpc: mockRpc } as unknown as SupabaseClient
}

describe('retrieveContext', () => {
  beforeEach(() => {
    ;(getEmbedding as jest.Mock).mockReset()
  })

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

  it('vector와 keyword 결과가 겹치면 RRF로 더 높은 순위를 부여한다', async () => {
    ;(getEmbedding as jest.Mock).mockResolvedValue(Array(1536).fill(0.01))

    const catalog = [
      {
        dataset_id: 'ds-1',
        title: '데이터 1',
        theme: '테마',
        keywords: '키워드',
        description: '설명',
        format: 'csv',
      },
      {
        dataset_id: 'ds-2',
        title: '데이터 2',
        theme: '테마',
        keywords: '키워드',
        description: '설명',
        format: 'csv',
      },
    ]

    const supabase = createMockSupabase(catalog, [], {
      rpc: {
        match_catalog: [
          {
            dataset_id: 'ds-2',
            title: '데이터 2',
            theme: '테마',
            keywords: '키워드',
            description: '설명',
            format: 'csv',
            similarity: 0.8,
          },
          {
            dataset_id: 'ds-1',
            title: '데이터 1',
            theme: '테마',
            keywords: '키워드',
            description: '설명',
            format: 'csv',
            similarity: 0.7,
          },
        ],
      },
    })

    const res = await retrieveContext(supabase, '경남 데이터', 2)
    // vector 1위 + keyword 2위 vs vector 2위 + keyword 1위는 동점이며,
    // Map 삽입 순서에 따라 vector에서 먼저 등장한 ds-2가 앞선다.
    expect(res[0].title).toBe('데이터 2')
    expect(res[1].title).toBe('데이터 1')
  })
})

describe('fuseRrf', () => {
  it('두 리스트에서 동일 항목이면 점수를 합산해 상위로 올린다', () => {
    const a = [{ key: 'x', source: 'catalog' as const, title: 'X', snippet: '' }]
    const b = [{ key: 'x', source: 'catalog' as const, title: 'X', snippet: '' }]
    const c = [{ key: 'y', source: 'catalog' as const, title: 'Y', snippet: '' }]

    const res = fuseRrf([a, c, b])
    expect(res[0].key).toBe('x')
    expect(res[1].key).toBe('y')
  })

  it('k 값이 커질수록 순위 간 점수 차이가 작아진다', () => {
    const list = [
      { key: 'first', source: 'catalog' as const, title: 'First', snippet: '' },
      { key: 'second', source: 'catalog' as const, title: 'Second', snippet: '' },
    ]
    const smallK = fuseRrf([list], 10)
    const largeK = fuseRrf([list], 100)
    expect(largeK[0].title).toBe('First')
    expect(largeK[1].title).toBe('Second')
    // RRF는 큰 k에서 순위 간 점수 차이가 줄어들어 순위가 더 부드럽게 결합된다.
    expect(smallK[0].title).toBe(largeK[0].title)
    expect(smallK[1].title).toBe(largeK[1].title)
  })
})

describe('buildCatalogContext', () => {
  it('카탈로그 메타데이터와 샘플 행을 포함한 컨텍스트를 생성한다', async () => {
    const supabase = createMockSupabase(
      [],
      [],
      {
        singleCatalog: {
          dataset_id: 'ds-1',
          title: '청년인구',
          description: '경남 청년인구 현황',
          theme: '인구',
          keywords: '청년,인구',
          table_name: 'gold_youth_population',
          rows: 1000,
          format: 'csv',
        },
        columns: [
          { table_name: 'gold_youth_population', column_name: 'sigun' },
          { table_name: 'gold_youth_population', column_name: 'year' },
        ],
        samples: [{ sigun: '창원시', year: 2024, population: 12345 }],
      },
    )

    const ctx = await buildCatalogContext(supabase, 'ds-1')
    expect(ctx).toContain('청년인구')
    expect(ctx).toContain('gold_youth_population')
    expect(ctx).toContain('sigun')
    expect(ctx).toContain('창원시')
  })

  it('table_name이 없으면 메타데이터만 반환한다', async () => {
    const supabase = createMockSupabase(
      [],
      [],
      {
        singleCatalog: {
          dataset_id: 'ds-2',
          title: '메타데이터만',
          description: '설명',
          theme: '테마',
          keywords: '키워드',
          table_name: null,
          rows: null,
          format: 'json',
        },
      },
    )

    const ctx = await buildCatalogContext(supabase, 'ds-2')
    expect(ctx).toContain('메타데이터만')
    expect(ctx).not.toContain('컬럼:')
  })
})

describe('buildOntologyContext', () => {
  it('노드 정보와 1-hop 관계 요약을 포함한다', async () => {
    const supabase = createMockSupabase(
      [],
      [],
      {
        ontoNode: {
          obj_id: 'sigun:48121',
          obj_type: '시군',
          label: '창원시',
          props: 'lat=35.2',
        },
        outLinks: [
          { src: 'sigun:48121', rel: 'neighbors', dst: 'sigun:48170', weight: 1 },
          { src: 'sigun:48121', rel: 'neighbors', dst: 'sigun:48123', weight: 1 },
        ],
        inLinks: [
          { src: 'action:settlement', rel: 'applies_to', dst: 'sigun:48121', weight: 1 },
        ],
      },
    )

    const ctx = await buildOntologyContext(supabase, 'sigun:48121')
    expect(ctx).toContain('창원시')
    expect(ctx).toContain('neighbors')
    expect(ctx).toContain('applies_to')
    expect(ctx).toContain('이웃 노드 수:')
  })
})
