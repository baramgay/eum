import type { ConnectorResult } from './types'

export interface PostgresCheckConfig {
  host: string
  port: number
  database: string
  username: string
  password: string
  ssl?: boolean
  tableName?: string
}

export interface PostgresSampleResult extends ConnectorResult {
  rows?: unknown[]
  columns?: string[]
}

export async function checkPostgres(config: PostgresCheckConfig): Promise<ConnectorResult> {
  try {
    const { Client } = await import('pg')
    const client = new Client({
      ...config,
      connectionTimeoutMillis: 5000,
    })
    await client.connect()
    await client.query('SELECT 1')
    await client.end()
    return { ok: true, message: 'PostgreSQL 연결 성공' }
  } catch (e) {
    if (e instanceof Error && 'code' in e && (e as { code?: string }).code === 'MODULE_NOT_FOUND') {
      return { ok: false, message: 'pg 패키지가 설치되지 않아 스텁만 사용 가능합니다 (TODO)' }
    }
    return { ok: false, message: e instanceof Error ? e.message : 'PostgreSQL 연결 실패' }
  }
}

/**
 * Postgres 커넥터로부터 샘플 행을 조회한다.
 *
 * - config.tableName이 있으면 해당 테이블에서 LIMIT 조회
 * - 없으면 연결 테스트만 수행
 */
export async function fetchPostgresSamples(
  config: PostgresCheckConfig,
  limit = 5,
): Promise<PostgresSampleResult> {
  try {
    const { Client } = await import('pg')
    const client = new Client({
      ...config,
      connectionTimeoutMillis: 5000,
    })
    await client.connect()

    if (config.tableName && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(config.tableName)) {
      const res = await client.query(`SELECT * FROM "${config.tableName}" LIMIT $1`, [limit])
      await client.end()
      return {
        ok: true,
        message: `PostgreSQL 샘플 조회 성공 (${res.rows.length}행)`,
        rows: res.rows,
        columns: res.fields.map((f) => f.name),
      }
    }

    await client.query('SELECT 1')
    await client.end()
    return { ok: true, message: 'PostgreSQL 연결 성공' }
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : 'PostgreSQL 샘플 조회 실패',
    }
  }
}
