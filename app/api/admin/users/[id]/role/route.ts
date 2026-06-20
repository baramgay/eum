import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { logAction } from '@/lib/audit'
import { SlidingWindowRateLimiter } from '@/lib/rate-limit'
import { userRoleSchema } from '@/lib/admin/users'

export const dynamic = 'force-dynamic'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!

const roleLimiter = new SlidingWindowRateLimiter(60_000, 30)

const roleSchema = z.object({
  role: userRoleSchema,
})

function adminHeaders() {
  return {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'apikey':        SERVICE_KEY,
  }
}

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const role = user.user_metadata?.role as string | undefined
  if (role !== 'admin' && role !== 'center') return null
  return user
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const actor = await requireAdmin()
  if (!actor)
    return NextResponse.json({ error: '관리자 권한이 필요합니다' }, { status: 403 })

  const limit = roleLimiter.isAllowed(`role:write:${actor.id}`)
  if (!limit.allowed)
    return NextResponse.json(
      { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': '30',
          'X-RateLimit-Remaining': String(limit.remaining),
          'X-RateLimit-Reset': String(Math.ceil(limit.resetAt / 1000)),
        },
      }
    )

  let body: z.infer<typeof roleSchema>
  try {
    body = roleSchema.parse(await req.json())
  } catch (e) {
    const msg = e instanceof z.ZodError
      ? e.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ')
      : '잘못된 요청입니다'
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  const getRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, {
    headers: adminHeaders(),
  })
  if (!getRes.ok)
    return NextResponse.json({ error: '사용자를 찾을 수 없습니다' }, { status: 404 })

  const existing = await getRes.json() as Record<string, unknown>
  const prevMeta = (existing.user_metadata ?? {}) as Record<string, unknown>
  const prevRole = prevMeta.role as string | undefined

  const updatedMeta = { ...prevMeta, role: body.role }

  const putRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, {
    method: 'PUT',
    headers: adminHeaders(),
    body: JSON.stringify({ user_metadata: updatedMeta }),
  })

  if (!putRes.ok) {
    const err = await putRes.json() as { message?: string }
    return NextResponse.json({ error: err.message ?? '역할 변경 실패' }, { status: putRes.status })
  }

  void logAction(
    (await createClient()),
    actor,
    'updated_user',
    'user',
    id,
    { role: prevRole },
    { role: body.role },
    req,
  )

  return NextResponse.json({ ok: true, role: body.role })
}
