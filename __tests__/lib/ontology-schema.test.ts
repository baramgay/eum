import { readFileSync } from 'fs'
import { join } from 'path'
import { load as yamlLoad } from 'js-yaml'

describe('config/ontology-schema.yaml', () => {
  const schema = yamlLoad(readFileSync(join(process.cwd(), 'config', 'ontology-schema.yaml'), 'utf8')) as Record<string, unknown>

  it('필수 최상위 키를 포함한다', () => {
    expect(schema).toHaveProperty('facility_filter')
    expect(schema).toHaveProperty('facility_filters')
    expect(schema).toHaveProperty('sample_domains')
    expect(schema).toHaveProperty('actions')
    expect(schema).toHaveProperty('keyword_mapping')
  })

  it('facility_filters에 핵심 공공시설 유형이 포함된다', () => {
    const filters = schema.facility_filters as string[]
    expect(filters).toContain('청년센터')
    expect(filters).toContain('도서관')
    expect(filters).toContain('체육관')
    expect(filters).toContain('문화센터')
    expect(filters.length).toBeGreaterThanOrEqual(4)
  })

  it('facility_filters에 WS-B에서 확장한 시설 유형이 포함된다', () => {
    const filters = schema.facility_filters as string[]
    expect(filters).toContain('문화회관')
    expect(filters).toContain('박물관')
    expect(filters).toContain('체육공원')
    expect(filters).toContain('복지센터')
    expect(filters).toContain('관광지')
  })

  it('sample_domains에 핵심 5개 도메인이 있다', () => {
    const domains = schema.sample_domains as Record<string, { name: string; relation: string }>
    expect(domains).toHaveProperty('traffic')
    expect(domains).toHaveProperty('commercial')
    expect(domains).toHaveProperty('air')
    expect(domains).toHaveProperty('hospital')
    expect(domains).toHaveProperty('school')
    expect(domains.traffic.name).toBe('교통안전')
    expect(domains.traffic.relation).toBe('교통위험')
  })

  it('sample_domains에 문화·체육·복지·관광 도메인이 확장되어 있다', () => {
    const domains = schema.sample_domains as Record<string, { name: string; relation: string; metrics?: unknown[] }>
    expect(domains).toHaveProperty('culture')
    expect(domains).toHaveProperty('sports')
    expect(domains).toHaveProperty('welfare')
    expect(domains).toHaveProperty('tourism')
    expect(domains.culture.metrics).toBeDefined()
    expect(domains.sports.metrics).toBeDefined()
    expect(domains.welfare.metrics).toBeDefined()
    expect(domains.tourism.metrics).toBeDefined()
  })

  it('sample_domains 항목에 metrics 정의가 포함된다', () => {
    const domains = schema.sample_domains as Record<string, { metrics?: Array<{ key: string; label: string; aggregate: string; fractionDigits?: number }> }>
    expect(domains.traffic.metrics).toBeDefined()
    expect(domains.traffic.metrics?.length).toBeGreaterThan(0)
    expect(domains.air.metrics?.map(m => m.key)).toEqual(
      expect.arrayContaining(['pm10', 'pm25', 'no2', 'o3'])
    )
    for (const [domain, cfg] of Object.entries(domains)) {
      if (!cfg.metrics) continue
      cfg.metrics.forEach(m => {
        expect(m).toHaveProperty('key')
        expect(m).toHaveProperty('label')
        expect(['sum', 'avg']).toContain(m.aggregate)
      })
    }
  })

  it('keyword_mapping에 새 도메인 키워드가 포함된다', () => {
    const mapping = schema.keyword_mapping as Record<string, string[]>
    expect(mapping).toHaveProperty('교통안전')
    expect(mapping).toHaveProperty('상권')
    expect(mapping).toHaveProperty('대기환경')
    expect(mapping).toHaveProperty('공공의료')
    expect(mapping).toHaveProperty('교육인프라')
    expect(mapping).toHaveProperty('문화시설')
    expect(mapping).toHaveProperty('체육시설')
    expect(mapping).toHaveProperty('복지시설')
    expect(mapping).toHaveProperty('관광')
  })
})
