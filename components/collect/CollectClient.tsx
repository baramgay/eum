'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Database, Calendar, ScrollText, Activity, Plus, ArrowRight } from 'lucide-react'
import { PageHeader, Btn } from '@/components/ui'
import Modal from '@/components/ui/Modal'
import { useRealtime } from '@/components/realtime/RealtimeProvider'
import { subscribeTable } from '@/lib/supabase/realtime'
import CollectSourceForm from './CollectSourceForm'
import CollectSourcesPanel from './CollectSourcesPanel'
import CollectSchedulesPanel from './CollectSchedulesPanel'
import CollectLogsPanel from './CollectLogsPanel'
import CollectRunsPanel from './CollectRunsPanel'
import type { SourceWithJob, CollectLog, TestResult } from './types'

type TabKey = 'sources' | 'schedules' | 'logs' | 'runs'

interface Props { role: string; tenantId: string }

const TAB_CONFIG: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'sources',   label: '소스 관리',   icon: <Database className="w-4 h-4" /> },
  { key: 'schedules', label: '스케줄 관리', icon: <Calendar className="w-4 h-4" /> },
  { key: 'logs',      label: '수집 로그',   icon: <ScrollText className="w-4 h-4" /> },
  { key: 'runs',      label: '실행 현황',   icon: <Activity className="w-4 h-4" /> },
]

const LOG_LIMIT = 20

