import { createServiceClient } from '@/lib/supabase/server'
import { computeIndicators } from '@/lib/evaluation'
import { jsonOk } from '@/lib/api'
import { unstable_cache } from 'next/cache'

const getCachedIndicators = unstable_cache(
  async () => {
    const supabase = await createServiceClient()
    return computeIndicators(supabase)
  },
  ['overview-indicators'],
  { revalidate: 60, tags: ['overview'] }
)

function formatDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

export async function GET() {
  const supabase = await createServiceClient()
  const today    = formatDate(new Date())
  const sevenAgo = formatDate(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000))

  const [
    ev,
    { count: analysisToday },
    { count: processToday },
    { count: collectSources },
    { data: collectLogsToday },
    { data: collectLogs7d },
    { data: qualityAll },
  ] = await Promise.all([
    getCachedIndicators(),
    supabase.from('analysis_runs').select('*', { count: 'exact', head: true }).gte('created_at', today),
    supabase.from('processing_runs').select('*', { count: 'exact', head: true }).gte('started_at', today).eq('status', 'done'),
    supabase.from('collection_sources').select('*', { count: 'exact', head: true }),
    supabase.from('collection_logs').select('status,rows_fetched').gte('started_at', today),
    supabase.from('collection_logs').select('started_at,status,rows_fetched').gte('started_at', `${sevenAgo}T00:00:00`).lte('started_at', `${today}T23:59:59`),
    supabase.from('quality_results').select('passed,error_rate,detail'),
  ])

  const lastRunOk   = collectLogsToday?.filter(l => l.status === 'done').length ?? 0
  const lastRunFail = collectLogsToday?.filter(l => l.status === 'error' || l.status === 'failed').length ?? 0
  const rowsToday   = collectLogsToday?.reduce((sum, l) => sum + (l.rows_fetched ?? 0), 0) ?? 0

  const trendMap = new Map<string, { date: string; runs: number; rows: number; ok: number; fail: number }>()
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = formatDate(d)
    trendMap.set(key, { date: key, runs: 0, rows: 0, ok: 0, fail: 0 })
  }
  for (const l of collectLogs7d ?? []) {
    const key = (l.started_at ?? '').slice(0, 10)
    if (!trendMap.has(key)) continue
    const entry = trendMap.get(key)!
    entry.runs += 1
    entry.rows += l.rows_fetched ?? 0
    if (l.status === 'done') entry.ok += 1
    else if (l.status === 'error' || l.status === 'failed') entry.fail += 1
  }
  const trend = Array.from(trendMap.values())

  const qualityPass  = qualityAll?.filter(r => r.passed).length ?? 0
  const qualityTotal = qualityAll?.length ?? 0
  const passRate     = qualityTotal ? (qualityPass / qualityTotal) * 100 : 0
  const issueCounts  = new Map<string, number>()
  for (const r of qualityAll ?? []) {
    for (const d of r.detail ?? []) {
      issueCounts.set(d.rule, (issueCounts.get(d.rule) ?? 0) + d.violations)
    }
  }
  const topIssues = Array.from(issueCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([rule]) => rule)

  const s = ev.summary as Record<string, number>
  return jsonOk({
    overall: ev.overall,
    areas:   ev.areas,
    summary: `데이터셋 ${s.datasets}개 · 개방 ${s.open}개 · AI-Ready ${s.ai_ready}개 · 입주기관 ${s.tenants_on}/${s.tenants_total}`,
    pipeline: {
      collect_sources: collectSources ?? 0,
      last_run_ok:     lastRunOk,
      last_run_fail:   lastRunFail,
      rows_today:      rowsToday,
      process_today:   processToday  ?? 0,
      analysis_today:  analysisToday ?? 0,
    },
    qualityAvg: {
      passRate: Math.round(passRate * 10) / 10,
      topIssues,
    },
    trend,
  }, {
    headers: {
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
    },
  })
}
