import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const targetTable = searchParams.get('target_table')

  if (!targetTable) {
    return NextResponse.json({ error: 'target_table 파라미터가 필요합니다' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('data_lineage')
    .select('*')
    .eq('target_table', targetTable)
    .order('created_at', { ascending: false })
    .limit(10)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ lineage: data ?? [] })
}
