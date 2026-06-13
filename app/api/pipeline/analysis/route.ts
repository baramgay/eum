import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { randomHex } from '@/lib/utils'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const tenantId = user.user_metadata?.tenant_id as string | undefined
  const role     = user.user_metadata?.role as string | undefined

  const q = supabase.from('analysis_records').select('*').order('performed_at', { ascending: false })
  const { data, error } = role === 'center' ? await q : await q.eq('tenant_id', tenantId ?? '')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const tenantId = user.user_metadata?.tenant_id as string
  const body = await req.json() as {
    title: string; purpose?: string; datasets_used?: string[]
    result_summary?: string; policy_applied?: boolean; performed_at: string
  }

  if (!body.title?.trim()) return NextResponse.json({ error: '제목 필수' }, { status: 400 })
  if (!body.performed_at) return NextResponse.json({ error: '수행일 필수' }, { status: 400 })

  const record = {
    record_id:      randomHex(16),
    tenant_id:      tenantId,
    title:          body.title.trim(),
    purpose:        body.purpose?.trim() ?? null,
    datasets_used:  body.datasets_used ?? [],
    result_summary: body.result_summary?.trim() ?? null,
    policy_applied: body.policy_applied ?? false,
    performed_at:   body.performed_at,
    created_at:     new Date().toISOString(),
  }
  const { error } = await supabase.from('analysis_records').insert(record)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ record_id: record.record_id })
}
