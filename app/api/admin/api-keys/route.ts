import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createPublicClient, generateApiKey } from '@/lib/openapi'
import { logApiKeyCreated } from '@/lib/audit'

function requireCenter(role: string) {
  return role !== 'center' && role !== 'admin'
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })
  if (requireCenter(user.user_metadata?.role)) {
    return NextResponse.json({ error: '센터 권한이 필요합니다' }, { status: 403 })
  }

  const sb = createPublicClient()
  const { data, error } = await sb
    .from('api_keys')
    .select('key_id, key_prefix, tenant_id, scope, is_active, expires_at, created_at, last_used_at, call_count')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })
  if (requireCenter(user.user_metadata?.role)) {
    return NextResponse.json({ error: '센터 권한이 필요합니다' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({})) as {
    tenant_id?: string
    scope?: { type: string; ids?: string[] }
    expires_days?: number
  }

  const { plain, prefix, hash } = generateApiKey()
  const expiresAt = body.expires_days
    ? new Date(Date.now() + body.expires_days * 86_400_000).toISOString()
    : null

  const sb = createPublicClient()
  const { data, error } = await sb
    .from('api_keys')
    .insert({
      key_hash:   hash,
      key_prefix: prefix,
      tenant_id:  body.tenant_id ?? null,
      scope:      body.scope ?? { type: 'all' },
      is_active:  true,
      expires_at: expiresAt,
    })
    .select('key_id, key_prefix, tenant_id, scope, is_active, expires_at, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  void logApiKeyCreated(supabase, user, data.key_id, {
    tenant_id: body.tenant_id,
    prefix,
  }, req)

  return NextResponse.json({ ...data, plain }, { status: 201 })
}
