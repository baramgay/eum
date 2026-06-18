/**
 * 온톨로지 서버 코어
 * Gold 데이터와 data/samples/ 샘플 데이터를 객체·관계로 승격하고,
 * YAML 스키마 기반 액션 스코어링을 수행한다.
 */
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { OntologyGraphData, ScoredRegion, ScoreActionRow, SigunCentroid } from './types'
import type { OntologyNode, OntologyEdge } from '@/lib/ontology-utils'
import { getSchema } from './schema'
import type { OntologySchemaConfig } from './schema'
import { propsToJsonb } from './props-jsonb'
import {
  fetchOntologyNodes,
  fetchOntologyEdges,
  insertOntologyNodes,
  insertOntologyEdges,
  deleteOntologyNodes,
  deleteOntologyEdges,
} from '@/lib/supabase/query-helpers'
import { createServiceClient } from '@/lib/supabase/server'

export interface CandidateResult {
  obj_type: string
  matched_keywords: string[]
  match_score: number
  reason: string
}

export interface ActionListItem {
  key: string
  name: string
  description: string
}

/* ────────────────────────────────────────────────────────────────────────── */
// JSONB 속성 보조

function withPropsJsonb<T extends OntologyNode>(node: T): T {
  node.props_jsonb = propsToJsonb(node.props)
  return node
}

/* ────────────────────────────────────────────────────────────────────────── */
// 샘플 JSON 로드

export function loadSampleJson<T>(name: string): T[] {
  try {
    const p = join(process.cwd(), 'data', 'samples', `${name}.json`)
    const raw = readFileSync(p, 'utf8')
    return JSON.parse(raw) as T[]
  } catch (e) {
    console.warn(`[ontology] 샘플 데이터 로드 실패: ${name}`, e)
    return []
  }
}

export function loadSigunCentroids(): SigunCentroid[] {
  try {
    const p = join(process.cwd(), 'data', 'geo', 'sigun_centroids.json')
    const raw = readFileSync(p, 'utf8')
    return JSON.parse(raw) as SigunCentroid[]
  } catch (e) {
    console.warn('[ontology] 시군 중심좌표 로드 실패', e)
    return []
  }
}

/* ────────────────────────────────────────────────────────────────────────── */
// 추가 샘플 JSON 패턴 로드 (WS-B)

/** 단순 glob 패턴(*.json)을 파일명과 매칭한다 */
function matchSamplePattern(pattern: string, fileName: string): boolean {
  if (!fileName.endsWith('.json')) return false
  const stem = fileName.slice(0, -5)
  const prefix = pattern.slice(0, -5)
  const star = prefix.indexOf('*')
  if (star === -1) return stem === prefix
  const before = prefix.slice(0, star)
  const after = prefix.slice(star + 1)
  return stem.startsWith(before) && stem.endsWith(after)
}

/** data/samples 디렉터리에서 패턴에 맞는 JSON 파일 목록을 반환한다 */
export function listSampleFilesByPattern(pattern: string): string[] {
  try {
    const dir = join(process.cwd(), 'data', 'samples')
    return readdirSync(dir).filter(name => matchSamplePattern(pattern, name))
  } catch (e) {
    console.warn(`[ontology] 샘플 디렉터리 읽기 실패: ${pattern}`, e)
    return []
  }
}

function loadRowsForPattern(pattern: string): Array<{ sgg_cd: string; sigun: string } & Record<string, unknown>> {
  const files = listSampleFilesByPattern(pattern)
  const rows: Array<{ sgg_cd: string; sigun: string } & Record<string, unknown>> = []
  for (const file of files) {
    rows.push(...loadSampleJson<{ sgg_cd: string; sigun: string } & Record<string, unknown>>(file.slice(0, -5)))
  }
  return rows
}

export interface PatternDomainBuilder {
  configKey: keyof OntologySchemaConfig['sample_domains']
  prefix: string
  pattern: string
  weight: (metrics: Record<string, number>) => number
}

/**
 * 패턴에 맞는 모든 샘플 JSON을 읽어 도메인 노드/관계를 생성한다.
 * 동일한 도메인+시군 노드가 이미 존재하면 속성과 연결 가중치를 갱신한다(중복 삽입 방지).
 */
