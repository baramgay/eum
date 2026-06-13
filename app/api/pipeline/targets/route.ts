import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const role = user.user_metadata?.role as string | undefined
  let tenantId: string
  if (role === 'center') {
    tenantId = req.nextUrl.searchParams.get('tenant_id') ?? (user.user_metadata?.tenant_id as string)
  } else {
    tenantId = user.user_metadata?.tenant_id as string
  }

  const { data, error } = await supabase
    .from('evaluation_targets')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data ?? {
    tenant_id: tenantId, target_year: 2026,
    open_rate_goal: 80.0, ai_ready_goal: 50.0,
    quality_pass_goal: 100.0, synthetic_goal: 2, analysis_goal: 5,
  })
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const tenantId = user.user_metadata?.tenant_id as string
  const body = await req.json() as {
    open_rate_goal?: number; ai_ready_goal?: number; quality_pass_goal?: number
    synthetic_goal?: number; analysis_goal?: number; target_year?: number
  }

  const payload = {
    tenant_id:        tenantId,
    target_year:      body.target_year ?? 2026,
    open_rate_goal:   body.open_rate_goal ?? 80.0,
    ai_ready_goal:    body.ai_ready_goal ?? 50.0,
    quality_pass_goal: body.quality_pass_goal ?? 100.0,
    synthetic_goal:   body.synthetic_goal ?? 2,
    analysis_goal:    body.analysis_goal ?? 5,
    updated_at:       new Date().toISOString(),
  }
  const { error } = await supabase
    .from('evaluation_targets')
    .upsert(payload, { onConflict: 'tenant_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
