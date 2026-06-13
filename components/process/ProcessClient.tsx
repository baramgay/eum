'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Rule } from '@/lib/processor'
import RuleEditor from './RuleEditor'
import toast from 'react-hot-toast'
import { Settings2 } from 'lucide-react'

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
}

interface RunResult {
  run_id: string
  status: string
  input_rows: number
  output_rows: number
  error_rows: number
  dataset_id: string
}

interface Props { role: string; tenantId: string }

const SOURCE_KIND_LABEL: Record<string, string> = {
  upload:  '업로드',
  catalog: '카탈로그',
  gold:    'Gold 테이블',
}

export default function ProcessClient({ role, tenantId }: Props) {
  const [pipelines, setPipelines]     = useState<Pipeline[]>([])
  const [loading, setLoading]         = useState(true)
  const [showForm, setShowForm]       = useState(false)
  const [editTarget, setEditTarget]   = useState<Pipeline | null>(null)
  const [runningId, setRunningId]     = useState<string | null>(null)
  const [runResult, setRunResult]     = useState<{ id: string; result: RunResult } | null>(null)
  const [runsMap, setRunsMap]         = useState<Record<string, RunRecord[]>>({})
  const [form, setForm]               = useState({
    name: '', description: '', source_kind: 'upload', source_dataset_id: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    const qs = role !== 'center' ? `?tenant_id=${tenantId}` : ''
    const res = await fetch(`/api/process${qs}`)
    const data = await res.json()
    setPipelines(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [role, tenantId])

  useEffect(() => { load() }, [load])

  async function loadRuns(pipelineId: string) {
    const res = await fetch(`/api/process/${pipelineId}`)
    const data = await res.json()
    if (data.runs) {
      setRunsMap(prev => ({ ...prev, [pipelineId]: data.runs }))
    }
  }

  async function createPipeline(e: React.FormEvent) {
    e.preventDefault()
    const body = {
      tenant_id:         tenantId,
      name:              form.name,
      description:       form.description || null,
      source_kind:       form.source_kind,
      source_dataset_id: form.source_dataset_id,
      rules:             [],
    }
    await fetch('/api/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setShowForm(false)
    setForm({ name: '', description: '', source_kind: 'upload', source_dataset_id: '' })
    toast.success('파이프라인이 생성되었습니다.')
    load()
  }

  async function deletePipeline(id: string) {
    if (!confirm('파이프라인을 삭제하시겠습니까?')) return
    await fetch(`/api/process/${id}`, { method: 'DELETE' })
    toast('파이프라인이 삭제되었습니다.')
    load()
  }

  async function saveRules(pipeline: Pipeline, rules: Rule[]) {
    await fetch(`/api/process/${pipeline.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rules }),
    })
    setEditTarget(null)
    toast.success('규칙이 저장되었습니다.')
    load()
  }

  async function runPipeline(id: string) {
    setRunningId(id)
    setRunResult(null)
    try {
      const res = await fetch(`/api/process/${id}/run`, { method: 'POST' })
      const data: RunResult = await res.json()
      setRunResult({ id, result: data })
      toast.success(`파이프라인 실행 완료 — ${data.output_rows ?? 0}행 출력`)
      loadRuns(id)
    } finally {
      setRunningId(null)
    }
  }

  if (loading) return (
    <div className="space-y-4 animate-pulse">
      <div className="flex justify-between items-center">
        <div className="h-6 bg-gray-200 rounded w-44" />
        <div className="h-9 bg-gray-200 rounded w-32" />
      </div>
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="bg-white rounded-lg border p-4">
          <div className="flex justify-between items-center">
            <div className="space-y-2">
              <div className="h-4 bg-gray-200 rounded w-36" />
              <div className="h-3 bg-gray-100 rounded w-48" />
            </div>
            <div className="flex gap-2">
              <div className="h-8 bg-gray-100 rounded w-20" />
              <div className="h-8 bg-gray-100 rounded w-24" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">데이터 가공 파이프라인</h2>
          <p className="text-sm text-gray-500 mt-0.5">규칙 기반 ETL 변환 및 실행</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
        >
          + 파이프라인 추가
        </button>
      </div>

      {/* 생성 폼 */}
      {showForm && (
        <form
          onSubmit={createPipeline}
          className="bg-white rounded-lg border shadow-sm p-5 space-y-4"
        >
          <h3 className="font-medium text-gray-700">새 파이프라인</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">파이프라인명 *</label>
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                required
                placeholder="예: 청년인구 정제"
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">소스 종류 *</label>
              <select
                value={form.source_kind}
                onChange={e => setForm(f => ({ ...f, source_kind: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm"
              >
                <option value="upload">업로드 (table_name)</option>
                <option value="catalog">카탈로그 (dataset_id)</option>
                <option value="gold">Gold 테이블</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-gray-500 mb-1">
                소스 식별자 *{' '}
                <span className="text-gray-400">
                  (upload: table_name / catalog: dataset_id)
                </span>
              </label>
              <input
                value={form.source_dataset_id}
                onChange={e => setForm(f => ({ ...f, source_dataset_id: e.target.value }))}
                required
                placeholder="예: sub_gyeongnam_a1b2c3d4"
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-gray-500 mb-1">설명</label>
              <input
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="선택 입력"
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
            >
              등록
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded-md hover:bg-gray-200"
            >
              취소
            </button>
          </div>
        </form>
      )}

      {/* 실행 결과 알림 */}
      {runResult && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-700 flex items-start justify-between">
          <span>
            실행 완료 — 입력 {runResult.result.input_rows.toLocaleString()}행
            → 출력 {runResult.result.output_rows.toLocaleString()}행,
            오류 {runResult.result.error_rows}건
          </span>
          <button
            onClick={() => setRunResult(null)}
            className="text-green-500 hover:text-green-700 ml-4 text-xs"
          >
            닫기
          </button>
        </div>
      )}

      {/* 파이프라인 목록 */}
      {pipelines.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-lg border">
          <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4">
            <Settings2 className="w-7 h-7 text-blue-400" />
          </div>
          <h3 className="text-base font-semibold text-gray-700 mb-1">등록된 파이프라인이 없습니다</h3>
          <p className="text-sm text-gray-400 mb-5 max-w-xs leading-relaxed">
            규칙 기반 ETL 파이프라인으로 데이터를 자동으로 변환·정제합니다
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            첫 파이프라인 만들기
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {pipelines.map(p => (
            <div key={p.id} className="bg-white rounded-lg border shadow-sm">
              {/* 카드 헤더 */}
              <div className="p-4 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-medium text-gray-800 truncate">{p.name}</div>
                  {p.description && (
                    <div className="text-xs text-gray-500 mt-0.5 truncate">{p.description}</div>
                  )}
                  <div className="flex flex-wrap gap-2 mt-1.5 text-xs text-gray-400">
                    <span className="bg-gray-100 px-2 py-0.5 rounded font-mono">
                      {SOURCE_KIND_LABEL[p.source_kind] ?? p.source_kind}
                    </span>
                    <span className="font-mono truncate max-w-[180px]">{p.source_dataset_id}</span>
                    <span>규칙 {p.rules.length}개</span>
                  </div>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button
                    onClick={() => setEditTarget(p)}
                    className="px-3 py-1.5 text-xs text-gray-600 border rounded hover:bg-gray-50"
                  >
                    규칙 편집
                  </button>
                  <button
                    onClick={() => runPipeline(p.id)}
                    disabled={runningId === p.id}
                    className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    {runningId === p.id ? '실행 중...' : '전체 실행'}
                  </button>
                  <button
                    onClick={() => loadRuns(p.id)}
                    className="px-3 py-1.5 text-xs text-gray-500 border rounded hover:bg-gray-50"
                    title="실행 이력 보기"
                  >
                    이력
                  </button>
                  <button
                    onClick={() => deletePipeline(p.id)}
                    className="px-3 py-1.5 text-xs text-red-500 border border-red-200 rounded hover:bg-red-50"
                  >
                    삭제
                  </button>
                </div>
              </div>

              {/* 실행 이력 */}
              {runsMap[p.id] && runsMap[p.id].length > 0 && (
                <div className="border-t px-4 py-3 bg-gray-50">
                  <p className="text-xs font-medium text-gray-500 mb-2">최근 실행 이력</p>
                  <div className="space-y-1">
                    {runsMap[p.id].map(run => (
                      <div key={run.id} className="flex items-center gap-3 text-xs text-gray-600">
                        <span className={`inline-block w-14 text-center rounded px-1 py-0.5 font-medium ${
                          run.status === 'done'    ? 'bg-green-100 text-green-700' :
                          run.status === 'failed'  ? 'bg-red-100 text-red-600' :
                          run.status === 'running' ? 'bg-blue-100 text-blue-600' :
                                                     'bg-gray-100 text-gray-500'
                        }`}>
                          {run.status}
                        </span>
                        <span>
                          입력 {(run.input_rows ?? 0).toLocaleString()}행
                          → 출력 {(run.output_rows ?? 0).toLocaleString()}행
                        </span>
                        {run.error_rows > 0 && (
                          <span className="text-red-500">오류 {run.error_rows}건</span>
                        )}
                        <span className="text-gray-400 ml-auto">
                          {run.started_at ? new Date(run.started_at).toLocaleString('ko-KR') : '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 규칙 편집 모달 */}
      {editTarget && (
        <RuleEditor
          pipelineId={editTarget.id}
          initialRules={editTarget.rules}
          onSave={rules => saveRules(editTarget, rules)}
          onClose={() => setEditTarget(null)}
        />
      )}
    </div>
  )
}
