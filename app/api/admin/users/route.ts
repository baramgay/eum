import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!

function adminHeaders() {
  return {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'apikey':        SERVICE_KEY,
  }
}

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })
  if (user.user_metadata?.role !== 'center')
    return NextResponse.json({ error: '센터 권한이 필요합니다' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const page     = searchParams.get('page') ?? '1'
  const perPage  = searchParams.get('per_page') ?? '100'

  const res = await fetch(
    `${SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=${perPage}`,
    { headers: adminHeaders() },
  )
  if (!res.ok) {
    const err = await res.json()
    return NextResponse.json({ error: err.message ?? '사용자 조회 실패' }, { status: res.status })
  }

  const raw = await res.json() as { users?: Array<Record<string, unknown>> }
  const users = (raw.users ?? []).map(u => ({
    id:              u.id,
    email:           u.email,
    role:            (u.user_metadata as Record<string, unknown>)?.role ?? 'viewer',
    tenant_id:       (u.user_metadata as Record<string, unknown>)?.tenant_id ?? null,
    created_at:      u.created_at,
    last_sign_in_at: u.last_sign_in_at,
    confirmed_at:    u.confirmed_at,
    banned_until:    u.banned_until,
  }))

  return NextResponse.json({ users })
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })
  if (user.user_metadata?.role !== 'center')
    return NextResponse.json({ error: '센터 권한이 필요합니다' }, { status: 403 })

  const body: {
    email?: string; password?: string
    role?: string; tenant_id?: string
  } = await req.json()

  if (!body.email || !body.password)
    return NextResponse.json({ error: 'email과 password는 필수입니다' }, { status: 400 })

  const meta: Record<string, string> = { role: body.role ?? 'viewer' }
  if (body.tenant_id) meta.tenant_id = body.tenant_id

  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify({
      email:         body.email,
      password:      body.password,
      email_confirm: true,
      user_metadata: meta,
    }),
  })

  if (!res.ok) {
    const err = await res.json()
    return NextResponse.json({ error: err.message ?? '사용자 생성 실패' }, { status: res.status })
  }

  const created = await res.json() as Record<string, unknown>
  return NextResponse.json({
    ok: true,
    user: { id: created.id, email: created.email },
  })
}
