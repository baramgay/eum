'use client'

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import Card from '@/components/ui/Card'
import { formatK, type PopulationTrendRow } from '../DashboardClient'

interface PopulationTrendWidgetProps {
  trend: PopulationTrendRow[]
  year: number
}

export default function PopulationTrendWidget({ trend, year }: PopulationTrendWidgetProps) {
  return (
    <Card>
      <h3 className="text-base font-semibold text-gray-700 dark:text-gray-300 mb-0.5">
        경남 청년인구 연도별 추이 (2018~{year})
      </h3>
      <p className="text-xs text-gray-400 dark:text-gray-300 mb-4">
        실제 주민등록 데이터 기반 · 인디고: 총 청년인구 / 앰버: 순이동 합계
      </p>
      <figure className="w-full h-[260px]" role="img" aria-label={`경남 청년인구 연도별 추이 선 차트, 2018~${year}`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={trend} margin={{ top: 4, right: 20, left: 20, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="year" tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={formatK} tick={{ fontSize: 11 }} />
            <Tooltip formatter={v => (v as number).toLocaleString()} />
            <Legend />
            <Line type="monotone" dataKey="total" name="총 청년인구" stroke="#4F46E5" strokeWidth={2} dot={{ r: 4 }} />
            <Line type="monotone" dataKey="net"   name="순이동 합계" stroke="#F59E0B" strokeWidth={2} dot={{ r: 4 }} strokeDasharray="5 3" />
          </LineChart>
        </ResponsiveContainer>
      </figure>
    </Card>
  )
}
