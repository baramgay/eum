import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { addComment } from '@/lib/submission'

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

  const body: { comment?: string } = await req.json()
  if (!body.comment?.trim()) {
    return NextResponse.json({ error: 'comment가 필요합니다' }, { status: 400 })
  }

  await addComment(supabase, id, body.comment.trim())
  return NextResponse.json({ ok: true, submission_id: id })
}
