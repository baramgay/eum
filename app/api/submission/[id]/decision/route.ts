import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { recordDecision } from '@/lib/submission'

const VALID_STATUSES = new Set(['approved', 'rejected', 'review'])

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })

  const role = user.user_metadata?.role as string
  if (role !== 'center') return NextResponse.json({ error: '센터 권한이 필요합니다' }, { status: 403 })

  const body: { status?: string; decision_note?: string } = await req.json()
  if (!body.status || !VALID_STATUSES.has(body.status)) {
    return NextResponse.json(
      { error: `status는 ${[...VALID_STATUSES].join(', ')} 중 하나여야 합니다` },
      { status: 400 }
    )
  }

  await recordDecision(supabase, id, body.status, body.decision_note ?? '')
  return NextResponse.json({ ok: true, submission_id: id, status: body.status })
}
