import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

type CookieEntry = { name: string; value: string; options?: Record<string, unknown> }

function cookieHandlers(store: Awaited<ReturnType<typeof cookies>>) {
  return {
    getAll() { return store.getAll() },
    setAll(cs: CookieEntry[]) {
      try {
        cs.forEach(({ name, value, options }) => store.set(name, value, options as never))
      } catch {}
    },
  }
}

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: cookieHandlers(cookieStore) }
  )
}

export async function createServiceClient() {
  // 서비스롤 키는 RLS를 우회하므로 사용자 세션 쿠키가 필요 없다.
  // SSR createServerClient는 cookies 옵션을 요구하므로 no-op 핸들러를 전달한다.
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false },
      cookies: {
        getAll() { return [] },
        setAll() { /* no-op: service role은 세션을 갱신하지 않는다 */ },
      },
    }
  )
}
