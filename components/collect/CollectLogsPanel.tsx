'use client'

import { useState } from 'react'
import { RefreshCw, Filter, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react'
import { Badge, EmptyState, Btn, Skeleton } from '@/components/ui'
import SortableTable from '@/components/common/SortableTable'
import type { CollectLog, SourceWithJob } from './types'

interface Props {
  logs: CollectLog[]
  loading: boolean
  sources: SourceWithJob[]
  statusFilter: string
  setStatusFilter: (v: string) => void
  sourceFilter: string
  setSourceFilter: (v: string) => void
  hasMore: boolean
  error?: string | null
  onRetry?: () => void
  onLoadMore: () => void
  onRefresh: () => void
}

const LOG_STATUS_VARIANT: Record<string, 'blue' | 'green' | 'red' | 'gray'> = {
  running: 'blue',
  success: 'green',
  failed:  'red',
}

export default function CollectLogsPanel({
  logs,
  loading,
  sources,
  statusFilter,
  setStatusFilter,
  sourceFilter,
  setSourceFilter,
  hasMore,
  error,
  onRetry,
  onLoadMore,
  onRefresh,
}: Props) {
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null)
  const sourceMap = new Map(sources.map(s => [s.source_id, s]))

  const logColumns: import('@/components/common/SortableTable').TableColumn<CollectLog>[] = [
    {
      key: 'status',
      label: '상태',
      render: log => <Badge variant={LOG_STATUS_VARIANT[log.status] ?? 'gray'}>{log.status}</Badge>,
    },
    {
      key: 'source',
      label: '소스',
      sortable: true,
      sortValue: log => sourceMap.get(log.source_id)?.title ?? log.source_id,
      render: log => (
        <span className="text-xs text-gray-700 dark:text-gray-300 max-w-[200px] truncate" title={sourceMap.get(log.source_id)?.title}>
          {sourceMap.get(log.source_id)?.title ?? log.source_id}
        </span>
      ),
    },
    {
      key: 'started_at',
      label: '시작',
      sortable: true,
      sortValue: log => new Date(log.started_at),
      render: log => <span className="text-xs text-gray-500 dark:text-gray-400">{new Date(log.started_at).toLocaleString('ko-KR')}</span>,
    },
    {
      key: 'duration_ms',
      label: '소요',
      sortable: true,
      sortValue: log => log.duration_ms ?? 0,
      render: log => <span className="text-xs text-gray-500 dark:text-gray-400">{log.duration_ms ? `${(log.duration_ms / 1000).toFixed(1)}초` : '—'}</span>,
    },
    {
      key: 'rows_fetched',
      label: '수집',
      align: 'right',
      sortable: true,
      sortValue: log => log.rows_fetched,
      render: log => <span className="text-xs tabular-nums">{log.rows_fetched.toLocaleString()}</span>,
    },
    {
      key: 'rows_new',
      label: '신규',
      align: 'right',
      sortable: true,
      sortValue: log => log.rows_new,
      render: log => <span className="text-xs text-green-600 tabular-nums">+{log.rows_new}</span>,
    },
    {
      key: 'rows_deleted',
      label: '삭제',
      align: 'right',
      sortable: true,
      sortValue: log => log.rows_deleted,
      render: log => <span className="text-xs text-red-500 tabular-nums">-{log.rows_deleted}</span>,
    },
    {
      key: 'error',
      label: '오류',
      render: log => (
        log.error_msg ? (
          <button
            onClick={() => setExpandedLogId(expandedLogId === log.log_id ? null : log.log_id)}
            className="text-red-600 hover:underline flex items-center gap-0.5 text-xs"
          >
            {expandedLogId === log.log_id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            보기
          </button>
        ) : (
          <span className="text-gray-300 dark:text-gray-200 text-xs">—</span>
        )
      ),
    },
  ]

  const isFiltered = statusFilter !== 'all' || sourceFilter !== 'all'

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2 justify-between">
        <div className="flex flex-col sm:flex-row gap-2">
          <select
            value={sourceFilter}
            onChange={e => setSourceFilter(e.target.value)}
            className="px-3 py-2 border rounded-md text-sm"
          >
            <option value="all">전체 소스</option>
            {sources.map(s => (
              <option key={s.source_id} value={s.source_id}>{s.title}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 border rounded-md text-sm"
          >
            <option value="all">전체 상태</option>
            <option value="running">실행 중</option>
            <option value="success">성공</option>
            <option value="failed">실패</option>
          </select>
          {isFiltered && (
            <Btn variant="ghost" size="sm" onClick={() => { setStatusFilter('all'); setSourceFilter('all') }}>
              <Filter className="w-3 h-3" />
              필터 초기화
            </Btn>
          )}
        </div>
        <Btn variant="secondary" size="sm" onClick={onRefresh} loading={loading}>
          <RefreshCw className="w-3.5 h-3.5" />
          새로고침
        </Btn>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-red-700">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
          {onRetry && (
            <Btn size="sm" variant="secondary" onClick={onRetry}>
              <RefreshCw className="w-3.5 h-3.5" />
              다시 시도
            </Btn>
          )}
        </div>
      )}

      {loading && logs.length === 0 ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : logs.length === 0 ? (
        <EmptyState
          icon="📋"
          title="수집 이력이 없습니다"
          description={isFiltered ? '필터를 조정해 보세요.' : '수집 소스를 실행하면 이력이 이 곳에 표시됩니다.'}
        />
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-lg border overflow-hidden shadow-sm">
          <SortableTable
            caption="수집 로그 목록"
            data={logs}
            keyExtractor={log => log.log_id}
            minWidth={900}
            columns={logColumns}
            expandedRow={log =>
              expandedLogId === log.log_id && log.error_msg ? (
                <div className="px-3 py-2 bg-red-50">
                  <pre className="whitespace-pre-wrap text-red-700 text-xs max-h-40 overflow-auto">{log.error_msg}</pre>
                </div>
              ) : null
            }
          />
        </div>
      )}

      {hasMore && (
        <div className="text-center">
          <Btn variant="secondary" size="sm" onClick={onLoadMore} loading={loading}>
            <ChevronDown className="w-3.5 h-3.5" />
            더 보기
          </Btn>
        </div>
      )}
    </div>
  )
}
