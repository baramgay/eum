import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const PREVIEW_LIMIT = 20

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const logId = searchParams.get('log_id')
  if (!logId) return NextResponse.json({ error: 'log_id가 필요합니다' }, { status: 400 })

  const role       = user.user_metadata?.role as string
  const userTenant = user.user_metadata?.tenant_id as string

  const { data: log } = await supabase
    .from('collection_logs')
    .select('log_id, source_id, tenant_id, table_name, status')
    .eq('log_id', logId)
    .maybeSingle()

  if (!log) return NextResponse.json({ error: '수집 로그를 찾을 수 없습니다' }, { status: 404 })
  if (role === 'agency' && log.tenant_id !== userTenant) {
    return NextResponse.json({ error: '접근 권한이 없습니다' }, { status: 403 })
  }

  if (!log.table_name) {
    return NextResponse.json({ preview: [], message: '미리보기 데이터 없음' })
  }

  const { data: upload } = await supabase
    .from('submission_uploads')
    .select('preview')
    .eq('table_name', log.table_name)
    .maybeSingle()

  const rawPreview = (upload?.preview as Record<string, unknown>[] | null) ?? []
  const preview = rawPreview.slice(0, PREVIEW_LIMIT)

  if (preview.length === 0) {
    return NextResponse.json({ preview: [], message: '미리보기 데이터 없음' })
  }

  return NextResponse.json({ preview })
}
