import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

export async function GET(req: NextRequest) {
  const datasetId = req.nextUrl.searchParams.get('dataset_id')
  if (!datasetId) return NextResponse.json({ checked_ids: [] })
  const { data } = await sb
    .from('quality_checklist_state')
    .select('checked_ids')
    .eq('dataset_id', datasetId)
    .maybeSingle()
  return NextResponse.json({ checked_ids: data?.checked_ids ?? [] })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.dataset_id) return NextResponse.json({ error: 'dataset_id required' }, { status: 400 })
  const { error } = await sb
    .from('quality_checklist_state')
    .upsert({
      dataset_id: body.dataset_id,
      checked_ids: body.checked_ids ?? [],
      updated_at: new Date().toISOString(),
    })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
