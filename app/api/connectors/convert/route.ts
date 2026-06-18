import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validateConnectorConfig, type ConnectorConfig } from '@/lib/connectors/types'
import { checkPostgres, checkSftp, checkApi } from '@/lib/connectors/server'
import { newCollectId, newJobId } from '@/lib/collector'

function getConnectorLabel(cfg: ConnectorConfig): string {
  if (cfg.type === 'postgres') return `${cfg.host}:${cfg.port}/${cfg.database}`
  if (cfg.type === 'sftp') return `${cfg.host}:${cfg.port}${cfg.remotePath}`
  return cfg.url
}

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })
  }

  const role = user.user_metadata?.role as string
  const userTenant = user.user_metadata?.tenant_id as string

  const body = (await req.json()) as {
    config?: unknown
    title?: string
    description?: string
    tenant_id?: string
  }

  const validated = validateConnectorConfig(body.config)
  if (!validated.success) {
    return NextResponse.json({ ok: false, message: validated.error }, { status: 400 })
  }

  const cfg = validated.config

  // 연결 테스트
  let testResult: { ok: boolean; message?: string }
  switch (cfg.type) {
    case 'postgres':
      testResult = await checkPostgres(cfg)
      break
    case 'sftp':
      testResult = await checkSftp(cfg)
      break
    case 'api':
      testResult = await checkApi(cfg)
      break
    default:
      return NextResponse.json({ ok: false, message: '지원하지 않는 커넥터 유형입니다' }, { status: 400 })
  }

  if (!testResult.ok) {
    return NextResponse.json({ ok: false, message: testResult.message }, { status: 400 })
  }

  const tenantId = body.tenant_id || userTenant
  if (role === 'agency' && userTenant !== tenantId) {
    return NextResponse.json({ error: '자신의 기관 데이터만 등록할 수 있습니다' }, { status: 403 })
  }

  const { data: known } = await supabase
    .from('tenants')
    .select('tenant_id')
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (!known) {
    return NextResponse.json({ error: '알 수 없는 tenant_id' }, { status: 400 })
  }

  // collection_sources에 저장할 URL과 메서드 도출
  let url = ''
  let method = 'GET'
  if (cfg.type === 'postgres') {
    url = `postgres://${cfg.host}:${cfg.port}/${cfg.database}`
  } else if (cfg.type === 'sftp') {
    url = `sftp://${cfg.host}:${cfg.port}${cfg.remotePath}`
  } else {
    url = cfg.url
    method = cfg.method
  }

  const sourceId = newCollectId()
  const jobId = newJobId()
  const title = body.title || `${cfg.type} 커넥터 - ${getConnectorLabel(cfg)}`

  const { error: srcErr } = await supabase.from('collection_sources').insert({
    source_id: sourceId,
    tenant_id: tenantId,
    title,
    description: body.description ?? null,
    url,
    method,
    auth_type: 'none',
    connector_config: cfg,
  })
  if (srcErr) {
    return NextResponse.json({ ok: false, error: srcErr.message }, { status: 500 })
  }

  const { error: jobErr } = await supabase.from('collection_jobs').insert({
    job_id: jobId,
    source_id: sourceId,
    tenant_id: tenantId,
    schedule_type: 'manual',
    status: 'idle',
    enabled: true,
  })
  if (jobErr) {
    return NextResponse.json({ ok: false, error: jobErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, source_id: sourceId, job_id: jobId }, { status: 201 })
}
