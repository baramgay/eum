'use client'

import Link from 'next/link'
import { Database, CheckCircle2, XCircle, Activity } from 'lucide-react'
import Card from '@/components/ui/Card'
import StatCard from '@/components/ui/StatCard'
import type { Indicators } from '../DashboardClient'

interface PipelineStatusWidgetProps {
  pipeline?: Indicators['pipeline']
}

export default function PipelineStatusWidget({ pipeline }: PipelineStatusWidgetProps) {
  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400">오늘의 파이프라인 현황</h3>
        <Link href="/pipeline" className="text-xs text-blue-500 hover:text-blue-700 dark:hover:text-blue-300 hover:underline transition-colors">바로가기 →</Link>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="수집 소스"
          value={pipeline?.collect_sources ?? 0}
          color="blue"
          icon={<Database className="w-5 h-5" />}
        />
        <StatCard
          label="정상 수집"
          value={pipeline?.last_run_ok ?? 0}
          color="green"
          icon={<CheckCircle2 className="w-5 h-5" />}
        />
        <StatCard
          label="수집 실패"
          value={pipeline?.last_run_fail ?? 0}
          color="red"
          icon={<XCircle className="w-5 h-5" />}
        />
        <StatCard
          label="오늘 수집행"
          value={(pipeline?.rows_today ?? 0).toLocaleString()}
          color="amber"
          icon={<Activity className="w-5 h-5" />}
        />
      </div>
      <p className="text-xs text-gray-400 dark:text-gray-300 mt-3 text-right">오늘({new Date().toLocaleDateString('ko-KR')}) 기준</p>
    </Card>
  )
}
