import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { runQuality } from '@/lib/quality'
import { getNextRunAt } from '@/lib/cron'
import { createNotification } from '@/lib/notifications'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  // Vercel Cron 인증
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = await createServiceClient()
  const now = new Date().toISOString()

  // 마감된 스케줄 조회
  const { data: schedules, error: schedulesErr } = await sb
    .from('quality_schedules')
    .select('*')
    .eq('active', true)
    .or(`next_run_at.is.null,next_run_at.lte.${now}`)

  if (schedulesErr) {
    return NextResponse.json({ error: schedulesErr.message }, { status: 500 })
  }

  const results: Array<{ schedule_id: string; dataset_id: string; ran: boolean; next_run_at: string | null }> = []
  const failures: Array<{ schedule_id: string; dataset_id: string; reason: string }> = []

  for (const schedule of (schedules ?? [])) {
    const nextRunAt = getNextRunAt(schedule.cron, new Date())
    const nextIso = nextRunAt ? nextRunAt.toISOString() : null

    try {
      const qualityResult = await runQuality(sb, schedule.dataset_id)

      // 품질 실패 알림
      if (qualityResult && !qualityResult.passed) {
        void (async () => {
          const { data: cat } = await sb
            .from('catalog')
            .select('tenant_id, title')
            .eq('dataset_id', schedule.dataset_id)
            .maybeSingle()
          await createNotification({
            tenant_id: cat?.tenant_id ?? undefined,
            type: 'quality_fail',
            title: `품질 진단 실패 — ${cat?.title ?? schedule.dataset_id}`,
            message: `오류율 ${(qualityResult.error_rate * 100).toFixed(1)}% / 임계 ${(qualityResult.threshold * 100).toFixed(1)}%`,
            link: `/quality?dataset_id=${schedule.dataset_id}`,
          })
        })()
      }

      // 스케줄 메타데이터 갱신
      await sb
        .from('quality_schedules')
        .update({ last_run_at: now, next_run_at: nextIso })
        .eq('id', schedule.id)

      results.push({
        schedule_id: schedule.id,
        dataset_id: schedule.dataset_id,
        ran: qualityResult !== null,
        next_run_at: nextIso,
      })
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      failures.push({ schedule_id: schedule.id, dataset_id: schedule.dataset_id, reason })
      // eslint-disable-next-line no-console
      console.error('[cron/quality] 스케줄 실행 실패:', reason)
    }
  }

  return NextResponse.json({ processed: results.length, failed: failures.length, results, failures })
}
