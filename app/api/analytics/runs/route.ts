import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { randomHex } from '@/lib/utils'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const tenantId = (user.user_metadata?.tenant_id as string | undefined) ?? 'center'
  const body = await req.json() as {
    analysis_type: string
    dataset_label: string
    result_title?: string
    result_summary?: Record<string, unknown>
  }

  const { error } = await supabase.from('analysis_runs').insert({
    id:             randomHex(16),
    tenant_id:      tenantId,
    analysis_type:  body.analysis_type ?? '',
    dataset_label:  body.dataset_label ?? '',
    result_title:   body.result_title ?? null,
    result_summary: body.result_summary ?? {},
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json([])

  const role     = (user.user_metadata?.role as string | undefined) ?? ''
  const tenantId = (user.user_metadata?.tenant_id as string | undefined) ?? ''
  const limit    = Math.min(Number(new URL(req.url).searchParams.get('limit') ?? '5'), 20)

  let query = supabase
    .from('analysis_runs')
    .select('id, analysis_type, dataset_label, result_title, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (role !== 'center') {
    query = query.eq('tenant_id', tenantId)
  }

  const { data } = await query
  return NextResponse.json(data ?? [])
}
