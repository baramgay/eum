'use client'

import { useEffect, useState } from 'react'
import {
  Database,
  CheckCircle2,
  XCircle,
  Clock,
  Play,
  Loader2,
} from 'lucide-react'
import Link from 'next/link'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Skeleton from '@/components/ui/Skeleton'
import type { PipelineDetailData } from '@/app/api/dashboard/pipeline/route'

const STATUS_BADGE: Record<string, { label: string; variant: 'green' | 'amber' | 'blue' | 'red' | 'gray' }> = {
  done:    { label: '완료',   variant: 'green' },
  running: { label: '실행중', variant: 'blue'  },
  queued:  { label: '대기',   variant: 'amber' },
  error:   { label: '오류',   variant: 'red'   },
}

function formatRows(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}만`
  return n.toLocaleString()
}

export default function PipelineDetailWidget() {
  const [data, setData]       = useState<PipelineDetailData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/dashboard/pipeline')
      .then(r => r.ok ? r.json() : null)
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <Card>
        <Skeleton className="h-4 w-40 mb-4" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
        </div>
      </Card>
    )
  }

  if (!data) return null

  const lastStatus = data.process_last_status
  const statusInfo = lastStatus ? STATUS_BADGE[lastStatus] ?? { label: lastStatus, variant: 'gray' as const } : null

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400">파이프라인 현황 (24시간)</h3>
        <Link href="/pipeline" className="text-xs text-blue-500 hover:text-blue-700 dark:hover:text-blue-300 hover:underline transition-colors">바로가기 →</Link>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Database className="w-3.5 h-3.5 text-blue-500" />
            <span className="text-xs text-gray-500 dark:text-gray-400">수집 소스</span>
          </div>
          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{data.sources_total}</p>
          <p className="text-xs text-gray-400 dark:text-gray-300 mt-0.5">전체 등록</p>
        </div>

        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
            <span className="text-xs text-gray-500 dark:text-gray-400">성공 / 실패</span>
          </div>
          <p className="text-2xl font-bold">
            <span className="text-green-600 dark:text-green-400">{data.last24h_ok}</span>
            <span className="text-gray-300 dark:text-gray-600 mx-1">/</span>
            <span className="text-red-500 dark:text-red-400">{data.last24h_fail}</span>
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-300 mt-0.5">최근 24시간</p>
        </div>

        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Play className="w-3.5 h-3.5 text-purple-500" />
            <span className="text-xs text-gray-500 dark:text-gray-400">가공 파이프라인</span>
          </div>
          <p className="text-2xl font-bold text-gray-700 dark:text-gray-200">
            {data.process_waiting + data.process_running + data.process_done}
          </p>
          <div className="flex gap-1 mt-0.5">
            <span className="text-xs text-amber-600 dark:text-amber-400">대기 {data.process_waiting}</span>
            <span className="text-gray-300 dark:text-gray-600">·</span>
            <span className="text-xs text-blue-600 dark:text-blue-400">실행 {data.process_running}</span>
          </div>
        </div>

        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Loader2 className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-xs text-gray-500 dark:text-gray-400">오늘 수집량</span>
          </div>
          <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{formatRows(data.rows_today)}</p>
          <p className="text-xs text-gray-400 dark:text-gray-300 mt-0.5">행 합계</p>
        </div>
      </div>

      {statusInfo && (
        <div className="flex items-center gap-2 mb-3 text-xs text-gray-500 dark:text-gray-400">
          <span>마지막 가공 상태</span>
          <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
        </div>
      )}

      {data.failed_sources.length > 0 && (
        <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
          <div className="flex items-center gap-1.5 mb-2">
            <XCircle className="w-3.5 h-3.5 text-red-500" />
            <span className="text-xs font-medium text-red-600 dark:text-red-400">
              실패 소스 ({data.failed_sources.length})
            </span>
          </div>
          <ul className="space-y-1.5">
            {data.failed_sources.slice(0, 5).map(src => (
              <li key={`${src.id}-${src.started_at}`} className="flex items-start gap-2">
                <Badge variant="red">{src.name}</Badge>
                {src.error_msg && (
                  <span className="text-xs text-gray-400 dark:text-gray-300 truncate flex-1" title={src.error_msg}>
                    {src.error_msg}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-gray-400 dark:text-gray-300 mt-3 text-right">
        {new Date().toLocaleDateString('ko-KR')} 기준
      </p>
    </Card>
  )
}
