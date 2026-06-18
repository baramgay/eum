'use client'

import { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'
import { Download, Database } from 'lucide-react'
import Card from '@/components/ui/Card'
import EmptyState from '@/components/ui/EmptyState'
import { useApi } from '@/lib/hooks/useApi'
import { apiClient } from '@/lib/api/client'
import { PERIOD_LABELS, type UsageData } from '../DashboardClient'

type Period = 'month' | 'q' | 'year'

async function fetchUsage(period: Period): Promise<UsageData> {
  return apiClient<UsageData>(`/api/usage?period=${period}`)
}

export default function DataUsageWidget() {
  const [period, setPeriod] = useState<Period>('month')
  const { data: usage, execute: loadUsage } = useApi(fetchUsage)

  useEffect(() => {
    loadUsage(period).catch(() => {})
  }, [period, loadUsage])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-700 dark:text-gray-300">데이터 활용 현황</h3>
        <div className="flex gap-1">
          {(['month', 'q', 'year'] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
                period === p
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-3">
            상위 5 다운로드
            <span className="ml-1 text-xs text-gray-400 dark:text-gray-300">({PERIOD_LABELS[period]} 기준)</span>
          </h4>
          {!usage || usage.topDownloads.length === 0 ? (
            <EmptyState
              icon={<Download className="w-6 h-6 text-gray-400 dark:text-gray-300" />}
              title="다운로드 이력이 없습니다"
              description="기간을 변경하거나 데이터를 활용해 보세요."
            />
          ) : (
            <figure className="w-full h-[180px]" role="img" aria-label={`상위 ${usage.topDownloads.length}개 다운로드 데이터셋 막대 차트`}>
              <ResponsiveContainer width="100%" height="100%">
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
            </figure>
          )}
        </Card>

        <Card>
          <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-3">최근 등록 데이터셋</h4>
          {!usage || usage.recentDatasets.length === 0 ? (
            <EmptyState
              icon={<Database className="w-6 h-6 text-gray-400 dark:text-gray-300" />}
              title="등록된 데이터셋이 없습니다"
              description="새로운 데이터셋이 등록되면 여기에 표시됩니다."
            />
          ) : (
            <ul className="space-y-2">
              {usage.recentDatasets.map(ds => (
                <li key={ds.datasetId} className="flex items-center justify-between gap-2 hover:bg-gray-50 dark:hover:bg-gray-950 rounded-lg px-2 py-1 -mx-2 transition-colors">
                  <span className="text-xs text-gray-700 dark:text-gray-300 truncate flex-1">{ds.title}</span>
                  <span className="text-xs text-gray-400 dark:text-gray-300 flex-shrink-0">
                    {ds.updatedAt ? new Date(ds.updatedAt).toLocaleDateString('ko-KR') : '—'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
