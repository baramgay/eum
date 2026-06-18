import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { summarizeAccessLogs } from '@/lib/telemetry'

const ONE_HOUR_MS = 60 * 60 * 1000

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })
  if (user.user_metadata?.role !== 'center') {
    return NextResponse.json({ error: '센터 권한이 필요합니다' }, { status: 403 })
  }

  const service = await createServiceClient()
  const since = new Date(Date.now() - ONE_HOUR_MS).toISOString()

  const [
    { data: accessLogs },
    { data: activeCollections },
    { data: failedCollections },
    { data: activeProcesses },
    { data: failedProcesses },
  ] = await Promise.all([
    service
      .from('api_access_logs')
      .select('status_code, response_ms, ts, error')
      .gte('ts', since)
      .order('ts', { ascending: false })
      .limit(5000),
    service
      .from('collection_logs')
      .select('log_id')
      .eq('status', 'running')
      .limit(100),
    service
      .from('collection_logs')
      .select('log_id')
      .eq('status', 'failed')
      .gte('started_at', since)
      .limit(100),
    service
      .from('processing_runs')
      .select('id')
      .eq('status', 'running')
      .limit(100),
    service
      .from('processing_runs')
      .select('id')
      .eq('status', 'failed')
      .gte('started_at', since)
      .limit(100),
  ])

  const api = summarizeAccessLogs((accessLogs ?? []) as unknown as Parameters<typeof summarizeAccessLogs>[0])

  return NextResponse.json({
    api,
    activeJobs: {
      collections: (activeCollections ?? []).length,
      processes: (activeProcesses ?? []).length,
    },
    failures: {
      collections: (failedCollections ?? []).length,
      processes: (failedProcesses ?? []).length,
    },
    window: { since, minutes: 60 },
  })
}
