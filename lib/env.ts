import { z } from 'zod'

const sharedSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3001'),
  NEXT_PUBLIC_KAKAO_MAP_KEY: z.string().optional(),
})

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  CRON_SECRET: z.string().min(1).optional(),
  COLLECTION_SECRET: z.string().min(1).optional(),
  QWEN_API_KEY: z.string().optional(),
  QWEN_BASE_URL: z.string().url().optional(),
  QWEN_MODEL: z.string().default('qwen-turbo'),
  EMBEDDING_API_KEY: z.string().optional(),
  EMBEDDING_BASE_URL: z.string().url().optional(),
  EMBEDDING_MODEL: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().email().optional(),
  CENTER_NOTIFICATION_EMAIL: z.string().email().optional(),
  TEST_CENTER_PASSWORD: z.string().optional(),
  TEST_AGENCY_PASSWORD: z.string().optional(),
  TEST_USER_PASSWORD: z.string().optional(),
})

const isServer = typeof window === 'undefined'

const parsedShared = sharedSchema.parse(process.env)
const parsedServer = isServer ? serverSchema.parse(process.env) : {}

export type Env = z.infer<typeof sharedSchema> & z.infer<typeof serverSchema>
export const env = { ...parsedShared, ...parsedServer } as Env
