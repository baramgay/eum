'use client'

import { Calendar, Clock, CheckCircle2, XCircle, CheckCircle, AlertCircle } from 'lucide-react'
import { StatCard, Badge, EmptyState, Btn, Skeleton, Select } from '@/components/ui'
import type { SourceWithJob } from './types'

interface Props {
  sources: SourceWithJob[]
  loading: boolean
  updatingSourceId?: string | null
  onUpdateJob: (sourceId: string, patch: Record<string, unknown>) => Promise<void>
}

const SCHEDULE_LABEL: Record<string, string> = {
  manual:  '수동',
  daily:   '매일 자정',
  weekly:  '매주 월요일',
  monthly: '매월 1일',
}

const STATUS_VARIANT: Record<string, 'gray' | 'blue' | 'green' | 'red'> = {
  idle:    'gray',
  running: 'blue',
  success: 'green',
  failed:  'red',
}

export default function CollectSchedulesPanel({ sources, loading, updatingSourceId, onUpdateJob }: Props) {
  const scheduledSources = sources.filter(s => s.job)

  async function handleToggle(sourceId: string, enabled: boolean) {
    await onUpdateJob(sourceId, { enabled })
  }

  async function handleScheduleChange(sourceId: string, scheduleType: string) {
    await onUpdateJob(sourceId, { schedule_type: scheduleType })
  }

  const totalCount = scheduledSources.length
  const activeCount  = scheduledSources.filter(s => s.job?.enabled).length
  const successCount = scheduledSources.filter(s => s.job?.status === 'success').length
  const failedCount  = scheduledSources.filter(s => s.job?.status === 'failed').length

  return (
    <div className="space-y-4">
      {!loading && totalCount > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="등록된 스케줄" value={totalCount} color="blue" icon={<Calendar className="w-4 h-4" />} />
          <StatCard label="활성화" value={activeCount} color="green" icon={<CheckCircle className="w-4 h-4" />} />
          <StatCard label="최근 성공" value={successCount} color="purple" icon={<CheckCircle2 className="w-4 h-4" />} />
          <StatCard label="최근 실패" value={failedCount} color="red" icon={<AlertCircle className="w-4 h-4" />} />
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          스케줄이 등록된 소스는 자동으로 주기 수집됩니다. 활성화 상태를 변경하려면 토글을 사용하세요.
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : scheduledSources.length === 0 ? (
        <EmptyState
          icon={<Calendar className="w-8 h-8 text-gray-300 dark:text-gray-200" />}
          title="등록된 스케줄이 없습니다"
          description="수집 소스에 주기 스케줄을 설정하면 이 곳에서 일괄 관리할 수 있습니다"
        />
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-lg border overflow-hidden shadow-sm overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead className="bg-gray-50 dark:bg-gray-950 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-2 text-left text-gray-600 dark:text-gray-400 font-medium">소스</th>
                <th className="px-4 py-2 text-left text-gray-600 dark:text-gray-400 font-medium">활성화</th>
                <th className="px-4 py-2 text-left text-gray-600 dark:text-gray-400 font-medium">스케줄</th>
                <th className="px-4 py-2 text-left text-gray-600 dark:text-gray-400 font-medium">다음 실행</th>
                <th className="px-4 py-2 text-left text-gray-600 dark:text-gray-400 font-medium">상태</th>
                <th className="px-4 py-2 text-left text-gray-600 dark:text-gray-400 font-medium">마지막 실행</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {scheduledSources.map(src => (
                <tr key={src.source_id} className="hover:bg-gray-50 dark:hover:bg-gray-950">
                  <td className="px-4 py-2">
                    <div className="font-medium text-gray-800 dark:text-gray-200">{src.title}</div>
                    <div className="text-xs text-gray-400 dark:text-gray-300 font-mono">{truncateUrl(src.url, 36)}</div>
                  </td>
                  <td className="px-4 py-2">
                    <label className="inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={src.job?.enabled ?? true}
                        onChange={e => handleToggle(src.source_id, e.target.checked)}
                        disabled={updatingSourceId === src.source_id}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600 relative"></div>
                      <span className="ml-2 text-xs text-gray-600 dark:text-gray-400">
                        {src.job?.enabled ? '활성' : '비활성'}
                      </span>
                    </label>
                  </td>
                  <td className="px-4 py-2">
                    <Select
                      value={src.job?.schedule_type ?? 'manual'}
                      onChange={e => handleScheduleChange(src.source_id, e.target.value)}
                      disabled={updatingSourceId === src.source_id}
                      className="px-2 py-1 border rounded-md text-xs disabled:bg-gray-100 disabled:text-gray-400"
                    >
                      <option value="manual">수동</option>
                      <option value="daily">매일 자정</option>
                      <option value="weekly">매주 월요일</option>
                      <option value="monthly">매월 1일</option>
                    </Select>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
                      <Clock className="w-3 h-3" />
                      {src.job?.next_run_at
                        ? new Date(src.job.next_run_at).toLocaleString('ko-KR')
                        : '—'}
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <Badge variant={STATUS_VARIANT[src.job?.status ?? 'idle'] ?? 'gray'}>
                      {src.job?.status ?? 'idle'}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-400 dark:text-gray-300">
                    {src.job?.last_run_at
                      ? new Date(src.job.last_run_at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 text-sm">
          <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300 font-medium mb-1">
            <Calendar className="w-4 h-4" />
            매일 자정
          </div>
          <p className="text-blue-600 dark:text-blue-400 text-xs">매일 00:00에 수집을 실행합니다.</p>
        </div>
        <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 text-sm">
          <div className="flex items-center gap-2 text-purple-700 dark:text-purple-300 font-medium mb-1">
            <CheckCircle2 className="w-4 h-4" />
            매주 월요일
          </div>
          <p className="text-purple-600 dark:text-purple-400 text-xs">매주 월요일 00:00에 수집을 실행합니다.</p>
        </div>
        <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-4 text-sm">
          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-medium mb-1">
            <XCircle className="w-4 h-4" />
            매월 1일
          </div>
          <p className="text-emerald-600 dark:text-emerald-400 text-xs">매월 1일 00:00에 수집을 실행합니다.</p>
        </div>
      </div>
    </div>
  )
}

function truncateUrl(url: string, maxLen = 40): string {
  if (url.length <= maxLen) return url
  return url.slice(0, maxLen) + '…'
}
