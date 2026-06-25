'use client'

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { Rule, ProcessError } from '@/lib/processor'
import RuleEditor from './RuleEditor'
import toast from 'react-hot-toast'
import { useRealtime } from '@/components/realtime/RealtimeProvider'
import { subscribeTable } from '@/lib/supabase/realtime'
import {
  Settings2, BarChart2, Search, Play, History, ArrowUpDown,
  Filter, Trash2, Edit3, AlertCircle, CheckCircle2, XCircle,
  Loader2, Clock, Network, Upload, PlayCircle,
} from 'lucide-react'
import { StatCard, Badge, EmptyState, Card, Btn, PageHeader, Skeleton } from '@/components/ui'
import Modal from '@/components/ui/Modal'

interface Pipeline {
  id: string
  tenant_id: string
  name: string
  description: string | null
  source_kind: string
  source_dataset_id: string
  rules: Rule[]
  created_at: string
  updated_at: string
}

interface RunRecord {
  id: string
  status: string
  input_rows: number
  output_rows: number
  error_rows: number
  started_at: string
  finished_at: string | null
  result_dataset_id: string | null
  result_table?: string | null
  error_log?: unknown[]
}

interface RunResult {
  run_id: string
  status: string
  input_rows: number
  output_rows: number
  error_rows: number
  dataset_id: string
  result_table?: string | null
  errors?: ProcessError[]
}

interface LineageNode {
  id: string
  run_type: string
  run_id: string
  source_ids: string[] | null
  target_table: string
  created_at: string
}

interface Props { role: string; tenantId: string }

const SOURCE_KIND_LABEL: Record<string, string> = {
  upload:   '업로드',
  catalog:  '카탈로그',
  gold:     'Gold 테이블',
  pipeline: '파이프라인',
}

type SortKey = 'created_desc' | 'created_asc' | 'name_asc' | 'name_desc'

