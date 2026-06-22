'use client'

import Link from 'next/link'
import { TrendingUp } from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
} from 'recharts'
import Card from '@/components/ui/Card'
import EmptyState from '@/components/ui/EmptyState'
import type { CollectionTrendRow } from '../DashboardClient'

interface CollectionTrendWidgetProps {
  trend?: CollectionTrendRow[]
}

export default function CollectionTrendWidget({ trend }: CollectionTrendWidgetProps) {
  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400">최근 7일 수집 트렌드</h3>
        <Link href="/collect" className="text-xs text-blue-500 hover:text-blue-700 dark:hover:text-blue-300 hover:underline transition-colors">바로가기 →</Link>
      </div>
      {trend && trend.length > 0 ? (
        <figure className="w-full h-40" role="img" aria-label="최근 7일 수집 트렌드 선 차트">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip
                formatter={(value, name) => {
                  const label = name === 'ok' ? '정상' : name === 'fail' ? '실패' : name === 'rows' ? '수집 행' : String(name)
                  return [typeof value === 'number' ? value.toLocaleString() : value, label]
                }}
                labelFormatter={(label) => String(label)}
              />
              <Line type="monotone" dataKey="ok" stroke="#16a34a" strokeWidth={2} dot={false} name="정상" />
              <Line type="monotone" dataKey="fail" stroke="#dc2626" strokeWidth={2} dot={false} name="실패" />
            </LineChart>
          </ResponsiveContainer>
        </figure>
      ) : (
        <EmptyState
          icon={<TrendingUp className="w-6 h-6 text-gray-400 dark:text-gray-300" />}
          title="최근 수집 이력이 없습니다"
          description="파이프라인이 실행되면 트렌드가 표시됩니다."
        />
      )}
    </Card>
  )
}
