import type { SupabaseClient } from '@supabase/supabase-js'

const DAILY_LIMIT = 100
const MONTHLY_LIMIT = 2000

export interface QuotaCheck {
  allowed: boolean
  reason?: string
}

export interface UsageRecord {
  calls?: number
  tokens?: number
}

function todayKey(): { date: string; month: string } {
  const today = new Date().toISOString().slice(0, 10)
  return { date: today, month: today.slice(0, 7) }
}

/**
 * 원자적 쿼터 체크 + 증가 (FOR UPDATE 행 잠금으로 TOCTOU 경쟁 조건 방지).
 * checkQuota + recordUsage 두 단계 패턴을 이 함수 하나로 대체한다.
 */
export async function checkAndIncrementQuota(
  userId: string,
  supabase: SupabaseClient,
): Promise<QuotaCheck> {
  const { data, error } = await supabase.rpc('increment_and_check_quota', {
    p_user_id: userId,
  })

  if (error) {
    console.error('[quota] increment_and_check_quota rpc error:', error)
    return { allowed: true }
  }

  const result = data as { allowed: boolean; reason?: string } | null
  return { allowed: result?.allowed ?? true, reason: result?.reason }
}

/**
 * 사용자의 일/월 LLM 사용량 한도를 확인한다.
 * @deprecated checkAndIncrementQuota 사용 권장 (TOCTOU 방지)
 */
export async function checkQuota(userId: string, supabase: SupabaseClient): Promise<QuotaCheck> {
  const { date, month } = todayKey()

  const { data: dailyRow } = await supabase
    .from('llm_usage')
    .select('calls')
    .eq('user_id', userId)
    .eq('date', date)
    .maybeSingle()

  const dailyCalls = dailyRow?.calls ?? 0
  if (dailyCalls >= DAILY_LIMIT) {
    return { allowed: false, reason: `일일 LLM 호출 한도(${DAILY_LIMIT})를 초과했습니다` }
  }

  const { data: monthRows } = await supabase
    .from('llm_usage')
    .select('calls')
    .eq('user_id', userId)
    .eq('month', month)

  const monthlyCalls = (monthRows ?? []).reduce((sum, r) => sum + (r.calls ?? 0), 0)
  if (monthlyCalls >= MONTHLY_LIMIT) {
    return { allowed: false, reason: `월간 LLM 호출 한도(${MONTHLY_LIMIT})를 초과했습니다` }
  }

  return { allowed: true }
}

/**
 * LLM 사용량을 기록한다. 동일 사용자/날짜 row가 있으면 누적한다.
 */
export async function recordUsage(
  userId: string,
  supabase: SupabaseClient,
  usage: UsageRecord,
): Promise<void> {
  const { date, month } = todayKey()

  const { data: existing } = await supabase
    .from('llm_usage')
    .select('id,calls,tokens')
    .eq('user_id', userId)
    .eq('date', date)
    .maybeSingle()

  if (existing) {
    await supabase
      .from('llm_usage')
      .update({
        calls: existing.calls + (usage.calls ?? 1),
        tokens: existing.tokens + (usage.tokens ?? 0),
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
  } else {
    await supabase.from('llm_usage').insert({
      user_id: userId,
      date,
      month,
      calls: usage.calls ?? 1,
      tokens: usage.tokens ?? 0,
    })
  }
}
