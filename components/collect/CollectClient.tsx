'use client'

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { RefreshCw, FlaskConical } from 'lucide-react'

interface CollectSource {
  source_id:     string
  tenant_id:     string
  title:         string
  url:           string
  method:        string
  auth_type:     string
  resp_format:   string
  theme:         string | null
  keywords:      string | null
  license:       string | null
  created_at:    string
  updated_at:    string
}

interface CollectJob {
  job_id:        string
  source_id:     string
  schedule_type: string
  status:        string
  last_run_at:   string | null
}

interface CollectLog {
  log_id:       string
  started_at:   string
  status:       string
  rows_fetched: number
  rows_new:     number
  rows_deleted: number
  error_msg:    string | null
}

interface TestResult {
  ok:           boolean
  rows_fetched?: number
  pages_fetched?: number
  preview?:     Record<string, unknown>[]
  columns?:     string[]
  error?:       string
}

interface SourceWithJob extends CollectSource {
  job?: CollectJob
}

interface Props { role: string; tenantId: string }

const JOB_STATUS_COLOR: Record<string, string> = {
  idle:    'bg-gray-100 text-gray-600',
  running: 'bg-blue-100 text-blue-700',
  success: 'bg-green-100 text-green-700',
  failed:  'bg-red-100 text-red-700',
}

