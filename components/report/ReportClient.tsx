'use client'
import { useEffect, useState, useCallback } from 'react'
import { FileText, AlertTriangle, CheckCircle, MinusCircle, Building2, Target, Download, ListTodo } from 'lucide-react'
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  ResponsiveContainer, Tooltip
} from 'recharts'
import CompareClient from './CompareClient'

interface Indicator { name: string; value: string; status: 'ok'|'warn'|'na'; desc: string }
interface Area {
  name: string; weight: number; color: string
  ok: number; total: number; score: number
  indicators: Indicator[]
}
interface EvalData {
  overall: number
  total_points: number
  areas: Area[]
  bonus: { synthetic_cases: number; bonus_score: number }
  summary: {
    datasets: number; open: number; ai_ready: number; high_value: number
    api_enabled: number; usage: number
    quality_pass: number; quality_total: number; avg_error_rate: number
    objects: number; links: number
    tenants_on: number; tenants_total: number
    synthetic_cases: number; analysis_records: number
  }
}
interface Tenant { tenant_id: string; name: string; gov_type: string | null }
interface EvalTargets {
  open_rate_goal: number; ai_ready_goal: number; quality_pass_goal: number
  synthetic_goal: number; analysis_goal: number
}

const STATUS_BADGE: Record<string, string> = {
  ok:   'bg-green-100 text-green-700',
  warn: 'bg-yellow-100 text-yellow-700',
  na:   'bg-gray-100 text-gray-500',
}
const STATUS_ICON: Record<string, React.ReactNode> = {
  ok:   <CheckCircle className="w-3.5 h-3.5 text-green-600" />,
  warn: <AlertTriangle className="w-3.5 h-3.5 text-yellow-600" />,
  na:   <MinusCircle className="w-3.5 h-3.5 text-gray-400" />,
}
const STATUS_LABEL: Record<string, string> = { ok: '충족', warn: '미흡', na: 'N/A' }

function indicatorAction(ind: Indicator): { action: string; pts: number; difficulty: '쉬움'|'보통'|'어려움' } {
  const n = ind.name.toLowerCase()
  if (n.includes('개방계획') || n.includes('이행률'))
    return { action: '미개방 데이터셋을 포털에 등록', pts: 8, difficulty: '쉬움' }
  if (n.includes('ai') || n.includes('친화') || n.includes('고가치'))
    return { action: '포털 AI-Ready 탭에서 미충족 항목 보완', pts: 7, difficulty: '보통' }
  if (n.includes('품질진단') || (n.includes('품질') && n.includes('도구')))
    return { action: '품질 탭 → 전체 재검사 실행', pts: 5, difficulty: '쉬움' }
  if (n.includes('값 관리') || (n.includes('오류율') && !n.includes('조치')))
    return { action: '오류율 초과 데이터셋 정제 후 재검사', pts: 18, difficulty: '보통' }
  if (n.includes('조치') || n.includes('보완율'))
    return { action: '품질 미통과 항목 조치 후 재검사 요청', pts: 10, difficulty: '보통' }
  if ((n.includes('분') && n.includes('실적')) || n.includes('정책활용'))
    return { action: '실적 관리 → 분析 실적 탭에 등록', pts: 10, difficulty: '쉬움' }
  if (n.includes('가명') || n.includes('합성'))
    return { action: '실적 관리 → 가명·합성 탭에 등록 (+1점/건)', pts: 5, difficulty: '보통' }
  if (n.includes('메타') || n.includes('공유 실적') || n.includes('입주'))
    return { action: '기관 관리 → 미입주 기관 온보딩', pts: 8, difficulty: '쉬움' }
  return { action: `${ind.name} 충족 조건 확인 후 데이터 보완`, pts: Math.max(3, Math.round(8)), difficulty: '보통' }
}

const DIFFICULTY_BADGE: Record<string, string> = {
  '쉬움': 'bg-green-50 text-green-700',
  '보통': 'bg-yellow-50 text-yellow-700',
  '어려움': 'bg-red-50 text-red-700',
}

interface Props { role?: string }

