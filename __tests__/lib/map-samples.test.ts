import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

const SAMPLES_DIR = join(process.cwd(), 'data', 'samples')
const DATA_AVAILABLE = existsSync(SAMPLES_DIR)

function loadSample(name: string): unknown[] {
  const p = join(SAMPLES_DIR, `${name}.json`)
  if (!existsSync(p)) return []
  return JSON.parse(readFileSync(p, 'utf8')) as unknown[]
}

// data/samples 없는 CI 환경에서는 전체 스킵 (데이터 품질 검증은 로컬 전용)
const describeOrSkip = DATA_AVAILABLE ? describe : describe.skip

describeOrSkip('public_facility 샘플 데이터', () => {
  const facilities = loadSample('public_facility') as Array<{
    facility_id: string
    sgg_cd: string
    sigun: string
    ftype: string
    lon: number | null
    lat: number | null
    capacity: number
  }>

  it('최소 700개 이상의 시설이 있다', () => {
    expect(facilities.length).toBeGreaterThanOrEqual(700)
  })

  it('4가지 시설 유형을 포함한다', () => {
    const types = new Set(facilities.map(f => f.ftype))
    expect(types.size).toBeGreaterThanOrEqual(4)
    expect(types).toContain('청년센터')
    expect(types).toContain('도서관')
    expect(types).toContain('체육관')
    expect(types).toContain('문화센터')
  })

  it('18개 시군 코드를 포함한다', () => {
    const codes = new Set(facilities.map(f => f.sgg_cd))
    expect(codes.size).toBeGreaterThanOrEqual(18)
  })

  it('유효한 좌표를 가진 시설이 다수 존재한다', () => {
    const valid = facilities.filter(f => typeof f.lon === 'number' && typeof f.lat === 'number')
    expect(valid.length).toBeGreaterThan(facilities.length * 0.5)
  })

  it('모든 시설에 필수 필드가 있다', () => {
    for (const f of facilities) {
      expect(f.facility_id).toBeTruthy()
      expect(f.sgg_cd).toBeTruthy()
      expect(f.sigun).toBeTruthy()
      expect(f.ftype).toBeTruthy()
      expect(f.capacity).toBeGreaterThanOrEqual(0)
    }
  })
})

describeOrSkip('8종 샘플 데이터 파일', () => {
  const names = [
    'traffic_accidents',
    'commercial_area',
    'air_quality',
    'public_hospital',
    'school_population',
    'public_facility',
    'youth_population',
    'business',
  ]

  it.each(names)('%s.json이 존재하고 비어있지 않다', (name) => {
    const rows = loadSample(name)
    expect(Array.isArray(rows)).toBe(true)
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0]).toHaveProperty('sgg_cd')
  })
})
