/**
 * 자연어 데이터 질의 (룰 기반 의도 매칭, LLM 없이 오프라인 동작)
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { SIGUN_LIST } from './regions'
import { parseModifiers, applyTopN, applyFilters } from './nlquery/query-modifiers'
import type { ModifierResult } from './nlquery/query-modifiers'
import { summarize } from './nlquery/summarize'
import { extractInheritedSigun, buildEffectiveQuestion } from './nlquery/context'
import type { ConversationTurn } from './nlquery/context'

const ADMIN_SUFFIXES = ['시', '군', '구', '동', '읍', '면']

const INVENTORY_KEYWORDS = [
  '데이터', '목록', '안내', '뭐있', '무엇이있', '어떤', '주제', '보유', '리스트', '카탈로그',
  'list', 'help', '예시', '예제', '질문', '물어볼', '뭐가있', '뭐가',
]

const DATASET_CATALOG = [
  { 주제: '정착잠재지수', 설명: 'KT/KB/KCB/주민등록 통합 분석', 예시질문: '청년 정착잠재 순위 보여줘' },
  { 주제: '청년인구 유출입', 설명: '주민등록인구 및 KT 이동인구', 예시질문: '창원시 청년 인구 유출입 현황' },
  { 주제: '사업체·고용', 설명: '통계청 전국사업체조사', 예시질문: '창원시 사업체 현황' },
  { 주제: '제조업 사업체', 설명: '제조업 사업체 및 종사자', 예시질문: '경남 제조업 현황' },
  { 주제: '공공시설', 설명: '공공데이터포털 시설 현황', 예시질문: '경남 청년센터 시설 현황' },
  { 주제: '소득·신용', 설명: 'KCB 신용융합 데이터', 예시질문: '소득 높은 시군 순위' },
]

function normalize(q: string): string {
  return q.replace(/\s/g, '').toLowerCase()
}

function hasKeyword(q: string, keywords: string[]): boolean {
  return keywords.some((k) => q.includes(k))
}

export interface QueryResult {
  intent: string | null
  sigun?: string | null
  columns: string[]
  rows: Record<string, unknown>[]
  hint?: string
  source?: string
  source_url?: string
  follow_up?: string[]
  /** 자연어 요약 문장 */
  summary?: string
  /** 적용된 TOP-N 개수 */
  topN?: number
  /** 적용된 필터 설명 */
  filterDescription?: string
}

export interface AnswerOptions {
  /** 외부에서 캐싱된 tenants 목록 */
  tenants?: { name: string; sgg_cd: string }[]
}

interface SigunMatch {
  name: string
  sgg_cd?: string
}

function extractSigun(q: string, tenants: { name: string; sgg_cd?: string }[]): SigunMatch | null {
  const tenantMap = new Map<string, string>()
  for (const t of tenants ?? []) {
    if (t.sgg_cd) tenantMap.set(t.name, t.sgg_cd)
  }
  const names = Array.from(new Set([...(tenants ?? []).map((t) => t.name), ...SIGUN_LIST]))
  for (const name of names) {
    const short = ADMIN_SUFFIXES.some((s) => name.endsWith(s)) ? name.slice(0, -1) : name
    if (q.includes(name) || q.includes(short)) {
      return { name, sgg_cd: tenantMap.get(name) }
    }
  }
  return null
}