export default function ReportClient({ role }: Props) {
  const isCenter = role === 'center'

  const [data, setData]         = useState<EvalData | null>(null)
  const [targets, setTargets]   = useState<EvalTargets | null>(null)
  const [tenants, setTenants]   = useState<Tenant[]>([])
  const [selectedTenant, setSelectedTenant] = useState<string>('')
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [reportMode, setReportMode] = useState<'report' | 'compare'>('report')

  // center 역할이면 기관 목록 로드
  useEffect(() => {
    if (!isCenter) return
    fetch('/api/tenants')
      .then(r => r.json())
      .then((d: Tenant[]) => setTenants(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [isCenter])

  const loadData = useCallback(async (tenantId?: string) => {
    setLoading(true)
    setError(null)
    const qs = tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : ''
    try {
      const [evalRes, targetRes] = await Promise.all([
        fetch(`/api/evaluation${qs}`),
        fetch(`/api/pipeline/targets${qs}`),
      ])
      if (!evalRes.ok) throw new Error(`HTTP ${evalRes.status}`)
      const [evalData, targetData] = await Promise.all([
        evalRes.json() as Promise<EvalData>,
        targetRes.ok ? (targetRes.json() as Promise<EvalTargets>) : Promise.resolve(null),
      ])
      setData(evalData)
      setTargets(targetData)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (reportMode === 'compare') return
    loadData(selectedTenant || undefined)
  }, [loadData, selectedTenant, reportMode])

  const today = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric'
  })

  function downloadCSV() {
    if (!data) return
    const rows = [
      ['영역', '지표명', '현황', '상태', '설명'],
      ...data.areas.flatMap(area =>
        area.indicators.map(ind => [
          area.name, ind.name, ind.value, STATUS_LABEL[ind.status], ind.desc,
        ])
      ),
    ]
    const csv = rows
      .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `평가리포트_${today}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading && reportMode === 'report') return (
    <div className="flex items-center justify-center py-20 gap-3 text-gray-400">
      <div className="w-5 h-5 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
      평가 지표 산출 중...
    </div>
  )

  if ((error || !data) && reportMode === 'report') return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center">
        <AlertTriangle className="w-6 h-6 text-red-400" />
      </div>
      <p className="text-sm text-red-600">{error ?? '데이터를 불러올 수 없습니다.'}</p>
    </div>
  )

  const scoreColor = (s: number) =>
    s >= 80 ? '#16a34a' : s >= 60 ? '#d97706' : '#dc2626'

  const totalPoints  = data?.total_points ?? 200
  const actualPoints = data ? Math.round(data.overall * totalPoints / 100) : 0
  const bonusScore   = data?.bonus?.bonus_score ?? 0
  const grandTotal   = actualPoints + bonusScore

  const openRate    = data?.summary.datasets ? data.summary.open / data.summary.datasets * 100 : 0
  const aiReadyRate = data?.summary.datasets ? data.summary.ai_ready / data.summary.datasets * 100 : 0
  const qPassRate   = data?.summary.quality_total ? data.summary.quality_pass / data.summary.quality_total * 100 : 0

  const goalItems = (targets && data) ? [
    { label: '개방률',     current: openRate,    goal: targets.open_rate_goal,    fmt: (v: number) => `${v.toFixed(0)}%` },
    { label: 'AI-Ready',  current: aiReadyRate,  goal: targets.ai_ready_goal,     fmt: (v: number) => `${v.toFixed(0)}%` },
    { label: '품질 통과율', current: qPassRate,   goal: targets.quality_pass_goal, fmt: (v: number) => `${v.toFixed(0)}%` },
    { label: '분析 실적',   current: data.summary.analysis_records ?? 0, goal: targets.analysis_goal, fmt: (v: number) => `${Math.round(v)}건` },
    { label: '가명·합성',   current: data.summary.synthetic_cases   ?? 0, goal: targets.synthetic_goal, fmt: (v: number) => `${Math.round(v)}건` },
  ] : []

  const selectedTenantName = tenants.find(t => t.tenant_id === selectedTenant)?.name

  // To-Do: warn 지표 → 우선순위 액션 아이템
  const actionItems = data ? data.areas.flatMap(area =>
    area.indicators
      .filter(ind => ind.status === 'warn')
      .map(ind => ({ area: area.name, ind, ...indicatorAction(ind) }))
  ).sort((a, b) => b.pts - a.pts) : []

  const radarData = data ? data.areas.map(a => ({ subject: a.name, score: a.score, fullMark: 100 })) : []

  return (
    <div className="space-y-8 print:space-y-6">
      {/* 헤더 */}
      <div className="flex items-start justify-between print:hidden">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">데이터 관리 역량 평가편람 대응 리포트</h2>
          <p className="text-sm text-gray-500 mt-1">경남연구원 이음(EUM) 플랫폼 · 산출일: {today}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* center 역할 — 기관 선택 드롭다운 */}
          {isCenter && reportMode === 'report' && (
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <select
                value={selectedTenant}
                onChange={e => setSelectedTenant(e.target.value)}
                className="text-sm border border-gray-200 rounded-md px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <option value="">전체 집계</option>
                {tenants.map(t => (
                  <option key={t.tenant_id} value={t.tenant_id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}
          {data && reportMode === 'report' && (
            <button
              onClick={downloadCSV}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded-md hover:bg-gray-200"
            >
              <Download className="w-4 h-4" />
              증빙 CSV
            </button>
          )}
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
          >
            <FileText className="w-4 h-4" />
            PDF 출력
          </button>
        </div>
      </div>

      {/* center 전용 모드 탭 */}
      {isCenter && (
        <div className="flex gap-1 border-b pb-0 print:hidden">
          {(['report', 'compare'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setReportMode(mode)}
              className={`px-4 py-2 text-sm font-medium rounded-t-md border-b-2 transition-colors ${
                reportMode === mode
                  ? 'border-blue-600 text-blue-700 bg-blue-50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {mode === 'report' ? '평가 리포트' : '기관 비교'}
            </button>
          ))}
        </div>
      )}

      {/* 기관 비교 모드 */}
      {reportMode === 'compare' && <CompareClient />}

      {/* 리포트 모드 */}
      {reportMode === 'report' && data && (
        <>
          {/* 인쇄용 제목 (화면에선 숨김) */}
          <div className="hidden print:block">
            <h2 className="text-xl font-bold">데이터 관리 역량 평가편람 대응 리포트</h2>
            {selectedTenantName && <p className="text-sm text-gray-600">기관: {selectedTenantName}</p>}
            <p className="text-sm text-gray-500">산출일: {today}</p>
          </div>

          {/* 종합 점수 + 레이더 */}
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border shadow-sm p-6 flex flex-col items-center justify-center">
              <p className="text-sm text-gray-500 mb-2">종합 평가 점수 (2026 편람 기준)</p>
              <div className="flex items-end gap-2">
                <div className="text-7xl font-extrabold" style={{ color: scoreColor(data.overall) }}>
                  {actualPoints}
                </div>
                <div className="pb-2 text-gray-400 text-base">/ {totalPoints}점</div>
              </div>
              {bonusScore > 0 && (
                <div className="mt-1 flex items-center gap-1.5 bg-green-50 border border-green-200 rounded-full px-3 py-1">
                  <span className="text-green-700 text-sm font-semibold">+{bonusScore}점 가점</span>
                  <span className="text-green-600 text-xs">→ 합계 {grandTotal}점</span>
                </div>
              )}
              <div className="w-full bg-gray-100 rounded-full h-2 mt-3">
                <div
                  className="h-2 rounded-full transition-all"
                  style={{ width: `${data.overall}%`, backgroundColor: scoreColor(data.overall) }}
                />
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 w-full text-xs text-center">
                <div className="bg-blue-50 rounded p-2">
                  <span className="font-medium text-blue-700">{data.summary.datasets}</span><br/>등록 데이터셋
                </div>
                <div className="bg-green-50 rounded p-2">
                  <span className="font-medium text-green-700">{data.summary.open}</span><br/>개방 데이터셋
                </div>
                <div className="bg-purple-50 rounded p-2">
                  <span className="font-medium text-purple-700">
                    {data.summary.tenants_on}/{data.summary.tenants_total}
                  </span><br/>입주 기관
                </div>
                <div className="bg-amber-50 rounded p-2">
                  <span className="font-medium text-amber-700">{data.summary.ai_ready}</span><br/>AI-Ready
                </div>
                <div className="bg-indigo-50 rounded p-2">
                  <span className="font-medium text-indigo-700">{data.summary.analysis_records ?? 0}</span><br/>분析 실적
                </div>
                <div className="bg-teal-50 rounded p-2">
                  <span className="font-medium text-teal-700">{data.summary.synthetic_cases ?? 0}</span><br/>가명·합성
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl border shadow-sm p-4">
              <p className="text-sm font-medium text-gray-600 mb-2 text-center">5개 영역 레이더</p>
              <ResponsiveContainer width="100%" height={220}>
                <RadarChart data={radarData}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v) => [`${v}점`, '점수']} />
                  <Radar
                    name="점수" dataKey="score"
                    stroke="#4F46E5" fill="#4F46E5" fillOpacity={0.25}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 목표 대비 현황 패널 */}
          {goalItems.length > 0 && (
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <div className="px-5 py-3 flex items-center gap-2 border-b bg-gray-50">
                <Target className="w-4 h-4 text-blue-600" />
                <span className="font-semibold text-gray-800 text-sm">목표 대비 현황</span>
                <span className="text-xs text-gray-400 ml-1">실적 관리 페이지에서 목표를 수정할 수 있습니다</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 divide-x divide-y md:divide-y-0 divide-gray-100">
                {goalItems.map(item => {
                  const pct = item.goal > 0 ? Math.min(item.current / item.goal * 100, 100) : 0
                  const met = item.current >= item.goal
                  return (
                    <div key={item.label} className="px-4 py-3">
                      <p className="text-xs text-gray-500 mb-1">{item.label}</p>
                      <div className="flex items-baseline gap-1 mb-1.5">
                        <span className={`text-base font-bold ${met ? 'text-green-700' : 'text-gray-800'}`}>
                          {item.fmt(item.current)}
                        </span>
                        <span className="text-xs text-gray-400">/ 목표 {item.fmt(item.goal)}</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full transition-all ${met ? 'bg-green-500' : 'bg-blue-500'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className={`text-xs mt-1 ${met ? 'text-green-600' : 'text-gray-400'}`}>
                        {met ? '목표 달성' : `${pct.toFixed(0)}% 달성`}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* 개선 액션 아이템 To-Do */}
          {actionItems.length > 0 && (
            <div className="bg-amber-50 rounded-xl border border-amber-200 overflow-hidden">
              <div className="px-5 py-3 flex items-center gap-2 border-b border-amber-200">
                <ListTodo className="w-4 h-4 text-amber-700" />
                <span className="font-semibold text-amber-800 text-sm">
                  우선 개선 액션 — {actionItems.length}개 지표 미충족
                </span>
                <span className="text-xs text-amber-600 ml-1">점수 기여도 높은 순</span>
              </div>
              <div className="divide-y divide-amber-100">
                {actionItems.slice(0, 6).map((item, i) => (
                  <div key={i} className="px-5 py-3 flex items-start gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-200 text-amber-800 text-xs font-bold flex items-center justify-center mt-0.5">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-amber-600 font-medium">{item.area}</span>
                        <span className="text-xs text-gray-500">›</span>
                        <span className="text-sm font-medium text-gray-800">{item.action}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{item.ind.name} · {item.ind.desc}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className="text-xs font-bold text-amber-700">+{item.pts}점 기여</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${DIFFICULTY_BADGE[item.difficulty]}`}>
                        {item.difficulty}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              {actionItems.length > 6 && (
                <div className="px-5 py-2 text-xs text-amber-600 text-right border-t border-amber-200">
                  + {actionItems.length - 6}개 항목은 아래 영역별 상세에서 확인
                </div>
              )}
            </div>
          )}

          {/* 영역별 인디케이터 */}
          {data.areas.map(area => (
            <div key={area.name} className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <div
                className="px-5 py-3 flex items-center justify-between border-b"
                style={{ backgroundColor: area.color + '15' }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: area.color }} />
                  <span className="font-semibold text-gray-800">{area.name}</span>
                  <span className="text-xs text-gray-500">가중치 {area.weight}점</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold" style={{ color: scoreColor(area.score) }}>
                    {Math.round(area.score * area.weight / 100)}
                    <span className="text-xs font-normal text-gray-400 ml-0.5">/ {area.weight}점</span>
                  </span>
                  <div className="w-24 bg-gray-200 rounded-full h-2">
                    <div
                      className="h-2 rounded-full transition-all"
                      style={{ width: `${area.score}%`, backgroundColor: area.color }}
                    />
                  </div>
                </div>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-gray-500 font-medium text-xs">지표명</th>
                    <th className="px-4 py-2 text-center text-gray-500 font-medium text-xs w-24">현황</th>
                    <th className="px-4 py-2 text-center text-gray-500 font-medium text-xs w-20">상태</th>
                    <th className="px-4 py-2 text-left text-gray-500 font-medium text-xs">설명</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {area.indicators.map(ind => (
                    <tr key={ind.name} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-800">{ind.name}</td>
                      <td className="px-4 py-2 text-center font-medium text-gray-700">{ind.value}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center justify-center gap-1">
                          {STATUS_ICON[ind.status]}
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${STATUS_BADGE[ind.status]}`}>
                            {STATUS_LABEL[ind.status]}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-gray-400 text-xs">{ind.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

          {/* 인쇄용 푸터 */}
          <div className="hidden print:block text-center text-xs text-gray-400 mt-8 border-t pt-4">
            경상남도 · 이음(EUM) 공공데이터 개방 플랫폼 · {today} 자동 산출
          </div>
        </>
      )}
    </div>
  )
}
