import { z } from 'zod'

export const postgresSchema = z.object({
  type: z.literal('postgres'),
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535).default(5432),
  database: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
  ssl: z.boolean().optional(),
})

export const sftpSchema = z.object({
  type: z.literal('sftp'),
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535).default(22),
  username: z.string().min(1),
  password: z.string().optional(),
  privateKey: z.string().optional(),
  remotePath: z.string().min(1),
})

export const apiSchema = z.object({
  type: z.literal('api'),
  url: z.string().url(),
  method: z.enum(['GET', 'POST']).default('GET'),
  headers: z.record(z.string(), z.string()).default({}),
  authType: z.enum(['none', 'bearer', 'api_key']).default('none'),
  authKey: z.string().optional(),
  authValue: z.string().optional(),
})

export type PostgresConfig = z.infer<typeof postgresSchema>
export type SftpConfig = z.infer<typeof sftpSchema>
export type ApiConfig = z.infer<typeof apiSchema>
export type ConnectorConfig = PostgresConfig | SftpConfig | ApiConfig

export interface ConnectorResult {
  ok: boolean
  message?: string
}

const connectorSchema = z.union([postgresSchema, sftpSchema, apiSchema] as const)

export function validateConnectorConfig(value: unknown): { success: true; config: ConnectorConfig } | { success: false; error: string } {
  const result = connectorSchema.safeParse(value)
  if (result.success) return { success: true, config: result.data }
  return { success: false, error: result.error.issues.map(i => i.message).join(', ') }
}
