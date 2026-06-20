import { createClient, createServiceClient } from '@/lib/supabase/server'
import { runCollection } from '@/lib/collector'
import type { CollectionJob, ProgressEvent } from '@/lib/collector'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return new Response('data: {"type":"error","message":"인증이 필요합니다"}\n\n', {
      status: 401,
      headers: { 'Content-Type': 'text/event-stream' },
    })
  }

  const role     = user.user_metadata?.role as string
  const tenantId = user.user_metadata?.tenant_id as string

  const svcClient = await createServiceClient()

  const { data: job, error: jobErr } = await svcClient
    .from('collection_jobs')
    .select('*')
    .eq('source_id', id)
    .maybeSingle()

  if (jobErr || !job) {
    const msg = jobErr?.message ?? '수집 잡을 찾을 수 없습니다'
    return new Response(`data: ${JSON.stringify({ type: 'error', message: msg })}\n\n`, {
      status: jobErr ? 500 : 404,
      headers: { 'Content-Type': 'text/event-stream' },
    })
  }

  if (role === 'agency' && job.tenant_id !== tenantId) {
    return new Response('data: {"type":"error","message":"접근 권한이 없습니다"}\n\n', {
      status: 403,
      headers: { 'Content-Type': 'text/event-stream' },
    })
  }

  const encoder = new TextEncoder()
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  const writer = writable.getWriter()

  const send = async (event: string, data: object) => {
    try {
      await writer.write(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
    } catch { }
  }

  ;(async () => {
    try {
      await send('progress', { fetched: 0, total: null, status: 'start' })

      const logId = await runCollection(
        svcClient,
        job as CollectionJob,
        (p: ProgressEvent) => {
          if (p.type === 'progress') {
            void send('progress', { fetched: p.fetched, total: p.total, status: 'fetching' })
          }
          if (p.type === 'fetched') {
            void send('progress', { fetched: p.rows, total: p.total, status: 'saving' })
          }
        },
      )

      const { data: log } = await svcClient
        .from('collection_logs')
        .select('status,rows_fetched,duration_ms')
        .eq('log_id', logId)
        .maybeSingle()

      await send('done', {
        rows:     log?.rows_fetched ?? 0,
        duration: log?.duration_ms  ?? 0,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await send('error', { message })
    } finally {
      try { await writer.close() } catch { }
    }
  })()

  return new Response(readable, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  })
}
