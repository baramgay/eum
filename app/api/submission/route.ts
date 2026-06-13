import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createSubmission, newTableName, summarizeQuality, inferSchema } from '@/lib/submission'
import { runQualityGeneric } from '@/lib/quality'
import { parseCsv } from '@/lib/collector'
import { randomHex } from '@/lib/utils'
import { logAction } from '@/lib/audit'
import { sendEmail, emailSubmissionReceived, CENTER_EMAIL } from '@/lib/email'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const tenantId = searchParams.get('tenant_id')
  const all      = searchParams.get('all') === 'true'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })

  const role       = user.user_metadata?.role as string
  const userTenant = user.user_metadata?.tenant_id as string

  if (all) {
    if (role !== 'center') return NextResponse.json({ error: '센터 권한이 필요합니다' }, { status: 403 })
    const { data } = await supabase.from('submissions')
      .select('*, consultant_comments(count)').order('submitted_at', { ascending: false })
    return NextResponse.json(data ?? [])
  }

  if (!tenantId) return NextResponse.json({ error: 'tenant_id 파라미터가 필요합니다' }, { status: 400 })
  if (role === 'agency' && userTenant !== tenantId) {
    return NextResponse.json({ error: '자신의 기관 데이터만 조회할 수 있습니다' }, { status: 403 })
  }

  const { data } = await supabase.from('submissions').select('*')
    .eq('tenant_id', tenantId).order('submitted_at', { ascending: false })
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })

  const form     = await req.formData()
  const file     = form.get('file') as File | null
  const tenantId = form.get('tenant_id') as string

  if (!tenantId) return NextResponse.json({ error: 'tenant_id가 필요합니다' }, { status: 400 })

  const role       = user.user_metadata?.role as string
  const userTenant = user.user_metadata?.tenant_id as string
  if (role === 'agency' && userTenant !== tenantId) {
    return NextResponse.json({ error: '자신의 기관 데이터만 등록할 수 있습니다' }, { status: 403 })
  }

  const { data: known } = await supabase.from('tenants').select('tenant_id').eq('tenant_id', tenantId).maybeSingle()
  if (!known) return NextResponse.json({ error: '알 수 없는 tenant_id' }, { status: 400 })

  const meta: Record<string, string> = {
    tenant_id: tenantId,
    title:       form.get('title')       as string ?? '',
    description: form.get('description') as string ?? '',
    theme:       form.get('theme')       as string ?? '',
    keywords:    form.get('keywords')    as string ?? '',
    license:     form.get('license')     as string ?? '',
    format:      form.get('format')      as string ?? '',
  }

  let uploadedData: Record<string, unknown>[] = []
  const tableName = newTableName(tenantId)

  if (file) {
    uploadedData = parseCsv(await file.text())

    const uploadId = randomHex(16)

    await supabase.from('submission_uploads').insert({
      upload_id:   uploadId,
      table_name:  tableName,
      schema_info: inferSchema(uploadedData),
      preview:     uploadedData.slice(0, 20),
      row_count:   uploadedData.length,
      created_at:  new Date().toISOString(),
    })
  }

  const diag    = await runQualityGeneric(supabase, tableName, uploadedData)
  const summary = summarizeQuality(diag)
  const rows    = parseInt(form.get('rows') as string ?? String(uploadedData.length), 10)
  const subId   = await createSubmission(supabase, meta, tableName, rows || uploadedData.length, summary)

  // 감사 로그 (fire-and-forget)
  void logAction(supabase, user, 'submitted', 'submission', subId, undefined, { title: meta.title, tenant_id: tenantId }, req)

  // 이메일 — 센터에 새 제출 알림 (fire-and-forget)
  void (async () => {
    const { subject, html } = emailSubmissionReceived(tenantId, meta.title, subId)
    await sendEmail(CENTER_EMAIL, subject, html)
  })()

  return NextResponse.json({
    submission_id:   subId,
    status:          'submitted',
    quality:         diag,
    quality_summary: summary,
  })
}
