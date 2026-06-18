import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getEmbedding } from '@/lib/ai/embeddings'

export const runtime = 'nodejs'

export async function POST(_req: NextRequest) {
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

  const { data: rows, error } = await supabase
    .from('catalog')
    .select('dataset_id,title,description,theme,keywords')
    .eq('ai_ready', true)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let updated = 0
  let failed = 0

  for (const r of rows ?? []) {
    const text = [r.title, r.theme, r.keywords, r.description].filter(Boolean).join(' ')
    const vec = await getEmbedding(text)
    if (!vec) {
      failed++
      continue
    }

    const { error: upErr } = await supabase
      .from('catalog')
      .update({
        description_embedding: vec,
        embedding_model: 'text-embedding-v3',
      })
      .eq('dataset_id', r.dataset_id)

    if (upErr) {
      // eslint-disable-next-line no-console
      console.error('[embeddings] update failed:', upErr.message)
      failed++
    } else {
      updated++
    }
  }

  return NextResponse.json({
    total: rows?.length ?? 0,
    updated,
    failed,
  })
}
