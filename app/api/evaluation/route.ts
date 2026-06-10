import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { computeIndicators } from '@/lib/evaluation'

export async function GET() {
  const supabase = await createClient()
  return NextResponse.json(await computeIndicators(supabase))
}
