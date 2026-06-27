import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })
  if (user.user_metadata?.role !== 'center') {
    return NextResponse.json({ error: '센터 권한이 필요합니다' }, { status: 403 })
  }

  const sb = await createServiceClient()
  const thisMonth = new Date().toISOString().slice(0, 7)

  const [
    subTotal,
    subApproved,
    qualityRows,
    apiCount,
    llmRows,
  ] = await Promise.all([
    sb.from('submissions').select('*', { count: 'exact', head: true }),
    sb.from('submissions').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
    sb.from('quality_results').select('pass_rate').order('ran_at', { ascending: false }).limit(30),
    sb.from('api_access_logs').select('*', { count: 'exact', head: true }),
    sb.from('llm_usage').select('calls,tokens').eq('month', thisMonth),
  ])

  const avgQuality =
    qualityRows.data && qualityRows.data.length > 0
      ? qualityRows.data.reduce((s, r) => s + (r.pass_rate ?? 0), 0) / qualityRows.data.length
      : 0

  const monthlyCalls = (llmRows.data ?? []).reduce((s, r) => s + (r.calls ?? 0), 0)
  const monthlyTokens = (llmRows.data ?? []).reduce((s, r) => s + (r.tokens ?? 0), 0)
  const total = subTotal.count ?? 0
  const approved = subApproved.count ?? 0

  return NextResponse.json({
    submissions: {
      total,
      approved,
      approvalRate: total > 0 ? Math.round((approved / total) * 100) : 0,
    },
    quality: {
      avgPassRate: Math.round(avgQuality),
      checked: qualityRows.data?.length ?? 0,
    },
    api: {
      totalAccess: apiCount.count ?? 0,
    },
    llm: {
      monthlyCalls,
      monthlyTokens,
    },
  })
}
