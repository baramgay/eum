'use client'

import { useRouter } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import Card from '@/components/ui/Card'
import Btn from '@/components/ui/Btn'
import Badge from '@/components/ui/Badge'
import type { Indicators } from '../DashboardClient'

interface QualityDim {
  name: string
  label: string
  status: 'pass' | 'fail' | 'none'
}

interface QualityWidgetProps {
  qualityDims: QualityDim[]
  qualityAvg?: Indicators['qualityAvg']
}

export default function QualityWidget({ qualityDims, qualityAvg }: QualityWidgetProps) {
  const router = useRouter()

  if (qualityDims.length === 0) return null

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400">데이터 품질 5영역</h3>
        <Btn variant="ghost" size="sm" onClick={() => router.push('/quality')}>
          상세 보기
          <ArrowRight className="w-3.5 h-3.5" />
        </Btn>
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        {qualityDims.map(d => (
          <Badge
            key={d.name}
            variant={d.status === 'pass' ? 'green' : d.status === 'fail' ? 'red' : 'gray'}
          >
            {d.label}
          </Badge>
        ))}
      </div>
      {qualityAvg && (
        <div className="border-t pt-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-gray-500 dark:text-gray-400">품질 통과율</span>
            <span className="text-xs font-bold text-gray-700 dark:text-gray-300">{qualityAvg.passRate.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2 mb-2">
            <div
              className="h-2 rounded-full bg-green-500 transition-all"
              style={{ width: `${Math.min(qualityAvg.passRate, 100)}%` }}
            />
          </div>
          {qualityAvg.topIssues.length > 0 && (
            <div className="text-xs text-gray-500 dark:text-gray-400">
              주요 이슈:
              <ul className="inline list-none ml-1">
                {qualityAvg.topIssues.map((issue, i, arr) => (
                  <li key={issue} className="inline">
                    <span className="text-red-600 dark:text-red-400">{issue}</span>
                    {i < arr.length - 1 && <span className="text-gray-300 dark:text-gray-200 mx-1">·</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
