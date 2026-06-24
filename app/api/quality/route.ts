import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { runAll, getQualityHistory, getQualityCompare, getLatestResults } from '@/lib/quality'
import { createNotification } from '@/lib/notifications'
import { err } from '@/lib/api-response'

/**
 * collection_logs 기준으로 준비성(readiness) 점수를 측정한다.
 * 30일 이내 최근 로그가 있으면 수집 준비 상태로 판단한다.
 *   - 7일 이내  → 100점
 *   - 14일 이내 → 75점
 *   - 30일 이내 → 50점
 *   - 없음      → -1 (미측정)
 */
async function measureReadiness(
  supabase: Awaited<ReturnType<typeof createClient>>,
  datasetId: string,
): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const { data } = await supabase
      .from('collection_logs')
      .select('created_at')
      .eq('dataset_id', datasetId)
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!data?.created_at) return -1

    const diffMs = Date.now() - new Date(data.created_at).getTime()
    const diffDays = diffMs / (1000 * 60 * 60 * 24)
    if (diffDays <= 7)  return 100
    if (diffDays <= 14) return 75
    return 50
  } catch {
    return -1
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return err('인증이 필요합니다', 401)
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
        return err('dataset_id가 필요합니다', 400)
      }
      const compare = await getQualityCompare(supabase, datasetId)
      return NextResponse.json(compare)
    }

    if (view === 'readiness') {
      if (!datasetId) {
        return err('dataset_id가 필요합니다', 400)
      }
      const score = await measureReadiness(supabase, datasetId)
      return NextResponse.json({ dataset_id: datasetId, readiness: score })
    }

    // 기본: 최신 결과 반환(저장된 결과가 있으면 즉시, 없으면 service_role로 재진단)
    const latest = await getLatestResults(supabase)
    if (latest.length > 0) {
      return NextResponse.json(latest)
    }

    const service = await createServiceClient()
    const results = await runAll(service)
    return NextResponse.json(results)
  } catch (e) {
    console.error('[GET /api/quality]', e)
    return err('품질 조회 중 오류가 발생했습니다', 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    // 1) 서비스 키 인증 또는 로그인 사용자 인증
    const serviceKey = req.headers.get('x-service-key')
    const expectedKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
    const isService = Boolean(serviceKey && serviceKey === expectedKey)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!isService && (!user || !['center', 'agency'].includes(user.user_metadata?.role))) {
      return err('인증·권한이 필요합니다', 401)
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
  } catch (e) {
    console.error('[POST /api/quality]', e)
    return err('품질 진단 중 오류가 발생했습니다', 500)
  }
}
