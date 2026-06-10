import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSubmission } from '@/lib/submission'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })

  const sub = await getSubmission(supabase, id)
  if (!sub) return NextResponse.json({ error: '제출물을 찾을 수 없습니다' }, { status: 404 })

  const role       = user.user_metadata?.role as string
  const userTenant = user.user_metadata?.tenant_id as string
  if (role === 'agency' && sub.meta?.tenant_id !== userTenant) {
    return NextResponse.json({ error: '접근 권한이 없습니다' }, { status: 403 })
  }

  return NextResponse.json(sub)
}