export default function ProcessClient({ role, tenantId }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pipelines, setPipelines]     = useState<Pipeline[]>([])
  const [loading, setLoading]         = useState(true)
  const [showForm, setShowForm]       = useState(false)
  const [editTarget, setEditTarget]   = useState<Pipeline | null>(null)
  const [runningId, setRunningId]     = useState<string | null>(null)
  const [runResult, setRunResult]     = useState<{ id: string; result: RunResult } | null>(null)
  const [runsMap, setRunsMap]         = useState<Record<string, RunRecord[]>>({})
  const [search, setSearch]           = useState('')
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'not_run' | 'running' | 'done' | 'failed'>('all')
  const [sortBy, setSortBy]           = useState<SortKey>('created_desc')
  const [error, setError]             = useState<string | null>(null)
  const [historyLoadingId, setHistoryLoadingId] = useState<string | null>(null)
  const [deleteLoadingId, setDeleteLoadingId]   = useState<string | null>(null)
  const [lineageMap, setLineageMap]     = useState<Record<string, LineageNode[]>>({})
  const [lineageLoadingId, setLineageLoadingId] = useState<string | null>(null)
  const [showErrorDialog, setShowErrorDialog]   = useState(false)
  const [selectedHistoryRun, setSelectedHistoryRun] = useState<RunRecord | null>(null)
  const [selectedIds, setSelectedIds]           = useState<Set<string>>(new Set())
  const [batchRunning, setBatchRunning]         = useState(false)
  const [batchResults, setBatchResults]         = useState<{ id: string; ok: boolean; data: unknown }[] | null>(null)

  const isReadOnly = role === 'viewer'

  // URL params: collect_source(레거시) 또는 source_id + dataset_id 로 form pre-fill
  const collectSource = searchParams?.get('collect_source') ?? searchParams?.get('source_id') ?? ''
  const presetDatasetId = searchParams?.get('dataset_id') ?? ''
  const [form, setForm] = useState({
    name: '', description: '', source_kind: collectSource ? 'catalog' : 'upload',
    source_dataset_id: presetDatasetId || collectSource,
  })

  const handleFetchError = useCallback(async (res: Response, fallback: string) => {
    let msg = fallback
    try {
      const data = await res.json()
      if (data.error) msg = data.error
      if (data.details && Array.isArray(data.details)) {
        msg += ': ' + data.details.map((d: { message?: string }) => d.message).join(', ')
      }
    } catch {
      msg = `${fallback} (HTTP ${res.status})`
    }
    toast.error(msg)
  }, [])

  const loadRuns = useCallback(async (pipelineId: string) => {
    try {
      const res = await fetch(`/api/process/${pipelineId}`)
      if (!res.ok) return
      const data = await res.json()
      if (data.runs) {
        setRunsMap(prev => ({ ...prev, [pipelineId]: data.runs }))
      }
    } catch {
      // 이력 로드 실패는 침묵 처리
    }
  }, [])

  const refreshHistory = useCallback(async (pipelineId: string) => {
    setHistoryLoadingId(pipelineId)
    try { await loadRuns(pipelineId) } finally { setHistoryLoadingId(null) }
  }, [loadRuns])

  const loadLineage = useCallback(async (runId: string, targetTable: string) => {
    setLineageLoadingId(runId)
    try {
      const res = await fetch(`/api/lineage?target_table=${encodeURIComponent(targetTable)}`)
      if (!res.ok) return
      const data = await res.json()
      if (Array.isArray(data.lineage)) {
        setLineageMap(prev => ({ ...prev, [runId]: data.lineage }))
      }
    } catch {
      // 계보 로드 실패는 침묵 처리
    } finally {
      setLineageLoadingId(null)
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = role !== 'center' ? `?tenant_id=${tenantId}` : ''
      const res = await fetch(`/api/process${qs}`)
      if (!res.ok) {
        const msg = '파이프라인 목록을 불러오지 못했습니다'
        await handleFetchError(res, msg)
        setError(`${msg} (HTTP ${res.status})`)
        setPipelines([])
        return
      }
      const data = await res.json()
      const list = Array.isArray(data) ? data : []
      setPipelines(list)
      // 각 파이프라인의 최근 이력을 백그라운드로 로드
      list.forEach((p: Pipeline) => loadRuns(p.id))
    } catch {
      const msg = '파이프라인 목록을 불러오지 못했습니다'
      toast.error(msg)
      setError(msg)
      setPipelines([])
    } finally {
      setLoading(false)
    }
  }, [role, tenantId, handleFetchError, loadRuns])

  useEffect(() => { load() }, [load])
  useEffect(() => { if (collectSource) setShowForm(true) }, [collectSource])

  // 실시간 가공 실행 구독
  const realtime = useRealtime()
  useEffect(() => {
    const sub = subscribeTable(realtime, 'processing_runs', () => load(), { event: 'INSERT' })
    return () => { sub.unsubscribe() }
  }, [realtime, load])

  // 실행 중인 run이 있으면 주기적으로 새로고침
  useEffect(() => {
    const runningPipelines = Object.entries(runsMap)
      .filter(([, runs]) => runs.some(r => r.status === 'running'))
      .map(([id]) => id)
    if (runningPipelines.length === 0) return
    const interval = setInterval(() => {
      runningPipelines.forEach(id => loadRuns(id))
    }, 3000)
    return () => clearInterval(interval)
  }, [runsMap, loadRuns])

  const filteredPipelines = useMemo(() => {
    let list = pipelines.filter(p => {
      const text = (p.name + ' ' + (p.description ?? '') + ' ' + p.source_dataset_id).toLowerCase()
      const matchesSearch = text.includes(search.toLowerCase())
      const matchesSource = sourceFilter === 'all' || p.source_kind === sourceFilter
      const run = runsMap[p.id]?.[0]
      const matchesStatus = statusFilter === 'all' ||
        (statusFilter === 'not_run' ? !run : run?.status === statusFilter)
      return matchesSearch && matchesSource && matchesStatus
    })
    list = [...list].sort((a, b) => {
      switch (sortBy) {
        case 'name_asc':  return a.name.localeCompare(b.name)
        case 'name_desc': return b.name.localeCompare(a.name)
        case 'created_asc': return a.created_at.localeCompare(b.created_at)
        case 'created_desc': return b.created_at.localeCompare(a.created_at)
      }
    })
    return list
  }, [pipelines, search, sourceFilter, statusFilter, sortBy, runsMap])

  const totalRules = useMemo(() =>
    pipelines.reduce((sum, p) => sum + (p.rules?.length ?? 0), 0),
  [pipelines])

  const recentRuns = useMemo(() => Object.values(runsMap).flat(), [runsMap])
  const doneRuns   = useMemo(() => recentRuns.filter(r => r.status === 'done').length, [recentRuns])
  const failedRuns = useMemo(() => recentRuns.filter(r => r.status === 'failed').length, [recentRuns])

  async function createPipeline(e: React.FormEvent) {
    e.preventDefault()
    if (isReadOnly) return
    const body = {
      tenant_id:         tenantId,
      name:              form.name,
      description:       form.description || null,
      source_kind:       form.source_kind,
      source_dataset_id: form.source_dataset_id,
      rules:             [],
    }
    try {
      const res = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        await handleFetchError(res, '파이프라인 생성 실패')
        return
      }
      setShowForm(false)
      setForm({ name: '', description: '', source_kind: 'upload', source_dataset_id: '' })
      toast.success('파이프라인이 생성되었습니다.')
      load()
    } catch {
      toast.error('파이프라인 생성 중 오류가 발생했습니다')
    }
  }

  async function deletePipeline(id: string) {
    if (isReadOnly) return
    if (!confirm('파이프라인을 삭제하시겠습니까?')) return
    setDeleteLoadingId(id)
    try {
      const res = await fetch(`/api/process/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        await handleFetchError(res, '파이프라인 삭제 실패')
        return
      }
      toast.success('파이프라인이 삭제되었습니다.')
      load()
    } catch {
      toast.error('파이프라인 삭제 중 오류가 발생했습니다')
    } finally {
      setDeleteLoadingId(null)
    }
  }

  async function saveRules(pipeline: Pipeline, rules: Rule[]) {
    if (isReadOnly) return
    try {
      const res = await fetch(`/api/process/${pipeline.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules }),
      })
      if (!res.ok) {
        await handleFetchError(res, '규칙 저장 실패')
        return
      }
      setEditTarget(null)
      toast.success('규칙이 저장되었습니다.')
      load()
    } catch {
      toast.error('규칙 저장 중 오류가 발생했습니다')
    }
  }

  async function runPipeline(id: string) {
    if (isReadOnly) return
    setRunningId(id)
    setRunResult(null)
    try {
      const res = await fetch(`/api/process/${id}/run`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        await handleFetchError(res, data.error ?? '파이프라인 실행 실패')
        return
      }
      const result = data as RunResult
      setRunResult({ id, result })
      toast.success(`파이프라인 실행 완료 — ${result.output_rows ?? 0}행 출력`)
      loadRuns(id)
    } catch {
      toast.error('파이프라인 실행 중 오류가 발생했습니다')
    } finally {
      setRunningId(null)
    }
  }

  async function runBatch() {
    if (isReadOnly || selectedIds.size === 0) return
    setBatchRunning(true)
    setBatchResults(null)
    try {
      const res = await fetch('/api/process/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pipeline_ids: Array.from(selectedIds) }),
      })
      const data = await res.json() as { results: { id: string; ok: boolean; data: unknown }[] }
      setBatchResults(data.results ?? [])
      const ok = (data.results ?? []).filter(r => r.ok).length
      const fail = (data.results ?? []).length - ok
      if (fail === 0) toast.success(`${ok}개 파이프라인 실행 완료`)
      else toast.error(`${ok}개 성공, ${fail}개 실패`)
      setSelectedIds(new Set())
    } catch {
      toast.error('배치 실행 중 오류가 발생했습니다')
    } finally {
      setBatchRunning(false)
    }
  }

  async function registerToPortal(pipelineId: string, result: RunResult) {
    const pipeline = pipelines.find(p => p.id === pipelineId)
    try {
      const res = await fetch('/api/catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title:       pipeline?.name ?? '파이프라인 결과',
          description: pipeline?.description ?? undefined,
          source:      'processing',
          pipeline_id: pipelineId,
          dataset_id:  result.dataset_id,
          table_name:  result.result_table ?? undefined,
          row_count:   result.output_rows,
        }),
      })
      if (!res.ok) {
        await handleFetchError(res, '포털 등록 실패')
        return
      }
      toast.success('포털에 등록되었습니다.')
    } catch {
      toast.error('포털 등록 중 오류가 발생했습니다')
    }
  }

  function lastRunStatus(id: string): RunRecord | undefined {
    return runsMap[id]?.[0]
  }

  function LineagePanel({ node, sourceDatasetId, pipelineName }: {
    node: LineageNode
    sourceDatasetId: string
    pipelineName: string
  }) {
    const sources = Array.isArray(node.source_ids) ? node.source_ids : [sourceDatasetId]
    return (
      <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded text-xs text-blue-800 dark:text-blue-300">
        <div className="flex items-center gap-2 mb-2 font-medium">
          <Network className="w-3.5 h-3.5" /> 데이터 계보
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {sources.map((s, i) => (
            <span key={i} className="px-2 py-1 bg-white dark:bg-gray-900 border border-blue-200 dark:border-blue-700 rounded truncate max-w-[140px]" title={s}>
              {s}
            </span>
          ))}
          <span className="text-blue-400">→</span>
          <span className="px-2 py-1 bg-white dark:bg-gray-900 border border-blue-200 dark:border-blue-700 rounded truncate max-w-[140px]" title={pipelineName}>
            {pipelineName}
          </span>
          <span className="text-blue-400">→</span>
          <span className="px-2 py-1 bg-white dark:bg-gray-900 border border-blue-200 dark:border-blue-700 rounded truncate max-w-[140px]" title={node.target_table}>
            {node.target_table}
          </span>
        </div>
      </div>
    )
  }

  function statusBadge(run?: RunRecord) {
    if (!run) return <Badge variant="gray">미실행</Badge>
    if (run.status === 'done')   return <Badge variant="green"><CheckCircle2 className="w-3 h-3 inline mr-1" />성공</Badge>
    if (run.status === 'failed') return <Badge variant="red"><XCircle className="w-3 h-3 inline mr-1" />실패</Badge>
    if (run.status === 'running') return <Badge variant="blue"><Loader2 className="w-3 h-3 inline mr-1 animate-spin" />실행 중</Badge>
    return <Badge variant="gray">{run.status}</Badge>
  }

  if (loading) return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i} padding="md">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div className="space-y-2 flex-1">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-56" />
              <div className="flex gap-2 pt-1">
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-5 w-20" />
              </div>
            </div>
            <div className="flex gap-1.5 shrink-0">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-16" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  )

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <PageHeader
        title="데이터 가공 파이프라인"
        subtitle="규칙 기반 ETL 변환 및 실행"
        action={
          !isReadOnly ? (
            <Btn onClick={() => setShowForm(!showForm)}>+ 파이프라인 추가</Btn>
          ) : undefined
        }
      />

      {isReadOnly && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm text-amber-700 dark:text-amber-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          viewer 권한으로는 조회만 가능합니다.
        </div>
      )}

      {/* 오류 알림 및 재시도 */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-sm text-red-700 dark:text-red-300 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <Btn size="sm" variant="secondary" onClick={load}>다시 시도</Btn>
        </div>
      )}

      {/* 통계 카드 */}
      {!loading && pipelines.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="총 파이프라인" value={pipelines.length} color="blue" icon={<Settings2 className="w-4 h-4" />} />
          <StatCard label="총 규칙" value={totalRules} color="purple" icon="🔧" />
          <StatCard label="성공 실행" value={doneRuns} color="green" icon={<Play className="w-4 h-4" />} />
          <StatCard label="실패 실행" value={failedRuns} color="red" icon={<History className="w-4 h-4" />} />
        </div>
      )}

      {/* 생성 폼 */}
      {showForm && !isReadOnly && (
        <Card>
          <h3 className="font-medium text-gray-700 dark:text-gray-300 mb-4">새 파이프라인</h3>
          <form onSubmit={createPipeline} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label htmlFor="proc-pipeline-name" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">파이프라인명 *</label>
                <input
                  id="proc-pipeline-name"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  required
                  placeholder="예: 청년인구 정제"
                  className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
                />
              </div>
              <div>
                <label htmlFor="proc-source-kind" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">소스 종류 *</label>
                <select
                  id="proc-source-kind"
                  value={form.source_kind}
                  onChange={e => setForm(f => ({ ...f, source_kind: e.target.value }))}
                  className="w-full border rounded px-3 py-2 text-sm bg-white dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
                >
                  <option value="upload">업로드 (table_name)</option>
                  <option value="catalog">카탈로그 (dataset_id)</option>
                  <option value="gold">Gold 테이블</option>
                  <option value="pipeline">파이프라인 출력 (체이닝)</option>
                </select>
              </div>
              <div className="md:col-span-2">
                {form.source_kind === 'pipeline' ? (
                  <>
                    <label htmlFor="source-pipeline-select" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">원본 파이프라인 *</label>
                    <select
                      id="source-pipeline-select"
                      value={form.source_dataset_id}
                      onChange={e => setForm(f => ({ ...f, source_dataset_id: e.target.value }))}
                      className="w-full border rounded px-3 py-2 text-sm bg-white dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
                      required
                    >
                      <option value="">파이프라인 선택...</option>
                      {pipelines
                        .filter(p => runsMap[p.id]?.[0]?.result_dataset_id)
                        .map(p => {
                          const latestRun = runsMap[p.id]?.[0]
                          return (
                            <option key={p.id} value={latestRun!.result_dataset_id!}>
                              {p.name}
                            </option>
                          )
                        })
                      }
                    </select>
                    <p className="text-xs text-gray-400 dark:text-gray-300 mt-1">최근 성공 실행이 있는 파이프라인만 표시됩니다.</p>
                  </>
                ) : (
                  <>
                    <label htmlFor="proc-source-id" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                      소스 식별자 *{' '}
                      <span className="text-gray-400 dark:text-gray-300">
                        (upload: table_name / catalog: dataset_id)
                      </span>
                    </label>
                    <input
                      id="proc-source-id"
                      value={form.source_dataset_id}
                      onChange={e => setForm(f => ({ ...f, source_dataset_id: e.target.value }))}
                      required
                      placeholder="예: sub_gyeongnam_a1b2c3d4"
                      className="w-full border rounded px-3 py-2 text-sm bg-white dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
                    />
                  </>
                )}
              </div>
              <div className="md:col-span-2">
                <label htmlFor="proc-description" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">설명</label>
                <input
                  id="proc-description"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="선택 입력"
                  className="w-full border rounded px-3 py-2 text-sm bg-white dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Btn type="submit" size="sm">등록</Btn>
              <Btn type="button" variant="secondary" size="sm" onClick={() => setShowForm(false)}>취소</Btn>
            </div>
          </form>
        </Card>
      )}

      {/* 검색 및 필터 */}
      {!showForm && pipelines.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-300" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="파이프라인명, 설명, 소스 식별자 검색"
                className="w-full pl-9 pr-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
              />
            </div>
            <div className="flex gap-2">
              <div className="flex items-center gap-1.5 px-3 py-2 border rounded-md bg-white dark:bg-gray-900 text-sm text-gray-600 dark:text-gray-400">
                <Filter className="w-4 h-4" />
                <select
                  value={sourceFilter}
                  onChange={e => setSourceFilter(e.target.value)}
                  className="bg-transparent outline-none text-sm"
                >
                  <option value="all">전체 소스</option>
                  <option value="upload">업로드</option>
                  <option value="catalog">카탈로그</option>
                  <option value="gold">Gold</option>
                  <option value="pipeline">파이프라인</option>
                </select>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-2 border rounded-md bg-white dark:bg-gray-900 text-sm text-gray-600 dark:text-gray-400">
                <ArrowUpDown className="w-4 h-4" />
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as SortKey)}
                  className="bg-transparent outline-none text-sm"
                >
                  <option value="created_desc">최신순</option>
                  <option value="created_asc">오래된순</option>
                  <option value="name_asc">이름 오름차순</option>
                  <option value="name_desc">이름 내림차순</option>
                </select>
              </div>
            </div>
          </div>

          {/* 상태 빠른 필터 */}
          <div className="flex flex-wrap gap-2">
            {[
              { key: 'all', label: '전체' },
              { key: 'not_run', label: '미실행' },
              { key: 'running', label: '실행 중' },
              { key: 'done', label: '성공' },
              { key: 'failed', label: '실패' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setStatusFilter(key as typeof statusFilter)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  statusFilter === key
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-950'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 실행 결과 알림 */}
      {runResult && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 text-sm text-green-700 dark:text-green-400 flex items-start justify-between">
          <div className="flex items-center gap-3 flex-wrap">
            <span>
              실행 완료 — 입력 {runResult.result.input_rows.toLocaleString()}행
              → 출력 {runResult.result.output_rows.toLocaleString()}행
              {runResult.result.error_rows > 0 && (
                <button
                  type="button"
                  className="text-red-500 ml-1 underline underline-offset-2 hover:text-red-700 dark:hover:text-red-300"
                  onClick={() => setShowErrorDialog(true)}
                >
                  오류 {runResult.result.error_rows}건
                </button>
              )}
            </span>
            {runResult.result.dataset_id && (
              <>
                <Btn size="sm" onClick={() => router.push(`/analytics?pipeline_run_id=${runResult.result.run_id}&dataset_id=${runResult.result.dataset_id}`)}>
                  <BarChart2 className="w-3 h-3" /> 분석으로 보내기
                </Btn>
                <Btn size="sm" variant="secondary" onClick={() => registerToPortal(runResult.id, runResult.result)}>
                  <Upload className="w-3 h-3" /> 포털에 등록
                </Btn>
              </>
            )}
          </div>
          <button
            onClick={() => setRunResult(null)}
            className="text-green-500 hover:text-green-700 dark:hover:text-green-300 ml-4 text-xs shrink-0"
          >
            닫기
          </button>
        </div>
      )}

      {/* 배치 실행 결과 */}
      {batchResults && (
        <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium text-blue-800 dark:text-blue-200">배치 실행 결과</span>
            <button onClick={() => setBatchResults(null)} className="text-blue-500 text-xs hover:text-blue-700 dark:hover:text-blue-300">닫기</button>
          </div>
          <div className="space-y-1">
            {batchResults.map(r => {
              const p = pipelines.find(p => p.id === r.id)
              return (
                <div key={r.id} className="flex items-center gap-2 text-xs">
                  {r.ok
                    ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                    : <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                  <span className={r.ok ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}>
                    {p?.name ?? r.id}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 파이프라인 목록 */}
      {!error && pipelines.length === 0 ? (
        <EmptyState
          icon="🔧"
          title="등록된 파이프라인이 없습니다"
          description="규칙 기반 ETL 파이프라인으로 데이터를 자동으로 변환·정제합니다"
          action={isReadOnly ? undefined : { label: '첫 파이프라인 만들기', onClick: () => setShowForm(true) }}
        />
      ) : filteredPipelines.length === 0 ? (
        <EmptyState
          icon={<Search className="w-6 h-6 text-gray-400 dark:text-gray-300" />}
          title="검색 조건에 맞는 파이프라인이 없습니다"
          description="다른 검색어나 필터를 선택해 보세요"
          action={{
            label: '필터 초기화',
            onClick: () => {
              setSearch('')
              setSourceFilter('all')
              setStatusFilter('all')
              setSortBy('created_desc')
            },
          }}
        />
      ) : (
        <div className="grid gap-4">
          {/* 전체 선택 + 배치 실행 헤더 */}
          {!isReadOnly && filteredPipelines.length > 0 && (
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={selectedIds.size === filteredPipelines.length && filteredPipelines.length > 0}
                  onChange={e => {
                    if (e.target.checked) setSelectedIds(new Set(filteredPipelines.map(p => p.id)))
                    else setSelectedIds(new Set())
                  }}
                  className="w-4 h-4 rounded border-gray-300 dark:border-gray-600"
                  aria-label="전체 선택"
                />
                전체 선택
              </label>
              {selectedIds.size > 0 && (
                <Btn
                  size="sm"
                  onClick={runBatch}
                  loading={batchRunning}
                  disabled={batchRunning}
                >
                  <PlayCircle className="w-3.5 h-3.5" />
                  선택 실행 ({selectedIds.size}개)
                </Btn>
              )}
            </div>
          )}
          {filteredPipelines.map(p => {
            const lastRun = lastRunStatus(p.id)
            return (
              <Card key={p.id} padding="md" hover>
                {/* 카드 헤더 */}
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  {!isReadOnly && (
                    <input
                      type="checkbox"
                      checked={selectedIds.has(p.id)}
                      onChange={e => {
                        const next = new Set(selectedIds)
                        if (e.target.checked) next.add(p.id)
                        else next.delete(p.id)
                        setSelectedIds(next)
                      }}
                      className="mt-1 w-4 h-4 rounded border-gray-300 dark:border-gray-600 shrink-0"
                      aria-label={`${p.name} 선택`}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-medium text-gray-800 dark:text-gray-200 truncate">{p.name}</div>
                      {statusBadge(lastRun)}
                    </div>
                    {p.description && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{p.description}</div>
                    )}
                    <div className="flex flex-wrap gap-2 mt-2 text-xs text-gray-500 dark:text-gray-400 items-center">
                      <Badge variant="gray">{SOURCE_KIND_LABEL[p.source_kind] ?? p.source_kind}</Badge>
                      <span className="font-mono truncate max-w-[180px] text-gray-400 dark:text-gray-300">{p.source_dataset_id}</span>
                      <Badge variant="purple">규칙 {p.rules.length}개</Badge>
                      {lastRun?.finished_at && (
                        <span className="flex items-center gap-1 text-gray-400 dark:text-gray-300">
                          <Clock className="w-3 h-3" />
                          {new Date(lastRun.finished_at).toLocaleString('ko-KR')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    {!isReadOnly && (
                      <>
                        <Btn variant="secondary" size="sm" onClick={() => setEditTarget(p)}>
                          <Edit3 className="w-3 h-3" /> 규칙
                        </Btn>
                        <Btn
                          size="sm"
                          onClick={() => runPipeline(p.id)}
                          loading={runningId === p.id}
                          disabled={runningId !== null}
                        >
                          <Play className="w-3 h-3" /> {runningId === p.id ? '실행 중' : '실행'}
                        </Btn>
                      </>
                    )}
                    <Btn
                      variant="ghost"
                      size="sm"
                      onClick={() => refreshHistory(p.id)}
                      loading={historyLoadingId === p.id}
                      disabled={historyLoadingId === p.id}
                      title="실행 이력 보기"
                    >
                      <History className="w-3 h-3" /> 이력
                    </Btn>
                    {!isReadOnly && (
                      <Btn
                        variant="danger"
                        size="sm"
                        onClick={() => deletePipeline(p.id)}
                        loading={deleteLoadingId === p.id}
                        disabled={deleteLoadingId === p.id || runningId !== null}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Btn>
                    )}
                  </div>
                </div>

                {/* 실행 이력 */}
                {runsMap[p.id] && runsMap[p.id].length > 0 && (
                  <div className="border-t mt-4 pt-3 bg-gray-50 dark:bg-gray-950 -mx-5 -mb-5 px-5 pb-4 rounded-b-2xl">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">최근 실행 이력</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left min-w-[520px]">
                        <thead>
                          <tr className="text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                            <th className="pb-2 font-medium">상태</th>
                            <th className="pb-2 font-medium">입/출력</th>
                            <th className="pb-2 font-medium text-right">오류</th>
                            <th className="pb-2 font-medium">결과</th>
                            <th className="pb-2 font-medium text-right">시작일시</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                          {runsMap[p.id].map(run => {
                            const lineage = lineageMap[run.id]
                            const showLineage = lineage !== undefined
                            return (
                              <Fragment key={run.id}>
                                <tr className="text-gray-600 dark:text-gray-400">
                                  <td className="py-2">{statusBadge(run)}</td>
                                  <td className="py-2 whitespace-nowrap">
                                    입력 {(run.input_rows ?? 0).toLocaleString()}행
                                    <span className="text-gray-400 dark:text-gray-300 mx-1">→</span>
                                    출력 {(run.output_rows ?? 0).toLocaleString()}행
                                  </td>
                                  <td className="py-2 text-right">
                                    {run.error_rows > 0 ? (
                                      <button
                                        type="button"
                                        onClick={() => setSelectedHistoryRun(run)}
                                        className="cursor-pointer"
                                        title="오류 상세 보기"
                                      >
                                        <Badge variant="red">오류 {run.error_rows}건 보기</Badge>
                                      </button>
                                    ) : (
                                      <span className="text-gray-400 dark:text-gray-300">—</span>
                                    )}
                                  </td>
                                  <td className="py-2">
                                    <div className="flex gap-1">
                                      {run.result_dataset_id && (
                                        <Btn
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => router.push(`/analytics?dataset_id=${run.result_dataset_id}`)}
                                        >
                                          <BarChart2 className="w-3 h-3" /> 분석
                                        </Btn>
                                      )}
                                      {run.result_table && (
                                        <Btn
                                          variant="ghost"
                                          size="sm"
                                          loading={lineageLoadingId === run.id}
                                          onClick={() => {
                                            if (showLineage) {
                                              setLineageMap(prev => { const n = { ...prev }; delete n[run.id]; return n })
                                            } else {
                                              loadLineage(run.id, run.result_table!)
                                            }
                                          }}
                                        >
                                          <Network className="w-3 h-3" /> 계보
                                        </Btn>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-2 text-right whitespace-nowrap text-gray-400 dark:text-gray-300">
                                    {run.started_at ? new Date(run.started_at).toLocaleString('ko-KR') : '—'}
                                  </td>
                                </tr>
                                {showLineage && lineage[0] && (
                                  <tr>
                                    <td colSpan={5} className="py-0">
                                      <LineagePanel
                                        node={lineage[0]}
                                        sourceDatasetId={p.source_dataset_id}
                                        pipelineName={p.name}
                                      />
                                    </td>
                                  </tr>
                                )}
                              </Fragment>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* 규칙 편집 모달 */}
      {editTarget && !isReadOnly && (
        <RuleEditor
          pipelineId={editTarget.id}
          initialRules={editTarget.rules}
          onSave={rules => saveRules(editTarget, rules)}
          onClose={() => setEditTarget(null)}
        />
      )}

      {/* 오류 행 뷰어 — 실행 직후 */}
      <Modal
        open={showErrorDialog}
        onClose={() => setShowErrorDialog(false)}
        title="오류 행 상세"
        size="lg"
      >
        <div className="p-6 overflow-auto">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">
            오류 행 상세 ({runResult?.result.errors?.length ?? 0}건 표시 / 최대 100건)
          </h3>
          {!runResult?.result.errors?.length ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">오류 상세 정보가 없습니다.</p>
          ) : (
            <div className="overflow-auto max-h-[60vh]">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-900 text-left">
                    <th className="border border-gray-200 dark:border-gray-700 px-3 py-2 font-medium text-gray-600 dark:text-gray-400">행 번호</th>
                    <th className="border border-gray-200 dark:border-gray-700 px-3 py-2 font-medium text-gray-600 dark:text-gray-400">규칙 번호</th>
                    <th className="border border-gray-200 dark:border-gray-700 px-3 py-2 font-medium text-gray-600 dark:text-gray-400">컬럼</th>
                    <th className="border border-gray-200 dark:border-gray-700 px-3 py-2 font-medium text-gray-600 dark:text-gray-400">오류 내용</th>
                  </tr>
                </thead>
                <tbody>
                  {runResult.result.errors.map((err, i) => (
                    <tr key={i} className="hover:bg-red-50 dark:hover:bg-red-900/20">
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-gray-700 dark:text-gray-300">{err.rowIndex + 1}</td>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-gray-700 dark:text-gray-300">{err.ruleIndex + 1}</td>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-gray-500 dark:text-gray-400">{err.column ?? '—'}</td>
                      <td className="border border-gray-200 px-3 py-1.5 text-red-600 dark:text-red-400">{err.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Modal>

      {/* 오류 행 뷰어 — 이력 row */}
      <Modal
        open={!!selectedHistoryRun}
        onClose={() => setSelectedHistoryRun(null)}
        title="오류 행 상세"
        size="lg"
      >
        <div className="p-6 overflow-auto">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">
            오류 {selectedHistoryRun?.error_rows ?? 0}건 (최대 100건 표시)
          </h3>
          {!selectedHistoryRun?.error_log?.length ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">오류 상세 정보가 없습니다.</p>
          ) : (
            <div className="overflow-auto max-h-[60vh]">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-900 text-left">
                    <th className="border border-gray-200 dark:border-gray-700 px-3 py-2 font-medium text-gray-600 dark:text-gray-400">행 번호</th>
                    <th className="border border-gray-200 dark:border-gray-700 px-3 py-2 font-medium text-gray-600 dark:text-gray-400">규칙 번호</th>
                    <th className="border border-gray-200 dark:border-gray-700 px-3 py-2 font-medium text-gray-600 dark:text-gray-400">컬럼</th>
                    <th className="border border-gray-200 dark:border-gray-700 px-3 py-2 font-medium text-gray-600 dark:text-gray-400">오류 내용</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedHistoryRun.error_log as ProcessError[]).map((err, i) => (
                    <tr key={i} className="hover:bg-red-50 dark:hover:bg-red-900/20">
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-gray-700 dark:text-gray-300">{(err.rowIndex ?? i) + 1}</td>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-gray-700 dark:text-gray-300">{typeof err.ruleIndex === 'number' ? err.ruleIndex + 1 : '—'}</td>
                      <td className="border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-gray-500 dark:text-gray-400">{err.column ?? '—'}</td>
                      <td className="border border-gray-200 px-3 py-1.5 text-red-600 dark:text-red-400">{err.message ?? JSON.stringify(err)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
