import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { inferArea } from '@/lib/quality'
import type { RuleDetail } from '@/lib/quality'

type GapStatus = 'green' | 'yellow' | 'red'

interface AreaResult {
  label: string
  status: GapStatus
  value?: number
  unit?: string
  missing?: string[]
}

interface GapReport {
  dataset_id: string
  areas: {
    A: AreaResult
    B: AreaResult
    C: AreaResult
    D: AreaResult
    E: AreaResult
  }
}

interface QualityResultRow {
  dataset_id: string
  table_name: string
  rule_count: number
  checked: number
  errors: number
  error_rate: number
  passed: boolean
  detail: RuleDetail[]
  ran_at: string
}

interface CatalogRow {
  dataset_id: string
  title: string | null
  description: string | null
  category: string | null
  updated_at: string | null
}

function computeAreaA(detail: RuleDetail[], checked: number, ruleCount: number): AreaResult {
  const nullViolations = detail
    .filter(d => (d.area ?? inferArea(d.rule)) === 'completeness')
    .reduce((s, d) => s + d.violations, 0)

  const perRuleChecked = ruleCount > 0 ? checked / ruleCount : 0
  const nullRate = perRuleChecked > 0 ? (nullViolations / perRuleChecked) * 100 : 0
  const value = Number(nullRate.toFixed(2))

  let status: GapStatus = 'green'
  if (value > 5) status = 'red'
  else if (value > 2) status = 'yellow'

  return { label: '완전성', status, value, unit: '%' }
}

function computeAreaB(detail: RuleDetail[]): AreaResult {
  const violations = detail
    .filter(d => {
      const trait = d.niaTrait
      return trait === 'syntacticAccuracy' || trait === 'validity'
    })
    .reduce((s, d) => s + d.violations, 0)

  const status: GapStatus = violations === 0 ? 'green' : violations < 100 ? 'yellow' : 'red'
  return { label: '정확성', status, value: violations, unit: '건' }
}

function computeAreaC(detail: RuleDetail[], checked: number, ruleCount: number): AreaResult {
  const dupViolations = detail
    .filter(d => (d.area ?? inferArea(d.rule)) === 'consistency')
    .reduce((s, d) => s + d.violations, 0)

  const perRuleChecked = ruleCount > 0 ? checked / ruleCount : 0
  const dupRate = perRuleChecked > 0 ? (dupViolations / perRuleChecked) * 100 : 0
  const value = Number(dupRate.toFixed(2))

  let status: GapStatus = 'green'
  if (value > 5) status = 'red'
  else if (value > 1) status = 'yellow'

  return { label: '일관성', status, value, unit: '%' }
}

function computeAreaD(ranAt: string): AreaResult {
  const diffMs = Date.now() - new Date(ranAt).getTime()
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  let status: GapStatus = 'green'
  if (days > 30) status = 'red'
  else if (days > 7) status = 'yellow'

  return { label: '최신성', status, value: days, unit: '일' }
}

function computeAreaE(catalog: CatalogRow): AreaResult {
  const missing: string[] = []
  if (!catalog.title) missing.push('title')
  if (!catalog.description) missing.push('description')
  if (!catalog.category) missing.push('category')

  const status: GapStatus = missing.length === 0 ? 'green' : missing.length >= 2 ? 'red' : 'yellow'
  return { label: '메타데이터', status, missing }
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })

  const datasetId = req.nextUrl.searchParams.get('dataset_id')
  if (!datasetId) return NextResponse.json({ error: 'dataset_id가 필요합니다' }, { status: 400 })

  const [qualityRes, catalogRes] = await Promise.all([
    supabase
      .from('quality_results')
      .select('*')
      .eq('dataset_id', datasetId)
      .order('ran_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('catalog')
      .select('dataset_id, title, description, category, updated_at')
      .eq('dataset_id', datasetId)
      .maybeSingle(),
  ])

  if (!qualityRes.data) {
    return NextResponse.json({ error: '품질 진단 결과가 없습니다' }, { status: 404 })
  }
  if (!catalogRes.data) {
    return NextResponse.json({ error: '카탈로그 데이터가 없습니다' }, { status: 404 })
  }

  const qr = qualityRes.data as QualityResultRow
  const cat = catalogRes.data as CatalogRow
  const detail: RuleDetail[] = Array.isArray(qr.detail) ? qr.detail : []

  const report: GapReport = {
    dataset_id: datasetId,
    areas: {
      A: computeAreaA(detail, qr.checked, qr.rule_count),
      B: computeAreaB(detail),
      C: computeAreaC(detail, qr.checked, qr.rule_count),
      D: computeAreaD(qr.ran_at),
      E: computeAreaE(cat),
    },
  }

  return NextResponse.json(report)
}