/** 의도별 컬럼 별칭: aliases[실제컬럼명] = [한글/영문 별칭] */
const INTENT_ALIASES: Record<string, Record<string, string[]>> = {
  '정착잠재지수': {
    '정착잠재지수': ['정착잠재지수', '정착', '잠재', '지수'],
    '순위': ['순위', 'rank'],
    '청년인구': ['청년인구', '인구'],
    '순유입이동량': ['순유입이동량', '순이동', '유입'],
    '월평균소득': ['월평균소득', '소득'],
    '생활인구지수': ['생활인구지수', '생활'],
  },
  '공공시설': {
    '개수': ['개수', '수', '갯수'],
    '시설유형': ['시설유형', '유형', 'ftype'],
  },
  '청년인구 유출입': {
    '청년인구': ['청년인구', '인구', 'population'],
    '유입': ['유입', 'inflow'],
    '유출': ['유출', 'outflow'],
    '순이동': ['순이동', 'net'],
  },
  '사업체·고용': {
    '사업체수': ['사업체수', '사업체', '업체'],
    '종사자수': ['종사자수', '종사자', '고용'],
  },
  '제조업 사업체': {
    '사업체수': ['사업체수', '사업체', '업체', '제조업'],
    '종사자수': ['종사자수', '종사자', '고용'],
  },
  '소득·신용 현황': {
    '월평균소득': ['월평균소득', '소득', 'income'],
    '평균신용점수': ['평균신용점수', '신용', 'credit'],
    '1인당대출': ['1인당대출', '대출', 'loan'],
    '3개월카드': ['3개월카드', '카드', 'card'],
  },
}

function formatFilterDescription(filters: ModifierResult['filters']): string {
  if (!filters.length) return ''
  return filters
    .map((f) => {
      const opText: Record<string, string> = {
        gt: '초과',
        gte: '이상',
        lt: '미만',
        lte: '이하',
        eq: '동일',
        neq: '제외',
      }
      return `${f.column} ${f.value}${opText[f.op] ?? '이상'}`
    })
    .join(', ')
}

function applyModifiersAndSummarize(
  result: QueryResult,
  question: string
): QueryResult {
  const aliases = INTENT_ALIASES[result.intent ?? ''] ?? {}
  const mods = parseModifiers(question, aliases)
  const filtered = applyFilters(result.rows, mods.filters)
  const sliced = applyTopN(filtered, mods.topN, mods.direction)
  const summary = summarize({
    intent: result.intent,
    sigun: result.sigun,
    columns: result.columns,
    rows: sliced,
    topN: mods.topN,
    direction: mods.direction,
    filters: mods.filters,
  })
  return {
    ...result,
    rows: sliced,
    summary,
    topN: mods.topN,
    filterDescription: mods.filters.length > 0 ? formatFilterDescription(mods.filters) : undefined,
  }
}

export function buildFollowUpQuestions(intent: string | null, sigun: string | null): string[] {
  const s = sigun ? sigun.replace(/시$|군$|구$/, '') : null
  const suffix = sigun ? ` (${sigun})` : ''
  switch (intent) {
    case '정착잠재지수':
      return [
        `정착잠재지수 상위 5개 시군 알려줘`,
        `${s || '창원'}시 청년 인구 유출입 현황`,
        `소득 높은 시군 순위`,
      ]
    case '공공시설':
      return [
        `${s || '경남'} 청년센터 시설 현황`,
        `${s || '전체'} 시설 유형별 비율`,
        `${s || '창원'}시 도서관·문화센터 현황`,
      ]
    case '청년인구 유출입':
      return [
        `${s || '경남'} 청년 인구 유입 순위`,
        `${s || '창원'}시 정착잠재지수`,
        `청년 인구가 많은 시군 Top 5`,
      ]
    case '사업체·고용':
    case '제조업 사업체':
      return [
        `${s || '경남'} 제조업 사업체 현황`,
        `${s || '창원'}시 사업체 수 순위`,
        `소득 높은 시군 순위`,
      ]
    case '소득·신용 현황':
      return [
        `월평균 소득 높은 시군 Top 5`,
        `${s || '경남'} 청년 정착잠재 순위`,
        `${s || '창원'}시 사업체 현황`,
      ]
    default:
      return [
        `청년 정착잠재 순위 보여줘`,
        `창원시 사업체 현황`,
        `경남 청년센터 시설 현황`,
      ]
  }
}

