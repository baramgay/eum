import {
  loadSampleJson,
  sumBySgg,
  avgBySgg,
  aggregateFacilities,
  listSampleFilesByPattern,
  buildPatternDomainNodesAndLinks,
} from '@/lib/ontology/core'

describe('loadSampleJson', () => {
  it('public_facility 샘플을 로드한다', () => {
    const rows = loadSampleJson<Record<string, unknown>>('public_facility')
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0]).toHaveProperty('sgg_cd')
    expect(rows[0]).toHaveProperty('ftype')
  })

  it('존재하지 않는 파일은 빈 배열을 반환한다', () => {
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const rows = loadSampleJson('not_existing_file_xyz')
    expect(rows).toEqual([])
    spy.mockRestore()
  })
})

describe('sumBySgg', () => {
  it('시군별로 지정한 컬럼을 합산한다', () => {
    const rows = [
      { sgg_cd: '48121', sigun: '창원시', value: 10 },
      { sgg_cd: '48121', sigun: '창원시', value: 20 },
      { sgg_cd: '48170', sigun: '진주시', value: 5 },
    ]
    const map = sumBySgg(rows, ['value'])
    expect(map['48121'].value).toBe(30)
    expect(map['48170'].value).toBe(5)
  })
})

describe('avgBySgg', () => {
  it('시군별로 지정한 컬럼의 평균을 계산한다', () => {
    const rows = [
      { sgg_cd: '48121', sigun: '창원시', pm10: 50 },
      { sgg_cd: '48121', sigun: '창원시', pm10: 70 },
      { sgg_cd: '48170', sigun: '진주시', pm10: 40 },
    ]
    const map = avgBySgg(rows, ['pm10'])
    expect(map['48121'].pm10).toBe(60)
    expect(map['48170'].pm10).toBe(40)
  })
})

describe('aggregateFacilities', () => {
  it('필터에 포함된 시설 유형만 집계한다', () => {
    const gold = [
      { sgg_cd: '48121', sigun: '창원시', ftype: '청년센터', capacity: 100 },
      { sgg_cd: '48121', sigun: '창원시', ftype: '도서관', capacity: 50 },
    ]
    const sample = [
      { sgg_cd: '48121', sigun: '창원시', ftype: '청년센터', capacity: 200 },
      { sgg_cd: '48170', sigun: '진주시', ftype: '체육관', capacity: 300 },
    ]
    const agg = aggregateFacilities(gold, sample, ['청년센터', '도서관', '체육관'])
    expect(agg['청년센터']['48121'].count).toBe(2)
    expect(agg['청년센터']['48121'].capacity).toBe(300)
    expect(agg['도서관']['48121'].count).toBe(1)
    expect(agg['체육관']['48170'].count).toBe(1)
  })

  it('필터에 없는 유형은 무시한다', () => {
    const rows = [
      { sgg_cd: '48121', sigun: '창원시', ftype: '문화센터', capacity: 100 },
    ]
    const agg = aggregateFacilities(rows, [], ['청년센터'])
    expect(Object.keys(agg)).toEqual(['청년센터'])
    expect(agg['청년센터']['48121']).toBeUndefined()
  })
})

describe('listSampleFilesByPattern', () => {
  it('sports_*.json 패턴에 sports_facility.json을 포함한다', () => {
    const files = listSampleFilesByPattern('sports_*.json')
    expect(files).toContain('sports_facility.json')
  })

  it('welfare_*.json 패턴에 welfare_facility.json을 포함한다', () => {
    const files = listSampleFilesByPattern('welfare_*.json')
    expect(files).toContain('welfare_facility.json')
  })

  it('tourism_*.json 패턴은 현재 매칭 파일이 없어도 빈 배열을 반환한다', () => {
    const files = listSampleFilesByPattern('tourism_*.json')
    expect(files).toEqual([])
  })

  it('culture_f*.json 패턴은 현재 매칭 파일이 없어도 빈 배열을 반환한다', () => {
    const files = listSampleFilesByPattern('culture_f*.json')
    expect(files).toEqual([])
  })

  it('매칭되는 파일이 없으면 빈 배열을 반환한다', () => {
    const files = listSampleFilesByPattern('no_such_pattern_*.json')
    expect(files).toEqual([])
  })
})

describe('buildPatternDomainNodesAndLinks', () => {
  it('체육 도메인 패턴으로 노드와 관계를 생성한다', () => {
    const objs: any[] = []
    const links: any[] = []
    buildPatternDomainNodesAndLinks(
      objs,
      links,
      {
        configKey: 'sports',
        prefix: 'sports',
        pattern: 'sports_*.json',
        weight: m => (m.gyms ?? 0) * 10 + (m.fields ?? 0) * 5 + (m.members ?? 0) * 0.01,
      },
      2024,
    )
    expect(objs.length).toBeGreaterThan(0)
    const found = objs.find(o => o.obj_id.startsWith('sports:'))
    expect(found).toBeDefined()
    expect(found?.obj_type).toBe('체육시설')
    expect(found?.props).toMatch(/체육관=\d+/)
    expect(found?.props).toMatch(/운동장=\d+/)
    expect(found?.props).toMatch(/회원=\d+/)
    expect(found?.props).toContain('year=2024')

    const rel = links.find(l => l.rel === '체육기반')
    expect(rel).toBeDefined()
    expect(rel?.src.startsWith('sigun:')).toBe(true)
    expect(rel?.dst.startsWith('sports:')).toBe(true)
  })

  it('존재하지 않는 패턴은 아무것도 추가하지 않는다', () => {
    const objs: any[] = []
    const links: any[] = []
    buildPatternDomainNodesAndLinks(
      objs,
      links,
      {
        configKey: 'culture',
        prefix: 'culture',
        pattern: 'no_such_culture_*.json',
        weight: () => 1,
      },
    )
    expect(objs).toHaveLength(0)
    expect(links).toHaveLength(0)
  })

  it('기존 체육 노드가 있으면 속성과 가중치를 갱신하고 중복을 만들지 않는다', () => {
    const objs: any[] = [
      {
        obj_id: 'sports:48121',
        obj_type: '체육시설',
        label: '창원시 체육시설',
        props: '체육관=0;운동장=0;회원=0',
      },
    ]
    const links: any[] = [
      { src: 'sigun:48121', rel: '체육기반', dst: 'sports:48121', weight: 0 },
    ]

    buildPatternDomainNodesAndLinks(
      objs,
      links,
      {
        configKey: 'sports',
        prefix: 'sports',
        pattern: 'sports_*.json',
        weight: m => (m.gyms ?? 0) * 10 + (m.fields ?? 0) * 5 + (m.members ?? 0) * 0.01,
      },
    )

    expect(objs.filter(o => o.obj_id === 'sports:48121')).toHaveLength(1)
    expect(objs[0].props).toMatch(/체육관=\d+/)
    expect(objs[0].props).toMatch(/운동장=\d+/)
    expect(objs[0].props).toMatch(/회원=\d+/)

    expect(links.filter(l => l.dst === 'sports:48121')).toHaveLength(1)
    expect(links[0].weight).toBeGreaterThan(0)
  })
})
