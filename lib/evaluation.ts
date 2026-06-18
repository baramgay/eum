/**
 * 평가편람 자동대응 엔진 (app/evaluation.py → TypeScript)
 * 2026 평가편람 5개 영역 지표를 Supabase 데이터에서 자동 산출
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { chatCompletion } from './ai/provider'

// 2026 평가편람 기준 (개방·활용 50, 관리체계 11, 합계 200 + 가점 5)
export const AREAS = [
  { key: 'open',     name: '개방·활용', weight: 50, color: '#1457b8' },
  { key: 'quality',  name: '품질',      weight: 45, color: '#0f9d8f' },
  { key: 'analysis', name: '분석·활용', weight: 53, color: '#7b4fc4' },
  { key: 'share',    name: '공유',      weight: 41, color: '#1aa251' },
  { key: 'mgmt',     name: '관리체계',  weight: 11, color: '#e8a317' },
] as const

const MACHINE_READABLE = new Set(['csv','json','xlsx','parquet','tsv','geojson','xml','rdf'])
const OPEN_LICENSE_RE  = /공공누리|cc\s*by|open\s*data|공개|개방/i

export function isQualityPassed(summary: string | null | undefined): boolean {
  const s = (summary ?? '').trim()
  return s.endsWith('통과') && !s.endsWith('미통과')
}

function parseSuggestions(value: unknown): unknown {
  if (!value) return null
  if (typeof value === 'object') return value
  try {
    return JSON.parse(String(value))
  } catch {
    return null
  }
}

async function ensureAiReadySuggestions(
  row: Record<string, unknown>,
  supabase?: SupabaseClient,
): Promise<unknown> {
  const existing = parseSuggestions(row.suggestions)
  if (existing) return existing
  if (!supabase) return null
  if (!process.env.QWEN_API_KEY) return null

  const datasetId = row.dataset_id as string | undefined
  if (!datasetId) return null

  try {
    const prompt = `아래 공공데이터셋의 메타데이터를 개선하기 위한 제안을 JSON 형태로 답변하세요.
답변 형식: {"description_suggestion": "...", "keywords_suggestion": "...", "reason": "..."}

제목: ${row.title ?? ''}
주제: ${row.theme ?? ''}
키워드: ${row.keywords ?? ''}
설명: ${row.description ?? ''}`

    const { content } = await chatCompletion({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
    })

    const jsonMatch = content.match(/\{[\s\S]*\}/)
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null
    if (parsed && typeof parsed === 'object') {
      await supabase.from('catalog').update({ suggestions: parsed }).eq('dataset_id', datasetId)
      return parsed
    }
  } catch {
    // LLM 제안 생성 실패 시 체크리스트 결과에 영향을 주지 않는다.
  }
  return null
}

export interface AiReadyChecklistResult {
  ai_ready: boolean
  pass_count: number
  total: number
  checklist: { name: string; pass: boolean; detail: string }[]
  suggestions?: unknown
}

// 2026 평가편람 ② AI친화·고가치 데이터 개방 노력 — AI-Ready 공식 체크리스트
export function computeAiReadyChecklist(row: Record<string, unknown>): AiReadyChecklistResult
export function computeAiReadyChecklist(
  row: Record<string, unknown>,
  supabase: SupabaseClient,
): Promise<AiReadyChecklistResult>
export function computeAiReadyChecklist(
  row: Record<string, unknown>,
  supabase?: SupabaseClient,
): AiReadyChecklistResult | Promise<AiReadyChecklistResult> {
  const qPassed    = isQualityPassed(String(row.quality_summary ?? ''))
  const rows       = Number(row.rows ?? 0)
  const desc       = String(row.description ?? '').trim()
  const title      = String(row.title ?? '').trim()
  const theme      = String(row.theme ?? '').trim()
  const kw         = String(row.keywords ?? '').trim()
  const lic        = String(row.license ?? '').trim()
  const fmt        = String(row.format ?? '').trim().toLowerCase()
  const isOpen     = Boolean(row.is_open)
  const updatedAt  = String(row.updated_at ?? '')
  const apiEnabled = Boolean(row.api_enabled)

  // 최근 1년 이내 갱신 여부
  const oneYearAgo = new Date()
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
  const isRecent = updatedAt ? new Date(updatedAt) > oneYearAgo : false

  const checklist = [
    {
      name: '① 기계가독 형식 (CSV/JSON/XML/Parquet 등)',
      pass:MACHINE_READABLE.has(fmt),
      detail: MACHINE_READABLE.has(fmt)
        ? `형식 ${fmt.toUpperCase()} — AI 학습 도구에서 직접 처리 가능`
        : `형식 ${fmt.toUpperCase() || '미지정'} — CSV·JSON·Parquet 등 기계가독 형식 필요`,
    },
    {
      name: '② 충분한 데이터 규모 (100행 이상)',
      pass:rows >= 100,
      detail: rows >= 100
        ? `${rows.toLocaleString()}행 — AI 학습·분석에 적정 규모`
        : `${rows.toLocaleString()}행 — 최소 100행 이상 권장 (현재 기준 미달)`,
    },
    {
      name: '③ 메타데이터 충실 (제목·설명 20자·주제·키워드 모두 입력)',
      pass:!!(title && theme && kw && desc.length >= 20),
      detail: (title && theme && kw && desc.length >= 20)
        ? '제목·설명·주제·키워드 모두 충실히 입력됨'
        : '제목·설명(20자 이상)·주제·키워드를 모두 입력해야 합니다',
    },
    {
      name: '④ 오픈 라이선스 명시 (공공누리·CC BY 등)',
      pass:!!lic && OPEN_LICENSE_RE.test(lic),
      detail: (lic && OPEN_LICENSE_RE.test(lic))
        ? `라이선스: ${lic} — 자유 활용 가능`
        : `라이선스 미지정 또는 비개방 — '공공누리 1유형' 또는 'CC BY 4.0' 명시 필요`,
    },
    {
      name: '⑤ 공개 상태 (개방포털 등록)',
      pass:isOpen,
      detail: isOpen ? '공개포털에 등록·공개 완료' : '아직 비공개 상태 — 개방포털 등록 필요',
    },
    {
      name: '⑥ 최근 1년 내 갱신',
      pass:isRecent,
      detail: isRecent
        ? `최근 갱신일: ${updatedAt.slice(0,10)} — 최신성 확보`
        : `갱신이 1년 이상 경과 — 데이터 최신화 필요`,
    },
    {
      name: '⑦ API 제공',
      pass:apiEnabled,
      detail: apiEnabled
        ? 'API 엔드포인트 제공 — 자동화·연계 활용 가능'
        : 'API 미제공 — 공개 API 등록 시 활용도 크게 향상',
    },
    {
      name: '⑧ 품질진단 통과',
      pass:qPassed,
      detail: qPassed
        ? '오류율 기준 이하, 자동 품질진단 통과'
        : `품질진단 미통과 — ${row.quality_summary || '진단 미실시'}`,
    },
  ]
  const passedCount = checklist.filter(c => c.pass).length
  const base: AiReadyChecklistResult = {
    ai_ready: passedCount >= 6, // 8개 중 6개 이상 통과 시 AI-Ready
    pass_count: passedCount,
    total: checklist.length,
    checklist,
  }

  if (!supabase) {
    base.suggestions = parseSuggestions(row.suggestions)
    return base
  }

  return (async () => {
    base.suggestions = await ensureAiReadySuggestions(row, supabase)
    return base
  })()
}

// 2026 평가편람 ⑤ 가명정보·합성데이터 개방 실적 (가점, 1건당 1점, 최대 5점)
export function computeSyntheticBonus(syntheticCount: number, anonymizedCount: number) {
  const total    = syntheticCount + anonymizedCount
  const bonus    = Math.min(total, 5)
  return {
    synthetic_count:   syntheticCount,
    anonymized_count:  anonymizedCount,
    total_cases:       total,
    bonus_score:       bonus,
    max_bonus:         5,
    detail: `합성데이터 ${syntheticCount}건 + 가명정보 제공 ${anonymizedCount}건 = ${total}건 → 가점 ${bonus}점`,
  }
}

export function computeSubmissionContribution(row: Record<string, unknown>) {
  const status       = String(row.status ?? '')
  const qPassed      = isQualityPassed(String(row.quality_summary ?? ''))
  const rows         = Number(row.rows ?? 0)
  const commentCount = Number(row.comment_count ?? 0)
  const hasNote      = !!String(row.decision_note ?? '').trim()

  return [
    {
      key: 'open', name: '개방·활용', contributes: status === 'approved',
      note: status === 'approved' ? '승인되어 개방포털에 등록·공개됨' : '승인되면 개방 데이터셋으로 등록되어 기여',
    },
    {
      key: 'quality', name: '품질', contributes: qPassed,
      note: row.quality_summary ? `자동 진단 결과 — ${row.quality_summary}` : '진단 대기 중',
    },
    {
      key: 'analysis', name: '분석·활용',
      contributes: status === 'approved' && rows >= 50,
      note: rows >= 50
        ? `${rows.toLocaleString()}행 데이터가 온톨로지·분석 자산으로 활용 가능`
        : `${rows.toLocaleString()}행 — 분석 활용 기준(50행 이상) 미달`,
    },
    {
      key: 'share', name: '공유', contributes: commentCount > 0,
      note: commentCount > 0
        ? `센터 컨설팅 코멘트 ${commentCount}건으로 기관-센터 간 공유 실적 형성`
        : '코멘트 등록 시 기관-센터 간 공유 실적으로 기여',
    },
    {
      key: 'mgmt', name: '관리체계',
      contributes: ['approved','rejected'].includes(status) && hasNote,
      note: (['approved','rejected'].includes(status) && hasNote)
        ? '담당자 결정 이력(메모 포함)이 기록되어 관리체계 증빙으로 활용'
        : '검토·결정 메모가 등록되면 관리체계 증빙으로 기여',
    },
  ]
}

// 정성지표 키 → 지표 이름 매핑 (017_qualitative_inputs 테이블과 동기)
export const QUALITATIVE_KEYS: Record<string, string> = {
  open_request_timeliness:       "③-1 공공데이터 제공신청 적기 처리율",
  open_period_compliance:        "③-2 공공데이터 제공 주기 준수율",
  open_support_activity:         "④-3 공공데이터 활용 지원 실적",
  analysis_policy_impact:        "①-2 분析 결과의 정책활용 노력 및 성과",
  analysis_ai_training:          "② AI·데이터 문해력 교육 실적",
  analysis_data_governance:      "③-3 AI·데이터기반행정 활성화 노력",
  mgmt_capability_infra:         "③ 데이터 역량 강화 인프라",
}

async function sc(supabase: SupabaseClient, table: string, filter?: [string, boolean]) {
  let q: any = supabase.from(table).select('*', { count: 'exact', head: true })
  if (filter) {
    q = q.eq(filter[0], filter[1])
  }
  const r = await q
  return r.count ?? 0
}

export async function computeIndicators(supabase: SupabaseClient, tenantId?: string) {
  const filter = tenantId
    ? (table: string) => supabase.from(table).select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId)
    : (table: string) => supabase.from(table).select('*', { count: 'exact', head: true })

  const scFiltered = async (table: string, col?: string, val?: boolean) => {
    let q: any = filter(table)
    if (col !== undefined) {
      q = q.eq(col, val)
    }
    const r = await q
    return r.count ?? 0
  }

  const [totalDs, openDs, aiReady, highValue, apiEnabled,
         usage, qTotal, qPass, errRes,
         objCnt, linkCnt, tTotal, tOn,
         syntheticCnt, analysisCnt] = await Promise.all([
    scFiltered('catalog'),
    scFiltered('catalog', 'is_open', true),
    scFiltered('catalog', 'ai_ready', true),
    scFiltered('catalog', 'high_value', true),
    scFiltered('catalog', 'api_enabled', true),
    scFiltered('usage_log'),
    scFiltered('quality_results'),
    scFiltered('quality_results', 'passed', true),
    tenantId
      ? supabase.from('quality_results').select('error_rate, dataset_id').in(
          'dataset_id',
          (await supabase.from('catalog').select('dataset_id').eq('tenant_id', tenantId)).data?.map(r=>r.dataset_id) ?? []
        )
      : supabase.from('quality_results').select('error_rate'),
    sc(supabase, 'onto_objects'),
    sc(supabase, 'onto_links'),
    sc(supabase, 'tenants'),
    sc(supabase, 'tenants', ['onboarded', true]),
    // 가명정보·합성데이터 실적 (015 마이그레이션 이후 활성)
    Promise.resolve(
      tenantId
        ? supabase.from('anonymous_data_cases').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId)
        : supabase.from('anonymous_data_cases').select('*', { count: 'exact', head: true })
    ).then(r => (r as { count: number | null }).count ?? 0).catch(() => 0),
    Promise.resolve(
      tenantId
        ? supabase.from('analysis_records').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId)
        : supabase.from('analysis_records').select('*', { count: 'exact', head: true })
    ).then(r => (r as { count: number | null }).count ?? 0).catch(() => 0),
  ])
  const errData = (errRes as { data: { error_rate: number }[] | null }).data
  const avgErr = errData?.length
    ? errData.reduce((s, r) => s + (r.error_rate ?? 0), 0) / errData.length : 0

  const openRate = totalDs ? openDs / totalDs * 100 : 0
  const aiRate   = totalDs ? aiReady / totalDs * 100 : 0
  const apiRate  = totalDs ? (apiEnabled as number) / totalDs * 100 : 0

  // 2026 평가편람 19개 지표 구조 (정량 지표 자동 집계, 정성 지표는 na로 표시)
  type Ind = [string, string, string, 'ok'|'warn'|'na', string]
  const indicators: Ind[] = [
    // ─── 개방·활용 (50점) ────────────────────────────────────────────────────
    ['open', '①-1 \'26년 개방계획 이행률',
      `${openDs}/${totalDs}`, openRate >= 80 ? 'ok':'warn',
      '메타관리시스템 기반 개방계획 이행 (A기관 5점 / B기관 8점)'],
    ['open', '①-2 \'27년 개방계획 조기 이행 및 중장기 계획 수립',
      openDs > 0 ? '이행중' : '미이행', openDs > 0 ? 'ok':'warn',
      '27~29년 중장기 개방계획 수립 및 조기 이행 (7점)'],
    ['open', '② AI친화·고가치 데이터 개방 노력',
      `AI-Ready ${aiRate.toFixed(0)}% / 고가치 ${highValue}건`,
      (aiRate >= 30 && highValue >= 2) ? 'ok':'warn',
      '정성평가 — AI-Ready 체크리스트 충족 비율·고가치 데이터 TOP100 개방'],
    ['open', '③-1 공공데이터 제공신청 적기 처리율',
      '자동집계', 'na', '제공신청 처리 건 적기 완료율 (2점)'],
    ['open', '③-2 공공데이터 제공 주기 준수율',
      '자동집계', 'na', '정기·수시 갱신 주기 준수율 (3점)'],
    ['open', '④-1 활용성 진단 서비스 기준값 달성도',
      `${usage}건`, usage >= 100 ? 'ok':'warn',
      '공공데이터포털 활용성 진단 기준값 대비 달성도 (5점)'],
    ['open', '④-2 공공데이터 민간 활용 성과',
      `API제공 ${apiRate.toFixed(0)}% / 활용로그 ${usage}건`,
      (usage >= 50 && apiRate >= 30) ? 'ok' : usage >= 10 ? 'warn' : 'warn',
      '민간·공공 활용 건수·성과 (정량+정성, 7점)'],
    ['open', '④-3 공공데이터 활용 지원 실적',
      '실적 등록 필요', 'na', '수요조사·교육·기업지원 등 지원 활동 (정성, 10점)'],
    ['open', '⑤ 가명정보·합성데이터 개방 실적 (가점)',
      `${syntheticCnt as number}건 / 최대 5점 가점`,
      (syntheticCnt as number) >= 2 ? 'ok' : (syntheticCnt as number) >= 1 ? 'warn' : 'na',
      '가명정보 제공 또는 합성데이터 개방 1건당 1점 (가점 최대 5점)'],

    // ─── 품질 (45점) ─────────────────────────────────────────────────────────
    ['quality', '①-1 품질관리 계획 수립',
      '운영중', 'ok', '품질관리 지침·절차서·계획서 수립 여부 (관리체계 일부)'],
    ['quality', '①-2 품질진단 도구 적용',
      `${qTotal}/${totalDs}건`, (qTotal >= totalDs && totalDs) ? 'ok':'warn',
      '기관 보유 DB 65% 이상 품질진단 수행 여부'],
    ['quality', '② 데이터 값 관리 — 오류율 0.001% 이하',
      `${qPass}/${qTotal}건 통과 / 평균오류율 ${avgErr.toFixed(4)}%`,
      (avgErr <= 0.001 && qPass === qTotal) ? 'ok':'warn',
      '오류진단 결과 오류율 0.001% 이하 충족 여부 (18점)'],
    ['quality', '③ 진단결과 조치 — 오류 보완율',
      qPass === qTotal ? '전체 통과' : `${qPass}/${qTotal} 조치완료`,
      qPass === qTotal ? 'ok':'warn',
      '오류 발견 후 보완 조치 완료율 (10점)'],

    // ─── 분석·활용 (53점) ───────────────────────────────────────────────────
    ['analysis', '①-1 데이터 분석·정책활용 실적',
      `분석 ${analysisCnt as number}건 / 활용로그 ${usage}건`,
      (analysisCnt as number) >= 5 ? 'ok' : (analysisCnt as number) >= 2 ? 'warn' : 'warn',
      '행정·정책 목적으로 데이터 분석 수행·활용 건수 (10점)'],
    ['analysis', '①-2 분석 결과의 정책활용 노력 및 성과',
      '실적 등록 필요', 'na', '분석 결과를 정책·사업에 반영한 노력·성과 (정성, 15점)'],
    ['analysis', '② AI·데이터 문해력 교육 실적',
      '실적 등록 필요', 'na', '전직원 AI·데이터 교육 이수율 (10점)'],
    ['analysis', '③-2 AI 도입·활용 사례 및 추진 노력',
      objCnt > 0 ? '온톨로지 AI 활용중' : '구현중', objCnt > 0 ? 'ok':'na',
      'AI 도입 사례·챗봇·분석AI 활용 노력 (정성, 8점)'],
    ['analysis', '③-3 AI·데이터기반행정 활성화 노력',
      '실적 등록 필요', 'na', '데이터기반행정 활성화 계획·이행 노력 (정성, 8점)'],

    // ─── 공유 (41점) ─────────────────────────────────────────────────────────
    ['share', '①-1 메타관리시스템 기반 데이터 공유 실적',
      `입주 ${tOn}/${tTotal}`, tOn >= 8 ? 'ok':'warn',
      '메타관리시스템 통한 기관 간 공유 건수 (15점 내 비중)'],
    ['share', '② 고가치·고활용 공유데이터 발굴 노력 및 실적',
      `고가치 ${highValue}건`, highValue >= 3 ? 'ok':'warn',
      '고가치 공유데이터 발굴·등록 노력 (정성, 12점)'],
    ['share', '③ 기관공유데이터 관리시스템 구축 실적',
      totalDs > 0 ? '메타관리시스템 운영중' : '구축 필요', totalDs > 0 ? 'ok':'warn',
      '기관 자체 공유데이터 관리시스템 구축 계획·예산·운영 (8점)'],
    ['share', '④ 공유데이터 거버넌스 체계',
      `${totalDs}건 등록`, totalDs > 0 ? 'ok':'warn',
      'DCAT 표준 메타데이터 관리·갱신 (6점)'],

    // ─── 관리체계 (11점) ──────────────────────────────────────────────────────
    ['mgmt', '① 데이터 전략·거버넌스 체계',
      '플랫폼 운영중', 'ok', '데이터 관리 지침·책임자·위원회 운영 여부'],
    ['mgmt', '② 데이터기반행정 성과 리포트',
      '자동생성', 'ok', '경영진 보고용 데이터기반 성과 지표 대시보드 운영'],
    ['mgmt', '③ 데이터 역량 강화 인프라',
      '실적 등록 필요', 'na', '데이터 전문인력 확보·교육 인프라 운영 실적'],
  ]

  // 정성지표 수기 입력값 로드 (017_qualitative_inputs) — 오류 무시
  let qualMap: Record<string, { status: 'ok'|'warn'|'na'; note: string | null }> = {}
  try {
    const qIn = tenantId
      ? await supabase.from('qualitative_inputs').select('indicator_key,status,note').eq('tenant_id', tenantId)
      : { data: null }
    if (qIn.data) {
      for (const row of qIn.data) {
        const name = QUALITATIVE_KEYS[row.indicator_key]
        if (name) qualMap[name] = { status: row.status, note: row.note }
      }
    }
  } catch { /* migration 017 미적용 환경에서도 정상 동작 */ }

  // 정성지표 override — 이름 기준으로 매칭
  const overriddenIndicators = indicators.map(ind => {
    const override = qualMap[ind[1]]
    if (!override) return ind
    return [ind[0], ind[1], override.note || '실적 입력됨', override.status, ind[4]] as typeof ind
  })

  const byArea: Record<string, unknown> = {}
  for (const a of AREAS) {
    const items    = overriddenIndicators.filter(i => i[0] === a.key)
    const measured = items.filter(i => i[3] !== 'na')
    const ok       = measured.filter(i => i[3] === 'ok').length
    const warn     = measured.filter(i => i[3] === 'warn').length
    const score    = measured.length ? Math.round(ok / measured.length * 100) : 0
    byArea[a.key] = {
      name: a.name, weight: a.weight, color: a.color,
      ok, warn, na: items.length - measured.length,
      measured: measured.length, total: items.length, score,
      indicators: items.map(i => ({ name: i[1], value: i[2], status: i[3], desc: i[4] })),
    }
  }

  const totalWeight = AREAS.reduce((s, a) => s + a.weight, 0)
  const overall = Math.round(
    AREAS.reduce((s, a) => s + (byArea[a.key] as { score: number }).score * a.weight, 0) / totalWeight
  )

  return {
    overall,
    total_points: 200, // 2026 평가편람 기준 만점
    areas: AREAS.map(a => byArea[a.key]),
    bonus: {
      synthetic_cases: syntheticCnt as number,
      bonus_score: Math.min((syntheticCnt as number), 5),
    },
    summary: {
      datasets: totalDs, open: openDs, ai_ready: aiReady, high_value: highValue,
      api_enabled: apiEnabled as number,
      usage, quality_pass: qPass, quality_total: qTotal,
      avg_error_rate: Math.round(avgErr * 10000) / 10000,
      objects: objCnt, links: linkCnt, tenants_on: tOn, tenants_total: tTotal,
      synthetic_cases: syntheticCnt as number,
      analysis_records: analysisCnt as number,
    },
  }
}
