'use client'

import { useState } from 'react'
import { RefreshCw, Filter, ChevronDown, ChevronUp, AlertCircle, Eye, ArrowRight } from 'lucide-react'
import { Badge, EmptyState, Btn, Skeleton, Select } from '@/components/ui'
import Modal from '@/components/ui/Modal'
import SortableTable from '@/components/common/SortableTable'
import type { CollectLog, SourceWithJob } from './types'

interface PreviewResponse {
  preview: Record<string, unknown>[]
  message?: string
}

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
  onSendToProcess?: (sourceId: string) => void
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
  onSendToProcess,
}: Props) {
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null)
  const [previewLogId, setPreviewLogId] = useState<string | null>(null)
  const [previewData, setPreviewData] = useState<PreviewResponse | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const sourceMap = new Map(sources.map(s => [s.source_id, s]))

  async function openPreview(logId: string) {
    setPreviewLogId(logId)
    setPreviewData(null)
    setPreviewLoading(true)
    try {
      const res = await fetch(`/api/collect/preview?log_id=${encodeURIComponent(logId)}`)
      const data: PreviewResponse = await res.json()
      setPreviewData(data)
    } catch {
      setPreviewData({ preview: [], message: '미리보기를 불러오지 못했습니다.' })
    } finally {
      setPreviewLoading(false)
    }
  }

  function closePreview() {
    setPreviewLogId(null)
    setPreviewData(null)
  }

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
      render: log => <span className="text-xs text-green-600 dark:text-green-400 tabular-nums">+{log.rows_new}</span>,
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
            className="text-red-600 dark:text-red-400 hover:underline flex items-center gap-0.5 text-xs"
          >
            {expandedLogId === log.log_id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            보기
          </button>
        ) : (
          <span className="text-gray-300 dark:text-gray-200 text-xs">—</span>
        )
      ),
    },
    {
      key: 'preview',
      label: '미리보기',
      render: log => (
        log.status === 'success' ? (
          <Btn variant="ghost" size="sm" onClick={() => openPreview(log.log_id)}>
            <Eye className="w-3 h-3" /> 미리보기
          </Btn>
        ) : (
          <span className="text-gray-300 dark:text-gray-200 text-xs">—</span>
        )
      ),
    },
    ...(onSendToProcess ? [{
      key: 'send_to_process' as const,
      label: '가공',
      render: (log: CollectLog) => (
        log.status === 'success' ? (
          <Btn variant="ghost" size="sm" onClick={() => onSendToProcess(log.source_id)}>
            <ArrowRight className="w-3 h-3" /> 가공으로
          </Btn>
        ) : (
          <span className="text-gray-300 dark:text-gray-200 text-xs">—</span>
        )
      ),
    }] : []),
  ]

  const isFiltered = statusFilter !== 'all' || sourceFilter !== 'all'

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2 justify-between">
        <div className="flex flex-col sm:flex-row gap-2">
          <Select
            value={sourceFilter}
            onChange={e => setSourceFilter(e.target.value)}
            className="px-3 py-2 border rounded-md text-sm bg-white dark:bg-gray-900"
          >
            <option value="all">전체 소스</option>
            {sources.map(s => (
              <option key={s.source_id} value={s.source_id}>{s.title}</option>
            ))}
          </Select>
          <Select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 border rounded-md text-sm bg-white dark:bg-gray-900"
          >
            <option value="all">전체 상태</option>
            <option value="running">실행 중</option>
            <option value="success">성공</option>
            <option value="failed">실패</option>
          </Select>
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
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-red-700 dark:text-red-300">
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
                <div className="px-3 py-2 bg-red-50 dark:bg-red-900/20">
                  <pre className="whitespace-pre-wrap text-red-700 dark:text-red-300 text-xs max-h-40 overflow-auto">{log.error_msg}</pre>
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

      <Modal
        open={!!previewLogId}
        onClose={closePreview}
        title="수집 데이터 미리보기"
        size="xl"
      >
        <div className="flex items-center justify-between px-5 py-3 border-b flex-shrink-0">
          <h3 className="font-semibold text-gray-800 dark:text-gray-200">수집 데이터 미리보기</h3>
          <button onClick={closePreview} className="text-gray-400 dark:text-gray-300 hover:text-gray-700 dark:hover:text-gray-300 text-lg">✕</button>
        </div>
        <div className="p-5 overflow-auto flex-1 max-h-[70vh]">
          {previewLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-8" />
              ))}
            </div>
          ) : !previewData || previewData.preview.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">{previewData?.message ?? '미리보기 데이터 없음'}</p>
          ) : (
            <>
              <p className="text-xs text-gray-400 dark:text-gray-300 mb-3">최대 20행 표시</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse min-w-[600px]">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800">
                      {Object.keys(previewData.preview[0]).map(col => (
                        <th key={col} className="border border-gray-200 dark:border-gray-700 px-3 py-2 font-medium text-gray-600 dark:text-gray-300 text-left whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.preview.map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                        {Object.values(row).map((val, j) => (
                          <td key={j} className="border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-gray-700 dark:text-gray-300 max-w-[200px] truncate" title={String(val ?? '')}>
                            {val === null || val === undefined ? <span className="text-gray-300 dark:text-gray-600">null</span> : String(val)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  )
}
