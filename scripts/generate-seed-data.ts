/**
 * EUM 플랫폼 샘플/시드 데이터 생성기
 * 실행: npx ts-node --project tsconfig.json scripts/generate-seed-data.ts
 *
 * 생성물:
 *   - supabase/seed-gold.sql (기존 골드 테이블 시드)
 *   - data/samples/*.csv, *.json (공공기관 샘플 데이터)
 */
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { SEED_SIGUN as SIGUN } from '../lib/regions'

const YEARS = [2022, 2023, 2024, 2025]
const AGES  = ['20-24', '25-29', '30-34', '35-39']
const INDUSTRIES = ['제조','도소매','숙박음식','건설','정보통신','농림어업','보걸복지']
const FTYPES = ['청년센터','도서관','체육관','문화센터']

// 재현 가능한 의사난수 (seed=48)
let _seed = 48
function rng(): number {
  _seed = (_seed * 1664525 + 1013904223) & 0xffffffff
  return ((_seed >>> 0) / 0xffffffff)
}
function rnd(a: number, b: number) { return a + rng() * (b - a) }
function int(n: number) { return Math.floor(n) }
function pick<T>(arr: T[]): T { return arr[int(rnd(0, arr.length))] }
function pad(n: number, len: number): string { return String(n).padStart(len, '0') }

// ─────────────────────────────────────────────────────────────
// 1) 기존 골드 테이블 시드 SQL 생성
// ─────────────────────────────────────────────────────────────

const youthRows: string[] = []
const bizRows: string[] = []
const facRows: string[] = []
let facId = 0

for (const [cd, name, w] of SIGUN) {
  const base = w * 1000
  for (const y of YEARS) {
    const decline = 1 - 0.04 * (y - 2022)
    for (const age of AGES) {
      for (const sex of ['M', 'F']) {
        const pop = int(base * decline * rnd(0.08, 0.16))
        const inf = int(pop * rnd(0.05, 0.18))
        const out = int(pop * rnd(0.07, 0.22))
        youthRows.push(`('${cd}','${name}',${y},'${age}','${sex}',${pop},${inf},${out})`)
      }
    }
    for (const ind of INDUSTRIES) {
      const bc  = int(w * 30 * rnd(0.5, 1.5))
      const emp = int(bc * rnd(3, 12))
      bizRows.push(`('${cd}','${name}',${y},'${ind}',${bc},${emp})`)
    }
  }
  // 시설은 지도/클로스터/히트맵 테스트를 위해 대폭 확충
  const n = Math.max(20, int(w * 2))
  for (let i = 0; i < n; i++) {
    facId++
    const ft  = FTYPES[int(rnd(0, FTYPES.length))]
    const useNull = rng() < 0.03
    const lon = useNull ? 'NULL' : (128.0 + rnd(-0.9, 1.1)).toFixed(6)
    const lat = useNull ? 'NULL' : (35.2  + rnd(-0.7, 0.8)).toFixed(6)
    const cap = [50, 100, 200, 300, 500, 0][int(rnd(0, 6))]
    facRows.push(`('FAC${pad(facId, 5)}','${cd}','${name}','${ft}','${name} ${ft} ${i+1}',${lon},${lat},${cap})`)
  }
}

const CHUNK = 500
function chunked(rows: string[], table: string): string {
  const parts: string[] = []
  for (let i = 0; i < rows.length; i += CHUNK) {
    parts.push(`INSERT INTO ${table} VALUES\n${rows.slice(i, i + CHUNK).join(',\n')};`)
  }
  return parts.join('\n')
}

const sql = [
  chunked(youthRows, 'gold_youth_population'),
  chunked(bizRows,   'gold_business'),
  chunked(facRows,   'gold_public_facility'),
].join('\n\n')

writeFileSync('supabase/seed-gold.sql', sql, 'utf8')
console.log(`[1/2] seed-gold.sql 생성 완료 — youth: ${youthRows.length}행, biz: ${bizRows.length}행, fac: ${facRows.length}행`)

// ─────────────────────────────────────────────────────────────
// 2) 공공기관 샘플 데이터 (CSV/JSON) 생성
//    analyze.py 의 action_parse 에서 읽을 수 있도록
//    컬럼명은 영문, 수치 컬럼은 70% 이상 유효하도록 구성
// ─────────────────────────────────────────────────────────────