export function buildPatternDomainNodesAndLinks(
  objs: OntologyNode[],
  links: OntologyEdge[],
  builder: PatternDomainBuilder,
  year?: number | null,
) {
  const schema = getSchema()
  const cfg = schema.sample_domains[builder.configKey]
  if (!cfg || !cfg.metrics) return

  const rows = loadRowsForPattern(builder.pattern)
  if (!rows.length) return

  const keys = cfg.metrics.map(m => m.key)
  const aggregate = cfg.metrics[0].aggregate
  const map = aggregate === 'avg' ? avgBySgg(rows, keys) : sumBySgg(rows, keys)
  const yearPart = year ? `;year=${year}` : ''

  const nodeIndex = new Map<string, number>()
  objs.forEach((o, i) => nodeIndex.set(o.obj_id, i))
  const linkIndex = new Map<string, number>()
  links.forEach((l, i) => linkIndex.set(`${l.src}|${l.rel}|${l.dst}`, i))

  for (const m of Object.values(map)) {
    const metrics: Record<string, number> = {}
    for (const k of keys) metrics[k] = Number(m[k] ?? 0)

    const oid = `${builder.prefix}:${m.sgg_cd}`
    const props =
      cfg.metrics
        .map(metric => {
          const v = metrics[metric.key] ?? 0
          const formatted =
            metric.aggregate === 'avg' && typeof metric.fractionDigits === 'number'
              ? v.toFixed(metric.fractionDigits)
              : String(Math.round(v))
          return `${metric.label}=${formatted}`
        })
        .join(';') + yearPart
    const weight = builder.weight(metrics)

    if (nodeIndex.has(oid)) {
      const existing = objs[nodeIndex.get(oid)!]
      existing.props = props
      existing.props_jsonb = propsToJsonb(props)
    } else {
      objs.push(withPropsJsonb({
        obj_id: oid,
        obj_type: cfg.name,
        label: `${m.sigun} ${cfg.name}`,
        props,
      }))
      nodeIndex.set(oid, objs.length - 1)
    }

    const linkKey = `sigun:${m.sgg_cd}|${cfg.relation}|${oid}`
    if (linkIndex.has(linkKey)) {
      links[linkIndex.get(linkKey)!].weight = weight
    } else {
      links.push({ src: `sigun:${m.sgg_cd}`, rel: cfg.relation, dst: oid, weight })
      linkIndex.set(linkKey, links.length - 1)
    }
  }
}

/* ────────────────────────────────────────────────────────────────────────── */
// 공공시설 집계

export interface FacilityRow {
  sgg_cd: string
  sigun: string
  ftype: string
  capacity?: number | null
}

export function aggregateFacilities(
  goldRows: FacilityRow[],
  sampleRows: FacilityRow[],
  filters: string[],
) {
  const map: Record<string, Record<string, { sgg_cd: string; sigun: string; count: number; capacity: number }>> = {}
  for (const ft of filters) map[ft] = {}

  const add = (r: FacilityRow) => {
    if (!filters.includes(r.ftype)) return
    const m = map[r.ftype]
    if (!m[r.sgg_cd]) {
      m[r.sgg_cd] = { sgg_cd: r.sgg_cd, sigun: r.sigun, count: 0, capacity: 0 }
    }
    m[r.sgg_cd].count += 1
    m[r.sgg_cd].capacity += Number(r.capacity ?? 0)
  }

  for (const r of goldRows) add(r)
  for (const r of sampleRows) add(r)
  return map
}

export function buildFacilityNodesAndLinks(
  objs: OntologyNode[],
  links: OntologyEdge[],
  supabase: SupabaseClient,
  year?: number | null,
) {
  return async () => {
    const schema = getSchema()
    const filters = schema.facility_filters?.length ? schema.facility_filters : [schema.facility_filter]

    // DB의 gold_public_facility가 있으면 우선 사용
    const { data: goldFacilities } = await supabase
      .from('gold_public_facility')
      .select('sgg_cd,sigun,ftype,capacity')
    const sampleFacilities = loadSampleJson<FacilityRow>('public_facility')

    const agg = aggregateFacilities((goldFacilities ?? []) as FacilityRow[], sampleFacilities, filters)

    for (const ft of filters) {
      for (const r of Object.values(agg[ft])) {
        const oid = `fac:${ft}:${r.sgg_cd}`
        const yearPart = year ? `;year=${year}` : ''
        objs.push(withPropsJsonb({
          obj_id: oid,
          obj_type: ft,
          label: `${r.sigun} ${ft}`,
          props: `개수=${r.count};수용=${r.capacity}${yearPart}`,
        }))
        links.push({ src: `sigun:${r.sgg_cd}`, rel: '보유시설', dst: oid, weight: r.count })
      }
    }
  }
}

