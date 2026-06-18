import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { logAction } from '@/lib/audit'
import { SlidingWindowRateLimiter } from '@/lib/rate-limit'
import { createUserSchema, paginationSchema, isPasswordCompliant } from '@/lib/admin/users'

export const dynamic = 'force-dynamic'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!

/** 관리자 API 전용 메모리 속도 제한기 (분산 환경에서는 Redis 기반으로 교체 권장) */
const adminRateLimiter = new SlidingWindowRateLimiter(60_000, 30)

function adminHeaders() {
  return {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'apikey':        SERVICE_KEY,
  }
}

function rateLimitResponse(result: { allowed: boolean; remaining: number; resetAt: number }) {
  return NextResponse.json(
    { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
    {
      status: 429,
      headers: {
        'X-RateLimit-Limit': '30',
        'X-RateLimit-Remaining': String(result.remaining),
        'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
      },
    }
  )
}

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })
  if (user.user_metadata?.role !== 'center')
    return NextResponse.json({ error: '센터 권한이 필요합니다' }, { status: 403 })

  const limit = adminRateLimiter.isAllowed(`admin:read:${user.id}`)
  if (!limit.allowed) return rateLimitResponse(limit)

  const { searchParams } = new URL(req.url)
  const { page, per_page } = paginationSchema.parse({
    page: searchParams.get('page') ?? '1',
    per_page: searchParams.get('per_page') ?? '20',
  })

  const res = await fetch(
    `${SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=${per_page}`,
    { headers: adminHeaders() },
  )
  if (!res.ok) {
    const err = await res.json()
    return NextResponse.json({ error: err.message ?? '사용자 조회 실패' }, { status: res.status })
  }

  const raw = await res.json() as { users?: Array<Record<string, unknown>>; total?: number; length?: number }
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

  return NextResponse.json({
    users,
    pagination: {
      page,
      per_page,
      total: raw.total ?? users.length,
    },
  })
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })
  if (user.user_metadata?.role !== 'center')
    return NextResponse.json({ error: '센터 권한이 필요합니다' }, { status: 403 })

  const limit = adminRateLimiter.isAllowed(`admin:write:${user.id}`)
  if (!limit.allowed) return rateLimitResponse(limit)

  let body: z.infer<typeof createUserSchema>
  try {
    body = createUserSchema.parse(await req.json())
  } catch (e) {
    const msg = e instanceof z.ZodError ? e.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join(', ') : '잘못된 요청입니다'
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  if (!isPasswordCompliant(body.password)) {
    return NextResponse.json(
      { error: '비밀번호는 8자 이상이며 영문 대소문자와 숫자를 포함해야 합니다' },
      { status: 400 }
    )
  }

  const meta: Record<string, string | null> = { role: body.role }
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
  void logAction(
    supabase,
    user,
    'created_user',
    'user',
    String(created.id),
    undefined,
    { email: body.email, role: body.role, tenant_id: body.tenant_id ?? null },
    req,
  )
  return NextResponse.json({
    ok: true,
    user: { id: created.id, email: created.email },
  })
}
