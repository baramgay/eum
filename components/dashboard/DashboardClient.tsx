'use client'

import { useEffect, useState } from 'react'

interface AreaScore { name: string; score: number; color: string; weight: number }
interface Indicators { overall: number; areas: AreaScore[]; summary: string }

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

export default function DashboardClient() {
  const [data, setData]     = useState<Indicators | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/overview').then(r => r.json()).then(d => { setData(d); setLoading(false) })
  }, [])

  if (loading) return <div className="text-center py-12 text-gray-400">로딩 중...</div>
  if (!data)   return <div className="text-center py-12 text-red-500">데이터를 불러올 수 없습니다.</div>

  return (
    <div className="space-y-6">
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
    </div>
  )
}
