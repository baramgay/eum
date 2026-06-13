'use client'

import { useEffect, useRef, useState } from 'react'
import SubmissionDetail from './SubmissionDetail'
import { Upload } from 'lucide-react'

interface Submission {
  submission_id: string; title: string; status: string; tenant_id: string
  submitted_at: string; quality_summary: string | null
  consultant_comments?: { count: number }[]
}

interface Props { role: string; tenantId: string }

const STATUS_LABEL: Record<string, string> = {
  submitted: '검토 대기',
  review:    '검토 중',
  approved:  '승인',
  rejected:  '반려',
}

const STATUS_COLOR: Record<string, string> = {
  submitted: 'bg-yellow-100 text-yellow-700',
  review:    'bg-blue-100 text-blue-700',
  approved:  'bg-green-100 text-green-700',
  rejected:  'bg-red-100 text-red-700',
}

export default function SubmissionClient({ role, tenantId }: Props) {
  const [items, setItems]       = useState<Submission[]>([])
  const [loading, setLoading]   = useState(true)
  const [uploading, setUploading] = useState(false)
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
  } | null>(null)

  async function loadList() {
    setLoading(true)
    const params = role === 'center' ? '?all=true' : `?tenant_id=${tenantId}`
    const r = await fetch(`/api/submission${params}`)
    setItems(await r.json())
    setLoading(false)
  }

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
        const vals = lines.slice(1, 20).map(l =>
          l.split(',')[idx]?.trim().replace(/^"|"$/g, '') ?? ''
        )
        const isNum = vals.filter(v => v !== '').every(v => !isNaN(Number(v)))
        return { name: h, type: isNum ? 'NUMBER' : 'TEXT' }
      })
      setFilePreview({ headers, rows: dataRows, schema, rowCount: lines.length - 1 })
    }
    reader.readAsText(file, 'utf-8')
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    if (!formRef.current) return
    const fd = new FormData(formRef.current)
    setUploading(true)
    await fetch('/api/submission', { method: 'POST', body: fd })
    setUploading(false)
    setShowForm(false)
    formRef.current.reset()
    await loadList()
  }

  useEffect(() => { loadList() }, [])

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

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-800">데이터 등록 관리</h2>
        {role !== 'center' && (
          <button onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700">
            {showForm ? '취소' : '데이터 등록'}
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-white rounded-lg border p-5 shadow-sm">
          <h3 className="font-medium text-gray-800 mb-4">데이터셋 등록</h3>
          <form ref={formRef} onSubmit={handleUpload} className="space-y-3">
            <input type="hidden" name="tenant_id" value={tenantId} />
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">제목 *</label>
                <input name="title" required placeholder="데이터셋 제목"
                  className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">주제</label>
                <input name="theme" placeholder="예: 인구통계"
                  className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">포맷</label>
                <select name="format"
                  className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="CSV">CSV</option>
                  <option value="JSON">JSON</option>
                  <option value="XLSX">XLSX</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">라이선스</label>
                <input name="license" placeholder="공공누리 1유형" defaultValue="공공누리 1유형"
                  className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">설명</label>
              <textarea name="description" rows={2} placeholder="데이터셋 설명"
                className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">CSV 파일</label>
              <div
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
                  }
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`relative border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
                  isDragging ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file" name="file" accept=".csv"
                  className="hidden"
                  onChange={e => { if (e.target.files?.[0]) parseCSVPreview(e.target.files[0]) }}
                />
                <p className="text-gray-400 text-sm">
                  {filePreview
                    ? <span className="text-blue-600 font-medium">파일 선택됨 · {filePreview.rowCount.toLocaleString()}행</span>
                    : <><span className="text-blue-600 font-medium">CSV 파일을 클릭하거나 드래그</span>하여 올려주세요</>
                  }
                </p>
              </div>
              {filePreview && (
                <div className="space-y-2 mt-2">
                  <div className="flex flex-wrap gap-1.5">
                    {filePreview.schema.map(s => (
                      <span
                        key={s.name}
                        className={`text-xs px-2 py-0.5 rounded-full font-mono ${
                          s.type === 'NUMBER' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {s.name} <span className="opacity-60">{s.type}</span>
                      </span>
                    ))}
                  </div>
                  <div className="overflow-x-auto rounded border text-xs">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          {filePreview.headers.map(h => (
                            <th key={h} className="px-3 py-1.5 text-left text-gray-600 font-medium">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {filePreview.rows.map((row, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            {row.map((cell, j) => (
                              <td key={j} className="px-3 py-1 text-gray-700">{cell || '—'}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="px-3 py-1 bg-gray-50 border-t text-gray-400">
                      전체 {filePreview.rowCount.toLocaleString()}행 · 미리보기 {Math.min(5, filePreview.rowCount)}행
                    </div>
                  </div>
                </div>
              )}
            </div>
            <button type="submit" disabled={uploading}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50">
              {uploading ? '등록 중...' : '등록'}
            </button>
          </form>
        </div>
      )}

      {loading ? (
        <div className="space-y-4 animate-pulse">
          <div className="flex justify-between items-center">
            <div className="h-6 bg-gray-200 rounded w-36" />
            <div className="h-9 bg-gray-200 rounded w-28" />
          </div>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-lg border p-4">
              <div className="flex justify-between items-start">
                <div className="space-y-2 flex-1">
                  <div className="h-4 bg-gray-200 rounded w-1/2" />
                  <div className="h-3 bg-gray-100 rounded w-1/3" />
                </div>
                <div className="h-6 bg-gray-100 rounded-full w-14" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-blue-50 mb-4">
            <Upload className="w-6 h-6 text-blue-400" />
          </div>
          <p className="text-gray-700 font-medium mb-1">
            {role === 'center' ? '아직 접수된 데이터셋 신청이 없습니다' : '등록된 데이터셋이 없습니다'}
          </p>
          <p className="text-sm text-gray-400">
            {role === 'center'
              ? '기관이 데이터를 등록하면 여기에 표시됩니다.'
              : '데이터 등록 버튼을 눌러 첫 번째 데이터셋을 신청해 보세요.'}
          </p>
          {role !== 'center' && (
            <button
              onClick={() => setShowForm(true)}
              className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
            >
              첫 데이터셋 등록하기
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-lg border overflow-hidden shadow-sm">
          {role === 'center' && (
            <div className="px-4 py-2 bg-blue-50 border-b text-xs text-blue-600">
              행을 클릭하면 상세 내용 확인 및 심사가 가능합니다.
            </div>
          )}
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-gray-600 font-medium">제목</th>
                {role === 'center' && <th className="px-4 py-2 text-left text-gray-600 font-medium">기관</th>}
                <th className="px-4 py-2 text-left text-gray-600 font-medium">상태</th>
                <th className="px-4 py-2 text-left text-gray-600 font-medium">품질</th>
                <th className="px-4 py-2 text-left text-gray-600 font-medium">등록일</th>
                {role === 'center' && <th className="px-4 py-2 text-left text-gray-600 font-medium">코멘트</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map(item => (
                <tr
                  key={item.submission_id}
                  onClick={role === 'center' ? () => setSelectedId(item.submission_id) : undefined}
                  className={`hover:bg-gray-50 ${role === 'center' ? 'cursor-pointer' : ''}`}
                >
                  <td className="px-4 py-2 text-gray-800">
                    {item.title}
                    {role === 'center' && <span className="ml-1 text-xs text-blue-400">→</span>}
                  </td>
                  {role === 'center' && (
                    <td className="px-4 py-2 text-gray-500 text-xs font-mono">{item.tenant_id}</td>
                  )}
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLOR[item.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {STATUS_LABEL[item.status] ?? item.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-500">{item.quality_summary ?? '—'}</td>
                  <td className="px-4 py-2 text-xs text-gray-400">
                    {new Date(item.submitted_at).toLocaleDateString('ko-KR')}
                  </td>
                  {role === 'center' && (
                    <td className="px-4 py-2 text-xs text-gray-400">
                      {item.consultant_comments?.[0]?.count ?? 0}건
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
