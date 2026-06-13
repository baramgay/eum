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
  if (!await requireCenter())
    return NextResponse.json({ error: '센터 권한이 필요합니다' }, { status: 403 })

  const body: { role?: string; tenant_id?: string | null } = await req.json()
  const meta: Record<string, unknown> = {}
  if (body.role !== undefined)      meta.role      = body.role
  if (body.tenant_id !== undefined) meta.tenant_id = body.tenant_id

  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, {
    method: 'PUT',
    headers: adminHeaders(),
    body: JSON.stringify({ user_metadata: meta }),
  })

  if (!res.ok) {
    const err = await res.json()
    return NextResponse.json({ error: err.message ?? '수정 실패' }, { status: res.status })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!await requireCenter())
    return NextResponse.json({ error: '센터 권한이 필요합니다' }, { status: 403 })

  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, {
    method: 'DELETE',
    headers: adminHeaders(),
  })

  if (!res.ok) {
    const err = await res.json()
    return NextResponse.json({ error: err.message ?? '삭제 실패' }, { status: res.status })
  }

  return NextResponse.json({ ok: true })
}
