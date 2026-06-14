/**
 * 자연어 데이터 질의 (룰 기반 의도 매칭, LLM 없이 오프라인 동작)
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

  // 의도 0: 정착잠재지수 랭킹 (최우선 — "정착" 키워드 포함)
  if (['정착', '잠재', '정착잠재', '순위', '랭킹'].some(k => ql.includes(k))) {
    let q0 = supabase
      .from('gold_settlement_index')
      .select('sigun,gov_type,rank,settlement_score,youth_pop_2025,youth_net_migration,income_monthly,living_index')
      .order('rank', { ascending: true })
    if (sigun) q0 = (q0 as any).eq('sigun', sigun)
    const { data: raw } = await q0
    const rows = (raw ?? []).map(r => ({
      sigun: r.sigun,
      시군구분: r.gov_type,
      순위: r.rank,
      정착잠재지수: Number(r.settlement_score).toFixed(2),
      청년인구: Math.round(r.youth_pop_2025),
      순유입이동량: Math.round(r.youth_net_migration),
      월평균소득: r.income_monthly,
      생활인구지수: Number(r.living_index).toFixed(1),
    }))
    return {
      intent: '정착잠재지수',
      sigun,
      columns: ['sigun','시군구분','순위','정착잠재지수','청년인구','순유입이동량','월평균소득','생활인구지수'],
      rows,
      source: '2018~2025 KT/KB/KCB/주민등록 통합 분석 (경남빅데이터센터)',
      source_url: 'https://data.go.kr',
    }
  }

  // 의도 3을 먼저 — 구체 키워드(청년센터·도서관)가 포괄 키워드(청년)보다 우선
  if (['시설', '청년센터', '도서관', '체육관', '복지관', '인프라', '문화센터', '청년공간'].some(k => ql.includes(k))) {
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
    return {
      intent: '공공시설',
      sigun,
      columns: ['sigun','시설유형','개수'],
      rows,
      source: '공공데이터포털 시설 현황 (경남빅데이터센터 정제)',
      source_url: 'https://data.go.kr',
    }
  }

  // 의도 1: 청년인구 유출입 (유입 순위 포함)
  if (['청년', '인구', '유입', '유출', '순이동', '이동', '유입순위', '유출순위'].some(k => ql.includes(k))) {
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

    // "유입" 키워드만 있고 "유출" 없으면 유입 기준 정렬
    const sortByInflow = ql.includes('유입') && !ql.includes('유출')
    const rows = Object.entries(grouped)
      .map(([sg, v]) => ({ sigun: sg, ...v }))
      .sort((a, b) => sortByInflow ? b.유입 - a.유입 : b.순이동 - a.순이동)
    return {
      intent: '청년인구 유출입',
      sigun,
      columns: ['sigun','청년인구','유입','유출','순이동'],
      rows,
      source: `${yr ?? ''} 주민등록인구 및 KT 이동인구 (경남빅데이터센터)`,
      source_url: 'https://jumin.mois.go.kr',
    }
  }

  // 의도 2: 사업체·고용 (제조업 포함)
  if (['사업체', '산업', '일자리', '고용', '종사자', '제조업', '업체', '공장'].some(k => ql.includes(k))) {
    const { data: yrD } = await supabase
      .from('gold_business').select('year').order('year', { ascending: false }).limit(1)
    const yr = yrD?.[0]?.year

    // 제조업 특화 쿼리
    const isMfg = ['제조업', '공장', '제조'].some(k => ql.includes(k))
    let q2 = supabase.from('gold_business').select('sigun,industry,biz_count,employees')
    if (yr)    q2 = (q2 as any).eq('year', yr)
    if (sigun) q2 = (q2 as any).eq('sigun', sigun)
    if (isMfg) q2 = (q2 as any).ilike('industry', '%제조%')
    const { data: raw } = await q2

    const grouped: Record<string, { 사업체수: number; 종사자수: number }> = {}
    for (const r of raw ?? []) {
      if (!grouped[r.sigun]) grouped[r.sigun] = { 사업체수: 0, 종사자수: 0 }
      grouped[r.sigun].사업체수 += r.biz_count ?? 0
      grouped[r.sigun].종사자수 += r.employees ?? 0
    }
    const rows = Object.entries(grouped)
      .map(([sg, v]) => ({ sigun: sg, ...v }))
      .sort((a, b) => b.종사자수 - a.종사자수)
    return {
      intent: isMfg ? '제조업 사업체' : '사업체·고용',
      sigun,
      columns: ['sigun','사업체수','종사자수'],
      rows,
      source: `${yr ?? ''} 통계청 전국사업체조사 (경남빅데이터센터 정제)`,
      source_url: 'https://kostat.go.kr',
    }
  }

  // 의도 4: 소득·신용 (KCB)
  if (['소득', '신용', '대출', '카드소비', '경제력', '금융', '카드'].some(k => ql.includes(k))) {
    let q4 = supabase
      .from('gold_settlement_index')
      .select('sigun,income_monthly,credit_score_avg,loan_per_cap,card_3m_per_cap')
      .order('income_monthly', { ascending: false })
    if (sigun) q4 = (q4 as any).eq('sigun', sigun)
    const { data: raw } = await q4
    const rows = (raw ?? []).map(r => ({
      sigun: r.sigun,
      월평균소득: r.income_monthly,
      평균신용점수: r.credit_score_avg,
      '1인당대출': r.loan_per_cap,
      '3개월카드': r.card_3m_per_cap,
    }))
    return {
      intent: '소득·신용 현황',
      sigun,
      columns: ['sigun','월평균소득','평균신용점수','1인당대출','3개월카드'],
      rows,
      source: '2018~2025 KCB 신용융합 데이터 (경남빅데이터센터)',
      source_url: 'https://data.go.kr',
    }
  }

  return {
    intent: null,
    sigun,
    columns: [],
    rows: [],
    hint: "예: '청년 정착잠재 순위', '창원시 청년 순유입 보여줘', '진주 사업체 현황', '거창군 청년센터', '소득 높은 시군', '경남 제조업 현황'",
  }
}