const SAMPLES_DIR = 'data/samples'
if (!existsSync(SAMPLES_DIR)) mkdirSync(SAMPLES_DIR, { recursive: true })

function toCsv(rows: Record<string, string | number | null>[]): string {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const lines = [headers.join(',')]
  for (const row of rows) {
    lines.push(headers.map(h => {
      const v = row[h]
      if (v === null || v === undefined) return ''
      const s = String(v)
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }).join(','))
  }
  return lines.join('\n')
}

function saveSample(name: string, rows: Record<string, string | number | null>[]) {
  const csv = toCsv(rows)
  const json = JSON.stringify(rows, null, 2)
  writeFileSync(`${SAMPLES_DIR}/${name}.csv`, csv, 'utf8')
  writeFileSync(`${SAMPLES_DIR}/${name}.json`, json, 'utf8')
  console.log(`       • ${name}: ${rows.length}행`)
}

// ── 교통사고 ──
const accidentTypes = ['차대차', '차대인', '단일사고', '기타']
const weathers = ['맑음', '비', '흐림', '안개', '눈']
const roadTypes = ['일반국도', '지방도', '시도로', '시군도', '기타']
const trafficRows: Record<string, string | number | null>[] = []
let accId = 0
for (const [cd, name, w] of SIGUN) {
  const n = Math.max(50, int(w * 10))
  for (let i = 0; i < n; i++) {
    accId++
    const year = pick([2022, 2023, 2024])
    trafficRows.push({
      accident_id: `ACC${pad(accId, 6)}`,
      sgg_cd: cd,
      sigun: name,
      year,
      month: int(rnd(1, 13)),
      accident_type: pick(accidentTypes),
      weather: pick(weathers),
      road_type: pick(roadTypes),
      fatalities: int(rnd(0, 3.5)),
      injuries: int(rnd(0, 11)),
      property_damage: int(rnd(0, 5001)),
      lon: Number((128.0 + rnd(-0.9, 1.1)).toFixed(6)),
      lat: Number((35.2 + rnd(-0.7, 0.8)).toFixed(6)),
    })
  }
}
saveSample('traffic_accidents', trafficRows)

// ── 상권 ──
const bizIndustries = ['음식', '소매', '서비스', '숙박', '교육', '의료', '제조', '건설', '운수', '정보통신', '부동산', '예술']
const commercialRows: Record<string, string | number | null>[] = []
let storeId = 0
for (const [cd, name, w] of SIGUN) {
  for (const year of [2022, 2023, 2024, 2025]) {
    for (const industry of bizIndustries) {
      storeId++
      const base = w * (industry === '음식' ? 8 : industry === '소매' ? 6 : 3)
      const storeCount = int(base * rnd(0.7, 1.4))
      const sales = int(storeCount * rnd(20, 80))
      const employees = int(storeCount * rnd(2, 8))
      commercialRows.push({
        store_id: `STR${pad(storeId, 6)}`,
        sgg_cd: cd,
        sigun: name,
        year,
        industry,
        store_count: storeCount,
        sales_amount: sales,
        employee_count: employees,
        opening_count: int(storeCount * rnd(0.05, 0.15)),
        closure_count: int(storeCount * rnd(0.03, 0.12)),
      })
    }
  }
}
saveSample('commercial_area', commercialRows)

// ── 대기질 ──
const stationNames = ['시청앞', '산업단지', '주거지역', '농촌지역', '해안가', '역세권', '공원']
const airRows: Record<string, string | number | null>[] = []
let stationId = 0
for (const [cd, name, w] of SIGUN) {
  const n = Math.max(2, int(w / 5))
  for (let i = 0; i < n; i++) {
    stationId++
    const stationName = `${name} ${pick(stationNames)}`
    for (const year of [2023, 2024, 2025]) {
      for (const month of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
        airRows.push({
          station_id: `AIR${pad(stationId, 5)}`,
          sgg_cd: cd,
          sigun: name,
          station_name: stationName,
          year,
          month,
          pm10: int(rnd(20, 91)),
          pm25: int(rnd(10, 46)),
          no2: Number(rnd(0.01, 0.05).toFixed(4)),
          o3: Number(rnd(0.03, 0.09).toFixed(4)),
          co: Number(rnd(0.3, 1.0).toFixed(4)),
          so2: Number(rnd(0.001, 0.01).toFixed(4)),
        })
      }
    }
  }
}
saveSample('air_quality', airRows)

