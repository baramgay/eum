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

  // 소스 존재 및 권한 확인
  const { data: src } = await supabase
    .from('collection_sources')
    .select('tenant_id')
    .eq('source_id', id)
    .maybeSingle()

  if (!src) return NextResponse.json({ error: '소스를 찾을 수 없습니다' }, { status: 404 })

  if (role === 'agency' && src.tenant_id !== userTenant) {
    return NextResponse.json({ error: '접근 권한이 없습니다' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('collection_logs')
    .select('log_id,job_id,started_at,finished_at,duration_ms,status,rows_fetched,rows_new,rows_changed,rows_deleted,error_msg,table_name')
    .eq('source_id', id)
    .order('started_at', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
