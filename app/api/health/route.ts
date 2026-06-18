export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { env } from '@/lib/env'

interface Check {
  name: string
  status: 'ok' | 'fail' | 'skipped'
  message?: string
}

export async function GET() {
  const checks: Check[] = []
  let status: 'ok' | 'degraded' = 'ok'

  // Supabase 연결 확인
  try {
    const supabase = await createServiceClient()
    const { error } = await supabase.rpc('select_one')
    if (error) {
      // rpc 가 없을 수 있으므로 fallback
      const { error: rawError } = await supabase.from('tenants').select('tenant_id').limit(1)
      if (rawError) throw rawError
    }
    checks.push({ name: 'supabase', status: 'ok' })
  } catch (e) {
    status = 'degraded'
    checks.push({ name: 'supabase', status: 'fail', message: e instanceof Error ? e.message : 'unknown error' })
  }

  // Qwen/LLM 엔드포인트 도달성 확인 (선택)
  if (env.QWEN_BASE_URL) {
    try {
      const res = await fetch(env.QWEN_BASE_URL, { method: 'HEAD' })
      checks.push({
        name: 'qwen',
        status: res.status > 0 ? 'ok' : 'fail',
        message: `status ${res.status}`,
      })
    } catch (e) {
      status = 'degraded'
      checks.push({ name: 'qwen', status: 'fail', message: e instanceof Error ? e.message : 'unreachable' })
    }
  } else {
    checks.push({ name: 'qwen', status: 'skipped', message: 'QWEN_BASE_URL not configured' })
  }

  const allFailed = checks.every(c => c.status === 'fail')
  if (allFailed && checks.length > 0) status = 'degraded'

  return NextResponse.json({ status, checks }, { status: status === 'ok' ? 200 : 503 })
}
