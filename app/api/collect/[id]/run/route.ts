import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { runCollection } from '@/lib/collector'
import { createNotification } from '@/lib/notifications'
import type { CollectionJob, ProgressEvent } from '@/lib/collector'

type Params = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Params) {
  const { id } = await params

  // CRON_SECRET 헤더 인증 또는 일반 사용자 세션 인증
  const cronSecret = req.headers.get('x-cron-secret')
  const isCron = cronSecret && cronSecret === process.env.CRON_SECRET

  let tenantId: string | undefined
  let role: string | undefined

  if (!isCron) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })
    role     = user.user_metadata?.role as string
    tenantId = user.user_metadata?.tenant_id as string
  }

  const svcClient = await createServiceClient()

  const { data: job, error: jobErr } = await svcClient
    .from('collection_jobs')
    .select('*')
    .eq('source_id', id)
    .maybeSingle()

  if (jobErr) return NextResponse.json({ error: jobErr.message }, { status: 500 })
  if (!job)   return NextResponse.json({ error: '수집 잡을 찾을 수 없습니다' }, { status: 404 })

  if (!isCron && role === 'agency' && job.tenant_id !== tenantId) {
    return NextResponse.json({ error: '접근 권한이 없습니다' }, { status: 403 })
  }

  const wantsSSE = req.headers.get('accept')?.includes('text/event-stream')

  if (wantsSSE) {
    const encoder = new TextEncoder()
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
    const writer = writable.getWriter()

    const send = async (data: object) => {
      try {
        await writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      } catch { /* already closed */ }
    }

    ;(async () => {
      try {
        const logId = await runCollection(
          svcClient,
          job as CollectionJob,
          (progress: ProgressEvent) => { void send(progress) },
        )

        const { data: log } = await svcClient
          .from('collection_logs')
          .select('status,rows_fetched')
          .eq('log_id', logId)
          .maybeSingle()

        const status = log?.status ?? 'success'
        const rowsFetched = log?.rows_fetched ?? 0

        void createNotification({
          tenant_id: job.tenant_id,
          type: status === 'success' || status === 'done' ? 'collection_complete' : 'collection_fail',
          title: status === 'success' || status === 'done'
            ? `수집 완료 — ${job.source_id}`
            : `수집 실패 — ${job.source_id}`,
          message: status === 'success' || status === 'done'
            ? `${rowsFetched.toLocaleString()}행 수집 완료`
            : undefined,
          link: `/collect`,
        })

        void svcClient.from('data_lineage').insert({
          run_type: 'collection',
          run_id: logId,
          source_ids: JSON.stringify([id]),
          target_table: 'collection_logs',
        })

        await send({ type: 'done', log_id: logId, status, rows_fetched: rowsFetched })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        await send({ type: 'error', message })
      } finally {
        try { await writer.close() } catch { /* already closed */ }
      }
    })()

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
      },
    })
  }

  try {
    const logId = await runCollection(svcClient, job as CollectionJob)

    const { data: log } = await svcClient
      .from('collection_logs')
      .select('status,rows_fetched')
      .eq('log_id', logId)
      .maybeSingle()

    const status = log?.status ?? 'success'
    const rowsFetched = log?.rows_fetched ?? 0

    void (async () => {
      const ok = status === 'success' || status === 'done'
      await createNotification({
        tenant_id: job.tenant_id,
        type: ok ? 'collection_complete' : 'collection_fail',
        title: ok ? `수집 완료 — ${job.source_id}` : `수집 실패 — ${job.source_id}`,
        message: ok ? `${rowsFetched.toLocaleString()}행 수집 완료` : undefined,
        link: `/collect`,
      })
    })()

    void svcClient.from('data_lineage').insert({
      run_type: 'collection',
      run_id: logId,
      source_ids: JSON.stringify([id]),
      target_table: 'collection_logs',
    })

    return NextResponse.json({
      log_id:      logId,
      status,
      rows_fetched: rowsFetched,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
