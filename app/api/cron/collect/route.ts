import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { runCollection, calcNextRunAt } from '@/lib/collector'
import type { CollectionJob } from '@/lib/collector'

export const runtime = 'nodejs'
export const maxDuration = 300

const PER_JOB_TIMEOUT_MS = 60_000

async function runJobWithTimeout(
  sb: Awaited<ReturnType<typeof createServiceClient>>,
  job: CollectionJob
): Promise<{ job_id: string; source_id: string; logId: string; nextRunAt: string | null }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Job ${job.job_id} timed out after ${PER_JOB_TIMEOUT_MS}ms`))
    }, PER_JOB_TIMEOUT_MS)

    runCollection(sb, job)
      .then(logId => {
        clearTimeout(timer)
        const nextRunAt = calcNextRunAt(job.schedule_type)
        resolve({ job_id: job.job_id, source_id: job.source_id, logId, nextRunAt })
      })
      .catch(err => {
        clearTimeout(timer)
        reject(err)
      })
  })
}

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

  const settled = await Promise.allSettled(
    ((jobs ?? []) as CollectionJob[]).map(job => runJobWithTimeout(sb, job))
  )

  const results: Array<{ job_id: string; source_id: string; logId: string }> = []
  const failures: Array<{ job_id: string; source_id: string; reason: string }> = []

  for (const outcome of settled) {
    if (outcome.status === 'rejected') {
      // 개별 잡 실패는 전체 cron 실행을 중단하지 않음
      const reason = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason)
      // eslint-disable-next-line no-console
      console.error('[cron/collect] 개별 잡 실패:', reason)
      continue
    }

    const { job_id, source_id, logId, nextRunAt } = outcome.value

    // next_run_at 업데이트
    await sb
      .from('collection_jobs')
      .update({ next_run_at: nextRunAt })
      .eq('job_id', job_id)

    results.push({ job_id, source_id, logId })
  }

  // 실패한 잡이 있으면 failures 배열에 담아 응답에 포함(모니터링용)
  for (let i = 0; i < settled.length; i++) {
    const outcome = settled[i]
    if (outcome.status === 'rejected') {
      const job = (jobs ?? [])[i] as CollectionJob
      const reason = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason)
      failures.push({ job_id: job.job_id, source_id: job.source_id, reason })

      // 실패 로그 Supabase에 영속화 (모니터링 대시보드용)
      await sb.from('collection_logs').insert({
        job_id: job.job_id,
        source_id: job.source_id,
        status: 'error',
        message: reason,
        collected_at: new Date().toISOString(),
      }).then(({ error }) => {
        if (error) console.error('[cron/collect] 로그 저장 실패:', error.message)
      })
    }
  }

  return NextResponse.json({ processed: results.length, failed: failures.length, jobs: results, failures })
}
