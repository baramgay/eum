/**
 * 서버 전용 데모 그래프 빌더 — Node.js fs 사용, 클라이언트 컴포넌트에서 임포트 금지
 * 클라이언트 안전 타입/메타데이터는 demo-graph-meta.ts 에서 임포트할 것
 */
import { loadSampleJson } from './core'
import type { OntologyNode, OntologyEdge } from '@/lib/ontology-utils'
import type { OntologyGraphData } from './types'
import type { ScenarioKey } from './demo-graph-meta'

// 클라이언트 안전 exports re-export (API route에서 편의상 사용 가능)
export type { ScenarioKey, ScenarioMeta, NodeKpi } from './demo-graph-meta'
export { SCENARIO_META, extractNodeKpis } from './demo-graph-meta'

/* ────────── 공통 헬퍼 ────────── */

interface YouthRow {
  id: string; sgg_cd: string; sigun: string; year: number
  age_group: string; sex: string; population: number; influx: number; outflow: number
}

interface WelfareRow {
  welfare_id: string; sgg_cd: string; sigun: string; year: number
  centers: number; beneficiaries: number; budget: number
}

interface HospitalRow {
  id: string; sgg_cd: string; sigun: string; year: number
  hospitals: number; beds: number; doctors: number
}

interface CulturalRow {
  id: string; sgg_cd: string; sigun: string; year: number
  facilities: number; programs: number; visitors: number
}

interface SportsRow {
  id: string; sgg_cd: string; sigun: string; year: number
  facilities: number; programs: number; participants: number
}

interface BusinessRow {
  id: string; sgg_cd: string; sigun: string; year: number
  industry: string; business_count: number; employees: number
}

interface TransportRow {
  transport_id: string; sgg_cd: string; sigun: string; year: number
  bus_routes: number; bus_stops: number; subway_stations: number
}

interface AirQualityRow {
  station_id: string; sgg_cd: string; sigun: string; year: number; month: number
  pm10: number; pm25: number; no2: number; o3: number; co: number; so2: number
}

interface WaterRow {
  water_id: string; sgg_cd: string; sigun: string; year: number
  bod: number; cod: number; ph: number; turbidity: number
}

interface AccidentRow {
  accident_id: string; sgg_cd: string; sigun: string; year: number; month: number
  accident_type: string; fatalities: number; injuries: number; property_damage: number
}

interface FireRow {
  safety_id: string; sgg_cd: string; sigun: string; year: number
  cctvs: number; fire_stations: number; safety_cases: number
}

function normalize(values: number[]): number[] {
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (max === min) return values.map(() => 0.5)
  return values.map(v => (v - min) / (max - min))
}

function zScores(values: number[]): number[] {
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const std = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length)
  if (std === 0) return values.map(() => 0)
  return values.map(v => (v - mean) / std)
}

/* ────────── 시나리오 1: 청년 유출 핫스팟 ────────── */

export function buildYouthExodusGraph(): OntologyGraphData {
  const rows = loadSampleJson<YouthRow>('youth_population')
  const latestYear = Math.max(...rows.map(r => r.year))
  const latest = rows.filter(r => r.year === latestYear)

  const sigunMap = new Map<string, { sigun: string; sgg_cd: string; totalPop: number; totalInflux: number; totalOutflow: number }>()
  for (const r of latest) {
    const existing = sigunMap.get(r.sgg_cd)
    if (existing) {
      existing.totalPop += r.population
      existing.totalInflux += r.influx
      existing.totalOutflow += r.outflow
    } else {
      sigunMap.set(r.sgg_cd, { sigun: r.sigun, sgg_cd: r.sgg_cd, totalPop: r.population, totalInflux: r.influx, totalOutflow: r.outflow })
    }
  }

  const sigunList = Array.from(sigunMap.values())
  const popValues = sigunList.map(s => s.totalPop)
  const normPop = normalize(popValues)

  const nodes: OntologyNode[] = sigunList.map((s, i) => {
    const netMigration = s.totalInflux - s.totalOutflow
    const ratio = s.totalPop > 0 ? ((netMigration / s.totalPop) * 100).toFixed(1) : '0'
    return {
      obj_id: `sigun:${s.sgg_cd}`,
      label: s.sigun,
      obj_type: '시군',
      props: `total_youth=${s.totalPop};net_migration=${netMigration};influx=${s.totalInflux};outflow=${s.totalOutflow};migration_rate=${ratio};size=${(normPop[i] * 40 + 15).toFixed(0)};year=${latestYear}`,
    }
  })

  // 상위 hub 시군 (순유입 상위 3개)
  const netList = sigunList.map(s => ({ sgg_cd: s.sgg_cd, net: s.totalInflux - s.totalOutflow }))
  netList.sort((a, b) => b.net - a.net)
  const hubs = new Set(netList.slice(0, 3).map(h => `sigun:${h.sgg_cd}`))

  // 유출이 있는 시군 → 가장 가까운 hub로 엣지
  const edges: OntologyEdge[] = []
  for (const s of sigunList) {
    const net = s.totalInflux - s.totalOutflow
    const nodeId = `sigun:${s.sgg_cd}`
    if (net < 0 && !hubs.has(nodeId)) {
      // 가장 가까운 hub (간단하게 netList 순서로)
      const targetHub = netList[0]
      const srcNetAbs = Math.abs(net)
      edges.push({ src: nodeId, rel: '청년이동', dst: `sigun:${targetHub.sgg_cd}`, weight: Math.round(srcNetAbs / 100) })
    }
  }

  return { nodes, edges }
}

