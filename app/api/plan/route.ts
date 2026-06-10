import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { draftOpenPlan, draftQualityPlan } from '@/lib/planning'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const type     = searchParams.get('type') ?? 'open'
  const tenantId = searchParams.get('tenant_id')

  if (!tenantId) return NextResponse.json({ error: 'tenant_id 파라미터가 필요합니다' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })

  const role = user.user_metadata?.role as string
  if (role !== 'center') return NextResponse.json({ error: '센터 권한이 필요합니다' }, { status: 403 })

  const plan = type === 'quality'
    ? await draftQualityPlan(supabase, tenantId)
    : await draftOpenPlan(supabase, tenantId)

  return NextResponse.json({ tenant_id: tenantId, type, plan })
}
