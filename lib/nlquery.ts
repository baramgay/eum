/**
 * 자연어 데이터 질의 (app/nlquery.py → TypeScript)
 * 의도 매칭 기반 룰 폴백 (LLM 없이 공공망 동작)
 */
import type { SupabaseClient } from '@supabase/supabase-js'

const ADMIN_SUFFIXES = ['시', '군', '구', '동', '읍', '면']

export async function answer(supabase: SupabaseClient, question: string) {
  const q  = (question ?? '').trim()
  const ql = q.replace(/\s/g, '')

  const { data: tenantRows } = await supabase.from('tenants').select('name,sgg_cd')
  let sigun: string | null = null
  for (const t of tenantRows ?? []) {
    const short = ADMIN_SUFFIXES.some(s => t.name.endsWith(s)) ? t.name.slice(0, -1) : t.name
    if (q.includes(t.name) || q.includes(short)) { sigun = t.name; break }
  }

  // 의도 1: 청년인구 유출입
  if (['청년', '인구', '유입', '유출', '순이동'].some(k => ql.includes(k))) {
    const { data: yrD } = await supabase
      .from('gold_youth_population').select('year').order('year', { ascending: false }).limit(1)
    const yr = yrD?.[0]?.year

    let q1 = supabase.from('gold_youth_population').select('sigun,population,inflow,outflow')
    if (yr)    q1 = (q1 as any).eq('year', yr)
    if (sigun) q1 = (q1 as any).eq('sigun', sigun)
    const { data: raw } = await q1

    const grouped: Record<string, { 청년인구: number; 유입: number; 유출: number; 순이동: number }> = {}
    for (const r of raw ?? []) {
      if (!grouped[r.sigun]) grouped[r.sigun] = { 청년인구: 0, 유입: 0, 유출: 0, 순이동: 0 }
      grouped[r.sigun].청년인구 += r.population
      grouped[r.sigun].유입     += r.inflow
      grouped[r.sigun].유출     += r.outflow
      grouped[r.sigun].순이동   += r.inflow - r.outflow
    }
    const rows = Object.entries(grouped)
      .map(([sigun, v]) => ({ sigun, ...v }))
      .sort((a, b) => b.순이동 - a.순이동)
    return { intent: '청년인구 유출입', sigun, columns: ['sigun','청년인구','유입','유출','순이동'], rows }
  }

  // 의도 2: 사업체·고용
  if (['사업체', '산업', '일자리', '고용', '종사자'].some(k => ql.includes(k))) {
    const { data: yrD } = await supabase
      .from('gold_business').select('year').order('year', { ascending: false }).limit(1)
    const yr = yrD?.[0]?.year

    let q2 = supabase.from('gold_business').select('sigun,biz_count,employees')
    if (yr)    q2 = (q2 as any).eq('year', yr)
    if (sigun) q2 = (q2 as any).eq('sigun', sigun)
    const { data: raw } = await q2

    const grouped: Record<string, { 사업체수: number; 종사자수: number }> = {}
    for (const r of raw ?? []) {
      if (!grouped[r.sigun]) grouped[r.sigun] = { 사업체수: 0, 종사자수: 0 }
      grouped[r.sigun].사업체수 += r.biz_count
      grouped[r.sigun].종사자수 += r.employees
    }
    const rows = Object.entries(grouped)
      .map(([sigun, v]) => ({ sigun, ...v }))
      .sort((a, b) => b.종사자수 - a.종사자수)
    return { intent: '사업체·고용', sigun, columns: ['sigun','사업체수','종사자수'], rows }
  }

  // 의도 3: 공공시설
  if (['시설', '청년센터', '도서관', '체육관', '복지관', '인프라'].some(k => ql.includes(k))) {
    let q3 = supabase.from('gold_public_facility').select('sigun,ftype')
    if (sigun) q3 = (q3 as any).eq('sigun', sigun)
    const { data: raw } = await q3

    const grouped: Record<string, Record<string, number>> = {}
    for (const r of raw ?? []) {
      if (!grouped[r.sigun]) grouped[r.sigun] = {}
      grouped[r.sigun][r.ftype] = (grouped[r.sigun][r.ftype] ?? 0) + 1
    }
    const rows = Object.entries(grouped)
      .flatMap(([sName, ft]) => Object.entries(ft).map(([시설유형, 개수]) => ({ sigun: sName, 시설유형, 개수 })))
      .sort((a, b) => a.sigun.localeCompare(b.sigun) || b.개수 - a.개수)
    return { intent: '공공시설', sigun, columns: ['sigun','시설유형','개수'], rows }
  }

  return {
    intent: null, sigun, columns: [], rows: [],
    hint: "예: '창원시 청년 순유입 보여줘', '진주 사업체 현황', '거창군 청년센터'",
  }
}
