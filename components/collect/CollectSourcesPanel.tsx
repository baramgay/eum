'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { Search, Calendar, CheckCircle, AlertCircle, Database, Play, ArrowRight, Pencil, Trash2, RefreshCw, X, Eye, Loader2 } from 'lucide-react'
import { StatCard, Badge, EmptyState, Btn, Skeleton } from '@/components/ui'
import Modal from '@/components/ui/Modal'
import SortableTable from '@/components/common/SortableTable'
import type { SourceWithJob } from './types'

interface Props {
  role: string
  sources: SourceWithJob[]
  loading: boolean
  search: string
  setSearch: (v: string) => void
  statusFilter: string
  setStatusFilter: (v: string) => void
  runningId: string | null
  lastRunResult: { sourceId: string; rowsFetched: number } | null
  deletingId?: string | null
  error?: string | null
  onRetry?: () => void
  onRun: (id: string) => void
  onEdit: (src: SourceWithJob) => void
  onDelete: (id: string) => void
  onOpenForm: () => void
  lastErrorMsgMap?: Record<string, string | null>
}

const STATUS_VARIANT: Record<string, 'gray' | 'blue' | 'green' | 'red'> = {
  idle:    'gray',
  running: 'blue',
  success: 'green',
  failed:  'red',
}

function statusToVariant(status: string) {
  return STATUS_VARIANT[status] ?? 'gray'
}

const SCHEDULE_LABEL: Record<string, string> = {
  manual:  '수동',
  daily:   '매일',
  weekly:  '매주',
  monthly: '매월',
}

function truncateUrl(url: string, maxLen = 40): string {
  if (url.length <= maxLen) return url
  return url.slice(0, maxLen) + '…'
}

type PreviewData = {
  preview: Record<string, unknown>[]
  schema_info: { name: string; type: string }[]
  rows_fetched: number
  finished_at: string | null
}

