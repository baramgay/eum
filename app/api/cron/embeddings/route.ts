import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getEmbedding } from '@/lib/ai/embeddings'
import { env } from '@/lib/env'

export const runtime = 'nodejs'

const MAX_JOBS = 100

export async function GET(req: NextRequest) {
  const secret = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!secret || secret !== env.CRON_SECRET) {
    return NextResponse.json({ error: '인증 실패' }, { status: 401 })
  }

  const supabase = await createServiceClient()

  const { data: pendingJobs, error: fetchErr } = await supabase
    .from('embedding_jobs')
    .select('id,dataset_id,attempts')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(MAX_JOBS)

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }

  let done = 0
  let failed = 0

  for (const job of pendingJobs ?? []) {
    const { error: runningErr } = await supabase
      .from('embedding_jobs')
      .update({ status: 'running', updated_at: new Date().toISOString() })
      .eq('id', job.id)

    if (runningErr) {
      failed++
      continue
    }

    try {
      const { data: catalogRow } = await supabase
        .from('catalog')
        .select('dataset_id,title,description,theme,keywords')
        .eq('dataset_id', job.dataset_id)
        .single()

      if (!catalogRow) {
        throw new Error('catalog row not found')
      }

      const text = [
        catalogRow.title,
        catalogRow.theme,
        catalogRow.keywords,
        catalogRow.description,
      ].filter(Boolean).join(' ')

      const vec = await getEmbedding(text)
      if (!vec) {
        throw new Error('embedding API returned null')
      }

      const { error: updateErr } = await supabase
        .from('catalog')
        .update({
          description_embedding: vec,
          embedding_model: env.EMBEDDING_MODEL ?? 'text-embedding-v3',
        })
        .eq('dataset_id', catalogRow.dataset_id)

      if (updateErr) {
        throw updateErr
      }

      await supabase
        .from('embedding_jobs')
        .update({
          status: 'done',
          attempts: (job.attempts ?? 0) + 1,
          error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id)

      done++
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e)
      const attempts = (job.attempts ?? 0) + 1
      await supabase
        .from('embedding_jobs')
        .update({
          status: attempts >= 3 ? 'failed' : 'pending',
          attempts,
          error: errMsg,
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id)
      failed++
    }
  }

  return NextResponse.json({
    processed: (pendingJobs ?? []).length,
    done,
    failed,
  })
}
