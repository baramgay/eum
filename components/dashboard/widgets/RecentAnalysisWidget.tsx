'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, BarChart3, ArrowRight } from 'lucide-react'
import Card from '@/components/ui/Card'
import Btn from '@/components/ui/Btn'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import { ANALYSIS_TYPE_LABEL, timeAgo, type AnalysisRun } from '../DashboardClient'

interface RecentAnalysisWidgetProps {
  recentRuns: AnalysisRun[]
}

export default function RecentAnalysisWidget({ recentRuns }: RecentAnalysisWidgetProps) {
  const router = useRouter()
  const [runQuery, setRunQuery] = useState('')
  const [runTypeFilter, setRunTypeFilter] = useState<string>('all')

  const runTypes = useMemo(() => {
    const types = new Set(recentRuns.map(r => r.analysis_type))
    return Array.from(types)
  }, [recentRuns])

  const filteredRuns = useMemo(() => {
    let rows = recentRuns
    const q = runQuery.trim().toLowerCase()
    if (q) {
      rows = rows.filter(r =>
        r.dataset_label.toLowerCase().includes(q) ||
        (r.result_title && r.result_title.toLowerCase().includes(q)) ||
        (ANALYSIS_TYPE_LABEL[r.analysis_type] ?? r.analysis_type).toLowerCase().includes(q)
      )
    }
    if (runTypeFilter !== 'all') rows = rows.filter(r => r.analysis_type === runTypeFilter)
    return rows
  }, [recentRuns, runQuery, runTypeFilter])

  return (
    <Card className="md:col-span-2">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400">최근 분석 이력</h3>
        <Btn variant="ghost" size="sm" onClick={() => router.push('/analytics')}>
          분석 탭으로
          <ArrowRight className="w-3.5 h-3.5" />
        </Btn>
      </div>

      {recentRuns.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3 mb-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-300" />
            <input
              type="text"
              placeholder="데이터셋, 분석명 검색..."
              value={runQuery}
              onChange={e => setRunQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-indigo-300 focus:outline-none"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setRunTypeFilter('all')}
              className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
                runTypeFilter === 'all'
                  ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
                  : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-950'
              }`}
            >
              전체
            </button>
            {runTypes.map(t => (
              <button
                key={t}
                onClick={() => setRunTypeFilter(t)}
                className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
                  runTypeFilter === t
                    ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
                    : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-950'
                }`}
              >
                {ANALYSIS_TYPE_LABEL[t] ?? t}
              </button>
            ))}
          </div>
        </div>
      )}

      {recentRuns.length === 0 ? (
        <EmptyState
          icon={<BarChart3 className="w-6 h-6 text-indigo-400" />}
          title="분석 이력이 없습니다"
          description="데이터 분석을 실행하면 최근 이력이 여기에 표시됩니다."
          action={{ label: '분석 바로가기', onClick: () => router.push('/analytics') }}
        />
      ) : filteredRuns.length === 0 ? (
        <EmptyState
          icon={<Search className="w-6 h-6 text-gray-400 dark:text-gray-300" />}
          title="검색 결과가 없습니다"
          description="다른 키워드나 필터를 변경해 보세요."
        />
      ) : (
        <ul className="space-y-2">
          {filteredRuns.map(run => (
            <li key={run.id}>
              <button
                type="button"
                className="flex items-start gap-2 w-full text-left cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-950 rounded-lg px-2 py-1.5 -mx-2 transition-colors"
                onClick={() => router.push('/analytics')}
              >
                <Badge variant="purple">
                  {ANALYSIS_TYPE_LABEL[run.analysis_type] ?? run.analysis_type}
                </Badge>
                <span className="text-xs text-gray-600 dark:text-gray-400 truncate flex-1">{run.dataset_label}</span>
                <span className="text-xs text-gray-400 dark:text-gray-300 whitespace-nowrap">{timeAgo(run.created_at)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
