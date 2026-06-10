/**
 * 평가편람 자동대응 엔진 (app/evaluation.py → TypeScript)
 * 2026 평가편람 5개 영역 지표를 Supabase 데이터에서 자동 산출
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export const AREAS = [
  { key: 'open',     name: '개방·활용', weight: 48, color: '#1457b8' },
  { key: 'quality',  name: '품질',      weight: 45, color: '#0f9d8f' },
  { key: 'analysis', name: '분석·활용', weight: 53, color: '#7b4fc4' },
  { key: 'share',    name: '공유',      weight: 41, color: '#1aa251' },
  { key: 'mgmt',     name: '관리체계',  weight:  6, color: '#e8a317' },
] as const

const MACHINE_READABLE = new Set(['csv','json','xlsx','parquet','tsv','geojson'])

export function isQualityPassed(summary: string | null | undefined): boolean {
  const s = (summary ?? '').trim()
  return s.endsWith('통과') && !s.endsWith('미통과')
}

export function computeAiReadyChecklist(row: Record<string, unknown>) {
  const qPassed = isQualityPassed(String(row.quality_summary ?? ''))
  const rows    = Number(row.rows ?? 0)
  const desc    = String(row.description ?? '').trim()
  const title   = String(row.title ?? '').trim()
  const theme   = String(row.theme ?? '').trim()
  const kw      = String(row.keywords ?? '').trim()
  const lic     = String(row.license ?? '').trim()
  const fmt     = String(row.format ?? '').trim().toLowerCase()

  const checklist = [
    {
      item: '품질진단 통과', passed: qPassed,
      detail: qPassed ? '오류율 기준 이하, 자동 품질진단 통과'
                      : `품질진단 미통과 — ${row.quality_summary || '진단 미실시'}`,
    },
    {
      item: '충분한 데이터 규모 (30행 이상)', passed: rows >= 30,
      detail: rows >= 30 ? `${rows.toLocaleString()}행 — AI 학습에 적정한 규모 확보`
                         : `${rows.toLocaleString()}행 — 최소 30행 이상 권장`,
    },
    {
      item: '메타데이터 충실 (제목·설명·주제·키워드)',
      passed: !!(title && theme && kw && desc.length >= 20),
      detail: (title && theme && kw && desc.length >= 20)
        ? '제목·설명·주제·키워드가 모두 충실히 입력됨'
        : '제목·설명(20자 이상)·주제·키워드를 모두 입력해야 합니다',
    },
    {
      item: '라이선스 명시', passed: !!lic,
      detail: lic ? `라이선스: ${lic}` : '라이선스가 명시되지 않았습니다 — CC BY 4.0 등 명시 권장',
    },
    {
      item: '기계가독 형식 (CSV/JSON/Parquet 등)', passed: MACHINE_READABLE.has(fmt),
      detail: MACHINE_READABLE.has(fmt)
        ? `형식 ${fmt.toUpperCase()} — AI 학습 도구에서 직접 읽기 가능`
        : `형식 ${fmt.toUpperCase() || '미지정'} — CSV/JSON/Parquet 등 기계가독 형식 권장`,
    },
  ]
  return { ai_ready: checklist.every(c => c.passed), checklist }
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

async function sc(supabase: SupabaseClient, table: string, filter?: [string, boolean]) {
  const q = supabase.from(table).select('*', { count: 'exact', head: true })
  const r = filter ? await (q as any).eq(filter[0], filter[1]) : await q
  return r.count ?? 0
}

export async function computeIndicators(supabase: SupabaseClient) {
  const [totalDs, openDs, aiReady, highValue] = await Promise.all([
    sc(supabase, 'catalog'),
    sc(supabase, 'catalog', ['is_open', true]),
    sc(supabase, 'catalog', ['ai_ready', true]),
    sc(supabase, 'catalog', ['high_value', true]),
  ])
  const usage      = await sc(supabase, 'usage_log')
  const qTotal     = await sc(supabase, 'quality_results')
  const qPass      = await sc(supabase, 'quality_results', ['passed', true])
  const { data: errData } = await supabase.from('quality_results').select('error_rate')
  const avgErr = errData?.length
    ? errData.reduce((s, r) => s + (r.error_rate ?? 0), 0) / errData.length : 0
  const objCnt  = await sc(supabase, 'onto_objects')
  const linkCnt = await sc(supabase, 'onto_links')
  const tTotal  = await sc(supabase, 'tenants')
  const tOn     = await sc(supabase, 'tenants', ['onboarded', true])

  const openRate = totalDs ? openDs / totalDs * 100 : 0
  const aiRate   = totalDs ? aiReady / totalDs * 100 : 0

  type Ind = [string, string, string, 'ok'|'warn'|'na', string]
  const indicators: Ind[] = [
    ['open',     '메타관리시스템 기반 개방 데이터셋', `${openDs}/${totalDs}`,  openRate >= 80 ? 'ok':'warn', 'DCAT 카탈로그 등록·개방 비율'],
    ['open',     'AI친화(AI-Ready) 데이터 비율',     `${aiRate.toFixed(0)}%`, aiRate   >= 50 ? 'ok':'warn', 'AI-Ready 체크리스트 자동 점검'],
    ['open',     '고가치 데이터 등록 수',             `${highValue}건`,        highValue>= 2  ? 'ok':'warn', '고가치 데이터 식별·관리'],
    ['open',     '개방데이터 활용 건수',               `${usage}건`,            usage    >=100 ? 'ok':'warn', '조회·다운로드·API 호출 로그 집계'],
    ['quality',  '품질진단 자동 수행 데이터셋',        `${qTotal}/${totalDs}`,  (qTotal >= totalDs && totalDs) ? 'ok':'warn', '규칙기반 자동 진단 커버리지'],
    ['quality',  '오류율 기준(0.001%) 충족',           `${qPass}/${qTotal}`,   (qTotal && qPass === qTotal) ? 'ok':'warn', '데이터 값 관리 - 오류율'],
    ['quality',  '평균 오류율',                        `${avgErr.toFixed(4)}%`, avgErr   <= 0.001 ? 'ok':'warn', '전 데이터셋 평균 오류율'],
    ['analysis', '온톨로지 객체/관계 구축',            `${objCnt}객체·${linkCnt}관계`, objCnt > 0 ? 'ok':'na', '분석 기반 시맨틱 모델'],
    ['analysis', '자연어 질의·분석 활용',              objCnt ? '가동' : '준비', objCnt ? 'ok':'na', 'text-to-SQL·셀프서비스 분석'],
    ['share',    '기관 간 공유 카탈로그',              `입주 ${tOn}/${tTotal}`, tOn >= 8 ? 'ok':'warn', '메타관리시스템 기반 공유 실적'],
    ['share',    '메타데이터 등록·관리',               `${totalDs}건 등록`,     totalDs > 0 ? 'ok':'warn', 'DCAT 표준 메타데이터 관리'],
    ['mgmt',     '추진기반(플랫폼 운영) 조성',         '운영중',                'ok', '센터 멀티테넌트 플랫폼 가동'],
    ['mgmt',     '데이터 성과 리포트 제공',            '자동생성',              'ok', '경영진용 성과 대시보드'],
  ]

  const byArea: Record<string, unknown> = {}
  for (const a of AREAS) {
    const items = indicators.filter(i => i[0] === a.key)
    const ok    = items.filter(i => i[3] === 'ok').length
    const total = items.filter(i => i[3] !== 'na').length
    byArea[a.key] = {
      name: a.name, weight: a.weight, color: a.color,
      ok, total: items.length, score: total ? Math.round(ok / total * 100) : 0,
      indicators: items.map(i => ({ name: i[1], value: i[2], status: i[3], desc: i[4] })),
    }
  }

  const overall = Math.round(
    AREAS.reduce((s, a) => s + (byArea[a.key] as { score: number }).score, 0) / AREAS.length
  )

  return {
    overall,
    areas: AREAS.map(a => byArea[a.key]),
    summary: {
      datasets: totalDs, open: openDs, ai_ready: aiReady, high_value: highValue,
      usage, quality_pass: qPass, quality_total: qTotal,
      avg_error_rate: Math.round(avgErr * 10000) / 10000,
      objects: objCnt, links: linkCnt, tenants_on: tOn, tenants_total: tTotal,
    },
  }
}
