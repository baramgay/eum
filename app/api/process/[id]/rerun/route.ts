import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { runPipelineAndSave } from '@/lib/processor'

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

  // 마지막 성공/실패 실행 기록 확인
  const { data: lastRun } = await supabase
    .from('processing_runs')
    .select('*')
    .eq('pipeline_id', id)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!lastRun) {
    return NextResponse.json({ error: '재실행할 이력이 없습니다' }, { status: 404 })
  }

  // 파이프라인 존재 및 권한 확인
  const { data: pipeline } = await supabase
    .from('processing_pipelines').select('*').eq('id', id).maybeSingle()
  if (!pipeline) return NextResponse.json({ error: '파이프라인을 찾을 수 없습니다' }, { status: 404 })
  if (role !== 'center' && pipeline.tenant_id !== userTenant) {
    return NextResponse.json({ error: '접근 권한이 없습니다' }, { status: 403 })
  }

  try {
    const result = await runPipelineAndSave(supabase, id)
    return NextResponse.json({
      run_id:       result.run_id,
      status:       result.status,
      input_rows:   result.input_rows,
      output_rows:  result.output_rows,
      error_rows:   result.error_rows,
      dataset_id:   result.dataset_id,
      result_table: result.result_table,
      previous_run_id: lastRun.id,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
