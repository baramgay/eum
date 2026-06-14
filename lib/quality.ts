/**
 * 규칙기반 품질진단 엔진 (app/quality.py → TypeScript)
 * gold 테이블: Supabase 쿼리 빌더로 위반 집계
 * 업로드 데이터: 인메모리 JSON 배열 대상 제네릭 검사
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export const ERROR_RATE_THRESHOLD = 0.001
export const GENERIC_THRESHOLD    = 5.0

// 각 규칙: [규칙명, 위반 집계 함수]
type RuleFn = (sb: SupabaseClient) => Promise<number>
type RuleEntry = [string, RuleFn]

export const RULES: Record<string, RuleEntry[]> = {
  gold_youth_population: [
    ['population 음수 금지',    sb => countWhere(sb, 'gold_youth_population', 'population', 'lt', 0)],
    ['population NULL 금지',    sb => countNull(sb,  'gold_youth_population', 'population')],
    ['연령대 코드 유효성',       sb => countNotIn(sb, 'gold_youth_population', 'age_band', ['20-24','25-29','30-34','35-39','20-39'])],
    ['성별 코드 유효성',         sb => countNotIn(sb, 'gold_youth_population', 'sex', ['M','F','total'])],
    ['연도 범위(2018-2025)',     sb => countYearOutOfRange(sb, 'gold_youth_population', 2018, 2025)],
    ['유입/유출 음수 금지',      sb => countTwoLt(sb, 'gold_youth_population', 'inflow', 'outflow')],
  ],
  gold_business: [
    ['사업체수 양수',           sb => countWhere(sb, 'gold_business', 'biz_count', 'lte', 0)],
    ['종사자수 음수 금지',       sb => countWhere(sb, 'gold_business', 'employees', 'lt', 0)],
    ['산업분류 결측 금지',       sb => countNull(sb,  'gold_business', 'industry')],
    ['종사자>=사업체 정합성',    sb => countEmpLtBiz(sb)],
  ],
  gold_public_facility: [
    ['좌표 결측 금지',          sb => countNullLon(sb)],
    ['경도 범위(경남)',          sb => countLonOutOfRange(sb)],
    ['위도 범위(경남)',          sb => countLatOutOfRange(sb)],
    ['정원 양수',               sb => countWhere(sb, 'gold_public_facility', 'capacity', 'lte', 0)],
    ['시설명 결측 금지',         sb => countNull(sb,  'gold_public_facility', 'name')],
  ],
}

// ─── 집계 헬퍼 ───────────────────────────────────────────────────────────────
type CountOp = 'lt' | 'lte' | 'gt' | 'gte' | 'eq' | 'neq'

async function countWhere(sb: SupabaseClient, table: string, col: string, op: CountOp, val: number) {
  const base = sb.from(table).select('*', { count: 'exact', head: true })
  let res: { count: number | null }
  switch (op) {
    case 'lt':  res = await base.lt(col, val); break
    case 'lte': res = await base.lte(col, val); break
    case 'gt':  res = await base.gt(col, val); break
    case 'gte': res = await base.gte(col, val); break
    case 'eq':  res = await base.eq(col, val); break
    case 'neq': res = await base.neq(col, val); break
  }
  return res.count ?? 0
}
async function countNull(sb: SupabaseClient, table: string, col: string) {
  const { count } = await sb.from(table).select('*', { count: 'exact', head: true }).is(col, null)
  return count ?? 0
}
async function countNotIn(sb: SupabaseClient, table: string, col: string, vals: string[]) {
  const { count } = await sb.from(table).select('*', { count: 'exact', head: true }).not(col, 'in', `(${vals.map(v => `"${v}"`).join(',')})`)
  return count ?? 0
}
async function countYearOutOfRange(sb: SupabaseClient, table: string, min: number, max: number) {
  const { count: a } = await sb.from(table).select('*', { count: 'exact', head: true }).lt('year', min)
  const { count: b } = await sb.from(table).select('*', { count: 'exact', head: true }).gt('year', max)
  return (a ?? 0) + (b ?? 0)
}
async function countTwoLt(sb: SupabaseClient, table: string, col1: string, col2: string) {
  const { count: a } = await sb.from(table).select('*', { count: 'exact', head: true }).lt(col1, 0)
  const { count: b } = await sb.from(table).select('*', { count: 'exact', head: true }).lt(col2, 0)
  return (a ?? 0) + (b ?? 0)
}
async function countEmpLtBiz(sb: SupabaseClient) {
  // employees < biz_count — Supabase filter: employees.lt.biz_count 불가, RPC 사용
  const { data } = await sb.rpc('count_emp_lt_biz')
  return Number(data ?? 0)
}
async function countNullLon(sb: SupabaseClient) {
  const { count } = await sb.from('gold_public_facility').select('*', { count: 'exact', head: true }).or('lon.is.null,lat.is.null')
  return count ?? 0
}
async function countLonOutOfRange(sb: SupabaseClient) {
  const { data } = await sb.rpc('count_lon_out_of_range')
  return Number(data ?? 0)
}
async function countLatOutOfRange(sb: SupabaseClient) {
  const { data } = await sb.rpc('count_lat_out_of_range')
  return Number(data ?? 0)
}

// ─── 메인 품질 함수 ──────────────────────────────────────────────────────────
export async function runQuality(supabase: SupabaseClient, datasetId: string) {
  const { data: cat } = await supabase
    .from('catalog').select('table_name').eq('dataset_id', datasetId).single()
  if (!cat || !RULES[cat.table_name]) return null

  const rules = RULES[cat.table_name]
  const { count: totalRows } = await supabase
    .from(cat.table_name).select('*', { count: 'exact', head: true })
  const total = totalRows ?? 0

  const detail = await Promise.all(
    rules.map(async ([rname, fn]) => ({ rule: rname, violations: await fn(supabase) }))
  )
  const errors = detail.reduce((s, r) => s + r.violations, 0)

  const checked = total * rules.length
  const rate    = checked ? (errors / checked) * 100 : 0
  const passed  = rate <= ERROR_RATE_THRESHOLD
  const ranAt   = new Date().toISOString()

  await supabase.from('quality_results').delete().eq('dataset_id', datasetId)
  await supabase.from('quality_results').insert({
    dataset_id: datasetId, rule_count: rules.length, checked, errors,
    error_rate: Math.round(rate * 100000) / 100000,
    passed, detail, ran_at: ranAt,
  })
  return {
    dataset_id: datasetId, table: cat.table_name,
    rule_count: rules.length, checked, errors,
    error_rate: rate, threshold: ERROR_RATE_THRESHOLD,
    passed, detail, ran_at: ranAt,
  }
}

export async function runAll(supabase: SupabaseClient) {
  const { data: rows } = await supabase.from('catalog').select('dataset_id')
  const results = await Promise.all((rows ?? []).map(r => runQuality(supabase, r.dataset_id)))
  return results.filter(Boolean)
}

// ─── 업로드 데이터 제네릭 품질 검사 ─────────────────────────────────────────
export async function runQualityGeneric(
  _supabase: SupabaseClient,
  tableName: string,
  uploadedData: Record<string, unknown>[],
) {
  if (!uploadedData?.length) {
    return {
      table: tableName, rule_count: 0, checked: 0, errors: 0,
      error_rate: 0, threshold: GENERIC_THRESHOLD, passed: true,
      detail: [] as Array<{rule:string;violations:number;threshold:number}>,
      ran_at: new Date().toISOString(),
    }
  }

  const cols = Object.keys(uploadedData[0])
  const rules: Array<{rule:string;violations:number;threshold:number}> = []

  for (const col of cols) {
    const nullCount = uploadedData.filter(r => r[col] == null).length
    rules.push({ rule: `결측치 비율 - ${col}`, violations: nullCount, threshold: GENERIC_THRESHOLD })

    const nums = uploadedData.map(r => r[col]).filter(v => typeof v === 'number') as number[]
    if (nums.length > 0) {
      rules.push({ rule: `음수 이상치 - ${col}`, violations: nums.filter(v => v < 0).length, threshold: GENERIC_THRESHOLD })
    }
  }

  const seen = new Set<string>()
  let dupCount = 0
  for (const row of uploadedData) {
    const key = JSON.stringify(row)
    if (seen.has(key)) dupCount++
    else seen.add(key)
  }
  rules.push({ rule: '중복행 비율', violations: dupCount, threshold: GENERIC_THRESHOLD })

  const errors  = rules.reduce((s, r) => s + r.violations, 0)
  const checked = uploadedData.length * rules.length
  const rate    = checked ? (errors / checked) * 100 : 0
  const passed  = rate <= GENERIC_THRESHOLD

  return {
    table: tableName, rule_count: rules.length, checked, errors,
    error_rate: Math.round(rate * 10000) / 10000,
    threshold: GENERIC_THRESHOLD, passed, detail: rules,
    ran_at: new Date().toISOString(),
  }
}

export function generateQualityRecommendations(diag: {
  checked: number; passed: boolean; error_rate: number; threshold: number;
  detail: Array<{rule:string;violations:number;threshold:number}>
}): string[] {
  if (!diag.checked) return ['데이터 행이 없습니다 — 유효한 데이터를 업로드해 주세요.']
  if (diag.passed)   return []
  const recs: string[] = []
  for (const item of diag.detail) {
    if (item.violations > 0) {
      recs.push(
        `[${item.rule}] 위반 ${item.violations.toLocaleString()}건 — 전체 ${diag.checked.toLocaleString()}행의 ` +
        `${(item.violations / diag.checked * 100).toFixed(2)}% (기준 ${item.threshold}%이하). 해당 컬럼의 오류 데이터를 보완해 주세요.`
      )
    }
  }
  return recs.length ? recs : [`오류율 ${diag.error_rate.toFixed(4)}%가 기준 ${diag.threshold}%를 초과합니다.`]
}
