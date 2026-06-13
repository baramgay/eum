import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { computeIndicators } from '@/lib/evaluation'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const role = user.user_metadata?.role as string | undefined
  let tenantId: string | undefined

  if (role === 'center') {
    const param = req.nextUrl.searchParams.get('tenant_id')
    tenantId = param ?? undefined   // 파라미터 없으면 전체 집계
  } else {
    tenantId = user.user_metadata?.tenant_id as string | undefined
  }

  return NextResponse.json(await computeIndicators(supabase, tenantId))
}
