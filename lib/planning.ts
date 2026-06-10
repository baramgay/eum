/**
 * 평가대응 계획서 초안 생성 (app/planning.py → TypeScript)
 */
import type { SupabaseClient } from '@supabase/supabase-js'

async function tenantName(supabase: SupabaseClient, tenantId: string): Promise<string> {
  const { data } = await supabase.from('tenants').select('name').eq('tenant_id', tenantId).maybeSingle()
  return data?.name ?? tenantId
}

export async function draftOpenPlan(supabase: SupabaseClient, tenantId: string): Promise<string> {
  const name = await tenantName(supabase, tenantId)
  const { data: rows } = await supabase
    .from('submissions').select('status,title,decision_note')
    .eq('tenant_id', tenantId).order('submitted_at')

  const approved = rows?.filter(r => r.status === 'approved') ?? []
  const rejected = rows?.filter(r => r.status === 'rejected') ?? []
  const pending  = rows?.filter(r => r.status === 'submitted') ?? []

  const lines = [
    `# ${name} 공공데이터 개방계획 초안`, '',
    `- 등록 ${rows?.length ?? 0}건 / 개방 ${approved.length}건 / 보류 ${rejected.length}건 / 검토대기 ${pending.length}건`,
    '', '## 1. 개방 완료',
    ...(approved.length ? approved.map(r => `- ${r.title}`) : ['- (해당 없음)']),
    '', '## 2. 보류 사유 및 향후 조치',
    ...(rejected.length ? rejected.map(r => `- ${r.title}: ${r.decision_note || '사유 미기재'}`) : ['- (해당 없음)']),
    '', '## 3. 향후 개방 예정(검토대기)',
    ...(pending.length ? pending.map(r => `- ${r.title}`) : ['- (해당 없음)']),
  ]
  return lines.join('\n')
}

export async function draftQualityPlan(supabase: SupabaseClient, tenantId: string): Promise<string> {
  const name = await tenantName(supabase, tenantId)
  const { data: rows } = await supabase
    .from('submissions').select('title,status,quality_summary')
    .eq('tenant_id', tenantId).eq('status', 'rejected').order('submitted_at')

  const lines = [
    `# ${name} 품질개선계획 초안`, '',
    `- 개선 검토 대상(보류) ${rows?.length ?? 0}건`, '', '## 개선과제',
  ]

  if (!rows?.length) {
    lines.push('- (현재 보류 상태인 제출이 없어 개선과제가 없습니다)')
    return lines.join('\n')
  }

  for (const r of rows) {
    const summary = r.quality_summary ?? ''
    const rateM   = summary.match(/오류율\s*([\d.]+)%/)
    const errM    = summary.match(/오류\s*(\d+)건/)
    const rate    = rateM ? rateM[1] + '%' : '확인 필요'
    const errors  = errM  ? errM[1]  + '건' : '확인 필요'
    lines.push(
      `- **${r.title}** — 오류 ${errors}, 오류율 ${rate}: ` +
      '데이터 입력 단계의 결측치·중복·이상치 점검 후 재정제하여 재진단 권장'
    )
  }
  return lines.join('\n')
}
