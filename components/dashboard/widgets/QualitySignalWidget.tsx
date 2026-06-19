'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, ShieldCheck } from 'lucide-react'
import Card from '@/components/ui/Card'
import Btn from '@/components/ui/Btn'
import Badge from '@/components/ui/Badge'
import Skeleton from '@/components/ui/Skeleton'
import type { QualitySignalData, Grade } from '@/app/api/dashboard/quality-signal/route'

const GRADE_CONFIG: Record<Grade, { label: string; bg: string; text: string; dot: string }> = {
  A: { label: 'A', bg: 'bg-green-100 dark:bg-green-900/30',  text: 'text-green-700 dark:text-green-300',  dot: 'bg-green-500' },
  B: { label: 'B', bg: 'bg-blue-100 dark:bg-blue-900/30',   text: 'text-blue-700 dark:text-blue-300',   dot: 'bg-blue-500' },
  C: { label: 'C', bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300', dot: 'bg-amber-400' },
  D: { label: 'D', bg: 'bg-orange-100 dark:bg-orange-900/30',text: 'text-orange-700 dark:text-orange-300',dot: 'bg-orange-400' },
  E: { label: 'E', bg: 'bg-red-100 dark:bg-red-900/30',     text: 'text-red-700 dark:text-red-300',     dot: 'bg-red-500' },
}

function GradeChip({ grade }: { grade: Grade }) {
  const c = GRADE_CONFIG[grade]
  return (
    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-sm font-bold ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  )
}

function SignalDot({ grade }: { grade: Grade }) {
  return (
    <span className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${GRADE_CONFIG[grade].dot}`} />
  )
}

export default function QualitySignalWidget() {
  const router = useRouter()
  const [data, setData]       = useState<QualitySignalData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/dashboard/quality-signal')
      .then(r => r.ok ? r.json() : null)
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <Card>
        <Skeleton className="h-4 w-40 mb-4" />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9" />)}
        </div>
      </Card>
    )
  }

  if (!data || data.top5_datasets.length === 0) return null

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-gray-400 dark:text-gray-300" />
          <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400">품질 신호등 (데이터셋 Top 5)</h3>
        </div>
        <Btn variant="ghost" size="sm" onClick={() => router.push('/quality')}>
          품질 탭
          <ArrowRight className="w-3.5 h-3.5" />
        </Btn>
      </div>

      <ul className="space-y-2 mb-4">
        {data.top5_datasets.map(ds => (
          <li key={ds.dataset_id} className="flex items-center gap-3">
            <GradeChip grade={ds.grade} />
            <SignalDot grade={ds.grade} />
            <span className="text-xs text-gray-700 dark:text-gray-200 truncate flex-1">{ds.title}</span>
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">
              {ds.avg_score.toFixed(1)}점
            </span>
          </li>
        ))}
      </ul>

      {data.top5_issues.length > 0 && (
        <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">미충족 지표 Top 5</p>
          <ul className="space-y-1.5">
            {data.top5_issues.map(issue => (
              <li key={issue.rule} className="flex items-center gap-2">
                <Badge variant="red">{issue.violations.toLocaleString()}건</Badge>
                <span className="text-xs text-gray-600 dark:text-gray-300 truncate">{issue.rule}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}