const LOG_STATUS_COLOR: Record<string, string> = {
  running: 'bg-blue-100 text-blue-700',
  success: 'bg-green-100 text-green-700',
  failed:  'bg-red-100 text-red-700',
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

export default function CollectClient({ role, tenantId }: Props) {
  const [sources,     setSources]     = useState<SourceWithJob[]>([])
  const [loading,     setLoading]     = useState(true)
  const [showForm,    setShowForm]    = useState(false)
  const [submitting,  setSubmitting]  = useState(false)
  const [runningId,   setRunningId]   = useState<string | null>(null)
  const [logModal,    setLogModal]    = useState<{ sourceId: string; title: string } | null>(null)
  const [logs,        setLogs]        = useState<CollectLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [testing,     setTesting]     = useState(false)
  const [testResult,  setTestResult]  = useState<TestResult | null>(null)

  // 폼 상태
  const [authType,       setAuthType]       = useState('none')
  const [respFormat,     setRespFormat]     = useState('json')
  const [method,         setMethod]         = useState('GET')
  const [paginationType, setPaginationType] = useState('none')

  // 현재 폼 데이터 수집 (테스트용)
  function collectFormData(form: HTMLFormElement): Record<string, unknown> {
    const fd = new FormData(form)
    return {
      url:           fd.get('url'),
      method:        fd.get('method'),
      auth_type:     fd.get('auth_type'),
      auth_key:      fd.get('auth_key') || null,
      auth_value:    fd.get('auth_value') || null,
      resp_format:   fd.get('resp_format'),
      json_path:     fd.get('json_path') || null,
      pagination_type:       fd.get('pagination_type') || 'none',
      pagination_page_param: fd.get('pagination_page_param') || 'pageNo',
      pagination_size_param: fd.get('pagination_size_param') || 'numOfRows',
      pagination_size:       fd.get('pagination_size') || 10,
      pagination_total_path: fd.get('pagination_total_path') || '$.totalCount',
      request_body:  (() => {
        const v = (fd.get('request_body') as string)?.trim()
        if (!v) return null
        try { return JSON.parse(v) } catch { return null }
      })(),
    }
  }

  async function loadSources() {
    setLoading(true)
    const res = await fetch('/api/collect')
    const list: SourceWithJob[] = await res.json()
    setSources(Array.isArray(list) ? list : [])
    setLoading(false)
  }

  async function handleTest(e: React.MouseEvent<HTMLButtonElement>) {
    const form = (e.currentTarget.closest('form') as HTMLFormElement)
    const data = collectFormData(form)
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

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const rawBody = (fd.get('request_body') as string)?.trim()
    let parsedBody: Record<string, unknown> | null = null
    if (rawBody) {
      try { parsedBody = JSON.parse(rawBody) } catch { toast.error('request_body JSON 파싱 오류'); return }
    }

    const body: Record<string, unknown> = {
      tenant_id:    tenantId,
      title:        fd.get('title'),
      url:          fd.get('url'),
      method:       fd.get('method'),
      auth_type:    fd.get('auth_type'),
      auth_key:     fd.get('auth_key') || null,
      auth_value:   fd.get('auth_value') || null,
      resp_format:  fd.get('resp_format'),
      json_path:    fd.get('json_path') || null,
      schedule_type: fd.get('schedule_type'),
      theme:        fd.get('theme') || null,
      keywords:     fd.get('keywords') || null,
      request_body: parsedBody,
      pagination_type:       fd.get('pagination_type') || 'none',
      pagination_page_param: fd.get('pagination_page_param') || 'pageNo',
      pagination_size_param: fd.get('pagination_size_param') || 'numOfRows',
      pagination_size:       fd.get('pagination_size') ? Number(fd.get('pagination_size')) : 1000,
      pagination_total_path: fd.get('pagination_total_path') || '$.totalCount',
    }
    setSubmitting(true)
    await fetch('/api/collect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setSubmitting(false)
    setShowForm(false)
    setTestResult(null)
    toast.success('수집 소스가 등록되었습니다.')
    await loadSources()
  }

  async function handleRun(sourceId: string) {
    setRunningId(sourceId)
    const res = await fetch(`/api/collect/${sourceId}/run`, { method: 'POST' })
    setRunningId(null)
    if (res.ok) {
      const data = await res.json()
      toast.success(`수집 완료 — ${data.rows_fetched?.toLocaleString() ?? 0}행`)
    } else {
      const err = await res.json().catch(() => ({ error: '알 수 없는 오류' }))
      toast.error(`수집 실패: ${err.error ?? '오류'}`)
    }
    await loadSources()
  }

  async function handleDelete(sourceId: string) {
    if (!confirm('소스를 삭제하면 수집 이력도 모두 삭제됩니다. 계속하시겠습니까?')) return
    await fetch(`/api/collect/${sourceId}`, { method: 'DELETE' })
    toast('소스가 삭제되었습니다.')
    await loadSources()
  }

  async function openLogs(sourceId: string, title: string) {
    setLogModal({ sourceId, title })
    setLogsLoading(true)
    const res = await fetch(`/api/collect/${sourceId}/logs`)
    setLogs(await res.json())
    setLogsLoading(false)
  }

  useEffect(() => { loadSources() }, [])

  return (
    <div className="space-y-4">
      {/* 로그 모달 */}
      {logModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl mx-4 flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <h3 className="font-semibold text-gray-800">수집 이력 — {logModal.title}</h3>
              <button onClick={() => setLogModal(null)} className="text-gray-400 hover:text-gray-700 text-lg">✕</button>
            </div>
            <div className="overflow-auto flex-1">
              {logsLoading ? (
                <div className="py-8 text-center text-gray-400">로딩 중...</div>
              ) : logs.length === 0 ? (
                <div className="py-8 text-center text-gray-400">수집 이력이 없습니다.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-gray-600 font-medium">로그 ID</th>
                      <th className="px-3 py-2 text-left text-gray-600 font-medium">시작</th>
                      <th className="px-3 py-2 text-left text-gray-600 font-medium">상태</th>
                      <th className="px-3 py-2 text-right text-gray-600 font-medium">수집</th>
                      <th className="px-3 py-2 text-right text-gray-600 font-medium">신규</th>
                      <th className="px-3 py-2 text-right text-gray-600 font-medium">삭제</th>
                      <th className="px-3 py-2 text-left text-gray-600 font-medium">오류</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {logs.map(log => (
                      <tr key={log.log_id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-mono text-xs text-gray-500">{log.log_id}</td>
                        <td className="px-3 py-2 text-xs text-gray-500">
                          {new Date(log.started_at).toLocaleString('ko-KR')}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${LOG_STATUS_COLOR[log.status] ?? 'bg-gray-100 text-gray-600'}`}>
                            {log.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right text-xs">{log.rows_fetched.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-xs text-green-600">+{log.rows_new}</td>
                        <td className="px-3 py-2 text-right text-xs text-red-500">-{log.rows_deleted}</td>
                        <td className="px-3 py-2 text-xs text-red-500 max-w-xs truncate">
                          {log.error_msg ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-800">데이터 수집 관리</h2>
        <button
          onClick={() => { setShowForm(!showForm); setTestResult(null) }}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
        >
          {showForm ? '취소' : '수집 소스 등록'}
        </button>
      </div>

      {/* 소스 등록 폼 */}
      {showForm && (
        <div className="bg-white rounded-lg border p-5 shadow-sm">
          <h3 className="font-medium text-gray-800 mb-4">수집 소스 등록</h3>
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* 기본 정보 */}
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">제목 *</label>
                <input name="title" required placeholder="소스 제목"
                  className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">URL *</label>
                <input name="url" required placeholder="https://api.data.go.kr/..."
                  className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">HTTP 메서드</label>
                <select name="method" value={method} onChange={e => setMethod(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-sm">
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">응답 형식</label>
                <select name="resp_format" value={respFormat} onChange={e => setRespFormat(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-sm">
                  <option value="json">JSON</option>
                  <option value="csv">CSV</option>
                </select>
              </div>

              {/* 인증 */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">인증 방식</label>
                <select name="auth_type" value={authType} onChange={e => setAuthType(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-sm">
                  <option value="none">인증 없음</option>
                  <option value="api_key">API 키 (헤더)</option>
                  <option value="bearer">Bearer 토큰</option>
                </select>
              </div>

              {authType === 'api_key' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">헤더 키</label>
                    <input name="auth_key" placeholder="X-API-Key"
                      className="w-full px-3 py-2 border rounded-md text-sm" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">API 키 값</label>
                    <input name="auth_value" type="password" placeholder="••••••••"
                      className="w-full px-3 py-2 border rounded-md text-sm" />
                  </div>
                </>
              )}
              {authType === 'bearer' && (
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Bearer 토큰</label>
                  <input name="auth_value" type="password" placeholder="••••••••"
                    className="w-full px-3 py-2 border rounded-md text-sm" />
                </div>
              )}
              {authType === 'none' && (
                <>
                  <input type="hidden" name="auth_key" value="" />
                  <input type="hidden" name="auth_value" value="" />
                </>
              )}

              {respFormat === 'json' && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    JSON 경로
                    <span className="ml-1 text-gray-400 font-normal">예: $.response.body.items.item</span>
                  </label>
                  <input name="json_path" placeholder="$.items"
                    className="w-full px-3 py-2 border rounded-md text-sm" />
                </div>
              )}

              {method === 'POST' && (
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Request Body (JSON)
                  </label>
                  <textarea name="request_body" rows={3} placeholder={'{"key": "value"}'}
                    className="w-full px-3 py-2 border rounded-md text-sm font-mono" />
                </div>
              )}
            </div>

            {/* 페이지네이션 설정 */}
            <div className="border rounded-md p-3 bg-gray-50">
              <div className="flex items-center gap-2 mb-3">
                <label className="text-xs font-semibold text-gray-700">페이지네이션</label>
                <select name="pagination_type" value={paginationType} onChange={e => setPaginationType(e.target.value)}
                  className="px-2 py-1 border rounded text-xs">
                  <option value="none">없음 (단일 요청)</option>
                  <option value="page">페이지 번호 (공공데이터포털 기본)</option>
                  <option value="offset">오프셋 (offset + limit)</option>
                </select>
              </div>

              {(paginationType === 'page' || paginationType === 'offset') && (
                <div className="grid md:grid-cols-4 gap-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      {paginationType === 'page' ? '페이지 파라미터' : '오프셋 파라미터'}
                    </label>
                    <input name="pagination_page_param"
                      defaultValue={paginationType === 'page' ? 'pageNo' : 'offset'}
                      className="w-full px-2 py-1 border rounded text-xs" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">크기 파라미터</label>
                    <input name="pagination_size_param"
                      defaultValue={paginationType === 'page' ? 'numOfRows' : 'limit'}
                      className="w-full px-2 py-1 border rounded text-xs" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">페이지당 행 수</label>
                    <input name="pagination_size" type="number" defaultValue="1000" min="1" max="5000"
                      className="w-full px-2 py-1 border rounded text-xs" />
                  </div>
                  {paginationType === 'page' && (
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">전체 건수 경로</label>
                      <input name="pagination_total_path" defaultValue="$.totalCount"
                        placeholder="$.totalCount"
                        className="w-full px-2 py-1 border rounded text-xs" />
                    </div>
                  )}
                </div>
              )}
              {(paginationType === 'none' || paginationType === '') && (
                <>
                  <input type="hidden" name="pagination_page_param" value="pageNo" />
                  <input type="hidden" name="pagination_size_param" value="numOfRows" />
                  <input type="hidden" name="pagination_size" value="1000" />
                  <input type="hidden" name="pagination_total_path" value="$.totalCount" />
                </>
              )}
            </div>

            {/* 스케줄 + 메타 */}
            <div className="grid md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">수집 스케줄</label>
                <select name="schedule_type"
                  className="w-full px-3 py-2 border rounded-md text-sm">
                  <option value="manual">수동</option>
                  <option value="daily">매일 자정</option>
                  <option value="weekly">매주 월요일</option>
                  <option value="monthly">매월 1일</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">주제</label>
                <input name="theme" placeholder="예: 인구통계"
                  className="w-full px-3 py-2 border rounded-md text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">키워드</label>
                <input name="keywords" placeholder="쉼표로 구분"
                  className="w-full px-3 py-2 border rounded-md text-sm" />
              </div>
            </div>

            {/* 테스트 결과 */}
            {testResult && (
              <div className={`rounded-md p-3 text-sm ${testResult.ok ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                {testResult.ok ? (
                  <div>
                    <p className="font-medium text-green-700 mb-1">
                      테스트 성공 — 총 {testResult.rows_fetched?.toLocaleString()}행
                      {testResult.pages_fetched && testResult.pages_fetched > 1 && ` (${testResult.pages_fetched}페이지)`}
                    </p>
                    {testResult.columns && testResult.columns.length > 0 && (
                      <p className="text-xs text-green-600 mb-2">
                        컬럼: {testResult.columns.join(', ')}
                      </p>
                    )}
                    {testResult.preview && testResult.preview.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="text-xs border-collapse w-full">
                          <thead>
                            <tr className="bg-green-100">
                              {testResult.columns?.map(c => (
                                <th key={c} className="border border-green-200 px-2 py-1 text-left font-medium text-green-800">{c}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {testResult.preview.slice(0, 5).map((row, i) => (
                              <tr key={i} className="hover:bg-green-50">
                                {testResult.columns?.map(c => (
                                  <td key={c} className="border border-green-100 px-2 py-0.5 text-gray-700 max-w-[120px] truncate">
                                    {row[c] != null ? String(row[c]) : <span className="text-gray-300">—</span>}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-red-600 font-medium">오류: {testResult.error}</p>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <button type="button" onClick={handleTest} disabled={testing}
                className="px-4 py-2 border border-blue-400 text-blue-600 text-sm rounded-md hover:bg-blue-50 disabled:opacity-50 flex items-center gap-1.5">
                <FlaskConical className="w-3.5 h-3.5" />
                {testing ? '테스트 중...' : '테스트'}
              </button>
              <button type="submit" disabled={submitting}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50">
                {submitting ? '등록 중...' : '등록'}
              </button>
              <button type="button" onClick={() => { setShowForm(false); setTestResult(null) }}
                className="px-4 py-2 border text-gray-600 text-sm rounded-md hover:bg-gray-50">
                취소
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 소스 목록 */}
      {loading ? (
        <div className="space-y-4 animate-pulse">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-lg border p-4">
              <div className="flex justify-between">
                <div className="space-y-2 flex-1">
                  <div className="h-4 bg-gray-200 rounded w-1/3" />
                  <div className="h-3 bg-gray-100 rounded w-2/3" />
                </div>
                <div className="flex gap-2">
                  <div className="h-8 bg-gray-100 rounded w-14" />
                  <div className="h-8 bg-gray-100 rounded w-20" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : sources.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4">
            <RefreshCw className="w-7 h-7 text-blue-400" />
          </div>
          <h3 className="text-base font-semibold text-gray-700 mb-1">등록된 수집 소스가 없습니다</h3>
          <p className="text-sm text-gray-400 mb-5 max-w-xs leading-relaxed">
            외부 API나 파일 URL을 등록하면 데이터를 주기적으로 자동 수집합니다
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            첫 수집 소스 등록하기
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-lg border overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-gray-600 font-medium">제목</th>
                {role === 'center' && <th className="px-4 py-2 text-left text-gray-600 font-medium">기관</th>}
                <th className="px-4 py-2 text-left text-gray-600 font-medium">URL</th>
                <th className="px-4 py-2 text-left text-gray-600 font-medium">형식</th>
                <th className="px-4 py-2 text-left text-gray-600 font-medium">스케줄</th>
                <th className="px-4 py-2 text-left text-gray-600 font-medium">상태</th>
                <th className="px-4 py-2 text-left text-gray-600 font-medium">마지막 실행</th>
                <th className="px-4 py-2 text-left text-gray-600 font-medium">액션</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sources.map(src => (
                <tr key={src.source_id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-800 font-medium">{src.title}</td>
                  {role === 'center' && (
                    <td className="px-4 py-2 text-gray-500 text-xs font-mono">{src.tenant_id}</td>
                  )}
                  <td className="px-4 py-2 text-xs text-blue-600 font-mono" title={src.url}>
                    {truncateUrl(src.url)}
                  </td>
                  <td className="px-4 py-2">
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700">
                      {src.resp_format.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-500">
                    {src.job ? SCHEDULE_LABEL[src.job.schedule_type] ?? src.job.schedule_type : '수동'}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      runningId === src.source_id
                        ? 'bg-blue-100 text-blue-700'
                        : JOB_STATUS_COLOR[src.job?.status ?? 'idle'] ?? JOB_STATUS_COLOR['idle']
                    }`}>
                      {runningId === src.source_id ? 'running' : (src.job?.status ?? 'idle')}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-400">
                    {src.job?.last_run_at
                      ? new Date(src.job.last_run_at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
                      : '—'}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => handleRun(src.source_id)}
                        disabled={runningId === src.source_id}
                        className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                      >
                        {runningId === src.source_id ? '실행 중' : '지금 실행'}
                      </button>
                      <button
                        onClick={() => openLogs(src.source_id, src.title)}
                        className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                      >
                        이력
                      </button>
                      {role === 'center' && (
                        <button
                          onClick={() => handleDelete(src.source_id)}
                          className="px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100"
                        >
                          삭제
                        </button>
                      )}
                    </div>
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
