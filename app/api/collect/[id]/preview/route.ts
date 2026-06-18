import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })

  const role       = user.user_metadata?.role as string
  const userTenant = user.user_metadata?.tenant_id as string

  const { data: job } = await supabase
    .from('collection_jobs')
    .select('tenant_id')
    .eq('source_id', id)
    .maybeSingle()

  if (!job) return NextResponse.json({ error: '수집 소스를 찾을 수 없습니다' }, { status: 404 })
  if (role === 'agency' && job.tenant_id !== userTenant) {
    return NextResponse.json({ error: '접근 권한이 없습니다' }, { status: 403 })
  }

  const { data: log } = await supabase
    .from('collection_logs')
    .select('table_name,rows_fetched,finished_at')
    .eq('source_id', id)
    .eq('status', 'success')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!log?.table_name) {
    return NextResponse.json({ preview: [], rows_fetched: 0, finished_at: null })
  }

  const { data: upload } = await supabase
    .from('submission_uploads')
    .select('preview,schema_info')
    .eq('table_name', log.table_name)
    .maybeSingle()

  return NextResponse.json({
    preview:     (upload?.preview as Record<string, unknown>[]) ?? [],
    schema_info: upload?.schema_info ?? [],
    rows_fetched: log.rows_fetched ?? 0,
    finished_at:  log.finished_at,
  })
}
