import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { applyRules, type Rule, type Row } from '@/lib/processor'

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

  const body: { rules?: Rule[] } = await req.json()
  const rules: Rule[] = body.rules ?? (pipeline.rules as Rule[]) ?? []

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
      const { data: rows } = await supabase.from(cat.table_name).select('*').limit(20)
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

  const before = sampleRows.slice(0, 20)
  const result = applyRules(before, rules)

  return NextResponse.json({
    before,
    after:  result.rows,
    errors: result.errors,
  })
}
