import type { ConnectorResult, SftpConfig } from './types'
import { sftpSchema } from './types'

export async function checkSftp(config: unknown): Promise<ConnectorResult> {
  const parsed = sftpSchema.safeParse(config)
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues.map((i) => i.message).join(', ') }
  }
  const cfg = parsed.data as SftpConfig

  try {
    const mod = await import('ssh2-sftp-client')
    const Client = (mod as { default: new () => any }).default
    const client = new Client()
    const connectOptions = {
      host: cfg.host,
      port: cfg.port,
      username: cfg.username,
      ...(cfg.password ? { password: cfg.password } : {}),
      ...(cfg.privateKey ? { privateKey: cfg.privateKey } : {}),
    }
    await client.connect(connectOptions)
    await client.list(cfg.remotePath)
    await client.end()
    return { ok: true, message: 'SFTP 연결 성공' }
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : 'SFTP 연결 실패',
    }
  }
}
