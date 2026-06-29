'use client'

import Card from '@/components/ui/Card'
import { Star } from 'lucide-react'

interface Props {
  bonus?: { synthetic_cases: number; bonus_score: number }
}

export default function SyntheticBonusWidget({ bonus }: Props) {
  const cases = bonus?.synthetic_cases ?? 0
  const score = bonus?.bonus_score ?? 0

  return (
    <Card padding="md">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Star className="w-4 h-4 text-teal-500" />
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">가명·합성 가점</span>
        </div>
        <span className="text-xs text-gray-400 dark:text-gray-500">2026 평가편람</span>
      </div>

      <div className="flex items-end gap-4">
        <div>
          <p className="text-3xl font-extrabold text-teal-600 dark:text-teal-400">+{score}점</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">최대 +5점</p>
        </div>
        <div className="pb-1">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            <span className="font-semibold text-gray-800 dark:text-gray-200">{cases}건</span> 등록
          </p>
        </div>
      </div>

      <div className="mt-3">
        <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-teal-500 rounded-full transition-all duration-500"
            style={{ width: `${Math.min(score / 5 * 100, 100)}%` }}
          />
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{score}/5점 달성</p>
      </div>
    </Card>
  )
}
