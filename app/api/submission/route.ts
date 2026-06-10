import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createSubmission, newTableName, summarizeQuality, inferSchema } from '@/lib/submission'
import { runQualityGeneric } from '@/lib/quality'

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
    const text    = await file.text()
    const lines   = text.trim().split('\n')
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
    uploadedData  = lines.slice(1).map(line => {
      const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''))
      return Object.fromEntries(headers.map((h, i) => {
        const v = vals[i] ?? ''
        const n = Number(v)
        return [h, v === '' ? null : isNaN(n) ? v : n]
      }))
    })

    const arr = new Uint8Array(16)
    crypto.getRandomValues(arr)
    const uploadId = Array.from(arr).map(b => b.toString(16).padStart(2,'0')).join('')

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

  return NextResponse.json({
    submission_id:   subId,
    status:          'submitted',
    quality:         diag,
    quality_summary: summary,
  })
}
