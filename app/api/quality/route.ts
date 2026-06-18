import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { runAll, getQualityHistory, getQualityCompare, getLatestResults } from '@/lib/quality'
import { createNotification } from '@/lib/notifications'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const view = searchParams.get('view') ?? 'results'
  const datasetId = searchParams.get('dataset_id') ?? undefined

  if (view === 'history') {
    const rows = await getQualityHistory(supabase, datasetId, 200)
    return NextResponse.json(rows)
  }

  if (view === 'compare') {
    if (!datasetId) {
      return NextResponse.json({ error: 'dataset_id가 필요합니다' }, { status: 400 })
    }
    const compare = await getQualityCompare(supabase, datasetId)
    return NextResponse.json(compare)
  }

  // 기본: 최신 결과 반환(저장된 결과가 있으면 즉시, 없으면 service_role로 재진단)
  const latest = await getLatestResults(supabase)
  if (latest.length > 0) {
    return NextResponse.json(latest)
  }

  const service = await createServiceClient()
  const results = await runAll(service)
  return NextResponse.json(results)
}

export async function POST(req: NextRequest) {
  // 1) 서비스 키 인증 또는 로그인 사용자 인증
  const serviceKey = req.headers.get('x-service-key')
  const expectedKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  const isService = Boolean(serviceKey && serviceKey === expectedKey)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!isService && (!user || !['center', 'agency'].includes(user.user_metadata?.role))) {
    return NextResponse.json({ error: '인증·권한이 필요합니다' }, { status: 401 })
  }

  const service = await createServiceClient()
  const results = await runAll(service)

  // 품질 실패 알림 (fire-and-forget)
  const failed = results.filter(r => !r.passed)
  if (failed.length > 0) {
    void (async () => {
      const { data: catalogRows } = await service
        .from('catalog')
        .select('dataset_id, tenant_id, title')
        .in('dataset_id', failed.map(f => f.dataset_id))
      const catalogMap = new Map((catalogRows ?? []).map((c: { dataset_id: string; tenant_id: string; title: string }) => [c.dataset_id, c]))
      for (const f of failed) {
        const cat = catalogMap.get(f.dataset_id)
        await createNotification({
          tenant_id: cat?.tenant_id ?? undefined,
          type: 'quality_fail',
          title: `품질 진단 실패 — ${cat?.title ?? f.dataset_id}`,
          message: `오류율 ${(f.error_rate * 100).toFixed(1)}% / 임계 ${(f.threshold * 100).toFixed(1)}%`,
          link: `/quality?dataset_id=${f.dataset_id}`,
        })
      }
    })()
  }

  return NextResponse.json({
    results,
    ran_at: new Date().toISOString(),
  })
}
