'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import SubmissionDetail from './SubmissionDetail'
import {
  Upload, CheckCircle2, AlertCircle, FileSpreadsheet, Loader2, Search, Filter,
  ArrowUpDown, X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import PageHeader from '@/components/ui/PageHeader'
import Card from '@/components/ui/Card'
import StatCard from '@/components/ui/StatCard'
import Badge from '@/components/ui/Badge'
import Btn from '@/components/ui/Btn'
import EmptyState from '@/components/ui/EmptyState'
import Skeleton from '@/components/ui/Skeleton'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Textarea from '@/components/ui/Textarea'

interface Submission {
  submission_id: string; title: string; status: string; tenant_id: string
  submitted_at: string; quality_summary: string | null
  consultant_comments?: { count: number }[]
}

interface Props { role: string; tenantId: string }

type Sort = 'newest' | 'oldest' | 'title'

const STATUS_LABEL: Record<string, string> = {
  submitted: '검토 대기',
  review:    '검토 중',
  approved:  '승인',
  rejected:  '반려',
}

const STATUS_VARIANT: Record<string, 'amber' | 'blue' | 'green' | 'red' | 'gray'> = {
  submitted: 'amber',
  review:    'blue',
  approved:  'green',
  rejected:  'red',
}

const STATUS_OPTIONS = [
  { value: 'all', label: '전체' },
  { value: 'submitted', label: '검토 대기' },
  { value: 'review', label: '검토 중' },
  { value: 'approved', label: '승인' },
  { value: 'rejected', label: '반려' },
]

const SORT_OPTIONS: { value: Sort; label: string }[] = [
  { value: 'newest', label: '최신순' },
  { value: 'oldest', label: '오래된순' },
  { value: 'title', label: '제목순' },
]

const CHECKLIST = [
  { key: 'title', label: '데이터셋 제목이 명확하게 작성되었습니다.' },
  { key: 'theme', label: '주제(분야)가 선택/입력되었습니다.' },
  { key: 'description', label: '데이터 설명이 20자 이상 작성되었습니다.' },
  { key: 'license', label: '라이선스(공공누리 유형 등)가 입력되었습니다.' },
  { key: 'file', label: 'CSV 파일이 업로드되었습니다.' },
  { key: 'preview', label: '컬럼 타입 미리보기를 확인했습니다.' },
]

function inferType(values: string[]): string {
  const nonEmpty = values.filter(v => v !== '')
  if (nonEmpty.length === 0) return 'TEXT'

  // BOOLEAN
  const boolSet = new Set(['true', 'false', 'yes', 'no', 'y', 'n', '1', '0'])
  if (nonEmpty.every(v => boolSet.has(v.toLowerCase()))) return 'BOOLEAN'

  // DATE
  const dateLike = nonEmpty.filter(v => /^\d{4}[-/]\d{2}[-/]\d{2}/.test(v))
  if (dateLike.length / nonEmpty.length > 0.8) return 'DATE'

  // NUMBER
  const numLike = nonEmpty.filter(v => !isNaN(Number(v)) && v.trim() !== '')
  if (numLike.length / nonEmpty.length > 0.9) return 'NUMBER'

  return 'TEXT'
}

export default function SubmissionClient({ role, tenantId }: Props) {
  const [items, setItems]       = useState<Submission[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [showForm, setShowForm] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [filePreview, setFilePreview] = useState<{
    headers: string[]
    rows: string[][]
    schema: Array<{ name: string; type: string }>
    rowCount: number
    fileName: string
  } | null>(null)
  const [checks, setChecks] = useState<Record<string, boolean>>({})
  const [formTouched, setFormTouched] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [sort, setSort] = useState<Sort>('newest')

  const loadList = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = role === 'center' ? '?all=true' : `?tenant_id=${tenantId}`
      const r = await fetch(`/api/submission${params}`)
      if (!r.ok) throw new Error('목록을 불러오지 못했습니다.')
      setItems(await r.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : '데이터를 불러오는 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }, [role, tenantId])

  function parseCSVPreview(file: File) {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const lines = text.trim().split('\n').filter(Boolean)
      if (lines.length === 0) return
      const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
      const dataRows = lines.slice(1, 6).map(l =>
        l.split(',').map(v => v.trim().replace(/^"|"$/g, ''))
      )
      const schema = headers.map((h, idx) => {
        const vals = lines.slice(1, 30).map(l =>
          l.split(',')[idx]?.trim().replace(/^"|"$/g, '') ?? ''
        )
        return { name: h, type: inferType(vals) }
      })
      setFilePreview({ headers, rows: dataRows, schema, rowCount: lines.length - 1, fileName: file.name })
      updateCheck('file', true)
      updateCheck('preview', false)
    }
    reader.readAsText(file, 'utf-8')
  }

  function updateCheck(key: string, value: boolean) {
    setChecks(prev => ({ ...prev, [key]: value }))
  }

  function evaluateChecks(): Record<string, boolean> {
    const form = formRef.current
    const title = (form?.querySelector('[name="title"]') as HTMLInputElement)?.value.trim() ?? ''
    const theme = (form?.querySelector('[name="theme"]') as HTMLInputElement)?.value.trim() ?? ''
    const description = (form?.querySelector('[name="description"]') as HTMLTextAreaElement)?.value.trim() ?? ''
    const license = (form?.querySelector('[name="license"]') as HTMLInputElement)?.value.trim() ?? ''

    return {
      title: title.length > 0,
      theme: theme.length > 0,
      description: description.length >= 20,
      license: license.length > 0,
      file: filePreview != null,
      preview: filePreview != null,
    }
  }

  function refreshChecks() {
    setChecks(evaluateChecks())
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    if (!formRef.current) return

    setFormTouched(true)
    const current = evaluateChecks()
    setChecks(current)
    const missing = CHECKLIST.filter(c => !current[c.key])
    if (missing.length > 0) {
      toast.error(`체크리스트를 완료해 주세요: ${missing[0].label}`)
      return
    }

    const fd = new FormData(formRef.current)
    setUploading(true)
    setUploadProgress(0)

    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/submission', true)

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        setUploadProgress(Math.round((event.loaded / event.total) * 100))
      } else {
        setUploadProgress(prev => Math.min(prev + 5, 90))
      }
    }

    xhr.onload = async () => {
      setUploadProgress(100)
      setUploading(false)
      if (xhr.status >= 200 && xhr.status < 300) {
        toast.success('데이터셋 등록 요청이 접수되었습니다.')
        setShowForm(false)
        formRef.current?.reset()
        setFilePreview(null)
        setChecks({})
        setFormTouched(false)
        await loadList()
      } else {
        let msg = '등록 중 오류가 발생했습니다.'
        try {
          const d = JSON.parse(xhr.responseText)
          msg = d.error ?? msg
        } catch {}
        toast.error(msg)
      }
    }

    xhr.onerror = () => {
      setUploading(false)
      toast.error('네트워크 오류가 발생했습니다.')
    }

    xhr.send(fd)
  }

  useEffect(() => { loadList() }, [loadList])

  const filteredItems = useMemo(() => {
    const result = items.filter(item => {
      const matchesSearch = item.title.toLowerCase().includes(search.toLowerCase())
      const matchesStatus = statusFilter === 'all' || item.status === statusFilter
      return matchesSearch && matchesStatus
    })
    result.sort((a, b) => {
      if (sort === 'newest') return new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()
      if (sort === 'oldest') return new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime()
      if (sort === 'title') return a.title.localeCompare(b.title, 'ko-KR')
      return 0
    })
    return result
  }, [items, search, statusFilter, sort])

  const stats = useMemo(() => ({
    total: items.length,
    pending: items.filter(i => i.status === 'submitted').length,
    review:  items.filter(i => i.status === 'review').length,
    approved: items.filter(i => i.status === 'approved').length,
    rejected: items.filter(i => i.status === 'rejected').length,
  }), [items])

  const allChecked = CHECKLIST.every(c => checks[c.key])

  const canSubmit = allChecked && !uploading

  return (
    <div className="space-y-4">
      {selectedId && (
        <SubmissionDetail
          submissionId={selectedId}
          role={role}
          onClose={() => setSelectedId(null)}
          onDecisionComplete={() => { setSelectedId(null); loadList() }}
        />
      )}

      <PageHeader
        title="데이터 등록 관리"
        subtitle={role === 'center' ? '기관별 데이터셋 등록 신청을 심사합니다.' : '기관의 데이터셋 등록 신청 현황을 관리합니다.'}
        action={role !== 'center' && (
          <Btn onClick={() => setShowForm(!showForm)} variant={showForm ? 'secondary' : 'primary'}>
            {showForm ? '취소' : '데이터 등록'}
          </Btn>
        )}
      />

      {/* 통계 카드 */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[110px]" />
          ))}
        </div>
      ) : items.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="총 제출" value={stats.total} color="blue" icon={<FileSpreadsheet className="w-5 h-5" />} />
          <StatCard label="검토 대기" value={stats.pending} color="amber" icon={<AlertCircle className="w-5 h-5" />} />
          <StatCard label="검토 중" value={stats.review} color="purple" icon={<Filter className="w-5 h-5" />} />
          <StatCard label="승인" value={stats.approved} color="green" icon={<CheckCircle2 className="w-5 h-5" />} />
          <StatCard label="반려" value={stats.rejected} color="red" icon={<AlertCircle className="w-5 h-5" />} />
        </div>
      ) : null}

      {showForm && (
        <Card>
          <h3 className="font-medium text-gray-800 dark:text-gray-200 mb-4">데이터셋 등록</h3>
          <form ref={formRef} onSubmit={handleUpload} className="space-y-4">
            <input type="hidden" name="tenant_id" value={tenantId} />
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <label htmlFor="submission-title" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">제목 <span className="text-red-500">*</span></label>
                <Input id="submission-title" name="title" required placeholder="데이터셋 제목"
                  onChange={refreshChecks}
                  className="px-3 py-2 rounded-lg bg-white dark:bg-gray-900" />
              </div>
              <div>
                <label htmlFor="submission-theme" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">주제 <span className="text-red-500">*</span></label>
                <Input id="submission-theme" name="theme" required placeholder="예: 인구통계"
                  onChange={refreshChecks}
                  className="px-3 py-2 rounded-lg bg-white dark:bg-gray-900" />
              </div>
              <div>
                <label htmlFor="submission-format" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">포맷</label>
                <Select id="submission-format" name="format"
                  className="px-3 py-2 rounded-lg bg-white dark:bg-gray-900">
                  <option value="CSV">CSV</option>
                  <option value="JSON">JSON</option>
                  <option value="XLSX">XLSX</option>
                </Select>
              </div>
              <div>
                <label htmlFor="submission-license" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">라이선스 <span className="text-red-500">*</span></label>
                <Input id="submission-license" name="license" required placeholder="공공누리 1유형" defaultValue="공공누리 1유형"
                  onChange={refreshChecks}
                  className="px-3 py-2 rounded-lg bg-white dark:bg-gray-900" />
              </div>
            </div>
            <div>
              <label htmlFor="submission-description" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">설명 <span className="text-red-500">*</span></label>
              <Textarea id="submission-description" name="description" required rows={3} placeholder="데이터셋 설명 (20자 이상)"
                onChange={refreshChecks}
                className="px-3 py-2 rounded-lg bg-white dark:bg-gray-900" />
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-300">최소 20자 이상 입력해 주세요.</p>
            </div>
            <div>
              <label htmlFor="submission-csv-file" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">CSV 파일 <span className="text-red-500">*</span></label>
              <button
                type="button"
                onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={e => {
                  e.preventDefault(); setIsDragging(false)
                  const file = e.dataTransfer.files[0]
                  if (file?.name.endsWith('.csv')) {
                    const dt = new DataTransfer()
                    dt.items.add(file)
                    if (fileInputRef.current) fileInputRef.current.files = dt.files
                    parseCSVPreview(file)
                  } else {
                    toast.error('CSV 파일만 업로드할 수 있습니다.')
                  }
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`w-full relative border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
                  isDragging ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
                }`}
              >
                <p className="text-gray-500 dark:text-gray-300 text-sm">
                  {filePreview
                    ? <span className="text-blue-600 dark:text-blue-400 font-medium flex items-center justify-center gap-1">
                        <FileSpreadsheet className="w-4 h-4" /> {filePreview.fileName} · {filePreview.rowCount.toLocaleString()}행
                      </span>
                    : <><span className="text-blue-600 dark:text-blue-400 font-medium">CSV 파일을 클릭하거나 드래그</span>하여 올려주세요</>
                  }
                </p>
              </button>
              <input
                id="submission-csv-file"
                ref={fileInputRef}
                type="file" name="file" accept=".csv"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) {
                    if (file.name.endsWith('.csv')) {
                      parseCSVPreview(file)
                    } else {
                      toast.error('CSV 파일만 업로드할 수 있습니다.')
                      e.target.value = ''
                    }
                  }
                }}
              />

              {filePreview && (
                <div className="space-y-2 mt-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-gray-600 dark:text-gray-400">컬럼 타입 자동 추론</p>
                    <Btn
                      type="button"
                      size="sm"
                      variant={checks.preview ? 'secondary' : 'primary'}
                      onClick={() => updateCheck('preview', true)}
                      className={checks.preview ? '!bg-green-50 dark:!bg-green-900/20 !text-green-700 dark:!text-green-300 !border-green-200 dark:!border-green-800' : ''}
                    >
                      {checks.preview ? <><CheckCircle2 className="w-3.5 h-3.5" /> 확인 완료</> : '미리보기 확인'}
                    </Btn>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {filePreview.schema.map(s => (
                      <span
                        key={s.name}
                        className={`text-xs px-2 py-0.5 rounded-full font-mono ${
                          s.type === 'NUMBER' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                          : s.type === 'DATE' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                          : s.type === 'BOOLEAN' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                        }`}
                      >
                        {s.name} <span className="opacity-60">{s.type}</span>
                      </span>
                    ))}
                  </div>
                  <div className="overflow-x-auto rounded-xl border text-xs">
                    <table className="w-full min-w-[640px]">
                      <thead className="bg-gray-50 dark:bg-gray-950 border-b">
                        <tr>
                          {filePreview.headers.map(h => (
                            <th key={h} className="px-3 py-1.5 text-left text-gray-600 dark:text-gray-400 font-medium">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                        {filePreview.rows.map((row, i) => (
                          <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors duration-100">
                            {row.map((cell, j) => (
                              <td key={j} className="px-3 py-1 text-gray-700 dark:text-gray-300">{cell || '—'}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="px-3 py-1 bg-gray-50 dark:bg-gray-950 border-t text-gray-400 dark:text-gray-300">
                      전체 {filePreview.rowCount.toLocaleString()}행 · 미리보기 {Math.min(5, filePreview.rowCount)}행
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 업로드 진행률 */}
            {uploading && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400">
                  <span className="flex items-center gap-1"><Loader2 className="w-3.5 h-3.5 animate-spin" /> 업로드 중...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-600 transition-all duration-200"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* 심사 요청 체크리스트 */}
            <div className={`rounded-xl border p-4 space-y-2 ${formTouched && !allChecked ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' : 'bg-gray-50 dark:bg-gray-950'}`}>
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> 심사 요청 전 체크리스트
              </h4>
              <div className="space-y-1.5">
                {CHECKLIST.map(c => {
                  const ok = checks[c.key]
                  return (
                    <label key={c.key} className="flex items-start gap-2 text-xs cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={ok}
                        onChange={() => {}}
                        className="mt-0.5"
                        readOnly
                      />
                      <span className={ok ? 'text-gray-700 dark:text-gray-300' : 'text-gray-500 dark:text-gray-400'}>{c.label}</span>
                      {formTouched && !ok && <AlertCircle className="w-3.5 h-3.5 text-red-500 ml-auto shrink-0" />}
                    </label>
                  )
                })}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Btn type="submit" loading={uploading} disabled={!canSubmit}>
                {uploading ? '등록 중...' : '심사 요청'}
              </Btn>
              <Btn type="button" variant="ghost" onClick={() => { setShowForm(false); setFormTouched(false) }} disabled={uploading}>
                취소
              </Btn>
            </div>
          </form>
        </Card>
      )}

      {/* 검색·필터·정렬 */}
      {!showForm && items.length > 0 && (
        <Card padding="sm" className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-300" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="데이터셋 제목 검색"
                className="pl-9 pr-3 py-2 rounded-lg bg-white dark:bg-gray-900"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-300 hover:text-gray-600 dark:hover:text-gray-400 transition-colors duration-150"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <Select
                value={sort}
                onChange={e => setSort(e.target.value as Sort)}
                className="px-3 py-2 rounded-lg bg-white dark:bg-gray-900"
              >
                {SORT_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {STATUS_OPTIONS.map(opt => {
              const active = statusFilter === opt.value
              return (
                <button
                  key={opt.value}
                  onClick={() => setStatusFilter(opt.value)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
                    active
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        </Card>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} padding="sm" className="flex items-start justify-between">
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
              </div>
              <Skeleton className="h-6 w-16 rounded-full" />
            </Card>
          ))}
        </div>
      ) : error ? (
        <EmptyState
          icon={<AlertCircle className="w-8 h-8 text-red-500" />}
          title="목록을 불러오지 못했습니다"
          description={error}
          action={{ label: '다시 시도', onClick: loadList }}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Upload className="w-8 h-8 text-gray-400 dark:text-gray-300" />}
          title={role === 'center' ? '아직 접수된 데이터셋 신청이 없습니다' : '등록된 데이터셋이 없습니다'}
          description={role === 'center'
            ? '기관이 데이터를 등록하면 여기에 표시됩니다.'
            : '데이터 등록 버튼을 눌러 첫 번째 데이터셋을 신청해 보세요.'}
          action={role !== 'center' ? { label: '첫 데이터셋 등록하기', onClick: () => setShowForm(true) } : undefined}
        />
      ) : filteredItems.length === 0 ? (
        <Card>
          <div className="text-center py-16 text-gray-400 dark:text-gray-300 text-sm">
            검색·필터 조건에 맞는 데이터셋이 없습니다.
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          {role === 'center' && (
            <div className="px-4 py-2.5 bg-blue-50 dark:bg-blue-900/20 border-b text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" />
              행을 클릭하면 상세 내용 확인 및 심사가 가능합니다.
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-gray-50 dark:bg-gray-950">
                <tr>
                  <th className="px-4 py-2.5 text-left text-gray-600 dark:text-gray-400 font-medium">제목</th>
                  {role === 'center' && <th className="px-4 py-2.5 text-left text-gray-600 dark:text-gray-400 font-medium">기관</th>}
                  <th className="px-4 py-2.5 text-left text-gray-600 dark:text-gray-400 font-medium">상태</th>
                  <th className="px-4 py-2.5 text-left text-gray-600 dark:text-gray-400 font-medium">품질</th>
                  <th className="px-4 py-2.5 text-left text-gray-600 dark:text-gray-400 font-medium">등록일</th>
                  {role === 'center' && <th className="px-4 py-2.5 text-left text-gray-600 dark:text-gray-400 font-medium">코멘트</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {filteredItems.map(item => (
                  <tr
                    key={item.submission_id}
                    onClick={role === 'center' ? () => setSelectedId(item.submission_id) : undefined}
                    className={`transition-colors ${role === 'center' ? 'cursor-pointer hover:bg-blue-50/60 dark:hover:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                  >
                    <td className="px-4 py-3 text-gray-800 dark:text-gray-200">
                      <span className="font-medium">{item.title}</span>
                      {role === 'center' && <span className="ml-1 text-xs text-blue-400">→</span>}
                    </td>
                    {role === 'center' && (
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs font-mono">{item.tenant_id}</td>
                    )}
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANT[item.status] ?? 'gray'}>
                        {STATUS_LABEL[item.status] ?? item.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">{item.quality_summary ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-400 dark:text-gray-300">
                      {new Date(item.submitted_at).toLocaleDateString('ko-KR')}
                    </td>
                    {role === 'center' && (
                      <td className="px-4 py-3 text-xs text-gray-400 dark:text-gray-300">
                        {item.consultant_comments?.[0]?.count ?? 0}건
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-950 border-t text-xs text-gray-400 dark:text-gray-300 flex items-center justify-between">
            <span>총 {filteredItems.length}건</span>
            <span className="flex items-center gap-1"><ArrowUpDown className="w-3.5 h-3.5" /> {SORT_OPTIONS.find(o => o.value === sort)?.label}</span>
          </div>
        </Card>
      )}
    </div>
  )
}
