import { NextResponse } from 'next/server'
import { validateConnectorConfig } from '@/lib/connectors/types'
import { checkPostgres, checkSftp, checkApi } from '@/lib/connectors/server'

export async function POST(request: Request) {
  const body = await request.json()
  const validated = validateConnectorConfig(body)
  if (!validated.success) {
    return NextResponse.json({ ok: false, message: validated.error }, { status: 400 })
  }

  const config = validated.config
  switch (config.type) {
    case 'postgres':
      return NextResponse.json(await checkPostgres(config))
    case 'sftp':
      return NextResponse.json(await checkSftp(config))
    case 'api':
      return NextResponse.json(await checkApi(config))
    default:
      return NextResponse.json({ ok: false, message: '지원하지 않는 커넥터 유형입니다' }, { status: 400 })
  }
}
