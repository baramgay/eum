import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getEmbedding } from '@/lib/ai/embeddings'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.user_metadata?.role !== 'center') {
    return NextResponse.json({ error: '센터 권한이 필요합니다' }, { status: 403 })
  }

  // 임베딩 API가 설정되어 있는지 간단히 확인
  const test = await getEmbedding('test')
  if (!test) {
    return NextResponse.json(
      { error: '임베딩 API가 설정되지 않았습니다' },
      { status: 503 },
    )
  }

  let datasetIds: string[] = []
  try {
    const body = await req.json()
    if (Array.isArray(body.datasetIds)) {
      datasetIds = body.datasetIds.filter((id: unknown) => typeof id === 'string')
    }
  } catch {
    // body가 없으면 전체 ai_ready 데이터셋 대상
  }

  let query = supabase
    .from('catalog')
    .select('dataset_id')
    .eq('ai_ready', true)

  if (datasetIds.length > 0) {
    query = query.in('dataset_id', datasetIds)
  }

  const { data: rows, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const jobs: { id: string; dataset_id: string }[] = []
  for (const r of rows ?? []) {
    const { data: upsert, error: upsertErr } = await supabase
      .from('embedding_jobs')
      .upsert(
        { dataset_id: r.dataset_id, status: 'pending', attempts: 0, error: null },
        { onConflict: 'dataset_id' },
      )
      .select('id,dataset_id')
      .single()

    if (upsertErr) {
      // eslint-disable-next-line no-console
      console.error('[embeddings] enqueue failed:', upsertErr.message)
      continue
    }
    if (upsert) jobs.push(upsert)
  }

  return NextResponse.json({
    jobIds: jobs.map((j) => j.id),
    count: jobs.length,
  })
}
