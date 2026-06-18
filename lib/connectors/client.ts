import type { ConnectorConfig, ConnectorResult } from './types'

export async function testConnector(config: ConnectorConfig): Promise<ConnectorResult> {
  const res = await fetch('/api/connectors/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  })
  if (!res.ok) {
    return { ok: false, message: `서버 오류: ${res.status}` }
  }
  return (await res.json()) as ConnectorResult
}
