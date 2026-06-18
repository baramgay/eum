import { getGraph, listActions, recommendOntologyCandidates, loadSigunCentroids } from '@/lib/ontology/core'

const MOCK_SIGUN_CENTROIDS = [
  { sgg_cd: '48121', sigun: '창원시', lat: 35.2280, lng: 128.6811 },
  { sgg_cd: '48170', sigun: '진주시', lat: 35.1799, lng: 128.1075 },
  { sgg_cd: '48220', sigun: '통영시', lat: 34.8544, lng: 128.4330 },
]

jest.mock('fs', () => {
  const actual = jest.requireActual<typeof import('fs')>('fs')
  return {
    ...actual,
    readFileSync: (p: unknown, enc: unknown) => {
      if (String(p).includes('data') && String(p).includes('sigun_centroids')) {
        return JSON.stringify(MOCK_SIGUN_CENTROIDS)
      }
      return actual.readFileSync(p as string, enc as BufferEncoding)
    },
  }
})

describe('ontology/core', () => {
  describe('getGraph', () => {
    it('centerSgg로 필터링하면 중심 노드와 이웃만 반환한다', async () => {
      const nodes = [
        { obj_id: 'sigun:48121', obj_type: '시군', label: '창원시', props: '' },
        { obj_id: 'youth:48121', obj_type: '청년인구', label: '창원시 청년', props: '' },
        { obj_id: 'sigun:48170', obj_type: '시군', label: '진주시', props: '' },
        { obj_id: 'youth:48170', obj_type: '청년인구', label: '진주시 청년', props: '' },
      ]
      const edges = [
        { src: 'sigun:48121', rel: '청년규모', dst: 'youth:48121', weight: 1 },
        { src: 'sigun:48170', rel: '청년규모', dst: 'youth:48170', weight: 1 },
        { src: 'youth:48121', rel: '순유출', dst: 'sigun:48121', weight: 1 },
      ]

      const fromMock = jest.fn((table: string) => ({
        select: jest.fn(() =>
          Promise.resolve({
            data: table === 'onto_objects' ? nodes : edges,
            error: null,
          })
        ),
      }))
      const supabase = { from: fromMock } as any

      const result = await getGraph(supabase, '48121')

      expect(result.nodes).toHaveLength(2)
      expect(result.nodes.map(n => n.obj_id)).toEqual(
        expect.arrayContaining(['sigun:48121', 'youth:48121'])
      )
      expect(result.edges).toHaveLength(2)
      expect(fromMock).toHaveBeenCalledWith('onto_objects')
      expect(fromMock).toHaveBeenCalledWith('onto_links')
    })

    it('centerSgg가 없으면 전체 그래프를 반환한다', async () => {
      const nodes = [{ obj_id: 'sigun:48121', obj_type: '시군', label: '창원시', props: '' }]
      const edges: any[] = []
      const supabase = {
        from: jest.fn((table: string) => ({
          select: jest.fn(() =>
            Promise.resolve({
              data: table === 'onto_objects' ? nodes : edges,
              error: null,
            })
          ),
        })),
      } as any

      const result = await getGraph(supabase)
      expect(result.nodes).toHaveLength(1)
      expect(result.edges).toHaveLength(0)
    })

    it('Supabase 조회 오류 시 예외를 던진다', async () => {
      const supabase = {
        from: jest.fn(() => ({
          select: jest.fn(() =>
            Promise.resolve({
              data: null,
              error: { message: 'connection failed' },
            })
          ),
        })),
      } as any

      await expect(getGraph(supabase)).rejects.toThrow('connection failed')
    })
  })

  describe('listActions', () => {
    it('YAML의 actions 목록을 key·name·description 형태로 반환한다', () => {
      const actions = listActions()
      expect(actions.length).toBeGreaterThan(0)
      expect(actions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ key: 'settlement', name: '청년 정착지원 우선지역 선정' }),
          expect.objectContaining({ key: 'housing', name: '청년 주거지원 우선지역 선정' }),
          expect.objectContaining({ key: 'employment', name: '청년 취업지원 우선지역 선정' }),
        ])
      )
      actions.forEach(a => {
        expect(a).toHaveProperty('key')
        expect(a).toHaveProperty('name')
        expect(a).toHaveProperty('description')
      })
    })
  })

  describe('recommendOntologyCandidates', () => {
    it('메타데이터에 매칭되는 키워드가 없으면 빈 배열을 반환한다', () => {
      expect(recommendOntologyCandidates({})).toEqual([])
    })

    it('메타데이터 키워드에 맞는 온톨로지 후보를 내림차순으로 반환한다', () => {
      const result = recommendOntologyCandidates({
        title: '청년 인구 유출 분석',
        description: '지역 청년층과 사업체 일자리 데이터',
      })
      expect(result.length).toBeGreaterThan(0)
      const types = result.map(r => r.obj_type)
      expect(types).toContain('청년인구')
      expect(types).toContain('사업체')

      // match_score 내림차순
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1].match_score).toBeGreaterThanOrEqual(result[i].match_score)
      }
    })
  })

  describe('loadSigunCentroids', () => {
    it('data/geo/sigun_centroids.json을 로드한다', () => {
      const rows = loadSigunCentroids()
      expect(rows.length).toBeGreaterThan(0)
      expect(rows[0]).toHaveProperty('sgg_cd')
      expect(rows[0]).toHaveProperty('lat')
      expect(rows[0]).toHaveProperty('lng')
    })
  })
})
