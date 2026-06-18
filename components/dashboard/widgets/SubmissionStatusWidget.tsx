'use client'

import { PieChart } from 'lucide-react'
import StatCard from '@/components/ui/StatCard'
import { SUB_STATUS } from '../DashboardClient'

interface SubmissionStatusWidgetProps {
  submissions: Record<string, number>
}

export default function SubmissionStatusWidget({ submissions }: SubmissionStatusWidgetProps) {
  return (
    <div>
      <h3 className="text-base font-semibold text-gray-700 dark:text-gray-300 mb-3">제출 현황</h3>
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
