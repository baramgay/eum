import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { logAction } from '@/lib/audit'
import { SlidingWindowRateLimiter } from '@/lib/rate-limit'
import { updateUserSchema } from '@/lib/admin/users'

export const dynamic = 'force-dynamic'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!

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

async function requireCenter() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.user_metadata?.role !== 'center') return null
  return user
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const actor = await requireCenter()
  if (!actor)
    return NextResponse.json({ error: '센터 권한이 필요합니다' }, { status: 403 })

  const limit = adminRateLimiter.isAllowed(`admin:write:${actor.id}`)
  if (!limit.allowed) return rateLimitResponse(limit)

  let body: z.infer<typeof updateUserSchema>
  try {
    body = updateUserSchema.parse(await req.json())
  } catch (e) {
    const msg = e instanceof z.ZodError ? e.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join(', ') : '잘못된 요청입니다'
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  const getRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, {
    headers: adminHeaders(),
  })
  let before: Record<string, unknown> | null = null
  if (getRes.ok) {
    const u = await getRes.json() as Record<string, unknown>
    before = {
      role: (u.user_metadata as Record<string, unknown>)?.role,
      tenant_id: (u.user_metadata as Record<string, unknown>)?.tenant_id,
      banned_until: u.banned_until,
    }
  }

  const meta: Record<string, unknown> = {}
  if (body.role !== undefined)      meta.role      = body.role
  if (body.tenant_id !== undefined) meta.tenant_id = body.tenant_id

  const payload: Record<string, unknown> = { user_metadata: meta }
  if (body.banned_until !== undefined) {
    payload.banned_until = body.banned_until
  }

  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, {
    method: 'PUT',
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const err = await res.json()
    return NextResponse.json({ error: err.message ?? '수정 실패' }, { status: res.status })
  }

  const after = { role: meta.role, tenant_id: meta.tenant_id, banned_until: payload.banned_until }
  let action: import('@/lib/audit').AuditAction = 'updated_user'
  if (body.banned_until !== undefined && before) {
    const wasBanned = before.banned_until && new Date(String(before.banned_until)) > new Date()
    const willBeBanned = after.banned_until && new Date(String(after.banned_until)) > new Date()
    if (!wasBanned && willBeBanned) action = 'banned_user'
    if (wasBanned && !willBeBanned) action = 'unbanned_user'
  }

  void logAction(
    (await createClient()),
    actor,
    action,
    'user',
    id,
    before ?? undefined,
    after,
    req,
  )

  return NextResponse.json({ ok: true })
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const actor = await requireCenter()
  if (!actor)
    return NextResponse.json({ error: '센터 권한이 필요합니다' }, { status: 403 })

  const limit = adminRateLimiter.isAllowed(`admin:write:${actor.id}`)
  if (!limit.allowed) return rateLimitResponse(limit)

  const getRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, {
    headers: adminHeaders(),
  })
  let before: Record<string, unknown> | null = null
  if (getRes.ok) {
    const u = await getRes.json() as Record<string, unknown>
    before = {
      email: u.email,
      role: (u.user_metadata as Record<string, unknown>)?.role,
      tenant_id: (u.user_metadata as Record<string, unknown>)?.tenant_id,
    }
  }

  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, {
    method: 'DELETE',
    headers: adminHeaders(),
  })

  if (!res.ok) {
    const err = await res.json()
    return NextResponse.json({ error: err.message ?? '삭제 실패' }, { status: res.status })
  }

  void logAction(
    (await createClient()),
    actor,
    'deleted_user',
    'user',
    id,
    before ?? undefined,
    undefined,
    req,
  )

  return NextResponse.json({ ok: true })
}
