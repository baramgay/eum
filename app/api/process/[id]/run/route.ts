import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { applyRules, persistResult, type Rule, type Row } from '@/lib/processor'

const PAGE_SIZE = 1000

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })

  const role       = user.user_metadata?.role as string
  const userTenant = user.user_metadata?.tenant_id as string

  const { data: pipeline } = await supabase
    .from('processing_pipelines').select('*').eq('id', id).maybeSingle()
  if (!pipeline) return NextResponse.json({ error: '파이프라인을 찾을 수 없습니다' }, { status: 404 })
  if (role !== 'center' && pipeline.tenant_id !== userTenant) {
    return NextResponse.json({ error: '접근 권한이 없습니다' }, { status: 403 })
  }

  // run 레코드 생성
  const arr = new Uint8Array(16)
  crypto.getRandomValues(arr)
  const runId = Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')
  const now = new Date().toISOString()

  await supabase.from('processing_runs').insert({
    id:          runId,
    pipeline_id: id,
    tenant_id:   pipeline.tenant_id,
    status:      'running',
    input_rows:  0,
    output_rows: 0,
    error_rows:  0,
    error_log:   [],
    started_at:  now,
    finished_at: null,
  })

  try {
    const rules: Rule[] = (pipeline.rules as Rule[]) ?? []
    let allRows: Row[] = []

    if (pipeline.source_kind === 'upload') {
      const { data: upload } = await supabase
        .from('submission_uploads')
        .select('preview, row_count')
        .eq('table_name', pipeline.source_dataset_id)
        .maybeSingle()
      allRows = (upload?.preview as Row[]) ?? []
    } else {
      const { data: cat } = await supabase
        .from('catalog')
        .select('table_name')
        .eq('dataset_id', pipeline.source_dataset_id)
        .maybeSingle()

      if (cat?.table_name && cat.table_name.startsWith('gold_')) {
        // 1000행씩 페이지네이션으로 전체 로드
        let from = 0
        while (true) {
          const { data: page } = await supabase
            .from(cat.table_name)
            .select('*')
            .range(from, from + PAGE_SIZE - 1)
          if (!page || page.length === 0) break
          allRows = allRows.concat(page as Row[])
          if (page.length < PAGE_SIZE) break
          from += PAGE_SIZE
        }
      } else if (cat?.table_name) {
        const { data: upload } = await supabase
          .from('submission_uploads')
          .select('preview')
          .eq('table_name', cat.table_name)
          .maybeSingle()
        allRows = (upload?.preview as Row[]) ?? []
      }
    }

    const result = applyRules(allRows, rules)
    const { datasetId } = await persistResult(supabase, pipeline.tenant_id, pipeline, result)

    await supabase.from('processing_runs').update({
      status:            'done',
      input_rows:        result.inputRows,
      output_rows:       result.outputRows,
      error_rows:        result.errorRows,
      result_dataset_id: datasetId,
      error_log:         result.errors,
      finished_at:       new Date().toISOString(),
    }).eq('id', runId)

    return NextResponse.json({
      run_id:     runId,
      status:     'done',
      input_rows:  result.inputRows,
      output_rows: result.outputRows,
      error_rows:  result.errorRows,
      dataset_id:  datasetId,
    })
  } catch (e) {
    await supabase.from('processing_runs').update({
      status:      'failed',
      error_log:   [{ message: (e as Error).message }],
      finished_at: new Date().toISOString(),
    }).eq('id', runId)

    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
