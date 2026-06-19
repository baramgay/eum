import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendEmail, CENTER_EMAIL } from '@/lib/email'
import { summarizeAccessLogs } from '@/lib/telemetry'

const ALERT_EMAIL_TO = process.env.ALERT_EMAIL_TO ?? CENTER_EMAIL

export const runtime = 'nodejs'

const ONE_HOUR_MS = 60 * 60 * 1000

const THRESHOLDS = {
  api5xxRate: 0.05,
  failedCollections: 3,
  failedProcesses: 3,
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = await createServiceClient()
  const since = new Date(Date.now() - ONE_HOUR_MS).toISOString()

  const [
    { data: accessLogs },
    { data: failedCollections },
    { data: failedProcesses },
  ] = await Promise.all([
    sb
      .from('api_access_logs')
      .select('status_code, response_ms, ts, error')
      .gte('ts', since)
      .limit(5000),
    sb
      .from('collection_logs')
      .select('log_id, source_id, error_msg')
      .eq('status', 'failed')
      .gte('started_at', since)
      .limit(100),
    sb
      .from('processing_runs')
      .select('id, pipeline_id, error_log')
      .eq('status', 'failed')
      .gte('started_at', since)
      .limit(100),
  ])

  const api = summarizeAccessLogs((accessLogs ?? []) as unknown as Parameters<typeof summarizeAccessLogs>[0])

  const alerts: string[] = []

  if (api.errorRate > THRESHOLDS.api5xxRate) {
    alerts.push(`API 5xx 비율 ${(api.errorRate * 100).toFixed(1)}% (임계 ${THRESHOLDS.api5xxRate * 100}%)`)
  }
  if ((failedCollections ?? []).length >= THRESHOLDS.failedCollections) {
    alerts.push(`수집 실패 ${(failedCollections ?? []).length}건 (임계 ${THRESHOLDS.failedCollections}건)`)
  }
  if ((failedProcesses ?? []).length >= THRESHOLDS.failedProcesses) {
    alerts.push(`가공 실패 ${(failedProcesses ?? []).length}건 (임계 ${THRESHOLDS.failedProcesses}건)`)
  }

  if (alerts.length > 0) {
    const subject = `[EUM] 시스템 알림 — ${alerts.length}개 지표 임계 초과`
    const failedSourceList = (failedCollections ?? [])
      .slice(0, 10)
      .map(c => `<li>소스 ${c.source_id}: ${c.error_msg ?? '오류 없음'}</li>`)
      .join('')
    const html = `
      <p>EUM 플랫폼 모니터링 시스템에서 다음 임계 초과를 감지했습니다.</p>
      <ul>
        ${alerts.map(a => `<li>${a}</li>`).join('')}
      </ul>
      ${failedSourceList ? `<p><strong>수집 실패 소스 목록:</strong></p><ul>${failedSourceList}</ul>` : ''}
      <p>기준 시각: ${new Date(since).toLocaleString('ko-KR')}</p>
      <p><a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001'}/admin/monitoring">모니터링 페이지로 이동</a></p>
    `
    const recipient = ALERT_EMAIL_TO
    await sendEmail(recipient, subject, html)
    await sb.from('alert_logs').insert({
      alerted_at: new Date().toISOString(),
      recipient,
      subject,
      alerts,
      failed_collections: (failedCollections ?? []).length,
      failed_processes: (failedProcesses ?? []).length,
      api_error_rate: api.errorRate,
    })
  }

  return NextResponse.json({
    alerted: alerts.length > 0,
    alerts,
    api,
    failedCollections: (failedCollections ?? []).length,
    failedProcesses: (failedProcesses ?? []).length,
  })
}
