'use client'

import { useEffect, useState } from 'react'
import Card from '@/components/ui/Card'
import Skeleton from '@/components/ui/Skeleton'
import { ShieldCheck, FileCheck, Zap, Activity } from 'lucide-react'

interface GovernanceData {
  submissions: { total: number; approved: number; approvalRate: number }
  quality: { avgPassRate: number; checked: number }
  api: { totalAccess: number }
  llm: { monthlyCalls: number; monthlyTokens: number }
}

interface MetricCardProps {
  icon: React.ElementType
  label: string
  value: string
  sub?: string
  color: string
}

function MetricCard({ icon: Icon, label, value, sub, color }: MetricCardProps) {
  return (
    <div className="flex items-start gap-3">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon className="w-4 h-4 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
        <p className="text-base font-bold text-gray-900 dark:text-gray-100">{value}</p>
        {sub && <p className="text-xs text-gray-400 dark:text-gray-500">{sub}</p>}
      </div>
    </div>
  )
}

export default function GovernanceWidget() {
  const [data, setData] = useState<GovernanceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/dashboard/governance')
      .then((r) => r.ok ? r.json() : r.json().then((e: { error?: string }) => Promise.reject(e.error)))
      .then((d: GovernanceData) => { setData(d); setLoading(false) })
      .catch((e: string | undefined) => { setError(e ?? '오류'); setLoading(false) })
  }, [])

  return (
    <Card padding="md">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">거버넌스 현황</h3>
        <span className="text-xs text-gray-400 dark:text-gray-500">이번 달 기준</span>
      </div>

      {loading && <Skeleton className="h-28 w-full" />}

      {error && (
        <p className="text-sm text-red-500 dark:text-red-400 py-4 text-center">{error}</p>
      )}

      {!loading && !error && data && (
        <div className="grid grid-cols-2 gap-4">
          <MetricCard
            icon={FileCheck}
            label="제출 승인율"
            value={`${data.submissions.approvalRate}%`}
            sub={`${data.submissions.approved} / ${data.submissions.total}건`}
            color="bg-green-500"
          />
          <MetricCard
            icon={ShieldCheck}
            label="품질 통과율"
            value={`${data.quality.avgPassRate}%`}
            sub={`${data.quality.checked}건 검사`}
            color="bg-blue-500"
          />
          <MetricCard
            icon={Activity}
            label="API 접근"
            value={data.api.totalAccess.toLocaleString()}
            sub="누적"
            color="bg-indigo-500"
          />
          <MetricCard
            icon={Zap}
            label="AI 호출 (월)"
            value={data.llm.monthlyCalls.toLocaleString()}
            sub={`${Math.round(data.llm.monthlyTokens / 1000)}k 토큰`}
            color="bg-orange-500"
          />
        </div>
      )}
    </Card>
  )
}
