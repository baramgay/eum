import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createPublicClient } from '@/lib/openapi'
import { logApiKeyRevoked } from '@/lib/audit'

type Params = { params: Promise<{ id: string }> }

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })

  const role = user.user_metadata?.role as string
  if (role !== 'center' && role !== 'admin') {
    return NextResponse.json({ error: '센터 권한이 필요합니다' }, { status: 403 })
  }

  const sb = createPublicClient()
  const { data: before } = await sb
    .from('api_keys')
    .select('key_id, tenant_id, is_active')
    .eq('key_id', id)
    .maybeSingle()

  const { error } = await sb
    .from('api_keys')
    .update({ is_active: false })
    .eq('key_id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  void logApiKeyRevoked(supabase, user, id, before ?? undefined)

  return NextResponse.json({ ok: true })
}