/* ────────────────────────────────────────────────────────────────────────── */
// 샘플 도메인 집계 헬퍼

export interface SggMetricRow {
  sgg_cd: string
  sigun: string
  [key: string]: number | string
}

export function sumBySgg<T extends { sgg_cd: string; sigun: string }>(
  rows: T[],
  keys: string[],
): Record<string, SggMetricRow> {
  const map: Record<string, SggMetricRow> = {}
  for (const r of rows) {
    if (!map[r.sgg_cd]) {
      map[r.sgg_cd] = { sgg_cd: r.sgg_cd, sigun: r.sigun }
      for (const k of keys) map[r.sgg_cd][k] = 0
    }
    for (const k of keys) {
      const v = Number((r as Record<string, unknown>)[k] ?? 0)
      map[r.sgg_cd][k] = (map[r.sgg_cd][k] as number) + (Number.isFinite(v) ? v : 0)
    }
  }
  return map
}

export function avgBySgg<T extends { sgg_cd: string; sigun: string }>(
  rows: T[],
  keys: string[],
): Record<string, SggMetricRow> {
  type Acc = SggMetricRow & { _cnt: number }
  const map: Record<string, Acc> = {}
  for (const r of rows) {
    if (!map[r.sgg_cd]) {
      map[r.sgg_cd] = { sgg_cd: r.sgg_cd, sigun: r.sigun, _cnt: 0 }
      for (const k of keys) map[r.sgg_cd][k] = 0
    }
    map[r.sgg_cd]._cnt += 1
    for (const k of keys) {
      const v = Number((r as Record<string, unknown>)[k] ?? 0)
      if (Number.isFinite(v)) {
        map[r.sgg_cd][k] = (map[r.sgg_cd][k] as number) + v
      }
    }
  }
  for (const m of Object.values(map)) {
    for (const k of keys) {
      m[k] = m._cnt ? (m[k] as number) / m._cnt : 0
    }
    delete (m as { _cnt?: number })._cnt
  }
  return map
}

interface DomainBuilder {
  file: string
  configKey: keyof OntologySchemaConfig['sample_domains']
  prefix: string
  /** 집계할 컬럼 키 (YAML sample_domains.metrics.key와 일치) */
  keys: string[]
  /** 집계 방식 */
  aggregate: 'sum' | 'avg'
  props: (m: Record<string, number>) => string
  weight: (m: Record<string, number>) => number
}

export function buildDomainNodesAndLinks(
  objs: OntologyNode[],
  links: OntologyEdge[],
  builder: DomainBuilder,
  year?: number | null,
) {
  const schema = getSchema()
  const cfg = schema.sample_domains[builder.configKey]
  if (!cfg) return

  const rows = loadSampleJson<{ sgg_cd: string; sigun: string } & Record<string, unknown>>(builder.file)
  const map = builder.aggregate === 'avg'
    ? avgBySgg(rows, builder.keys)
    : sumBySgg(rows, builder.keys)
  const yearPart = year ? `;year=${year}` : ''
  for (const m of Object.values(map)) {
    const oid = `${builder.prefix}:${m.sgg_cd}`
    const metrics: Record<string, number> = {}
    for (const k of builder.keys) metrics[k] = Number(m[k] ?? 0)
    objs.push(withPropsJsonb({
      obj_id: oid,
      obj_type: cfg.name,
      label: `${m.sigun} ${cfg.name}`,
      props: `${builder.props(metrics)}${yearPart}`,
    }))
    links.push({ src: `sigun:${m.sgg_cd}`, rel: cfg.relation, dst: oid, weight: builder.weight(metrics) })
  }
}

