import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { computeIndicators } from '@/lib/evaluation'

export async function GET() {
  const supabase = await createClient()
  const today    = new Date().toISOString().slice(0, 10)

  const [
    ev,
    { count: analysisToday },
    { count: processToday },
    { count: collectSources },
    { data: collectLogsToday },
    { data: qualityAll },
  ] = await Promise.all([
    computeIndicators(supabase),
    supabase.from('analysis_runs').select('*', { count: 'exact', head: true }).gte('created_at', today),
    supabase.from('processing_runs').select('*', { count: 'exact', head: true }).gte('started_at', today).eq('status', 'done'),
    supabase.from('collection_sources').select('*', { count: 'exact', head: true }),
    supabase.from('collection_logs').select('status,rows_fetched').gte('started_at', today),
    supabase.from('quality_results').select('passed,error_rate,detail'),
  ])

  const lastRunOk   = collectLogsToday?.filter(l => l.status === 'done').length ?? 0
  const lastRunFail = collectLogsToday?.filter(l => l.status === 'error' || l.status === 'failed').length ?? 0
  const rowsToday   = collectLogsToday?.reduce((sum, l) => sum + (l.rows_fetched ?? 0), 0) ?? 0

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
  return NextResponse.json({
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
  })
}
