import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const revalidate = 3600  // 1시간 캐시 (정적 데이터)

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const sgg = searchParams.get('sgg')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })
  }

  let query = supabase
    .from('gold_settlement_index')
    .select('*')
    .order('rank', { ascending: true })

  if (sgg) query = query.eq('sgg_cd', sgg)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data ?? [], {
    headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=300' },
  })
}