/* ────────────────────────────────────────────────────────────────────────── */

export async function buildOntology(supabase: SupabaseClient) {
  const schema = getSchema()

  // 기존 객체/관계 초기화
  await deleteOntologyNodes(supabase)
  await deleteOntologyEdges(supabase)

  const { data: tenants } = await supabase.from('tenants').select('sgg_cd,name,gov_type')
  const centroids = loadSigunCentroids()
  const centroidMap = new Map(centroids.map(c => [c.sgg_cd, c]))
  const objs: OntologyNode[] = []
  const links: OntologyEdge[] = []

  for (const t of tenants ?? []) {
    const c = centroidMap.get(t.sgg_cd)
    const geoPart = c ? `;lat=${c.lat};lng=${c.lng}` : ''
    objs.push(withPropsJsonb({
      obj_id: `sigun:${t.sgg_cd}`,
      obj_type: '시군',
      label: t.name,
      props: `유형=${t.gov_type}${geoPart}`,
    }))
  }

  const { data: yrData } = await supabase
    .from('gold_youth_population').select('year').order('year', { ascending: false }).limit(1)
  const latest = yrData?.[0]?.year
  if (!latest) return { objects: 0, links: 0, year: null }

  const yearPart = latest ? `;year=${latest}` : ''

  const { data: yp } = await supabase.rpc('agg_youth_pop', { yr: latest })
  for (const r of yp ?? []) {
    const net = Number(r.inf) - Number(r.outf)
    const oid = `youth:${r.sgg_cd}`
    objs.push(withPropsJsonb({
      obj_id: oid,
      obj_type: '청년인구',
      label: `${r.sigun} 청년`,
      props: `인구=${r.pop};순이동=${net}${yearPart}`,
    }))
    links.push({ src: `sigun:${r.sgg_cd}`, rel: '청년규모', dst: oid, weight: Number(r.pop) })
    links.push({ src: oid, rel: net >= 0 ? '순유입' : '순유출', dst: `sigun:${r.sgg_cd}`, weight: Math.abs(net) })
  }

  const { data: bz } = await supabase.rpc('agg_business', { yr: latest })
  for (const r of bz ?? []) {
    const oid = `biz:${r.sgg_cd}`
    objs.push(withPropsJsonb({
      obj_id: oid,
      obj_type: '사업체',
      label: `${r.sigun} 사업체`,
      props: `사업체=${r.bc};종사자=${r.emp}${yearPart}`,
    }))
    links.push({ src: `sigun:${r.sgg_cd}`, rel: '산업기반', dst: oid, weight: Number(r.emp) })
  }

  // 공공시설 (유형별) — DB 우선, 없으면 샘플 폴리백
  await buildFacilityNodesAndLinks(objs, links, supabase, latest)()

  // 샘플 데이터 도메인 노드/관계
  buildDomainNodesAndLinks(
    objs, links,
    {
      file: 'traffic_accidents',
      configKey: 'traffic',
      prefix: 'traffic',
      keys: ['fatalities', 'injuries', 'property_damage'],
      aggregate: 'sum',
      props: m => `사고=${Math.round(m.accidents ?? 0)};사망=${Math.round(m.fatalities ?? 0)};부상=${Math.round(m.injuries ?? 0)};재산피해=${Math.round(m.property_damage ?? 0)}`,
      weight: m => (m.fatalities ?? 0) * 10 + (m.injuries ?? 0),
    },
    latest,
  )

  buildDomainNodesAndLinks(
    objs, links,
    {
      file: 'commercial_area',
      configKey: 'commercial',
      prefix: 'commercial',
      keys: ['store_count', 'sales_amount', 'employee_count'],
      aggregate: 'sum',
      props: m => `점포=${Math.round(m.store_count ?? 0)};매출=${Math.round(m.sales_amount ?? 0)};종사자=${Math.round(m.employee_count ?? 0)}`,
      weight: m => (m.sales_amount ?? 0) * 0.001 + (m.employee_count ?? 0),
    },
    latest,
  )

  buildDomainNodesAndLinks(
    objs, links,
    {
      file: 'air_quality',
      configKey: 'air',
      prefix: 'air',
      keys: ['pm10', 'pm25', 'no2', 'o3', 'co', 'so2'],
      aggregate: 'avg',
      props: m => `PM10=${(m.pm10 ?? 0).toFixed(1)};PM25=${(m.pm25 ?? 0).toFixed(1)};NO2=${(m.no2 ?? 0).toFixed(3)};O3=${(m.o3 ?? 0).toFixed(3)}`,
      weight: m => (m.pm10 ?? 0) + (m.pm25 ?? 0) * 2,
    },
    latest,
  )

  buildDomainNodesAndLinks(
    objs, links,
    {
      file: 'public_hospital',
      configKey: 'hospital',
      prefix: 'hospital',
      keys: ['beds', 'doctors', 'nurses'],
      aggregate: 'sum',
      props: m => `병상=${Math.round(m.beds ?? 0)};의사=${Math.round(m.doctors ?? 0)};간호사=${Math.round(m.nurses ?? 0)}`,
      weight: m => (m.beds ?? 0) * 2 + (m.doctors ?? 0) + (m.nurses ?? 0) * 0.5,
    },
    latest,
  )

  buildDomainNodesAndLinks(
    objs, links,
    {
      file: 'school_population',
      configKey: 'school',
      prefix: 'school',
      keys: ['school_count', 'students', 'teachers'],
      aggregate: 'sum',
      props: m => `학교=${Math.round(m.school_count ?? 0)};학생=${Math.round(m.students ?? 0)};교원=${Math.round(m.teachers ?? 0)}`,
      weight: m => (m.students ?? 0) * 0.1 + (m.teachers ?? 0) + (m.school_count ?? 0) * 10,
    },
    latest,
  )

  // 문화/복지/체육/관광 도메인은 패턴으로 여러 샘플 JSON을 추가 수용한다 (WS-B)
  buildDomainNodesAndLinks(
    objs, links,
    {
      file: 'cultural_facility',
      configKey: 'culture',
      prefix: 'culture',
      keys: ['facilities', 'seats', 'events'],
      aggregate: 'sum',
      props: m => `시설=${Math.round(m.facilities ?? 0)};좌석=${Math.round(m.seats ?? 0)};행사=${Math.round(m.events ?? 0)}`,
      weight: m => (m.facilities ?? 0) * 10 + (m.events ?? 0),
    },
    latest,
  )

  buildPatternDomainNodesAndLinks(
    objs, links,
    {
      configKey: 'culture',
      prefix: 'culture',
      pattern: 'culture_f*.json',
      weight: m => (m.facilities ?? 0) * 10 + (m.events ?? 0),
    },
    latest,
  )

  buildPatternDomainNodesAndLinks(
    objs, links,
    {
      configKey: 'welfare',
      prefix: 'welfare',
      pattern: 'welfare_*.json',
      weight: m => (m.centers ?? 0) * 10 + (m.budget ?? 0) * 0.001,
    },
    latest,
  )

  buildPatternDomainNodesAndLinks(
    objs, links,
    {
      configKey: 'sports',
      prefix: 'sports',
      pattern: 'sports_*.json',
      weight: m => (m.gyms ?? 0) * 10 + (m.fields ?? 0) * 5 + (m.members ?? 0) * 0.01,
    },
    latest,
  )

  buildDomainNodesAndLinks(
    objs, links,
    {
      file: 'public_transport',
      configKey: 'transport',
      prefix: 'transport',
      keys: ['bus_routes', 'bus_stops', 'subway_stations'],
      aggregate: 'sum',
      props: m => `버스노선=${Math.round(m.bus_routes ?? 0)};정류장=${Math.round(m.bus_stops ?? 0)};지하철=${Math.round(m.subway_stations ?? 0)}`,
      weight: m => (m.bus_routes ?? 0) * 10 + (m.bus_stops ?? 0) + (m.subway_stations ?? 0) * 50,
    },
    latest,
  )

  buildDomainNodesAndLinks(
    objs, links,
    {
      file: 'housing_stock',
      configKey: 'housing',
      prefix: 'housing',
      keys: ['total_houses', 'apt_houses', 'avg_price'],
      aggregate: 'avg',
      props: m => `총주택=${Math.round(m.total_houses ?? 0)};아파트=${Math.round(m.apt_houses ?? 0)};평균가격=${Math.round(m.avg_price ?? 0)}`,
      weight: m => (m.total_houses ?? 0) * 0.001 + (m.apt_houses ?? 0) * 0.001 + (m.avg_price ?? 0) * 0.0001,
    },
    latest,
  )

  buildDomainNodesAndLinks(
    objs, links,
    {
      file: 'water_quality',
      configKey: 'water',
      prefix: 'water',
      keys: ['bod', 'cod', 'tn', 'tp'],
      aggregate: 'avg',
      props: m => `BOD=${(m.bod ?? 0).toFixed(2)};COD=${(m.cod ?? 0).toFixed(2)};TN=${(m.tn ?? 0).toFixed(2)};TP=${(m.tp ?? 0).toFixed(3)}`,
      weight: m => (m.bod ?? 0) + (m.cod ?? 0) + (m.tn ?? 0) + (m.tp ?? 0) * 10,
    },
    latest,
  )

  buildDomainNodesAndLinks(
    objs, links,
    {
      file: 'fire_safety',
      configKey: 'safety',
      prefix: 'safety',
      keys: ['cctvs', 'fire_stations', 'safety_cases'],
      aggregate: 'sum',
      props: m => `CCTV=${Math.round(m.cctvs ?? 0)};소방서=${Math.round(m.fire_stations ?? 0)};안전사례=${Math.round(m.safety_cases ?? 0)}`,
      weight: m => (m.cctvs ?? 0) + (m.fire_stations ?? 0) * 100 + (m.safety_cases ?? 0) * 10,
    },
    latest,
  )

  // 관광 도메인은 기존 tourism.json과 추가 tourism_*.json을 모두 수용한다 (WS-B)
  buildDomainNodesAndLinks(
    objs, links,
    {
      file: 'tourism',
      configKey: 'tourism',
      prefix: 'tourism',
      keys: ['attractions', 'visitors', 'revenue'],
      aggregate: 'sum',
      props: m => `관광지=${Math.round(m.attractions ?? 0)};방문객=${Math.round(m.visitors ?? 0)};수익=${Math.round(m.revenue ?? 0)}`,
      weight: m => (m.attractions ?? 0) * 100 + (m.visitors ?? 0) * 0.01,
    },
    latest,
  )

  buildPatternDomainNodesAndLinks(
    objs, links,
    {
      configKey: 'tourism',
      prefix: 'tourism',
      pattern: 'tourism_*.json',
      weight: m => (m.attractions ?? 0) * 100 + (m.visitors ?? 0) * 0.01,
    },
    latest,
  )

  if (objs.length) await insertOntologyNodes(supabase, objs)
  if (links.length) await insertOntologyEdges(supabase, links)
  return { objects: objs.length, links: links.length, year: latest }
}

