import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { computeIndicators } from '@/lib/evaluation'

export async function GET() {
  const supabase = await createClient()
  const today    = new Date().toISOString().slice(0, 10)

  const [ev, { count: analysisToday }, { count: processToday }] = await Promise.all([
    computeIndicators(supabase),
    supabase.from('analysis_runs').select('*', { count: 'exact', head: true }).gte('created_at', today),
    supabase.from('processing_runs').select('*', { count: 'exact', head: true }).gte('started_at', today).eq('status', 'done'),
  ])

  const s = ev.summary as Record<string, number>
  return NextResponse.json({
    overall: ev.overall,
    areas:   ev.areas,
    summary: `데이터셋 ${s.datasets}개 · 개방 ${s.open}개 · AI-Ready ${s.ai_ready}개 · 입주기관 ${s.tenants_on}/${s.tenants_total}`,
    pipeline: {
      analysis_today: analysisToday ?? 0,
      process_today:  processToday  ?? 0,
    },
  })
}
