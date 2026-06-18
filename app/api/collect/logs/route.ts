import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const MAX_LIMIT = 100

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })

  const role       = user.user_metadata?.role as string
  const userTenant = user.user_metadata?.tenant_id as string

  const { searchParams } = new URL(req.url)
  const sourceId = searchParams.get('source_id') ?? undefined
  const status   = searchParams.get('status') ?? undefined
  const limit    = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), MAX_LIMIT)
  const offset   = Math.max(parseInt(searchParams.get('offset') ?? '0', 10), 0)

  let query = supabase
    .from('collection_logs')
    .select('*', { count: 'exact' })
    .order('started_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (role === 'agency') {
    query = query.eq('tenant_id', userTenant)
  }
  if (sourceId) {
    query = query.eq('source_id', sourceId)
  }
  if (status) {
    query = query.eq('status', status)
  }

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ rows: data ?? [], count: count ?? 0, limit, offset })
}