export async function getGraph(supabase: SupabaseClient, centerSgg?: string): Promise<OntologyGraphData> {
  const nodes = await fetchOntologyNodes(supabase)
  const edges = await fetchOntologyEdges(supabase)

  // 모든 edges는 실제 존재하는 node endpoint만 참조하도록 정리
  const nodeIds = new Set(nodes.map(n => n.obj_id))
  const validEdges = edges.filter(e => nodeIds.has(e.src) && nodeIds.has(e.dst))

  if (!centerSgg) return { nodes, edges: validEdges }

  const centerId = `sigun:${centerSgg}`
  const keep = new Set<string>([centerId])
  for (const e of validEdges) {
    if (e.src === centerId) keep.add(e.dst)
    if (e.dst === centerId) keep.add(e.src)
  }
  const filteredNodes = nodes.filter(n => keep.has(n.obj_id))
  const filteredNodeIds = new Set(filteredNodes.map(n => n.obj_id))
  const filteredEdges = validEdges.filter(e => filteredNodeIds.has(e.src) && filteredNodeIds.has(e.dst))
  return { nodes: filteredNodes, edges: filteredEdges }
}

let cachedGraph: ((centerSgg?: string) => Promise<OntologyGraphData>) | null = null

/** unstable_cache 기반 온톨로지 그래프 조회 (lazy initialization) */
export async function getCachedGraph(centerSgg?: string): Promise<OntologyGraphData> {
  if (!cachedGraph) {
    const { unstable_cache } = await import('next/cache')

    // unstable_cache 콜백 낸에서는 Dynamic data source(cookies/headers)에 접근할 수 없다.
    // 온톨로지 그래프는 사용자별 데이터가 아니므로 Service Role 클라이언트를 사용해
    // 쿠키 없이 DB에 접근한다.
    const nextCache = unstable_cache(
      async (sgg: string | undefined) => {
        const supabase = await createServiceClient()
        return getGraph(supabase, sgg || undefined)
      },
      ['ontology-graph'],
      { tags: ['ontology-graph'] },
    ) as (centerSgg?: string) => Promise<OntologyGraphData>

    cachedGraph = async (sgg) => {
      try {
        return await nextCache(sgg)
      } catch (e) {
        // unstable_cache가 실패하면(요청 컨텍스트 부재, 캐시 초기화 오류 등)
        // 사용자에게 500 대신 데이터라도 보여주기 위해 Service Role로 직접 조회한다.
        console.warn('[ontology] unstable_cache lookup failed, falling back to direct query.', e)
        const supabase = await createServiceClient()
        return getGraph(supabase, sgg || undefined)
      }
    }
  }
  return cachedGraph(centerSgg)
}

