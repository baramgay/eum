export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'

const VALID_EVENTS = new Set(['dataset.created', 'dataset.updated'])

function isValidUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })

  const role     = user.user_metadata?.role as string
  const tenantId = user.user_metadata?.tenant_id as string

  let query = supabase
    .from('webhooks')
    .select('webhook_id, tenant_id, url, events, is_active, created_at')
    .order('created_at', { ascending: false })

  if (role !== 'center') {
    query = query.eq('tenant_id', tenantId)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })

  const role     = user.user_metadata?.role as string
  const tenantId = user.user_metadata?.tenant_id as string

  const body: {
    url?: string
    events?: string[]
    tenant_id?: string
  } = await req.json()

  if (!body.url?.trim()) {
    return NextResponse.json({ error: 'url은 필수입니다' }, { status: 400 })
  }
  if (!isValidUrl(body.url)) {
    return NextResponse.json({ error: '유효하지 않은 URL입니다' }, { status: 400 })
  }

  const events: string[] = Array.isArray(body.events) ? body.events : []
  const invalidEvents = events.filter(e => !VALID_EVENTS.has(e))
  if (invalidEvents.length > 0) {
    return NextResponse.json(
      { error: `유효하지 않은 이벤트: ${invalidEvents.join(', ')}. 허용: ${Array.from(VALID_EVENTS).join(', ')}` },
      { status: 400 }
    )
  }
  if (!events.length) {
    return NextResponse.json({ error: 'events는 하나 이상 필요합니다' }, { status: 400 })
  }

  const targetTenantId = role === 'center' && body.tenant_id
    ? body.tenant_id
    : tenantId

  if (!targetTenantId) {
    return NextResponse.json({ error: 'tenant_id를 확인할 수 없습니다' }, { status: 400 })
  }

  const sb = await createServiceClient()
  const { data, error } = await sb.from('webhooks').insert({
    tenant_id: targetTenantId,
    url:       body.url.trim(),
    events,
    is_active: true,
  }).select('webhook_id').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true, webhook_id: data.webhook_id }, { status: 201 })
}
