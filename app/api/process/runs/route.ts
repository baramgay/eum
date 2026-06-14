import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })
  }

  const role       = user.user_metadata?.role as string
  const userTenant = user.user_metadata?.tenant_id as string

  let query = supabase
    .from('processing_runs')
    .select('id,pipeline_id,tenant_id,status,input_rows,output_rows,error_rows,error_log,started_at,finished_at')
    .order('started_at', { ascending: false })
    .limit(20)

  if (role !== 'center') {
    query = query.eq('tenant_id', userTenant)
  }

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data ?? [])
}