export default function CollectSourcesPanel({
  role,
  sources,
  loading,
  search,
  setSearch,
  statusFilter,
  setStatusFilter,
  runningId,
  lastRunResult,
  deletingId,
  error,
  onRetry,
  onRun,
  onEdit,
  onDelete,
  onOpenForm,
  lastErrorMsgMap = {},
}: Props) {
  const router = useRouter()
  const [previewSourceId, setPreviewSourceId] = useState<string | null>(null)
  const [previewData, setPreviewData] = useState<PreviewData | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  async function openPreview(sourceId: string) {
    setPreviewSourceId(sourceId)
    setPreviewData(null)
    setPreviewLoading(true)
    try {
      const res = await fetch(`/api/collect/${sourceId}/preview`)
      const json = await res.json()
      setPreviewData(json)
    } finally {
      setPreviewLoading(false)
    }
  }

  const filteredSources = sources.filter(src => {
    const haystack = (src.title + ' ' + src.url + ' ' + (src.theme ?? '') + ' ' + (src.keywords ?? '')).toLowerCase()
    const matchesSearch = haystack.includes(search.toLowerCase())
    const matchesStatus = statusFilter === 'all'
      ? true
      : statusFilter === 'idle'
        ? !src.job?.status || src.job.status === 'idle'
        : src.job?.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const scheduledCount = sources.filter(s => s.job && s.job.schedule_type !== 'manual').length
  const successCount   = sources.filter(s => s.job?.status === 'success').length
  const failedCount    = sources.filter(s => s.job?.status === 'failed').length

  const sourceColumns: import('@/components/common/SortableTable').TableColumn<SourceWithJob>[] = [
    {
      key: 'title',
      label: '제목',
      sortable: true,
      sortValue: s => s.title,
      render: s => <span className="font-medium text-gray-800 dark:text-gray-200">{s.title}</span>,
    },
    ...(role === 'center' ? [{
      key: 'tenant_id' as const,
      label: '기관',
      sortable: true as const,
      sortValue: (s: SourceWithJob) => s.tenant_id,
      render: (s: SourceWithJob) => <span className="text-gray-500 dark:text-gray-400 text-xs font-mono">{s.tenant_id}</span>,
    }] : []),
    {
      key: 'url',
      label: 'URL',
      render: s => <span className="text-xs text-blue-600 font-mono" title={s.url}>{truncateUrl(s.url)}</span>,
    },
    {
      key: 'resp_format',
      label: '형식',
      render: s => <Badge variant="purple">{s.resp_format.toUpperCase()}</Badge>,
    },
    {
      key: 'schedule',
      label: '스케줄',
      sortable: true,
      sortValue: s => s.job?.schedule_type ?? '',
      render: s => <span className="text-xs text-gray-500 dark:text-gray-400">{s.job ? SCHEDULE_LABEL[s.job.schedule_type] ?? s.job.schedule_type : '수동'}</span>,
    },
    {
      key: 'status',
      label: '상태',
      sortable: true,
      sortValue: s => runningId === s.source_id ? 'running' : (s.job?.status ?? 'idle'),
      render: s => {
        const isFailed = !runningId && (s.job?.status === 'failed' || s.job?.status === 'error')
        const errMsg = lastErrorMsgMap[s.source_id]
        if (isFailed) {
          return (
            <button
              type="button"
              onClick={() => errMsg
                ? toast.error(errMsg, { duration: 6000 })
                : toast.error('수집 실패 — 오류 상세 없음')
              }
              title={errMsg ?? '실패'}
              className="cursor-pointer"
            >
              <Badge variant="red">실패</Badge>
            </button>
          )
        }
        return (
          <Badge variant={runningId === s.source_id ? 'blue' : statusToVariant(s.job?.status ?? 'idle')}>
            {runningId === s.source_id ? 'running' : (s.job?.status ?? 'idle')}
          </Badge>
        )
      },
    },
    {
      key: 'last_run_at',
      label: '마지막 실행',
      sortable: true,
      sortValue: s => s.job?.last_run_at ? new Date(s.job.last_run_at).getTime() : 0,
      render: s => (
        <span className="text-xs text-gray-400 dark:text-gray-300">
          {s.job?.last_run_at
            ? new Date(s.job.last_run_at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
            : '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      label: '액션',
      render: s => (
        <div className="flex flex-wrap gap-1.5">
          <Btn size="sm" onClick={() => onRun(s.source_id)} disabled={runningId === s.source_id} loading={runningId === s.source_id}>
            <Play className="w-3 h-3" />
            {runningId === s.source_id ? '실행 중' : '지금 실행'}
          </Btn>
          {lastRunResult?.sourceId === s.source_id && (
            <Btn size="sm" variant="secondary" className="bg-emerald-600 text-white hover:bg-emerald-700 border-transparent"
              onClick={() => router.push(`/process?collect_source=${s.source_id}`)}>
              <ArrowRight className="w-3 h-3" />
              가공으로
            </Btn>
          )}
          <Btn
            size="sm"
            variant="ghost"
            onClick={() => openPreview(s.source_id)}
            disabled={s.job?.status !== 'success'}
            title={s.job?.status !== 'success' ? '수집 성공 이력이 없습니다' : '수집 데이터 미리보기'}
          >
            <Eye className="w-3 h-3" />
            미리보기
          </Btn>
          <Btn size="sm" variant="ghost" onClick={() => onEdit(s)}>
            <Pencil className="w-3 h-3" />
            수정
          </Btn>
          {role === 'center' && (
            <Btn size="sm" variant="danger" onClick={() => onDelete(s.source_id)} loading={deletingId === s.source_id} disabled={deletingId === s.source_id}>
              <Trash2 className="w-3 h-3" />
              삭제
            </Btn>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      {!loading && sources.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="총 소스" value={sources.length} color="blue" icon={<Database className="w-4 h-4" />} />
          <StatCard label="스케줄 등록" value={scheduledCount} color="purple" icon={<Calendar className="w-4 h-4" />} />
          <StatCard label="최근 성공" value={successCount} color="green" icon={<CheckCircle className="w-4 h-4" />} />
          <StatCard label="최근 실패" value={failedCount} color="red" icon={<AlertCircle className="w-4 h-4" />} />
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-2 flex-1 w-full sm:w-auto">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-300" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="제목, URL, 주제, 키워드 검색"
              className="w-full pl-9 pr-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 border rounded-md text-sm"
          >
            <option value="all">전체 상태</option>
            <option value="idle">대기</option>
            <option value="running">실행 중</option>
            <option value="success">성공</option>
            <option value="failed">실패</option>
          </select>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <span>{filteredSources.length} / {sources.length}개</span>
          {(search || statusFilter !== 'all') && (
            <Btn variant="ghost" size="sm" onClick={() => { setSearch(''); setStatusFilter('all') }}>
              <X className="w-3.5 h-3.5" />
              초기화
            </Btn>
          )}
        </div>
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

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white dark:bg-gray-900 rounded-lg border p-4">
              <div className="flex justify-between">
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
                <div className="flex gap-2">
                  <Skeleton className="h-8 w-14" />
                  <Skeleton className="h-8 w-20" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : sources.length === 0 ? (
        <EmptyState
          icon="🌐"
          title="등록된 수집 소스가 없습니다"
          description="외부 API나 파일 URL을 등록하면 데이터를 주기적으로 자동 수집합니다"
          action={{ label: '첫 수집 소스 등록하기', onClick: onOpenForm }}
        />
      ) : filteredSources.length === 0 ? (
        <div className="text-center py-16 text-gray-400 dark:text-gray-300 text-sm">
          검색·필터·정렬 조건에 맞는 수집 소스가 없습니다.
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-lg border shadow-sm max-h-[70vh]">
          <SortableTable
            caption="수집 소스 목록"
            data={filteredSources}
            keyExtractor={s => s.source_id}
            minWidth={900}
            maxHeight="70vh"
            columns={sourceColumns}
          />
        </div>
      )}

      {previewSourceId && (
        <Modal
          open={!!previewSourceId}
          onClose={() => { setPreviewSourceId(null); setPreviewData(null) }}
          title="수집 데이터 미리보기"
          size="xl"
        >
          {previewLoading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-gray-500">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>불러오는 중…</span>
            </div>
          ) : !previewData || previewData.preview.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-sm">미리보기 데이터가 없습니다.</div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span>전체 수집 행: <strong className="text-gray-700">{previewData.rows_fetched.toLocaleString()}건</strong></span>
                {previewData.finished_at && (
                  <span>수집 일시: <strong className="text-gray-700">{new Date(previewData.finished_at).toLocaleString('ko-KR')}</strong></span>
                )}
                <span className="text-gray-400">최대 20행 표시</span>
              </div>
              <div className="overflow-auto max-h-[60vh] border rounded-md">
                <table className="min-w-full text-xs">
                  <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                    <tr>
                      {Object.keys(previewData.preview[0]).map(col => (
                        <th key={col} className="px-3 py-2 text-left font-semibold text-gray-600 dark:text-gray-300 whitespace-nowrap border-b">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.preview.slice(0, 20).map((row, i) => (
                      <tr key={i} className="border-b last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        {Object.values(row).map((val, j) => (
                          <td key={j} className="px-3 py-1.5 text-gray-700 dark:text-gray-300 whitespace-nowrap max-w-[200px] overflow-hidden text-ellipsis">
                            {val === null || val === undefined ? <span className="text-gray-300 italic">null</span> : String(val)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}
