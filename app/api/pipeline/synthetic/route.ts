import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { randomHex } from '@/lib/utils'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const tenantId = user.user_metadata?.tenant_id as string | undefined
  const role     = user.user_metadata?.role as string | undefined

  const q = supabase.from('anonymous_data_cases').select('*').order('opened_at', { ascending: false })
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
    case_type: 'synthetic' | 'anonymized'
    title: string; dataset_id?: string; portal_url?: string; opened_at: string
  }

  if (!body.title?.trim()) return NextResponse.json({ error: '제목 필수' }, { status: 400 })
  if (!body.opened_at)     return NextResponse.json({ error: '개방일 필수' }, { status: 400 })
  if (!['synthetic', 'anonymized'].includes(body.case_type))
    return NextResponse.json({ error: 'case_type은 synthetic 또는 anonymized' }, { status: 400 })

  const record = {
    case_id:    randomHex(16),
    tenant_id:  tenantId,
    case_type:  body.case_type,
    title:      body.title.trim(),
    dataset_id: body.dataset_id?.trim() ?? null,
    portal_url: body.portal_url?.trim() ?? null,
    opened_at:  body.opened_at,
    created_at: new Date().toISOString(),
  }
  const { error } = await supabase.from('anonymous_data_cases').insert(record)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ case_id: record.case_id })
}
