import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { runAll } from '@/lib/quality'

export async function GET() {
  const supabase = await createClient()
  return NextResponse.json(await runAll(supabase))
}

export async function POST() {
  const supabase = await createClient()
  return NextResponse.json({
    results: await runAll(supabase),
    ran_at: new Date().toISOString(),
  })
}
