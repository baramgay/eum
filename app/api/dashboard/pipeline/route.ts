import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const revalidate = 60

function today() {
  return new Date().toISOString().slice(0, 10)
}

export interface FailedSource {
  id: string
  name: string
  error_msg: string | null
  started_at: string
}

export interface PipelineDetailData {
  sources_total: number
  last24h_ok: number
  last24h_fail: number
  failed_sources: FailedSource[]
  rows_today: number
  process_waiting: number
  process_running: number
  process_done: number
  process_last_status: 'done' | 'running' | 'queued' | 'error' | null
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const todayStr = `${today()}T00:00:00`

  const [
    { count: sourcesTotal },
    { data: recentLogs },
    { data: processingRuns },
    { data: todayLogs },
  ] = await Promise.all([
    supabase.from('collection_sources').select('id', { count: 'exact', head: true }),
    supabase
      .from('collection_logs')
      .select('source_id, status, rows_collected, started_at, error_msg, collection_sources(name)')
      .gte('started_at', since24h)
      .order('started_at', { ascending: false }),
    supabase
      .from('processing_runs')
      .select('status, started_at')
      .order('started_at', { ascending: false })
      .limit(100),
    supabase
      .from('collection_logs')
      .select('rows_collected')
      .gte('started_at', todayStr),
  ])

  const logs = recentLogs ?? []
  const last24hOk = logs.filter(l => l.status === 'done').length
  const last24hFail = logs.filter(l => l.status === 'error' || l.status === 'failed').length

  const failedSources: FailedSource[] = logs
    .filter(l => l.status === 'error' || l.status === 'failed')
    .slice(0, 10)
    .map(l => ({
      id: l.source_id,
      name: (l.collection_sources as unknown as { name: string } | null)?.name ?? l.source_id,
      error_msg: l.error_msg ?? null,
      started_at: l.started_at,
    }))

  const rowsToday = (todayLogs ?? []).reduce((sum, l) => sum + (l.rows_collected ?? 0), 0)

  const runs = processingRuns ?? []
  const processWaiting = runs.filter(r => r.status === 'queued').length
  const processRunning = runs.filter(r => r.status === 'running').length
  const processDone    = runs.filter(r => r.status === 'done').length
  const lastRun        = runs[0] ?? null

  return NextResponse.json({
    sources_total:        sourcesTotal ?? 0,
    last24h_ok:           last24hOk,
    last24h_fail:         last24hFail,
    failed_sources:       failedSources,
    rows_today:           rowsToday,
    process_waiting:      processWaiting,
    process_running:      processRunning,
    process_done:         processDone,
    process_last_status:  lastRun?.status ?? null,
  } satisfies PipelineDetailData)
}
