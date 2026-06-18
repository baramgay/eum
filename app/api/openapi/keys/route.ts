export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'
import { generateApiKey } from '@/lib/openapi'
import { logApiKeyCreated } from '@/lib/audit'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })

  const role     = user.user_metadata?.role as string
  const tenantId = user.user_metadata?.tenant_id as string

  let query = supabase
    .from('api_keys')
    .select('key_id, tenant_id, key_prefix, name, description, scope, expires_at, is_active, created_at, last_used_at, call_count')
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
    name?: string
    description?: string
    scope?: { type: string; ids?: string[] }
    expires_at?: string
    tenant_id?: string
  } = await req.json()

  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'name은 필수입니다' }, { status: 400 })
  }

  // center는 임의 tenant_id 지정 가능, 그 외에는 본인 tenant_id만 사용
  const targetTenantId = role === 'center' && body.tenant_id
    ? body.tenant_id
    : tenantId

  if (!targetTenantId) {
    return NextResponse.json({ error: 'tenant_id를 확인할 수 없습니다' }, { status: 400 })
  }

  const { plain, prefix, hash } = generateApiKey()

  const scope = body.scope ?? { type: 'all' }

  // service-role로 insert (RLS 우회)
  const sb = await createServiceClient()
  const { data: inserted, error } = await sb
    .from('api_keys')
    .insert({
      tenant_id:   targetTenantId,
      key_hash:    hash,
      key_prefix:  prefix,
      name:        body.name.trim(),
      description: body.description ?? null,
      scope,
      expires_at:  body.expires_at ?? null,
      is_active:   true,
    })
    .select('key_id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  void logApiKeyCreated(
    supabase,
    user,
    inserted?.key_id ?? '',
    { tenant_id: targetTenantId, name: body.name.trim(), prefix },
    req,
  )

  return NextResponse.json({ ok: true, key: plain, prefix }, { status: 201 })
}