// ── 공공병원 ──
const hospitalTypes = ['종합병원', '병원', '보건소', '보건지소', '의원']
const hospitalDepts = ['내과', '외과', '소아청소년과', '산부인과', '정형외과', '응급의학과', '안과', '이비인후과']
const hospitalRows: Record<string, string | number | null>[] = []
let hospitalId = 0
for (const [cd, name, w] of SIGUN) {
  const n = Math.max(5, int(w / 2))
  for (let i = 0; i < n; i++) {
    hospitalId++
    const htype = w >= 30 ? pick(hospitalTypes.slice(0, 2)) : pick(hospitalTypes.slice(2))
    const beds = htype.includes('종합') ? int(rnd(200, 801)) : htype === '병원' ? int(rnd(50, 201)) : int(rnd(5, 31))
    hospitalRows.push({
      hospital_id: `HSP${pad(hospitalId, 5)}`,
      sgg_cd: cd,
      sigun: name,
      name: `${name} ${htype === '보건소' ? '보건소' : htype === '보건지소' ? '보건지소' : htype === '의원' ? '의원' : '의료원'}`,
      hospital_type: htype,
      dept: pick(hospitalDepts),
      doctors: int(beds * rnd(0.05, 0.12)),
      nurses: int(beds * rnd(0.15, 0.35)),
      beds,
      lon: Number((128.0 + rnd(-0.9, 1.1)).toFixed(6)),
      lat: Number((35.2 + rnd(-0.7, 0.8)).toFixed(6)),
    })
  }
}
saveSample('public_hospital', hospitalRows)

// ── 학교/교육 인구 ──
const schoolLevels = ['초등학교', '중학교', '고등학교', '특수학교']
const schoolRows: Record<string, string | number | null>[] = []
let schoolId = 0
for (const [cd, name, w] of SIGUN) {
  for (const year of [2021, 2022, 2023, 2024, 2025]) {
    for (const level of schoolLevels) {
      const count = level === '초등학교' ? int(w * rnd(0.4, 0.8)) :
                    level === '중학교' ? int(w * rnd(0.15, 0.35)) :
                    level === '고등학교' ? int(w * rnd(0.1, 0.25)) :
                    int(rnd(1, 4))
      const students = int(count * (level === '특수학교' ? rnd(60, 121) : rnd(200, 501)))
      const teachers = int(students / (level === '특수학교' ? 5 : 15))
      schoolId++
      schoolRows.push({
        school_id: `SCH${pad(schoolId, 6)}`,
        sgg_cd: cd,
        sigun: name,
        year,
        school_level: level,
        school_count: count,
        students,
        teachers,
        classrooms: int(students / rnd(20, 31)),
      })
    }
  }
}
saveSample('school_population', schoolRows)

// ── 공공시설 (지도/클로스터/히트맵 테스트용) ──
const facilityRows: Record<string, string | number | null>[] = []
let sampleFacId = 0
for (const [cd, name, w] of SIGUN) {
  const n = Math.max(20, int(w * 2))
  for (let i = 0; i < n; i++) {
    sampleFacId++
    const ft = FTYPES[int(rnd(0, FTYPES.length))]
    const useNull = rng() < 0.03
    facilityRows.push({
      facility_id: `SMP-FAC${pad(sampleFacId, 5)}`,
      sgg_cd: cd,
      sigun: name,
      ftype: ft,
      name: `${name} ${ft} ${i + 1}`,
      lon: useNull ? null : Number((128.0 + rnd(-0.9, 1.1)).toFixed(6)),
      lat: useNull ? null : Number((35.2 + rnd(-0.7, 0.8)).toFixed(6)),
      capacity: [50, 100, 200, 300, 500, 0][int(rnd(0, 6))],
    })
  }
}
saveSample('public_facility', facilityRows)

