import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { computeIndicators } from '@/lib/evaluation'

export async function GET() {
  const supabase = await createClient()
  const ev = await computeIndicators(supabase)
  return NextResponse.json({
    platform: '이음(EUM)',
    generated_at: new Date().toISOString(),
    summary: ev.summary,
    overall_score: ev.overall,
  })
}
