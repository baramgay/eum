import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { runCollection, newJobId, calcNextRunAt } from '@/lib/collector'
import type { CollectionJob } from '@/lib/collector'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  // Vercel Cron 인증
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = await createServiceClient()
  const now = new Date()

  // schedule_type이 manual이 아니고 next_run_at이 지났거나 null인 잡 조회
  const { data: jobs, error: jobsErr } = await sb
    .from('collection_jobs')
    .select('*')
    .neq('schedule_type', 'manual')
    .eq('enabled', true)
    .or(`next_run_at.is.null,next_run_at.lte.${now.toISOString()}`)

  if (jobsErr) {
    return NextResponse.json({ error: jobsErr.message }, { status: 500 })
  }

  const results: Array<{ job_id: string; source_id: string; logId: string }> = []

  for (const job of (jobs ?? []) as CollectionJob[]) {
    try {
      const logId = await runCollection(sb, job)

      // next_run_at 업데이트
      const nextRunAt = calcNextRunAt(job.schedule_type)
      await sb
        .from('collection_jobs')
        .update({ next_run_at: nextRunAt })
        .eq('job_id', job.job_id)

      results.push({ job_id: job.job_id, source_id: job.source_id, logId })
    } catch {
      // 개별 잡 실패는 전체 cron 실행을 중단하지 않음
    }
  }

  return NextResponse.json({ processed: results.length, jobs: results })
}
