import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })
  if (user.user_metadata?.role !== 'center')
    return NextResponse.json({ error: '센터 권한이 필요합니다' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const action        = searchParams.get('action')
  const resourceType  = searchParams.get('resource_type')
  const limit         = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200)
  const offset        = parseInt(searchParams.get('offset') ?? '0', 10)

  let query = supabase
    .from('audit_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (action)       query = query.eq('action', action)
  if (resourceType) query = query.eq('resource_type', resourceType)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ logs: data ?? [], total: count ?? 0, limit, offset })
}
