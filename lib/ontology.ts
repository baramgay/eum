/**
 * 온톨로지 코어 (app/ontology.py → TypeScript)
 * Gold 데이터를 객체·관계로 승격, YAML 스키마 기반 액션 스코어링
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { load as yamlLoad } from 'js-yaml'
import { readFileSync } from 'fs'
import { join } from 'path'

interface OntologySchema {
  facility_filter: string
  actions: Record<string, {
    name: string
    description: string
    weights: { youth_pop: number; employees: number; facility_gap: number; outmigration: number }
  }>
  keyword_mapping: Record<string, string[]>
}

let _schema: OntologySchema | null = null

function getSchema(): OntologySchema {
  if (!_schema) {
    const p = join(process.cwd(), 'config', 'ontology-schema.yaml')
    _schema = yamlLoad(readFileSync(p, 'utf8')) as OntologySchema
  }
  return _schema
}

export async function buildOntology(supabase: SupabaseClient) {
  const schema = getSchema()

  // 기존 객체/관계 초기화
  await supabase.from('onto_objects').delete().neq('obj_id', 'NEVER_MATCH')
  await supabase.from('onto_links').delete().neq('src', 'NEVER_MATCH')

  const { data: tenants } = await supabase.from('tenants').select('sgg_cd,name,gov_type')
  const objs: Array<{ obj_id: string; obj_type: string; label: string; props: string }> = []
  const links: Array<{ src: string; rel: string; dst: string; weight: number }> = []

  for (const t of tenants ?? []) {
    objs.push({ obj_id: `sigun:${t.sgg_cd}`, obj_type: '시군', label: t.name, props: `유형=${t.gov_type}` })
  }

  const { data: yrData } = await supabase
    .from('gold_youth_population').select('year').order('year', { ascending: false }).limit(1)
  const latest = yrData?.[0]?.year
  if (!latest) return { objects: 0, links: 0, year: null }

  const { data: yp } = await supabase.rpc('agg_youth_pop', { yr: latest })
  for (const r of yp ?? []) {
    const net = Number(r.inf) - Number(r.outf)
    const oid = `youth:${r.sgg_cd}`
    objs.push({ obj_id: oid, obj_type: '청년인구', label: `${r.sigun} 청년`, props: `인구=${r.pop};순이동=${net}` })
    links.push({ src: `sigun:${r.sgg_cd}`, rel: '청년규모', dst: oid, weight: Number(r.pop) })
    links.push({ src: oid, rel: net >= 0 ? '순유입' : '순유출', dst: `sigun:${r.sgg_cd}`, weight: Math.abs(net) })
  }

  const { data: bz } = await supabase.rpc('agg_business', { yr: latest })
  for (const r of bz ?? []) {
    const oid = `biz:${r.sgg_cd}`
    objs.push({ obj_id: oid, obj_type: '사업체', label: `${r.sigun} 사업체`, props: `사업체=${r.bc};종사자=${r.emp}` })
    links.push({ src: `sigun:${r.sgg_cd}`, rel: '산업기반', dst: oid, weight: Number(r.emp) })
  }

  const { data: fac } = await supabase.rpc('agg_facility', { ftype_filter: schema.facility_filter })
  for (const r of fac ?? []) {
    const oid = `fac:${r.sgg_cd}`
    objs.push({ obj_id: oid, obj_type: '청년인프라', label: `${r.sigun} ${schema.facility_filter}`, props: `개수=${r.n}` })
    links.push({ src: `sigun:${r.sgg_cd}`, rel: '보유시설', dst: oid, weight: Number(r.n) })
  }

  if (objs.length)  await supabase.from('onto_objects').insert(objs)
  if (links.length) await supabase.from('onto_links').insert(links)
  return { objects: objs.length, links: links.length, year: latest }
}

export async function getGraph(supabase: SupabaseClient, centerSgg?: string) {
  if (centerSgg) {
    const oids = [`sigun:${centerSgg}`, `youth:${centerSgg}`, `biz:${centerSgg}`, `fac:${centerSgg}`]
    const { data: nodes } = await supabase.from('onto_objects').select('*').in('obj_id', oids)
    const { data: edges } = await supabase.from('onto_links').select('*')
      .or(`src.in.(${oids.join(',')}),dst.in.(${oids.join(',')})`)
    return { nodes: nodes ?? [], edges: edges ?? [] }
  }
  const { data: nodes } = await supabase.from('onto_objects').select('*')
  const { data: edges } = await supabase.from('onto_links').select('*')
  return { nodes: nodes ?? [], edges: edges ?? [] }
}

export function recommendOntologyCandidates(meta: Record<string, unknown>) {
  const schema = getSchema()
  const text = [meta.title, meta.description, meta.theme, meta.keywords]
    .map(v => String(v ?? '')).join(' ').toLowerCase()

  const results: Array<{ obj_type: string; matched_keywords: string[]; match_score: number; reason: string }> = []
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

export function listActions() {
  const schema = getSchema()
  return Object.entries(schema.actions).map(([key, v]) => ({
    key, name: v.name, description: v.description,
  }))
}

export async function scoreAction(supabase: SupabaseClient, actionKey: string, top = 10) {
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
  if (!rows?.length) return []

  const w = action.weights
  const mxPop = Math.max(...rows.map((r: any) => Number(r.pop))) || 1
  const mxEmp = Math.max(...rows.map((r: any) => Number(r.emp))) || 1
  const mxFac = Math.max(...rows.map((r: any) => Number(r.fac))) || 1
  const mxOut = Math.max(...rows.map((r: any) => Math.abs(Math.min(0, Number(r.net))))) || 1

  const out = rows.map((r: any) => {
    const pop = Number(r.pop); const net = Number(r.net)
    const emp = Number(r.emp); const fac = Number(r.fac)
    const score = (
      w.youth_pop    * (pop / mxPop) +
      w.employees    * (emp / mxEmp) +
      w.facility_gap * (1 - fac / mxFac) +
      w.outmigration * (Math.abs(Math.min(0, net)) / mxOut)
    ) * 100
    return {
      sgg_cd: r.sgg_cd, sigun: r.sigun,
      youth_pop: pop, net_migration: net, employees: emp, youth_centers: fac,
      priority_score: Math.round(score * 10) / 10,
    }
  }).sort((a: any, b: any) => b.priority_score - a.priority_score)

  return out.slice(0, top).map((o: any, i: number) => ({ ...o, rank: i + 1 }))
}
