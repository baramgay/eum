import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { computeAiReadyChecklist } from '@/lib/evaluation'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const service = await createServiceClient()
  const { data, error } = await service
    .from('catalog').select('*').eq('dataset_id', id).single()
  if (error || !data) return NextResponse.json({ error: '데이터셋 없음' }, { status: 404 })

  const result = await computeAiReadyChecklist(data as Record<string, unknown>, service)
  return NextResponse.json(result)
}