/* ────────── 시나리오 2: 공공서비스 격차 지도 ────────── */

export function buildServiceGapGraph(): OntologyGraphData {
  const welfareRows = loadSampleJson<WelfareRow>('welfare_facility')
  const hospitalRows = loadSampleJson<HospitalRow>('public_hospital')
  const culturalRows = loadSampleJson<CulturalRow>('cultural_facility')
  const sportsRows = loadSampleJson<SportsRow>('sports_facility')

  const latestWelfare = Math.max(...welfareRows.map(r => r.year))
  const latestHospital = Math.max(...hospitalRows.map(r => r.year))
  const latestCultural = Math.max(...culturalRows.map(r => r.year))
  const latestSports = Math.max(...sportsRows.map(r => r.year))

  const welfareBySgg = new Map<string, { sigun: string; centers: number }>()
  for (const r of welfareRows.filter(r => r.year === latestWelfare)) {
    const e = welfareBySgg.get(r.sgg_cd)
    welfareBySgg.set(r.sgg_cd, { sigun: r.sigun, centers: (e?.centers ?? 0) + r.centers })
  }

  const hospitalBySgg = new Map<string, { sigun: string; hospitals: number }>()
  for (const r of hospitalRows.filter(r => r.year === latestHospital)) {
    const e = hospitalBySgg.get(r.sgg_cd)
    hospitalBySgg.set(r.sgg_cd, { sigun: r.sigun, hospitals: (e?.hospitals ?? 0) + r.hospitals })
  }

  const culturalBySgg = new Map<string, { sigun: string; facilities: number }>()
  for (const r of culturalRows.filter(r => r.year === latestCultural)) {
    const e = culturalBySgg.get(r.sgg_cd)
    culturalBySgg.set(r.sgg_cd, { sigun: r.sigun, facilities: (e?.facilities ?? 0) + r.facilities })
  }

  const sportsBySgg = new Map<string, { sigun: string; facilities: number }>()
  for (const r of sportsRows.filter(r => r.year === latestSports)) {
    const e = sportsBySgg.get(r.sgg_cd)
    sportsBySgg.set(r.sgg_cd, { sigun: r.sigun, facilities: (e?.facilities ?? 0) + r.facilities })
  }

  // 시군 집합 (4개 도메인 합집합)
  const allSgg = new Set([...welfareBySgg.keys(), ...hospitalBySgg.keys(), ...culturalBySgg.keys(), ...sportsBySgg.keys()])

  const nodes: OntologyNode[] = []
  const edges: OntologyEdge[] = []

  // 도메인 허브 노드 4개
  const domains = [
    { id: 'domain:welfare', label: '복지시설', type: '서비스도메인', color: '#8B5CF6' },
    { id: 'domain:hospital', label: '의료시설', type: '서비스도메인', color: '#EF4444' },
    { id: 'domain:cultural', label: '문화시설', type: '서비스도메인', color: '#F59E0B' },
    { id: 'domain:sports', label: '체육시설', type: '서비스도메인', color: '#10B981' },
  ]
  for (const d of domains) {
    nodes.push({ obj_id: d.id, label: d.label, obj_type: d.type, props: `color=${d.color}` })
  }

  for (const sgg_cd of allSgg) {
    const welfare = welfareBySgg.get(sgg_cd)
    const hospital = hospitalBySgg.get(sgg_cd)
    const cultural = culturalBySgg.get(sgg_cd)
    const sports = sportsBySgg.get(sgg_cd)
    const sigun = welfare?.sigun ?? hospital?.sigun ?? cultural?.sigun ?? sports?.sigun ?? sgg_cd
    const totalFac = (welfare?.centers ?? 0) + (hospital?.hospitals ?? 0) + (cultural?.facilities ?? 0) + (sports?.facilities ?? 0)

    nodes.push({
      obj_id: `sigun:${sgg_cd}`,
      label: sigun,
      obj_type: '시군',
      props: `welfare=${welfare?.centers ?? 0};hospital=${hospital?.hospitals ?? 0};cultural=${cultural?.facilities ?? 0};sports=${sports?.facilities ?? 0};total_facility=${totalFac}`,
    })

    if (welfare?.centers) edges.push({ src: `sigun:${sgg_cd}`, rel: '시설보유', dst: 'domain:welfare', weight: welfare.centers })
    if (hospital?.hospitals) edges.push({ src: `sigun:${sgg_cd}`, rel: '시설보유', dst: 'domain:hospital', weight: hospital.hospitals })
    if (cultural?.facilities) edges.push({ src: `sigun:${sgg_cd}`, rel: '시설보유', dst: 'domain:cultural', weight: cultural.facilities })
    if (sports?.facilities) edges.push({ src: `sigun:${sgg_cd}`, rel: '시설보유', dst: 'domain:sports', weight: sports.facilities })
  }

  return { nodes, edges }
}

