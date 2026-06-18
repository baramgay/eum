import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  applyRules,
  collectJoinTargets,
  validateRules,
  type Rule,
  type Row,
} from '@/lib/processor'

const PREVIEW_LIMIT = 20

export async function POST(
  req: Request,
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

  let body: { rules?: Rule[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '요청 본문을 JSON으로 파싱할 수 없습니다' }, { status: 400 })
  }
  const rules: Rule[] = body.rules ?? (pipeline.rules as Rule[]) ?? []

  const validationErrors = validateRules(rules as unknown[])
  if (validationErrors.length > 0) {
    return NextResponse.json({ error: '규칙 검증 오류', details: validationErrors }, { status: 400 })
  }

  try {
    let sampleRows: Row[] = []

    if (pipeline.source_kind === 'upload') {
      const { data: upload } = await supabase
        .from('submission_uploads')
        .select('preview')
        .eq('table_name', pipeline.source_dataset_id)
        .maybeSingle()
      sampleRows = (upload?.preview as Row[]) ?? []
    } else {
      // catalog 소스: gold_ 테이블이면 직접 limit 20, 아니면 submission_uploads.preview 사용
      const { data: cat } = await supabase
        .from('catalog')
        .select('table_name')
        .eq('dataset_id', pipeline.source_dataset_id)
        .maybeSingle()

      if (cat?.table_name && cat.table_name.startsWith('gold_')) {
        const { data: rows } = await supabase.from(cat.table_name).select('*').limit(PREVIEW_LIMIT)
        sampleRows = (rows as Row[]) ?? []
      } else if (cat?.table_name) {
        const { data: upload } = await supabase
          .from('submission_uploads')
          .select('preview')
          .eq('table_name', cat.table_name)
          .maybeSingle()
        sampleRows = (upload?.preview as Row[]) ?? []
      }
    }

    const before = sampleRows.slice(0, PREVIEW_LIMIT)
    const joinTargets = await collectJoinTargets(supabase, rules, { limit: PREVIEW_LIMIT })
    const result = applyRules(before, rules, joinTargets)

    return NextResponse.json({
      before,
      after:  result.rows,
      errors: result.errors,
      summary: {
        inputRows:  result.inputRows,
        outputRows: result.outputRows,
        errorRows:  result.errorRows,
      },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: '미리보기 실행 중 오류가 발생했습니다', message }, { status: 500 })
  }
}
