import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data } = await supabase.from('tenants').select('*')
    .order('gov_type', { ascending: false }).order('name')
  return NextResponse.json(data ?? [])
}