/* ────────── 시나리오 3: 산업 클러스터 분포 ────────── */

export function buildIndustryClusterGraph(): OntologyGraphData {
  const bizRows = loadSampleJson<BusinessRow>('business')
  const transRows = loadSampleJson<TransportRow>('public_transport')
  const latestBiz = Math.max(...bizRows.map(r => r.year))
  const latestTrans = Math.max(...transRows.map(r => r.year))

  // 시군별 업종별 집계
  const sigunIndustry = new Map<string, Map<string, { business_count: number; employees: number }>>()
  const sigunNames = new Map<string, string>()
  for (const r of bizRows.filter(r => r.year === latestBiz)) {
    sigunNames.set(r.sgg_cd, r.sigun)
    if (!sigunIndustry.has(r.sgg_cd)) sigunIndustry.set(r.sgg_cd, new Map())
    const industryMap = sigunIndustry.get(r.sgg_cd)!
    const e = industryMap.get(r.industry)
    industryMap.set(r.industry, {
      business_count: (e?.business_count ?? 0) + r.business_count,
      employees: (e?.employees ?? 0) + r.employees,
    })
  }

  // 대중교통 (시군별 버스노선 합계)
  const transportBySgg = new Map<string, number>()
  for (const r of transRows.filter(r => r.year === latestTrans)) {
    transportBySgg.set(r.sgg_cd, (transportBySgg.get(r.sgg_cd) ?? 0) + r.bus_routes)
  }

  // 업종 노드 (고유 업종)
  const allIndustries = new Set<string>()
  for (const industryMap of sigunIndustry.values()) {
    for (const ind of industryMap.keys()) allIndustries.add(ind)
  }

  const industryColors: Record<string, string> = {
    제조: '#4F46E5', 도소매: '#10B981', 서비스: '#F59E0B', 음식숙박: '#EF4444',
    건설: '#8B5CF6', 교육: '#06B6D4', 의료: '#EC4899', 운수: '#F97316',
  }

  const nodes: OntologyNode[] = []
  const edges: OntologyEdge[] = []

  for (const ind of allIndustries) {
    nodes.push({ obj_id: `industry:${ind}`, label: ind, obj_type: '업종', props: `color=${industryColors[ind] ?? '#94A3B8'}` })
  }

  for (const [sgg_cd, industryMap] of sigunIndustry) {
    const sigun = sigunNames.get(sgg_cd) ?? sgg_cd
    const totalBiz = Array.from(industryMap.values()).reduce((a, b) => a + b.business_count, 0)
    const totalEmp = Array.from(industryMap.values()).reduce((a, b) => a + b.employees, 0)
    const busRoutes = transportBySgg.get(sgg_cd) ?? 0

    nodes.push({
      obj_id: `sigun:${sgg_cd}`,
      label: sigun,
      obj_type: '시군',
      props: `total_biz=${totalBiz};total_emp=${totalEmp};bus_routes=${busRoutes}`,
    })

    for (const [ind, stats] of industryMap) {
      edges.push({ src: `sigun:${sgg_cd}`, rel: '산업집중', dst: `industry:${ind}`, weight: stats.business_count })
    }
  }

  // 시군 간 교통 접근성 엣지 (버스 노선 비슷한 시군끼리)
  const sggList = Array.from(sigunIndustry.keys())
  for (let i = 0; i < sggList.length; i++) {
    for (let j = i + 1; j < sggList.length; j++) {
      const a = transportBySgg.get(sggList[i]) ?? 0
      const b = transportBySgg.get(sggList[j]) ?? 0
      const diff = Math.abs(a - b)
      if (diff < 15 && a > 5 && b > 5) {
        edges.push({ src: `sigun:${sggList[i]}`, rel: '교통연결', dst: `sigun:${sggList[j]}`, weight: Math.min(a, b) })
      }
    }
  }

  return { nodes, edges }
}

