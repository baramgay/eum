'use client'
import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'

interface CompareRow {
  tenant_id: string; name: string
  total: number; open: number; open_pct: number
  ai_ready: number; ai_ready_pct: number
  quality_pass: number; quality_total: number; quality_pct: number
  analysis: number; synthetic: number
}
interface Goals {
  open: number; aiReady: number; quality: number; analysis: number; synthetic: number
}
const DEFAULT_GOALS: Goals = { open: 80, aiReady: 50, quality: 100, analysis: 5, synthetic: 2 }

function HeatCell({ value, goal, unit = '%' }: { value: number; goal: number; unit?: string }) {
  const pct   = goal > 0 ? Math.min(value / goal * 100, 100) : 0
  const color = pct >= 100 ? '#16a34a' : pct >= 70 ? '#d97706' : pct >= 30 ? '#f59e0b' : '#dc2626'
  return (
    <td className="px-3 py-2 text-center">
      <span className="text-sm font-bold" style={{ color }}>{value}{unit}</span>
      <div className="w-12 mx-auto bg-gray-100 dark:bg-gray-800 rounded-full h-1 mt-0.5">
        <div className="h-1 rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </td>
  )
}

export default function CompareClient() {
  const [rows, setRows]       = useState<CompareRow[]>([])
  const [goals, setGoals]     = useState<Goals>(DEFAULT_GOALS)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/evaluation/compare').then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() }),
      fetch('/api/pipeline/targets').then(r => r.ok ? r.json() : null).catch(() => null),
    ])
      .then(([compareData, t]) => {
        setRows(Array.isArray(compareData) ? compareData : [])
        if (t) {
          setGoals({
            open:      t.open_rate_goal    ?? DEFAULT_GOALS.open,
            aiReady:   t.ai_ready_goal     ?? DEFAULT_GOALS.aiReady,
            quality:   t.quality_pass_goal ?? DEFAULT_GOALS.quality,
            analysis:  t.analysis_goal     ?? DEFAULT_GOALS.analysis,
            synthetic: t.synthetic_goal    ?? DEFAULT_GOALS.synthetic,
          })
        }
        setLoading(false)
      })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center py-16 gap-3 text-gray-400 dark:text-gray-300">
      <div className="w-4 h-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
      기관별 집계 중...
    </div>
  )

  if (error) return (
    <div className="flex items-center justify-center py-16 gap-2 text-red-500 text-sm">
      <AlertTriangle className="w-4 h-4" />{error}
    </div>
  )

  if (!rows.length) return (
    <div className="text-center py-16 text-gray-400 dark:text-gray-300 text-sm">등록된 기관이 없습니다.</div>
  )

  const GOALS = goals

  // 기관별 달성 카운트로 정렬
  const sorted = [...rows].sort((a, b) => {
    const score = (r: CompareRow) =>
      (r.open_pct >= GOALS.open ? 1 : 0) +
      (r.ai_ready_pct >= GOALS.aiReady ? 1 : 0) +
      (r.quality_pct >= GOALS.quality ? 1 : 0) +
      (r.analysis >= GOALS.analysis ? 1 : 0) +
      (r.synthetic >= GOALS.synthetic ? 1 : 0)
    return score(b) - score(a)
  })

  const chartData = sorted.map(r => ({
    name: r.name,
    open: r.open_pct,
    aiReady: r.ai_ready_pct,
    quality: r.quality_pct,
  }))

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">기관별 평가 현황 비교</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          전체 {rows.length}개 기관 · 목표 달성 기준: 개방 {GOALS.open}%·AI-Ready {GOALS.aiReady}%·품질 {GOALS.quality}%·분석 {GOALS.analysis}건·가명합성 {GOALS.synthetic}건
        </p>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[680px]">
          <thead className="bg-gray-50 dark:bg-gray-950 border-b">
            <tr>
              <th className="px-3 py-2.5 text-left text-xs text-gray-500 dark:text-gray-400 font-medium w-8">#</th>
              <th className="px-3 py-2.5 text-left text-xs text-gray-700 dark:text-gray-300 font-semibold min-w-[120px]">기관명</th>
              <th className="px-3 py-2.5 text-center text-xs text-gray-500 dark:text-gray-400 font-medium">등록<br/>건수</th>
              <th className="px-3 py-2.5 text-center text-xs text-blue-600 dark:text-blue-400 font-semibold">개방률</th>
              <th className="px-3 py-2.5 text-center text-xs text-purple-600 dark:text-purple-400 font-semibold">AI-Ready</th>
              <th className="px-3 py-2.5 text-center text-xs text-teal-600 dark:text-teal-400 font-semibold">품질통과율</th>
              <th className="px-3 py-2.5 text-center text-xs text-indigo-600 dark:text-indigo-400 font-semibold">분석<br/>실적</th>
              <th className="px-3 py-2.5 text-center text-xs text-green-600 dark:text-green-400 font-semibold">가명·합성<br/>실적</th>
              <th className="px-3 py-2.5 text-center text-xs text-gray-500 dark:text-gray-400 font-medium">목표<br/>달성</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.map((r, i) => {
              const achieved =
                (r.open_pct >= GOALS.open ? 1 : 0) +
                (r.ai_ready_pct >= GOALS.aiReady ? 1 : 0) +
                (r.quality_pct >= GOALS.quality ? 1 : 0) +
                (r.analysis >= GOALS.analysis ? 1 : 0) +
                (r.synthetic >= GOALS.synthetic ? 1 : 0)
              return (
                <tr key={r.tenant_id} className="hover:bg-gray-50 dark:hover:bg-gray-950">
                  <td className="px-3 py-2.5 text-center text-xs text-gray-400 dark:text-gray-300">{i + 1}</td>
                  <td className="px-3 py-2.5 font-medium text-gray-800 dark:text-gray-200">{r.name}</td>
                  <td className="px-3 py-2.5 text-center text-gray-600 dark:text-gray-400 text-sm">{r.total}</td>
                  <HeatCell value={r.open_pct} goal={GOALS.open} />
                  <HeatCell value={r.ai_ready_pct} goal={GOALS.aiReady} />
                  <HeatCell value={r.quality_pct} goal={GOALS.quality} />
                  <HeatCell value={r.analysis} goal={GOALS.analysis} unit="건" />
                  <HeatCell value={r.synthetic} goal={GOALS.synthetic} unit="건" />
                  <td className="px-3 py-2.5 text-center">
                    <span className={`text-sm font-bold ${achieved >= 4 ? 'text-green-700 dark:text-green-300' : achieved >= 2 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
                      {achieved}/5
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* 기관별 핵심 지표 차트 */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border shadow-sm p-5">
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">기관별 핵심 지표 비교</p>
        <p className="text-xs text-gray-400 dark:text-gray-300 mb-4">개방률·AI-Ready·품질 통과율 (%)</p>
        <ResponsiveContainer width="100%" height={Math.max(240, sorted.length * 36)}>
          <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 20, left: 100, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} />
            <Tooltip formatter={(v, n) => [`${v}%`, n as string]} />
            <Legend />
            <Bar dataKey="open" name="개방률" fill="#2563eb" radius={[0, 4, 4, 0]} />
            <Bar dataKey="aiReady" name="AI-Ready" fill="#9333ea" radius={[0, 4, 4, 0]} />
            <Bar dataKey="quality" name="품질통과율" fill="#059669" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* 범례 */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
        {[
          { color: '#16a34a', label: '목표 달성 (100%+)' },
          { color: '#d97706', label: '근접 (70-99%)' },
          { color: '#f59e0b', label: '진행중 (30-69%)' },
          { color: '#dc2626', label: '미흡 (~30%)' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
            {label}
          </div>
        ))}
      </div>
    </div>
  )
}
