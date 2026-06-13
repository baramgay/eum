import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { runAll } from '@/lib/quality'

export async function GET() {
  const supabase = await createClient()
  return NextResponse.json(await runAll(supabase))
}

export async function POST(req: NextRequest) {
  // 내부 서비스 호출: x-service-key 헤더로 인증
  const serviceKey = req.headers.get('x-service-key')
  const expectedKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

  if (!serviceKey || serviceKey !== expectedKey) {
    return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })
  }

  const supabase = await createServiceClient()
  const results = await runAll(supabase)
  return NextResponse.json({
    results,
    ran_at: new Date().toISOString(),
  })
}
