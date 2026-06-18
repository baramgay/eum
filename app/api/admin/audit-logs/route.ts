import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const ALLOWED_ACTIONS = [
  'submitted', 'approved', 'rejected', 'review',
  'created_tenant', 'updated_tenant', 'deleted_tenant', 'onboarded_tenant',
  'issued_api_key', 'revoked_api_key',
  'created_user', 'updated_user', 'deleted_user', 'banned_user', 'unbanned_user',
]

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user)
    return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })
  if (user.user_metadata?.role !== 'center')
    return NextResponse.json({ error: '센터 권한이 필요합니다' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const page    = Math.max(1, Number(searchParams.get('page') ?? '1'))
  const perPage = Math.min(100, Math.max(5, Number(searchParams.get('per_page') ?? '20')))
  const action  = searchParams.get('action') ?? ''
  const resourceType = searchParams.get('resource_type') ?? ''
  const search = searchParams.get('search') ?? ''
  const from  = searchParams.get('from') ?? ''
  const to    = searchParams.get('to') ?? ''

  let query = supabase
    .from('audit_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })

  if (action && ALLOWED_ACTIONS.includes(action)) {
    query = query.eq('action', action)
  }
  if (resourceType) {
    query = query.eq('resource_type', resourceType)
  }
  if (from) {
    query = query.gte('created_at', from)
  }
  if (to) {
    query = query.lte('created_at', `${to}T23:59:59`)
  }
  if (search.trim()) {
    const term = search.trim()
    query = query.or(`actor_email.ilike.%${term}%,resource_id.ilike.%${term}%`)
  }

  const { data, error, count } = await query.range((page - 1) * perPage, page * perPage - 1)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    logs: data ?? [],
    pagination: {
      page,
      per_page: perPage,
      total: count ?? 0,
      total_pages: Math.ceil((count ?? 0) / perPage),
    },
  })
}
