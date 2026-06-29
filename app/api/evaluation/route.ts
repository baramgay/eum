import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { computeIndicators } from '@/lib/evaluation'

let _cache: { data: unknown; ts: number } | null = null
const CACHE_TTL = 5 * 60 * 1000

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const role = user.user_metadata?.role as string | undefined
  let tenantId: string | undefined

  if (role === 'center') {
    const param = req.nextUrl.searchParams.get('tenant_id')
    tenantId = param ?? undefined
  } else {
    tenantId = user.user_metadata?.tenant_id as string | undefined
  }

  if (!tenantId && _cache && Date.now() - _cache.ts < CACHE_TTL) {
    return NextResponse.json(_cache.data)
  }

  const result = await computeIndicators(supabase, tenantId)
  if (!tenantId) _cache = { data: result, ts: Date.now() }

  return NextResponse.json(result)
}