/* ────────── 시나리오 4: 환경·안전 취약지역 ────────── */

// 경남 인접 시군 관계 (지리적 인접)
const ADJACENCY: [string, string][] = [
  ['48121', '48127'], ['48121', '48220'], ['48121', '48240'],
  ['48127', '48220'], ['48127', '48350'],
  ['48170', '48220'], ['48170', '48310'],
  ['48220', '48240'], ['48220', '48250'],
  ['48240', '48250'], ['48240', '48270'],
  ['48250', '48270'], ['48250', '48310'],
  ['48270', '48310'], ['48270', '48820'],
  ['48310', '48330'], ['48310', '48850'],
  ['48330', '48350'], ['48330', '48730'],
  ['48350', '48730'], ['48350', '48820'],
  ['48730', '48820'], ['48730', '48840'],
  ['48820', '48850'], ['48840', '48850'],
]

export function buildEnvRiskGraph(): OntologyGraphData {
  const airRows = loadSampleJson<AirQualityRow>('air_quality')
  const accRows = loadSampleJson<AccidentRow>('traffic_accidents')
  const fireRows = loadSampleJson<FireRow>('fire_safety')
  const waterRows = loadSampleJson<{ water_id: string; sgg_cd: string; sigun: string; year: number; bod: number; cod: number; ph: number; turbidity: number }>('water_quality')

  const latestAir = Math.max(...airRows.map(r => r.year))
  const latestAcc = Math.max(...accRows.map(r => r.year))
  const latestFire = Math.max(...fireRows.map(r => r.year))
  const latestWater = Math.max(...waterRows.map(r => r.year))

  const airBySgg = new Map<string, { sigun: string; pm10: number[]; pm25: number[] }>()
  for (const r of airRows.filter(r => r.year === latestAir)) {
    const e = airBySgg.get(r.sgg_cd)
    if (e) { e.pm10.push(r.pm10); e.pm25.push(r.pm25) }
    else airBySgg.set(r.sgg_cd, { sigun: r.sigun, pm10: [r.pm10], pm25: [r.pm25] })
  }

  const accBySgg = new Map<string, { sigun: string; count: number; fatalities: number }>()
  for (const r of accRows.filter(r => r.year === latestAcc)) {
    const e = accBySgg.get(r.sgg_cd)
    accBySgg.set(r.sgg_cd, { sigun: r.sigun, count: (e?.count ?? 0) + 1, fatalities: (e?.fatalities ?? 0) + r.fatalities })
  }

  const fireBySgg = new Map<string, { sigun: string; cases: number; fire_stations: number }>()
  for (const r of fireRows.filter(r => r.year === latestFire)) {
    const e = fireBySgg.get(r.sgg_cd)
    fireBySgg.set(r.sgg_cd, { sigun: r.sigun, cases: (e?.cases ?? 0) + r.safety_cases, fire_stations: (e?.fire_stations ?? 0) + r.fire_stations })
  }

  const waterBySgg = new Map<string, { sigun: string; bod: number[]; turbidity: number[] }>()
  for (const r of waterRows.filter(r => r.year === latestWater)) {
    const e = waterBySgg.get(r.sgg_cd)
    if (e) { e.bod.push(r.bod); e.turbidity.push(r.turbidity) }
    else waterBySgg.set(r.sgg_cd, { sigun: r.sigun, bod: [r.bod], turbidity: [r.turbidity] })
  }

  const allSgg = new Set([...airBySgg.keys(), ...accBySgg.keys(), ...fireBySgg.keys()])

  // 복합 위험 스코어 계산
  const sggList = Array.from(allSgg)
  const rawScores = sggList.map(sgg_cd => {
    const air = airBySgg.get(sgg_cd)
    const acc = accBySgg.get(sgg_cd)
    const fire = fireBySgg.get(sgg_cd)
    const water = waterBySgg.get(sgg_cd)
    const pm10 = air ? air.pm10.reduce((a, b) => a + b, 0) / air.pm10.length : 0
    const pm25 = air ? air.pm25.reduce((a, b) => a + b, 0) / air.pm25.length : 0
    const accidents = acc?.count ?? 0
    const cases = fire?.cases ?? 0
    const bod = water ? water.bod.reduce((a, b) => a + b, 0) / water.bod.length : 0
    return { sgg_cd, pm10, pm25, accidents, cases, bod }
  })

  const pm10Norm = normalize(rawScores.map(s => s.pm10))
  const pm25Norm = normalize(rawScores.map(s => s.pm25))
  const accNorm = normalize(rawScores.map(s => s.accidents))
  const caseNorm = normalize(rawScores.map(s => s.cases))
  const bodNorm = normalize(rawScores.map(s => s.bod))

  const compositeScores = rawScores.map((s, i) =>
    pm10Norm[i] * 0.25 + pm25Norm[i] * 0.25 + accNorm[i] * 0.3 + caseNorm[i] * 0.1 + bodNorm[i] * 0.1
  )
  const zs = zScores(compositeScores)

  const nodes: OntologyNode[] = sggList.map((sgg_cd, i) => {
    const air = airBySgg.get(sgg_cd)
    const acc = accBySgg.get(sgg_cd)
    const fire = fireBySgg.get(sgg_cd)
    const sigun = air?.sigun ?? acc?.sigun ?? fire?.sigun ?? sgg_cd
    const pm10Avg = air ? (air.pm10.reduce((a, b) => a + b, 0) / air.pm10.length).toFixed(1) : '0'
    const pm25Avg = air ? (air.pm25.reduce((a, b) => a + b, 0) / air.pm25.length).toFixed(1) : '0'
    const riskSize = Math.round(compositeScores[i] * 40 + 12)
    return {
      obj_id: `sigun:${sgg_cd}`,
      label: sigun,
      obj_type: '시군',
      props: `risk_score=${compositeScores[i].toFixed(3)};z_score=${zs[i].toFixed(2)};pm10_avg=${pm10Avg};pm25_avg=${pm25Avg};accidents=${acc?.count ?? 0};fire_cases=${fire?.cases ?? 0};size=${riskSize}`,
    }
  })

  const presentSgg = new Set(sggList)
  const edges: OntologyEdge[] = ADJACENCY
    .filter(([a, b]) => presentSgg.has(a) && presentSgg.has(b))
    .map(([a, b]) => ({ src: `sigun:${a}`, rel: '인접', dst: `sigun:${b}`, weight: 1 }))

  return { nodes, edges }
}

/* ────────── 시나리오 디스패처 ────────── */

export function buildDemoGraph(scenario: ScenarioKey): OntologyGraphData {
  switch (scenario) {
    case 'youth-exodus': return buildYouthExodusGraph()
    case 'service-gap': return buildServiceGapGraph()
    case 'industry-cluster': return buildIndustryClusterGraph()
    case 'env-risk': return buildEnvRiskGraph()
  }
}

