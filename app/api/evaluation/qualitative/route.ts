import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { QUALITATIVE_KEYS } from '@/lib/evaluation'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })

  const tenantId = user.user_metadata?.tenant_id as string
  if (!tenantId) return NextResponse.json({ error: 'tenant_id 없음' }, { status: 400 })

  const { data, error } = await supabase
    .from('qualitative_inputs')
    .select('indicator_key,status,note,updated_at')
    .eq('tenant_id', tenantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 모든 정성지표 키를 반환 (미입력은 na/null로 채움)
  const inputMap: Record<string, { status: string; note: string | null; updated_at: string | null }> = {}
  for (const row of data ?? []) {
    inputMap[row.indicator_key] = { status: row.status, note: row.note, updated_at: row.updated_at }
  }

  const result = Object.entries(QUALITATIVE_KEYS).map(([key, name]) => ({
    key,
    name,
    status: inputMap[key]?.status ?? 'na',
    note:   inputMap[key]?.note   ?? null,
    updated_at: inputMap[key]?.updated_at ?? null,
  }))

  return NextResponse.json(result)
}

export async function PUT(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })

  const tenantId = user.user_metadata?.tenant_id as string
  if (!tenantId) return NextResponse.json({ error: 'tenant_id 없음' }, { status: 400 })

  const body = await req.json() as { key: string; status: 'ok' | 'warn' | 'na'; note?: string }

  if (!body.key || !(body.key in QUALITATIVE_KEYS)) {
    return NextResponse.json({ error: '유효하지 않은 indicator_key' }, { status: 400 })
  }
  if (!['ok', 'warn', 'na'].includes(body.status)) {
    return NextResponse.json({ error: '유효하지 않은 status' }, { status: 400 })
  }

  const { error } = await supabase
    .from('qualitative_inputs')
    .upsert({
      tenant_id:     tenantId,
      indicator_key: body.key,
      status:        body.status,
      note:          body.note ?? null,
      updated_at:    new Date().toISOString(),
    }, { onConflict: 'tenant_id,indicator_key' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
