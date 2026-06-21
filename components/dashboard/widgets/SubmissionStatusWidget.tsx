'use client'

import Link from 'next/link'
import { PieChart } from 'lucide-react'
import StatCard from '@/components/ui/StatCard'
import { SUB_STATUS } from '../DashboardClient'

interface SubmissionStatusWidgetProps {
  submissions: Record<string, number>
}

export default function SubmissionStatusWidget({ submissions }: SubmissionStatusWidgetProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold text-gray-700 dark:text-gray-300">제출 현황</h3>
        <Link href="/submission" className="text-xs text-blue-500 hover:text-blue-700 hover:underline transition-colors">바로가기 →</Link>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {SUB_STATUS.map(s => (
          <StatCard
            key={s.key}
            label={s.label}
            value={submissions[s.key] ?? 0}
            color={s.color}
            icon={<PieChart className="w-5 h-5" />}
          />
        ))}
      </div>
    </div>
  )
}