export default function CollectClient({ role, tenantId }: Props) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabKey>('sources')

  const [sources, setSources] = useState<SourceWithJob[]>([])
  const [loading, setLoading]   = useState(true)

  const [showForm, setShowForm] = useState(false)
  const [editingSource, setEditingSource] = useState<SourceWithJob | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)

  const [runningId, setRunningId] = useState<string | null>(null)
  const [lastRunResult, setLastRunResult] = useState<{ sourceId: string; rowsFetched: number; datasetId?: string } | null>(null)
  const [sseProgress, setSseProgress] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [sourceStatusFilter, setSourceStatusFilter] = useState('all')

  const [logs, setLogs] = useState<CollectLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const logsOffsetRef = useRef(0)
  const [logsHasMore, setLogsHasMore] = useState(false)
  const [logStatusFilter, setLogStatusFilter] = useState('all')
  const [logSourceFilter, setLogSourceFilter] = useState('all')

  const [sourcesError, setSourcesError] = useState<string | null>(null)
  const [logsError, setLogsError] = useState<string | null>(null)

  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [updatingJobId, setUpdatingJobId] = useState<string | null>(null)

  const loadSources = useCallback(async () => {
    setLoading(true)
    setSourcesError(null)
    try {
      const res = await fetch('/api/collect')
      if (!res.ok) throw new Error('수집 소스를 불러오지 못했습니다.')
      const list: SourceWithJob[] = await res.json()
      setSources(Array.isArray(list) ? list : [])
    } catch (e) {
      setSourcesError(e instanceof Error ? e.message : '수집 소스를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadLogs = useCallback(async (reset = false) => {
    if (reset) logsOffsetRef.current = 0
    const offset = logsOffsetRef.current
    const params = new URLSearchParams({ limit: String(LOG_LIMIT), offset: String(offset) })
    if (logStatusFilter !== 'all') params.set('status', logStatusFilter)
    if (logSourceFilter !== 'all') params.set('source_id', logSourceFilter)

    setLogsLoading(true)
    setLogsError(null)
    try {
      const res = await fetch(`/api/collect/logs?${params.toString()}`)
      if (!res.ok) throw new Error('수집 로그를 불러오지 못했습니다.')
      const data = await res.json() as { rows: CollectLog[]; count: number }
      const rows = data.rows ?? []
      setLogs(prev => reset ? rows : [...prev, ...rows])
      setLogsHasMore((offset + rows.length) < data.count)
      logsOffsetRef.current = offset + rows.length
    } catch (e) {
      setLogsError(e instanceof Error ? e.message : '수집 로그를 불러오지 못했습니다.')
    } finally {
      setLogsLoading(false)
    }
  }, [logStatusFilter, logSourceFilter])

  useEffect(() => { loadSources() }, [loadSources])

  useEffect(() => {
    if (activeTab === 'logs' || activeTab === 'runs') {
      loadLogs(true)
    }
  }, [activeTab, logStatusFilter, logSourceFilter, loadLogs])

  // 실시간 수집 로그 구독
  const realtime = useRealtime()
  useEffect(() => {
    const sub = subscribeTable(realtime, 'collection_logs', () => {
      loadLogs(true)
      loadSources()
    }, { event: 'INSERT' })
    return () => { sub.unsubscribe() }
  }, [realtime, loadLogs, loadSources])

  // 실행 중일 때는 로그/실행 탭을 주기적으로 갱신
  useEffect(() => {
    if (!runningId && activeTab !== 'logs' && activeTab !== 'runs') return
    const timer = setInterval(() => {
      loadLogs(true)
      loadSources()
    }, 5000)
    return () => clearInterval(timer)
  }, [runningId, activeTab, loadLogs, loadSources])

  async function handleTest(data: Record<string, unknown>) {
    if (!data.url) { toast.error('URL을 먼저 입력하세요.'); return }
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/collect/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const result: TestResult = await res.json()
      setTestResult(result)
      if (result.ok) {
        toast.success(`테스트 성공 — ${result.rows_fetched?.toLocaleString()}행 확인`)
      } else {
        toast.error(`테스트 실패: ${result.error}`)
      }
    } finally {
      setTesting(false)
    }
  }

  async function handleCreate(body: Record<string, unknown>) {
    setSubmitting(true)
    const res = await fetch('/api/collect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, tenant_id: tenantId }),
    })
    setSubmitting(false)
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: '오류' }))
      toast.error(`등록 실패: ${err.error}`)
      return
    }
    setShowForm(false)
    setTestResult(null)
    toast.success('수집 소스가 등록되었습니다.')
    await loadSources()
  }

  async function handleUpdate(body: Record<string, unknown>) {
    if (!editingSource) return
    setSubmitting(true)
    const res = await fetch(`/api/collect/${editingSource.source_id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setSubmitting(false)
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: '오류' }))
      toast.error(`수정 실패: ${err.error}`)
      return
    }
    setEditingSource(null)
    setTestResult(null)
    toast.success('수집 소스가 수정되었습니다.')
    await loadSources()
  }

  async function handleRun(sourceId: string) {
    setRunningId(sourceId)
    setLastRunResult(null)
    setSseProgress('수집 시작...')
    try {
      const res = await fetch(`/api/collect/${sourceId}/run`, {
        method: 'POST',
        headers: { 'Accept': 'text/event-stream' },
      })

      if (res.headers.get('content-type')?.includes('text/event-stream') && res.body) {
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            try {
              const event = JSON.parse(line.slice(6))
              if (event.type === 'start')   setSseProgress('수집 요청 중...')
              if (event.type === 'fetched') setSseProgress(`${(event.rows ?? 0).toLocaleString()}행 수집됨`)
              if (event.type === 'saved')   setSseProgress('저장 중...')
              if (event.type === 'done') {
                const rowsFetched: number = event.rows_fetched ?? 0
                toast.success(`수집 완료 — ${rowsFetched.toLocaleString()}행`)
                setLastRunResult({ sourceId, rowsFetched, datasetId: event.dataset_id ?? undefined })
              }
              if (event.type === 'error') throw new Error(event.message)
            } catch (e) {
              if (e instanceof SyntaxError) continue
              throw e
            }
          }
        }
      } else {
        // JSON fallback
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: '알 수 없는 오류' }))
          throw new Error(err.error ?? '오류')
        }
        const data = await res.json()
        const rowsFetched: number = data.rows_fetched ?? 0
        toast.success(`수집 완료 — ${rowsFetched.toLocaleString()}행`)
        setLastRunResult({ sourceId, rowsFetched, datasetId: data.dataset_id ?? undefined })
      }
    } catch (e) {
      toast.error(`수집 실패: ${e instanceof Error ? e.message : '오류'}`)
    } finally {
      setRunningId(null)
      setSseProgress(null)
    }
    await loadSources()
    await loadLogs(true)
  }

  async function handleDelete(sourceId: string) {
    if (!confirm('소스를 삭제하면 수집 이력도 모두 삭제됩니다. 계속하시겠습니까?')) return
    setDeletingId(sourceId)
    try {
      const res = await fetch(`/api/collect/${sourceId}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: '오류' }))
        toast.error(`삭제 실패: ${err.error}`)
        return
      }
      toast('소스가 삭제되었습니다.')
      await loadSources()
    } finally {
      setDeletingId(null)
    }
  }

  async function handleUpdateJob(sourceId: string, patch: Record<string, unknown>) {
    setUpdatingJobId(sourceId)
    try {
      const res = await fetch(`/api/collect/${sourceId}/job`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: '오류' }))
        toast.error(`스케줄 변경 실패: ${err.error}`)
        return
      }
      toast.success('스케줄 설정이 변경되었습니다.')
      await loadSources()
    } finally {
      setUpdatingJobId(null)
    }
  }

  function openCreate() {
    setEditingSource(null)
    setTestResult(null)
    setShowForm(true)
  }

  function openEdit(src: SourceWithJob) {
    setShowForm(false)
    setEditingSource(src)
    setTestResult(null)
  }

  function closeModal() {
    setShowForm(false)
    setEditingSource(null)
    setTestResult(null)
  }

  const lastErrorMsgMap = useMemo<Record<string, string | null>>(() => {
    const map: Record<string, string | null> = {}
    for (const src of sources) {
      if (src.job?.status === 'failed' || src.job?.status === 'error') {
        const lastLog = logs
          .filter(l => l.source_id === src.source_id && (l.status === 'failed' || l.status === 'error'))
          .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())[0]
        map[src.source_id] = lastLog?.error_msg ?? null
      }
    }
    return map
  }, [sources, logs])

  const formSource = showForm ? null : editingSource
  const isFormOpen = showForm || !!editingSource

  return (
    <div className="space-y-4">
      {/* 폼 모달 */}
      <Modal
        open={isFormOpen}
        onClose={closeModal}
        title={editingSource ? '수집 소스 수정' : '수집 소스 등록'}
        description="외부 데이터 수집 소스를 등록하거나 수정합니다"
        size="xl"
        className="max-w-4xl"
        showCloseButton={false}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b flex-shrink-0">
          <h3 className="font-semibold text-gray-800 dark:text-gray-200">
            {editingSource ? '수집 소스 수정' : '수집 소스 등록'}
          </h3>
          <button onClick={closeModal} className="text-gray-400 dark:text-gray-300 hover:text-gray-700 dark:hover:text-gray-300 text-lg">✕</button>
        </div>
        <div className="overflow-auto p-5 flex-1">
          <CollectSourceForm
            key={editingSource?.source_id ?? 'new'}
            initialData={formSource}
            onSubmit={editingSource ? handleUpdate : handleCreate}
            onTest={handleTest}
            onCancel={closeModal}
            submitting={submitting}
            testing={testing}
            testResult={testResult}
          />
        </div>
      </Modal>

      <PageHeader
        title="데이터 수집 관리"
        subtitle="외부 API·파일을 등록하고 스케줄·실행·이력을 관리합니다"
        action={
          <Btn onClick={openCreate}>
            <Plus className="w-4 h-4" />
            수집 소스 등록
          </Btn>
        }
      />

      {/* 탭 */}
      <div className="border-b">
        <nav className="flex gap-1">
          {TAB_CONFIG.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* 수집 완료 배너 — 가공 탭 연동 */}
      {lastRunResult && !runningId && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 flex items-center justify-between gap-4 text-sm">
          <span className="text-green-700">
            수집 완료 — {lastRunResult.rowsFetched.toLocaleString()}행
          </span>
          <Btn
            size="sm"
            onClick={() => {
              const params = new URLSearchParams({ source_id: lastRunResult.sourceId })
              if (lastRunResult.datasetId) params.set('dataset_id', lastRunResult.datasetId)
              router.push(`/process?${params.toString()}`)
            }}
          >
            <ArrowRight className="w-3.5 h-3.5" />
            가공으로
          </Btn>
        </div>
      )}

      {activeTab === 'sources' && (
        <>
          {runningId && sseProgress && (
            <p className="text-xs text-blue-600 animate-pulse px-1 mt-1">{sseProgress}</p>
          )}
          <CollectSourcesPanel
            role={role}
            sources={sources}
            loading={loading}
            search={search}
            setSearch={setSearch}
            statusFilter={sourceStatusFilter}
            setStatusFilter={setSourceStatusFilter}
            runningId={runningId}
            lastRunResult={lastRunResult}
            deletingId={deletingId}
            error={sourcesError}
            onRetry={loadSources}
            onRun={handleRun}
            onEdit={openEdit}
            onDelete={handleDelete}
            onOpenForm={openCreate}
            lastErrorMsgMap={lastErrorMsgMap}
          />
        </>
      )}

      {activeTab === 'schedules' && (
        <CollectSchedulesPanel
          sources={sources}
          loading={loading}
          updatingSourceId={updatingJobId}
          onUpdateJob={handleUpdateJob}
        />
      )}

      {activeTab === 'logs' && (
        <CollectLogsPanel
          logs={logs}
          loading={logsLoading}
          sources={sources}
          statusFilter={logStatusFilter}
          setStatusFilter={setLogStatusFilter}
          sourceFilter={logSourceFilter}
          setSourceFilter={setLogSourceFilter}
          hasMore={logsHasMore}
          error={logsError}
          onRetry={() => loadLogs(true)}
          onLoadMore={() => loadLogs(false)}
          onRefresh={() => loadLogs(true)}
          onSendToProcess={sourceId => router.push(`/process?source_id=${encodeURIComponent(sourceId)}`)}
        />
      )}

      {activeTab === 'runs' && (
        <CollectRunsPanel
          sources={sources}
          logs={logs}
          runningId={runningId}
          onRun={handleRun}
        />
      )}
    </div>
  )
}
