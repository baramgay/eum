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
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: cookieHandlers(cookieStore) }
  )
}
