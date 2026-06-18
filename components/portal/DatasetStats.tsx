'use client'
import { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid,
} from 'recharts'
import type { DatasetStats as DS } from '@/lib/utilization'

export default function DatasetStats({ datasetId }: { datasetId: string }) {
  const [stats, setStats] = useState<DS | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/catalog/${datasetId}/stats`)
      .then(r => r.json())
      .then(d => { setStats(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [datasetId])

  if (loading) {
    return <div className="text-center py-8 text-gray-400 dark:text-gray-300 text-sm">통계 산출 중...</div>
  }
  if (!stats || stats.rowCount === 0) {
    return <div className="text-center py-8 text-gray-400 dark:text-gray-300 text-sm">통계 데이터가 없습니다.</div>
  }

  return (
    <div className="space-y-4">
      {stats.sampled && (
        <div className="bg-yellow-50 border border-yellow-200 rounded p-2 text-xs text-yellow-700">
          대용량 데이터: 상위 50,000행 기준 통계
        </div>
      )}
      {stats.source === 'upload' && (
        <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-700">
          미리보기(20행) 기준 통계입니다.
        </div>
      )}

      {/* 컬럼 기초 통계 테이블 */}
      <div className="overflow-x-auto rounded border text-xs">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-950">
            <tr>
              {['컬럼', '타입', '건수', 'NULL', '고유값', '최솟값', '최댓값', '평균'].map(h => (
                <th key={h} className="px-3 py-1.5 text-left text-gray-600 dark:text-gray-400 font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {stats.columns.map(c => (
              <tr key={c.name} className="hover:bg-gray-50 dark:hover:bg-gray-950">
                <td className="px-3 py-1.5 font-mono text-gray-700 dark:text-gray-300 max-w-[120px] truncate">{c.name}</td>
                <td className="px-3 py-1.5">
                  <span className={`px-1.5 py-0.5 rounded text-xs ${
                    c.type === 'number' ? 'bg-blue-100 text-blue-700'
                    : c.type === 'date' ? 'bg-green-100 text-green-700'
                    : c.type === 'boolean' ? 'bg-purple-100 text-purple-700'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                  }`}>{c.type}</span>
                </td>
                <td className="px-3 py-1.5 text-gray-600 dark:text-gray-400">{c.count.toLocaleString()}</td>
                <td className="px-3 py-1.5 text-gray-400 dark:text-gray-300">{c.nullCount}</td>
                <td className="px-3 py-1.5 text-gray-600 dark:text-gray-400">{c.uniqueCount.toLocaleString()}</td>
                <td className="px-3 py-1.5 text-gray-600 dark:text-gray-400">{c.min?.toLocaleString() ?? '—'}</td>
                <td className="px-3 py-1.5 text-gray-600 dark:text-gray-400">{c.max?.toLocaleString() ?? '—'}</td>
                <td className="px-3 py-1.5 text-gray-600 dark:text-gray-400">{c.mean != null ? c.mean.toFixed(1) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 시계열 분포 */}
      {stats.timeseries && stats.timeseries.length > 1 && (
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">시계열 분포 ({stats.dateColumn})</p>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={stats.timeseries} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="t" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Line type="monotone" dataKey="count" stroke="#4F46E5" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 히스토그램 (숫자 컬럼 최대 2개) */}
      {stats.columns
        .filter(c => c.histogram && c.histogram.length > 0)
        .slice(0, 2)
        .map(c => (
          <div key={c.name}>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">{c.name} 히스토그램</p>
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={c.histogram} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                <XAxis dataKey="bin" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#0891B2" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ))}
    </div>
  )
}