// ── 청년 인구 (CSV/JSON 샘플) ──
const youthSampleRows: Record<string, string | number | null>[] = []
let youthSampleId = 0
for (const [cd, name, w] of SIGUN) {
  const base = w * 1000
  for (const y of YEARS) {
    const decline = 1 - 0.04 * (y - 2022)
    for (const age of AGES) {
      for (const sex of ['M', 'F']) {
        youthSampleId++
        const pop = int(base * decline * rnd(0.08, 0.16))
        youthSampleRows.push({
          id: `YTH${pad(youthSampleId, 6)}`,
          sgg_cd: cd,
          sigun: name,
          year: y,
          age_group: age,
          sex,
          population: pop,
          influx: int(pop * rnd(0.05, 0.18)),
          outflow: int(pop * rnd(0.07, 0.22)),
        })
      }
    }
  }
}
saveSample('youth_population', youthSampleRows)

// ── 사업체 (CSV/JSON 샘플) ──
const businessRows: Record<string, string | number | null>[] = []
let bizSampleId = 0
for (const [cd, name, w] of SIGUN) {
  for (const y of YEARS) {
    for (const ind of INDUSTRIES) {
      bizSampleId++
      const bc = int(w * 30 * rnd(0.5, 1.5))
      businessRows.push({
        id: `BIZ${pad(bizSampleId, 6)}`,
        sgg_cd: cd,
        sigun: name,
        year: y,
        industry: ind,
        business_count: bc,
        employees: int(bc * rnd(3, 12)),
      })
    }
  }
}
saveSample('business', businessRows)

// ── 문화시설 ──
const cultureRows: Record<string, string | number | null>[] = []
let cultureId = 0
for (const [cd, name, w] of SIGUN) {
  const n = Math.max(3, int(w / 15))
  for (let i = 0; i < n; i++) {
    cultureId++
    const year = pick([2022, 2023, 2024])
    const facilities = int(w * rnd(0.3, 0.7))
    const seats = int(facilities * rnd(80, 160))
    cultureRows.push({
      culture_id: `CUL${pad(cultureId, 6)}`,
      sgg_cd: cd,
      sigun: name,
      year,
      facilities,
      seats,
      events: int(facilities * rnd(10, 30)),
    })
  }
}
saveSample('cultural_facility', cultureRows)

// ── 체육시설 ──
const sportsRows: Record<string, string | number | null>[] = []
let sportsId = 0
for (const [cd, name, w] of SIGUN) {
  const n = Math.max(3, int(w / 12))
  for (let i = 0; i < n; i++) {
    sportsId++
    const year = pick([2022, 2023, 2024])
    const gyms = int(w * rnd(0.2, 0.6))
    const fields = int(gyms * rnd(1.0, 2.0))
    sportsRows.push({
      sports_id: `SPO${pad(sportsId, 6)}`,
      sgg_cd: cd,
      sigun: name,
      year,
      gyms,
      fields,
      members: int((gyms * 100 + fields * 50) * rnd(0.8, 1.4)),
    })
  }
}
saveSample('sports_facility', sportsRows)

// ── 복지시설 ──
const welfareRows: Record<string, string | number | null>[] = []
let welfareId = 0
for (const [cd, name, w] of SIGUN) {
  const n = Math.max(3, int(w / 10))
  for (let i = 0; i < n; i++) {
    welfareId++
    const year = pick([2022, 2023, 2024])
    const centers = int(w * rnd(0.15, 0.45))
    const beneficiaries = int(centers * rnd(300, 900))
    welfareRows.push({
      welfare_id: `WEL${pad(welfareId, 6)}`,
      sgg_cd: cd,
      sigun: name,
      year,
      centers,
      beneficiaries,
      budget: int(beneficiaries * rnd(0.1, 0.3)),
    })
  }
}
saveSample('welfare_facility', welfareRows)

// ── 관광 ──
const tourismRows: Record<string, string | number | null>[] = []
let tourismId = 0
for (const [cd, name, w] of SIGUN) {
  const n = Math.max(3, int(w / 14))
  for (let i = 0; i < n; i++) {
    tourismId++
    const year = pick([2022, 2023, 2024])
    const attractions = int(w * rnd(0.2, 0.5))
    const visitors = int(attractions * rnd(3000, 9000))
    tourismRows.push({
      tourism_id: `TRM${pad(tourismId, 6)}`,
      sgg_cd: cd,
      sigun: name,
      year,
      attractions,
      visitors,
      revenue: int(visitors * rnd(5, 20)),
    })
  }
}
saveSample('tourism', tourismRows)

console.log(`[2/2] ${SAMPLES_DIR} 샘플 데이터 생성 완료 (총 12개 주제)` )
