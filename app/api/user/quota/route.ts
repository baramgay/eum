import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const DAILY_LIMIT = 100
const MONTHLY_LIMIT = 2000

export async function GET() {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })

  const today = new Date().toISOString().slice(0, 10)
  const month = today.slice(0, 7)

  const [dailyRes, monthlyRes] = await Promise.all([
    authClient
      .from('llm_usage')
      .select('calls, tokens')
      .eq('user_id', user.id)
      .eq('date', today)
      .maybeSingle(),
    authClient
      .from('llm_usage')
      .select('calls')
      .eq('user_id', user.id)
      .eq('month', month),
  ])

  const daily_calls = dailyRes.data?.calls ?? 0
  const monthly_calls = (monthlyRes.data ?? []).reduce((s, r) => s + (r.calls ?? 0), 0)

  return NextResponse.json({
    daily_calls,
    daily_limit: DAILY_LIMIT,
    daily_remaining: Math.max(0, DAILY_LIMIT - daily_calls),
    monthly_calls,
    monthly_limit: MONTHLY_LIMIT,
    monthly_remaining: Math.max(0, MONTHLY_LIMIT - monthly_calls),
  })
}
