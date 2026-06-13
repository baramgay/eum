import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { computeAiReadyChecklist } from '@/lib/evaluation'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { data, error } = await supabase
    .from('catalog').select('*').eq('dataset_id', params.id).single()
  if (error || !data) return NextResponse.json({ error: '데이터셋 없음' }, { status: 404 })

  return NextResponse.json(computeAiReadyChecklist(data as Record<string, unknown>))
}
