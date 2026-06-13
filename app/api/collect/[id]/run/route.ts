import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { runCollection } from '@/lib/collector'
import type { CollectionJob } from '@/lib/collector'

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

  try {
    const logId = await runCollection(svcClient, job as CollectionJob)

    const { data: log } = await svcClient
      .from('collection_logs')
      .select('status,rows_fetched')
      .eq('log_id', logId)
      .maybeSingle()

    return NextResponse.json({
      log_id:      logId,
      status:      log?.status ?? 'success',
      rows_fetched: log?.rows_fetched ?? 0,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