export async function answer(
  supabase: SupabaseClient,
  question: string,
  context: ConversationTurn[] = [],
  options?: AnswerOptions,
): Promise<QueryResult> {
  const q  = (question ?? '').trim()
  const ql = q.replace(/\s/g, '')

  const tenantRows = options?.tenants ?? ((await supabase.from('tenants').select('name,sgg_cd')).data ?? [])
  let sigunMatch = extractSigun(q, tenantRows)

  // 문맥에서 시군 추론: 현재 질문에 시군이 없고 이전 턴에 있으면 상속
  if (!sigunMatch && context.length > 0) {
    sigunMatch = extractInheritedSigun(context, (ctxQ) => extractSigun(ctxQ, tenantRows))
  }

  const sigun = sigunMatch?.name ?? null
  const sggCd = sigunMatch?.sgg_cd ?? null

  // 짧은 후속 질문이 의도 키워드를 포함하지 않으면 문맥 키워드/의도 보강
  const { text: effectiveQ } = buildEffectiveQuestion(q, context)
  const effectiveQl = effectiveQ.replace(/\s/g, '')

  // 의도 -1: 데이터 목록/안내 질문
  if (hasKeyword(effectiveQl, INVENTORY_KEYWORDS)) {
    return {
      intent: '데이터안내',
      sigun,
      columns: ['주제', '설명', '예시질문'],
      rows: DATASET_CATALOG.map((r) => ({ ...r })),
      hint: sigun
        ? `'${sigun}'와(과) 함께 위 주제를 조합해서 질문할 수 있습니다. 예: ${sigun} 사업체 현황`
        : '원하는 시군명과 위 주제를 조합해서 질문할 수 있습니다. 예: 창원시 청년 인구 유출입',
      follow_up: DATASET_CATALOG.slice(0, 3).map((r) => r.예시질문),
    }
  }

  // 의도 0: 정착잠재지수 (정착/잠재/정착지수 키워드 — "순위"만으로는 다른 주제와 충돌하므로 제외)
  if (hasKeyword(effectiveQl, ['정착', '잠재', '정착잠재', '정착지수', '정착잠재지수'])) {
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
    return applyModifiersAndSummarize({
      intent: '정착잠재지수',
      sigun,
      columns: ['sigun','시군구분','순위','정착잠재지수','청년인구','순유입이동량','월평균소득','생활인구지수'],
      rows,
      source: '2018~2025 KT/KB/KCB/주민등록 통합 분석 (경남빅데이터센터)',
      source_url: 'https://data.go.kr',
      follow_up: buildFollowUpQuestions('정착잠재지수', sigun),
    }, q)
  }

  // 의도 3을 먼저 — 구체 키워드(청년센터·도서관)가 포괄 키워드(청년)보다 우선
  if (hasKeyword(effectiveQl, ['시설', '공공시설', '복지시설', '문화시설', '청년센터', '도서관', '체육관', '복지관', '인프라', '문화센터', '청년공간'])) {
    let q3 = supabase.from('gold_public_facility').select('sigun,ftype')
    if (sigun) q3 = (q3 as any).eq(sggCd ? 'sgg_cd' : 'sigun', sggCd ?? sigun)
    const { data: raw } = await q3

    const grouped: Record<string, Record<string, number>> = {}
    for (const r of raw ?? []) {
      if (!grouped[r.sigun]) grouped[r.sigun] = {}
      grouped[r.sigun][r.ftype] = (grouped[r.sigun][r.ftype] ?? 0) + 1
    }
    const rows = Object.entries(grouped)
      .flatMap(([sName, ft]) => Object.entries(ft).map(([시설유형, 개수]) => ({ sigun: sName, 시설유형, 개수 })))
      .sort((a, b) => a.sigun.localeCompare(b.sigun) || b.개수 - a.개수)
    return applyModifiersAndSummarize({
      intent: '공공시설',
      sigun,
      columns: ['sigun','시설유형','개수'],
      rows,
      source: '공공데이터포털 시설 현황 (경남빅데이터센터 정제)',
      source_url: 'https://data.go.kr',
      follow_up: buildFollowUpQuestions('공공시설', sigun),
    }, q)
  }

  // 의도 1: 청년인구 유출입 (유입 순위 포함)
  if (hasKeyword(effectiveQl, ['청년', '인구', '유입', '유출', '순이동', '이동', '유입순위', '유출순위', '유입이많은', '유출이많은'])) {
    const { data: yrD } = await supabase
      .from('gold_youth_population').select('year').order('year', { ascending: false }).limit(1)
    const yr = yrD?.[0]?.year

    let q1 = supabase.from('gold_youth_population').select('sigun,population,inflow,outflow')
    if (yr)    q1 = (q1 as any).eq('year', yr)
    if (sigun) q1 = (q1 as any).eq(sggCd ? 'sgg_cd' : 'sigun', sggCd ?? sigun)
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
    const sortByInflow = effectiveQl.includes('유입') && !effectiveQl.includes('유출')
    const rows = Object.entries(grouped)
      .map(([sg, v]) => ({ sigun: sg, ...v }))
      .sort((a, b) => sortByInflow ? b.유입 - a.유입 : b.순이동 - a.순이동)
    return applyModifiersAndSummarize({
      intent: '청년인구 유출입',
      sigun,
      columns: ['sigun','청년인구','유입','유출','순이동'],
      rows,
      source: `${yr ?? ''} 주민등록인구 및 KT 이동인구 (경남빅데이터센터)`,
      source_url: 'https://jumin.mois.go.kr',
      follow_up: buildFollowUpQuestions('청년인구 유출입', sigun),
    }, q)
  }

  // 의도 2: 사업체·고용 (제조업 포함)
  if (hasKeyword(effectiveQl, ['사업체', '산업', '일자리', '고용', '종사자', '제조업', '업체', '공장', '업종', '산업별'])) {
    const { data: yrD } = await supabase
      .from('gold_business').select('year').order('year', { ascending: false }).limit(1)
    const yr = yrD?.[0]?.year

    // 제조업 특화 쿼리
    const isMfg = ['제조업', '공장', '제조'].some(k => effectiveQl.includes(k))
    let q2 = supabase.from('gold_business').select('sigun,industry,biz_count,employees')
    if (yr)    q2 = (q2 as any).eq('year', yr)
    if (sigun) q2 = (q2 as any).eq(sggCd ? 'sgg_cd' : 'sigun', sggCd ?? sigun)
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
    return applyModifiersAndSummarize({
      intent: isMfg ? '제조업 사업체' : '사업체·고용',
      sigun,
      columns: ['sigun','사업체수','종사자수'],
      rows,
      source: `${yr ?? ''} 통계청 전국사업체조사 (경남빅데이터센터 정제)`,
      source_url: 'https://kostat.go.kr',
      follow_up: buildFollowUpQuestions(isMfg ? '제조업 사업체' : '사업체·고용', sigun),
    }, q)
  }

  // 의도 4: 소득·신용 (KCB)
  if (hasKeyword(effectiveQl, ['소득', '신용', '대출', '카드소비', '경제력', '금융', '카드', '월급', '연봉', '소득순위'])) {
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
    return applyModifiersAndSummarize({
      intent: '소득·신용 현황',
      sigun,
      columns: ['sigun','월평균소득','평균신용점수','1인당대출','3개월카드'],
      rows,
      source: '2018~2025 KCB 신용융합 데이터 (경남빅데이터센터)',
      source_url: 'https://data.go.kr',
      follow_up: buildFollowUpQuestions('소득·신용 현황', sigun),
    }, q)
  }

  // 어떤 의도에도 맞지 않으면 데이터 안내를 반환 (0개 결과 대신 실제 도움 제공)
  return {
    intent: '데이터안내',
    sigun,
    columns: ['주제', '설명', '예시질문'],
    rows: DATASET_CATALOG.map((r) => ({ ...r })),
    hint: sigun
      ? `'${sigun}'와(과) 함께 조회할 수 있는 데이터 목록입니다. 예: ${sigun} 사업체 현황, ${sigun} 청년센터`
      : '아래 데이터 목록을 참고해 시군명과 주제를 조합해서 질문할 수 있습니다. 예: 창원시 사업체 현황',
    follow_up: DATASET_CATALOG.slice(0, 3).map((r) => r.예시질문),
  }
}