export function recommendOntologyCandidates(meta: Record<string, unknown>): CandidateResult[] {
  const schema = getSchema()
  const text = ['title', 'description', 'theme', 'keywords']
    .map(k => String(meta[k] ?? '')).join(' ').toLowerCase()

  const results: CandidateResult[] = []
  for (const [objType, kws] of Object.entries(schema.keyword_mapping)) {
    const matched = kws.filter(kw => text.includes(String(kw)))
    if (matched.length) {
      results.push({
        obj_type: objType,
        matched_keywords: matched,
        match_score: matched.length,
        reason: `'${matched.slice(0, 3).join(', ')}' 키워드가 메타데이터에서 발견됨`,
      })
    }
  }
  return results.sort((a, b) => b.match_score - a.match_score)
}

export function listActions(): ActionListItem[] {
  const schema = getSchema()
  return Object.entries(schema.actions).map(([key, v]) => ({
    key, name: v.name, description: v.description,
  }))
}

export async function scoreAction(supabase: SupabaseClient, actionKey: string, top = 10): Promise<ScoredRegion[]> {
  const schema = getSchema()
  const action = schema.actions[actionKey]
  if (!action) return []

  const { data: yrData } = await supabase
    .from('gold_youth_population').select('year').order('year', { ascending: false }).limit(1)
  const latest = yrData?.[0]?.year
  if (!latest) return []

  const { data: rows } = await supabase.rpc('score_action_data', {
    yr: latest, ftype_filter: schema.facility_filter,
  })
  const typedRows = (rows ?? []) as ScoreActionRow[]
  if (!typedRows.length) return []

  const w = action.weights
  const mxPop = Math.max(...typedRows.map(r => Number(r.pop))) || 1
  const mxEmp = Math.max(...typedRows.map(r => Number(r.emp))) || 1
  const mxFac = Math.max(...typedRows.map(r => Number(r.fac))) || 1
  const mxOut = Math.max(...typedRows.map(r => Math.abs(Math.min(0, Number(r.net))))) || 1

  const out = typedRows.map(r => {
    const pop = Number(r.pop); const net = Number(r.net)
    const emp = Number(r.emp); const fac = Number(r.fac)
    const score = (
      w.youth_pop * (pop / mxPop) +
      w.employees * (emp / mxEmp) +
      w.facility_gap * (1 - fac / mxFac) +
      w.outmigration * (Math.abs(Math.min(0, net)) / mxOut)
    ) * 100
    return {
      sgg_cd: r.sgg_cd, sigun: r.sigun,
      youth_pop: pop, net_migration: net, employees: emp, youth_centers: fac,
      priority_score: Math.round(score * 10) / 10,
    }
  }).sort((a, b) => b.priority_score - a.priority_score)

  return out.slice(0, top).map((o, i) => ({ ...o, rank: i + 1 }))
}
