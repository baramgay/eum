import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  if (user.user_metadata?.role !== 'center')
    return NextResponse.json({ error: '센터 권한 필요' }, { status: 403 })

  const [
    { data: tenants },
    { data: catalogRows },
    { data: idMapRows },
    { data: qualityRows },
    { data: analysisRows },
    { data: syntheticRows },
  ] = await Promise.all([
    Promise.resolve(supabase.from('tenants').select('tenant_id, name').order('name')),
    Promise.resolve(supabase.from('catalog').select('tenant_id, is_open, ai_ready')),
    Promise.resolve(supabase.from('catalog').select('dataset_id, tenant_id')),
    Promise.resolve(supabase.from('quality_results').select('dataset_id, passed')),
    Promise.resolve(supabase.from('analysis_records').select('tenant_id')).catch(() => ({ data: [] as { tenant_id: string }[] })),
    Promise.resolve(supabase.from('anonymous_data_cases').select('tenant_id')).catch(() => ({ data: [] as { tenant_id: string }[] })),
  ])

  if (!tenants?.length) return NextResponse.json([])

  // dataset_id → tenant_id 매핑
  const idMap = new Map<string, string>()
  idMapRows?.forEach((r: { dataset_id: string; tenant_id: string }) => idMap.set(r.dataset_id, r.tenant_id))

  type Agg = { total: number; open: number; aiReady: number; qTotal: number; qPass: number; analysis: number; synthetic: number }
  const agg: Record<string, Agg> = {}
  const ensure = (tid: string) => {
    if (!agg[tid]) agg[tid] = { total: 0, open: 0, aiReady: 0, qTotal: 0, qPass: 0, analysis: 0, synthetic: 0 }
  }

  catalogRows?.forEach((r: { tenant_id: string; is_open: boolean; ai_ready: boolean }) => {
    if (!r.tenant_id) return
    ensure(r.tenant_id)
    agg[r.tenant_id].total++
    if (r.is_open) agg[r.tenant_id].open++
    if (r.ai_ready) agg[r.tenant_id].aiReady++
  })
  qualityRows?.forEach((r: { dataset_id: string; passed: boolean }) => {
    const tid = idMap.get(r.dataset_id)
    if (!tid) return
    ensure(tid)
    agg[tid].qTotal++
    if (r.passed) agg[tid].qPass++
  })
  ;(analysisRows ?? []).forEach((r: { tenant_id: string }) => {
    if (!r.tenant_id) return
    ensure(r.tenant_id)
    agg[r.tenant_id].analysis++
  })
  ;(syntheticRows ?? []).forEach((r: { tenant_id: string }) => {
    if (!r.tenant_id) return
    ensure(r.tenant_id)
    agg[r.tenant_id].synthetic++
  })

  const rows = tenants.map((t: { tenant_id: string; name: string }) => {
    const a = agg[t.tenant_id] ?? { total: 0, open: 0, aiReady: 0, qTotal: 0, qPass: 0, analysis: 0, synthetic: 0 }
    const openPct    = a.total  ? Math.round(a.open    / a.total  * 100) : 0
    const aiReadyPct = a.total  ? Math.round(a.aiReady / a.total  * 100) : 0
    const qualityPct = a.qTotal ? Math.round(a.qPass   / a.qTotal * 100) : 0
    return {
      tenant_id: t.tenant_id,
      name:      t.name,
      total:     a.total,
      open:      a.open,
      open_pct:  openPct,
      ai_ready:  a.aiReady,
      ai_ready_pct: aiReadyPct,
      quality_pass:  a.qPass,
      quality_total: a.qTotal,
      quality_pct:   qualityPct,
      analysis:  a.analysis,
      synthetic: a.synthetic,
    }
  })

  return NextResponse.json(rows)
}
