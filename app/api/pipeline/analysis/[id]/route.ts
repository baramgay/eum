import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const tenantId = user.user_metadata?.tenant_id as string | undefined
  const role     = user.user_metadata?.role as string | undefined

  const q = supabase.from('analysis_records').delete().eq('record_id', id)
  const { error } = role === 'center' ? await q : await q.eq('tenant_id', tenantId ?? '')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
