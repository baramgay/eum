import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { computeIndicators } from '@/lib/evaluation'

export async function GET() {
  const supabase = await createClient()
  const ev = await computeIndicators(supabase)
  const s = ev.summary as Record<string, number>
  return NextResponse.json({
    overall: ev.overall,
    areas: ev.areas,
    summary: `데이터셋 ${s.datasets}개 · 개방 ${s.open}개 · AI-Ready ${s.ai_ready}개 · 입주기관 ${s.tenants_on}/${s.tenants_total}`,
  })
}
