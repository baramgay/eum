'use client'

import { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ReferenceLine, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend,
} from 'recharts'

interface AreaScore { name: string; score: number; color: string; weight: number }
interface Indicators { overall: number; areas: AreaScore[]; summary: string }

interface UsageData {
  topDownloads: { datasetId: string; title: string; count: number }[]
  recentDatasets: { datasetId: string; title: string; updatedAt: string }[]
  period: string
}

interface MigrationRow    { sigun: string; net: number; inflow: number; outflow: number }
interface TrendRow        { year: number; total: number; net: number }
interface SettlementRow   {
  sigun: string; rank: number; settlement_score: number
  youth_pop_2025: number; youth_pop_change_rate: number
  living_index: number; income_monthly: number
}
interface ChartData {
  migration: MigrationRow[]
  trend: TrendRow[]
  submissions: Record<string, number>
  year: number
  migYear: number
}

function ScoreGauge({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="bg-white rounded-lg p-4 shadow-sm border">
      <div className="text-sm text-gray-500 mb-1">{label}</div>
      <div className="flex items-end gap-2">
        <span className="text-3xl font-bold" style={{ color }}>{value.toFixed(1)}</span>
        <span className="text-gray-400 text-sm mb-1">/ 100</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
        <div className="h-2 rounded-full transition-all" style={{ width: `${value}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}

const SUB_STATUS = [
  { key: 'submitted', label: '대기',   bg: 'bg-yellow-50', text: 'text-yellow-700' },
  { key: 'review',    label: '검토중', bg: 'bg-blue-50',   text: 'text-blue-700' },
  { key: 'approved',  label: '승인',   bg: 'bg-green-50',  text: 'text-green-700' },
  { key: 'rejected',  label: '반려',   bg: 'bg-red-50',    text: 'text-red-700' },
]

const formatK = (v: number) =>
  Math.abs(v) >= 10000 ? `${(v / 10000).toFixed(1)}만` : v.toLocaleString()

const GRADE_COLOR = ['#6D28D9','#2563EB','#0891B2','#059669','#65A30D','#D97706','#DC2626']

const PERIOD_LABELS: Record<string, string> = { month: '월', q: '분기', year: '연' }

export default function DashboardClient() {
  const [data, setData]           = useState<Indicators | null>(null)
  const [charts, setCharts]       = useState<ChartData | null>(null)
  const [settlement, setSettlement] = useState<SettlementRow[]>([])
  const [loading, setLoading]     = useState(true)
  const [period, setPeriod]       = useState<'month' | 'q' | 'year'>('month')
  const [usage, setUsage]         = useState<UsageData | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/overview').then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e))),
      fetch('/api/charts').then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e))),
      fetch('/api/settlement').then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e))),
    ]).then(([ov, ch, si]) => {
      setData(ov)
      setCharts(ch)
      setSettlement(si)
      setLoading(false)
    }).catch(err => {
      console.error('[Dashboard] 데이터 로드 오류:', err)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    fetch(`/api/usage?period=${period}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setUsage(d) })
      .catch(() => {})
  }, [period])

  if (loading) return (
    <div className="space-y-8 animate-pulse">
      <div className="h-6 bg-gray-200 rounded w-48" />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-white rounded-lg border p-4">
            <div className="h-3 bg-gray-100 rounded w-2/3 mb-3" />
            <div className="h-8 bg-gray-200 rounded w-1/2 mb-2" />
            <div className="h-2 bg-gray-100 rounded w-full mt-2" />
          </div>
        ))}
      </div>
      <div className="bg-white rounded-lg border p-5">
        <div className="h-4 bg-gray-200 rounded w-1/3 mb-4" />
        <div className="h-64 bg-gray-100 rounded" />
      </div>
      <div className="bg-white rounded-lg border p-5">
        <div className="h-4 bg-gray-200 rounded w-1/4 mb-4" />
        <div className="h-40 bg-gray-100 rounded" />
      </div>
    </div>
  )
  if (!data)   return <div className="text-center py-12 text-red-500">데이터를 불러올 수 없습니다.</div>

  const maxPop = settlement[0]?.youth_pop_2025 ?? 1

  return (
    <div className="space-y-8">
      {/* 종합 점수 게이지 */}
      <div>
        <h2 className="text-xl font-semibold text-gray-800">플랫폼 현황</h2>
        <p className="text-sm text-gray-500 mt-0.5">{data.summary}</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <ScoreGauge value={data.overall} label="종합 점수" color="#2563eb" />
        {data.areas.map(a => (
          <ScoreGauge key={a.name} value={a.score} label={a.name} color={a.color} />
        ))}
      </div>

      {charts && (
        <>
          {/* 제출 현황 stat cards */}
          <div>
            <h3 className="text-base font-semibold text-gray-700 mb-3">제출 현황</h3>
            <div className="grid grid-cols-4 gap-3">
              {SUB_STATUS.map(s => (
                <div key={s.key} className={`${s.bg} rounded-lg p-4 border text-center`}>
                  <p className={`text-3xl font-bold ${s.text}`}>{charts.submissions[s.key] ?? 0}</p>
                  <p className={`text-sm mt-1 ${s.text}`}>{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* 시군별 청년 순이동 */}
          <div className="bg-white rounded-lg border shadow-sm p-5">
            <h3 className="text-base font-semibold text-gray-700 mb-0.5">
              시군별 청년 순이동 ({charts.migYear}년)
            </h3>
            <p className="text-xs text-gray-400 mb-4">
              파란색: 순유입 / 빨간색: 순유출 — 실제 주민등록 기반 산출
            </p>
            <ResponsiveContainer width="100%" height={420}>
              <BarChart
                data={charts.migration}
                layout="vertical"
                margin={{ top: 4, right: 40, left: 56, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickFormatter={formatK} tick={{ fontSize: 11 }} domain={['auto','auto']} />
                <YAxis type="category" dataKey="sigun" width={52} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v, name) => [(v as number).toLocaleString(), name === 'net' ? '순이동' : (name as string)]}
                  labelFormatter={l => `${l}`}
                />
                <ReferenceLine x={0} stroke="#9CA3AF" strokeWidth={1.5} />
                <Bar dataKey="net" name="순이동" radius={[0, 3, 3, 0]}>
                  {charts.migration.map(d => (
                    <Cell key={d.sigun} fill={d.net >= 0 ? '#2563EB' : '#DC2626'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 연도별 청년인구 추이 (2018-2025 실제) */}
          <div className="bg-white rounded-lg border shadow-sm p-5">
            <h3 className="text-base font-semibold text-gray-700 mb-0.5">
              경남 청년인구 연도별 추이 (2018~{charts.year})
            </h3>
            <p className="text-xs text-gray-400 mb-4">
              실제 주민등록 데이터 기반 · 인디고: 총 청년인구 / 앰버: 순이동 합계
            </p>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={charts.trend} margin={{ top: 4, right: 20, left: 20, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={formatK} tick={{ fontSize: 11 }} />
                <Tooltip formatter={v => (v as number).toLocaleString()} />
                <Legend />
                <Line type="monotone" dataKey="total" name="총 청년인구" stroke="#4F46E5" strokeWidth={2} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="net"   name="순이동 합계" stroke="#F59E0B" strokeWidth={2} dot={{ r: 4 }} strokeDasharray="5 3" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {/* 정착잠재지수 순위 */}
      {settlement.length > 0 && (
        <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b bg-indigo-50">
            <h3 className="text-base font-semibold text-indigo-800">
              경남 시군별 청년 정착잠재지수 종합순위
            </h3>
            <p className="text-xs text-indigo-600 mt-0.5">
              KT/KB/KCB/주민등록 4대 데이터소스 통합 — 2018~2025 경남연구원 분석
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-2 text-center text-gray-500 w-10">순위</th>
                  <th className="px-4 py-2 text-left text-gray-600">시군</th>
                  <th className="px-4 py-2 text-right text-gray-600">청년인구(2025)</th>
                  <th className="px-4 py-2 text-right text-gray-600">인구증감(%)</th>
                  <th className="px-4 py-2 text-right text-gray-600">생활인구지수</th>
                  <th className="px-4 py-2 text-right text-gray-600">월평균소득</th>
                  <th className="px-4 py-2 text-left text-gray-600 min-w-36">정착잠재지수</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {settlement.map((r, i) => (
                  <tr key={r.sigun} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-center">
                      <span
                        className="inline-block w-6 h-6 rounded-full text-xs font-bold text-white flex items-center justify-center"
                        style={{ backgroundColor: GRADE_COLOR[Math.min(i, GRADE_COLOR.length - 1)] }}
                      >
                        {r.rank}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-medium text-gray-800">{r.sigun}</td>
                    <td className="px-4 py-2 text-right text-gray-600">
                      <div className="flex items-center justify-end gap-1">
                        <div className="bg-gray-100 rounded-full h-1.5 w-20">
                          <div
                            className="bg-indigo-400 h-1.5 rounded-full"
                            style={{ width: `${(r.youth_pop_2025 / maxPop) * 100}%` }}
                          />
                        </div>
                        <span className="text-xs">{formatK(r.youth_pop_2025)}</span>
                      </div>
                    </td>
                    <td className={`px-4 py-2 text-right text-sm font-medium ${r.youth_pop_change_rate >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                      {r.youth_pop_change_rate >= 0 ? '+' : ''}{r.youth_pop_change_rate.toFixed(1)}%
                    </td>
                    <td className="px-4 py-2 text-right text-gray-600 text-xs">{r.living_index.toFixed(1)}</td>
                    <td className="px-4 py-2 text-right text-gray-600 text-xs">{r.income_monthly}만원</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-100 rounded-full h-2">
                          <div
                            className="h-2 rounded-full"
                            style={{
                              width: `${Math.max(5, ((r.settlement_score + 4) / 8) * 100)}%`,
                              backgroundColor: GRADE_COLOR[Math.min(i, GRADE_COLOR.length - 1)],
                            }}
                          />
                        </div>
                        <span className={`text-xs font-semibold w-10 text-right ${r.settlement_score >= 0 ? 'text-blue-700' : 'text-red-600'}`}>
                          {r.settlement_score >= 0 ? '+' : ''}{r.settlement_score.toFixed(2)}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-2 bg-gray-50 border-t">
            <p className="text-xs text-gray-400">
              정착잠재지수: 인구변화·이동·생활인구·소득·신용 5개 지표 표준화 합산 | 양수=정착 잠재력 높음 | 음수=유출 압력 높음
            </p>
          </div>
        </div>
      )}

      {/* 데이터 활용 현황 */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-700">데이터 활용 현황</h3>
          <div className="flex gap-1">
            {(['month', 'q', 'year'] as const).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
                  period === p
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {/* Top5 다운로드 */}
          <div className="bg-white rounded-lg border shadow-sm p-5">
            <h4 className="text-sm font-medium text-gray-600 mb-3">
              상위 5 다운로드
              <span className="ml-1 text-xs text-gray-400">({PERIOD_LABELS[period]} 기준)</span>
            </h4>
            {!usage || usage.topDownloads.length === 0 ? (
              <p className="text-xs text-gray-400 py-4 text-center">다운로드 이력이 없습니다.</p>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart
                  data={usage.topDownloads}
                  layout="vertical"
                  margin={{ top: 4, right: 24, left: 8, bottom: 4 }}
                >
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis
                    type="category"
                    dataKey="title"
                    width={120}
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v: string) => v.length > 14 ? v.slice(0, 14) + '…' : v}
                  />
                  <Tooltip formatter={(v) => [`${v}회`, '다운로드']} />
                  <Bar dataKey="count" fill="#4F46E5" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* 최근 등록 데이터셋 */}
          <div className="bg-white rounded-lg border shadow-sm p-5">
            <h4 className="text-sm font-medium text-gray-600 mb-3">최근 등록 데이터셋</h4>
            {!usage || usage.recentDatasets.length === 0 ? (
              <p className="text-xs text-gray-400 py-4 text-center">등록된 데이터셋이 없습니다.</p>
            ) : (
              <ul className="space-y-2">
                {usage.recentDatasets.map(ds => (
                  <li key={ds.datasetId} className="flex items-center justify-between gap-2">
                    <span className="text-xs text-gray-700 truncate flex-1">{ds.title}</span>
                    <span className="text-xs text-gray-400 flex-shrink-0">
                      {ds.updatedAt ? new Date(ds.updatedAt).toLocaleDateString('ko-KR') : '—'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
