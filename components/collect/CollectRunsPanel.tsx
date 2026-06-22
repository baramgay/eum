'use client'

import { Play, Activity, CheckCircle, AlertCircle, Clock, RotateCw } from 'lucide-react'
import { StatCard, Badge, EmptyState, Btn } from '@/components/ui'
import type { CollectLog, SourceWithJob } from './types'

interface SseProgress {
  label: string
  fetched: number
  total: number | null
}

interface Props {
  sources: SourceWithJob[]
  logs: CollectLog[]
  runningId: string | null
  sseProgress: SseProgress | null
  onRun: (sourceId: string) => void
}

const STATUS_VARIANT: Record<string, 'blue' | 'green' | 'red' | 'gray'> = {
  running: 'blue',
  success: 'green',
  failed:  'red',
}

export default function CollectRunsPanel({ sources, logs, runningId, sseProgress, onRun }: Props) {
  const runningLogs = logs.filter(l => l.status === 'running')
  const recentLogs  = logs.filter(l => l.status !== 'running').slice(0, 10)

  const successCount = logs.filter(l => l.status === 'success').length
  const failedCount  = logs.filter(l => l.status === 'failed').length
  const avgDuration  = logs.filter(l => l.duration_ms).length > 0
    ? logs.filter(l => l.duration_ms).reduce((a, b) => a + (b.duration_ms ?? 0), 0) / logs.filter(l => l.duration_ms).length / 1000
    : 0

  const sourceMap = new Map(sources.map(s => [s.source_id, s]))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="진행 중" value={runningLogs.length} color="blue" icon={<Activity className="w-4 h-4" />} />
        <StatCard label="최근 성공" value={successCount} color="green" icon={<CheckCircle className="w-4 h-4" />} />
        <StatCard label="최근 실패" value={failedCount} color="red" icon={<AlertCircle className="w-4 h-4" />} />
        <StatCard label="평균 소요" value={`${avgDuration.toFixed(1)}초`} color="purple" icon={<Clock className="w-4 h-4" />} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* 진행 중 */}
        <div className="bg-white dark:bg-gray-900 rounded-lg border p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-1.5">
            <RotateCw className="w-4 h-4 text-blue-600 dark:text-blue-400 animate-spin" />
            진행 중인 수집
          </h3>
          {runningLogs.length === 0 && !runningId ? (
            <EmptyState icon="⏳" title="현재 실행 중인 수집이 없습니다" description="지금 실행 버튼으로 즉시 수집을 시작하세요." />
          ) : (
            <div className="space-y-2">
              {runningId && sseProgress && (
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-md px-3 py-2 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-blue-700 dark:text-blue-300">{sseProgress.label}</p>
                    {sseProgress.total != null && (
                      <span className="text-xs text-blue-500 dark:text-blue-400">
                        {Math.min(100, Math.round((sseProgress.fetched / sseProgress.total) * 100))}%
                      </span>
                    )}
                  </div>
                  <div className="w-full bg-blue-100 dark:bg-blue-900/30 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                      style={{
                        width: sseProgress.total != null
                          ? `${Math.min(100, Math.round((sseProgress.fetched / sseProgress.total) * 100))}%`
                          : '60%',
                        animation: sseProgress.total == null ? 'pulse 1.5s ease-in-out infinite' : undefined,
                      }}
                    />
                  </div>
                </div>
              )}
              {runningLogs.map(log => {
                const src = sourceMap.get(log.source_id)
                return (
                  <div key={log.log_id} className="flex items-center justify-between bg-blue-50 dark:bg-blue-900/20 rounded-md px-3 py-2">
                    <div>
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{src?.title ?? log.source_id}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{new Date(log.started_at).toLocaleString('ko-KR')}</p>
                    </div>
                    <Badge variant="blue">running</Badge>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* 최근 완료 */}
        <div className="bg-white dark:bg-gray-900 rounded-lg border p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">최근 완료</h3>
          {recentLogs.length === 0 ? (
            <EmptyState icon="📋" title="완료된 수집이 없습니다" description="수집 실행 후 결과가 이 곳에 표시됩니다." />
          ) : (
            <div className="space-y-2 max-h-80 overflow-auto">
              {recentLogs.map(log => {
                const src = sourceMap.get(log.source_id)
                return (
                  <div key={log.log_id} className="flex items-center justify-between border-b last:border-0 pb-2 last:pb-0">
                    <div>
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{src?.title ?? log.source_id}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {new Date(log.started_at).toLocaleString('ko-KR')} · {log.rows_fetched.toLocaleString()}행
                      </p>
                    </div>
                    <Badge variant={STATUS_VARIANT[log.status] ?? 'gray'}>{log.status}</Badge>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* 빠른 실행 */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">빠른 실행</h3>
        {sources.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-300">등록된 소스가 없습니다.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {sources.slice(0, 8).map(src => (
              <Btn
                key={src.source_id}
                size="sm"
                variant="secondary"
                onClick={() => onRun(src.source_id)}
                disabled={runningId === src.source_id}
                loading={runningId === src.source_id}
              >
                <Play className="w-3 h-3" />
                {src.title}
              </Btn>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
