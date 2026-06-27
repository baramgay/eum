import { z } from 'zod'

// GitHub Actions: 미설정 Secret은 빈 문자열("")로 전달됨 → undefined로 정규화
const str = (s: z.ZodString) => z.preprocess(v => (v === '' ? undefined : v), s.optional())
const optStr = z.preprocess(v => (v === '' ? undefined : v), z.string().optional())
const optUrl = z.preprocess(v => (v === '' ? undefined : v), z.string().url().optional())
const optEmail = z.preprocess(v => (v === '' ? undefined : v), z.string().email().optional())

const sharedSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3001'),
  NEXT_PUBLIC_KAKAO_MAP_KEY: optStr,
})

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  CRON_SECRET: str(z.string().min(1)),
  COLLECTION_SECRET: str(z.string().min(1)),
  PRIMARY_LLM_PROVIDER: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.enum(['qwen', 'local']).default('qwen'),
  ),
  QWEN_API_KEY: optStr,
  QWEN_BASE_URL: optUrl,
  QWEN_MODEL: z.string().default('qwen-turbo'),
  LOCAL_LLM_BASE_URL: optUrl,
  LOCAL_LLM_MODEL: optStr,
  EMBEDDING_API_KEY: optStr,
  EMBEDDING_BASE_URL: optUrl,
  EMBEDDING_MODEL: optStr,
  RESEND_API_KEY: optStr,
  RESEND_FROM_EMAIL: optEmail,
  CENTER_NOTIFICATION_EMAIL: optEmail,
  TEST_CENTER_PASSWORD: optStr,
  TEST_AGENCY_PASSWORD: optStr,
  TEST_USER_PASSWORD: optStr,
})

const isServer = typeof window === 'undefined'

const parsedShared = sharedSchema.parse(process.env)
const parsedServer = isServer ? serverSchema.parse(process.env) : {}

export type Env = z.infer<typeof sharedSchema> & z.infer<typeof serverSchema>
export const env = { ...parsedShared, ...parsedServer } as Env
