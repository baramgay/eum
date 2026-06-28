import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { runPipelineAndSave, validateRules, type Rule } from '@/lib/processor'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })

  const role       = user.user_metadata?.role as string
  const userTenant = user.user_metadata?.tenant_id as string

  const supabase = await createServiceClient()

  const { data: pipeline } = await supabase
    .from('processing_pipelines').select('*').eq('id', id).maybeSingle()
  if (!pipeline) return NextResponse.json({ error: '파이프라인을 찾을 수 없습니다' }, { status: 404 })
  if (role !== 'center' && pipeline.tenant_id !== userTenant) {
    return NextResponse.json({ error: '접근 권한이 없습니다' }, { status: 403 })
  }

  const rules: Rule[] = (pipeline.rules as Rule[]) ?? []
  const validationErrors = validateRules(rules as unknown[])
  if (validationErrors.length > 0) {
    return NextResponse.json({ error: '규칙 검증 오류', details: validationErrors }, { status: 400 })
  }

  try {
    const result = await runPipelineAndSave(supabase, id)

    if (result.result_table) {
      void supabase.from('data_lineage').insert({
        run_type: 'processing',
        run_id: result.run_id,
        source_ids: JSON.stringify([pipeline.source_dataset_id ?? id]),
        target_table: result.result_table,
      })
    }

    return NextResponse.json({
      run_id:       result.run_id,
      status:       result.status,
      input_rows:   result.input_rows,
      output_rows:  result.output_rows,
      error_rows:   result.error_rows,
      dataset_id:   result.dataset_id,
      result_table: result.result_table,
      errors:       result.errors,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
