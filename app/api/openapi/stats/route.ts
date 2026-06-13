export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })

  const since30d = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()

  const [keysRes, logsRes, webhooksRes] = await Promise.all([
    supabase.from('api_keys').select('key_id').eq('is_active', true),
    supabase.from('api_access_logs').select('log_id, response_ms').gte('ts', since30d),
    supabase.from('webhooks').select('webhook_id').eq('is_active', true),
  ])

  const logs = logsRes.data ?? []
  const msValues = logs.map(l => (l as { response_ms?: number | null }).response_ms ?? null).filter((v): v is number => v != null)
  const avgResponseMs = msValues.length > 0
    ? Math.round(msValues.reduce((s, v) => s + v, 0) / msValues.length)
    : null

  return NextResponse.json({
    activeKeys:       keysRes.data?.length ?? 0,
    requestsLast30d:  logs.length,
    activeWebhooks:   webhooksRes.data?.length ?? 0,
    avgResponseMs,
  })
}
