'use client'

import { useEffect, useRef, useState } from 'react'

interface Submission {
  id: string; title: string; status: string; tenant_id: string
  submitted_at: string; quality_summary: string | null
}

interface Props { role: string; tenantId: string }

const STATUS_LABEL: Record<string, string> = {
  submitted: '검토 대기',
  review: '검토 중',
  approved: '승인',
  rejected: '반려',
}

export default function SubmissionClient({ role, tenantId }: Props) {
  const [items, setItems]   = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [showForm, setShowForm]   = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  async function loadList() {
    setLoading(true)
    const params = role === 'center' ? '?all=true' : `?tenant_id=${tenantId}`
    const r = await fetch(`/api/submission${params}`)
    setItems(await r.json())
    setLoading(false)
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
              <input type="file" name="file" accept=".csv"
                className="w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
            </div>
            <button type="submit" disabled={uploading}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50">
              {uploading ? '등록 중...' : '등록'}
            </button>
          </form>
        </div>
      )}

      {loading ? (
        <div className="text-center py-8 text-gray-400">로딩 중...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-8 text-gray-400">등록된 데이터가 없습니다.</div>
      ) : (
        <div className="bg-white rounded-lg border overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-gray-600 font-medium">제목</th>
                {role === 'center' && <th className="px-4 py-2 text-left text-gray-600 font-medium">기관</th>}
                <th className="px-4 py-2 text-left text-gray-600 font-medium">상태</th>
                <th className="px-4 py-2 text-left text-gray-600 font-medium">품질</th>
                <th className="px-4 py-2 text-left text-gray-600 font-medium">등록일</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map(item => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-800">{item.title}</td>
                  {role === 'center' && <td className="px-4 py-2 text-gray-500 text-xs font-mono">{item.tenant_id}</td>}
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      item.status === 'approved' ? 'bg-green-100 text-green-700' :
                      item.status === 'rejected' ? 'bg-red-100 text-red-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>{STATUS_LABEL[item.status] ?? item.status}</span>
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-500">{item.quality_summary ?? '—'}</td>
                  <td className="px-4 py-2 text-xs text-gray-400">
                    {new Date(item.submitted_at).toLocaleDateString('ko-KR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
