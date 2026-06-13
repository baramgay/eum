'use client'

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { RefreshCw } from 'lucide-react'

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

const AUTH_TYPE_LABEL: Record<string, string> = {
  none:    '인증 없음',
  api_key: 'API 키',
  bearer:  'Bearer 토큰',
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

  // 폼 상태
  const [authType,    setAuthType]    = useState('none')
  const [respFormat,  setRespFormat]  = useState('json')

  async function loadSources() {
    setLoading(true)
    const res = await fetch('/api/collect')
    const list: SourceWithJob[] = await res.json()
    setSources(Array.isArray(list) ? list : [])
    setLoading(false)
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const body: Record<string, unknown> = {
      tenant_id:     tenantId,
      title:         fd.get('title'),
      url:           fd.get('url'),
      method:        fd.get('method'),
      auth_type:     fd.get('auth_type'),
      auth_key:      fd.get('auth_key') || null,
      auth_value:    fd.get('auth_value') || null,
      resp_format:   fd.get('resp_format'),
      json_path:     fd.get('json_path') || null,
      schedule_type: fd.get('schedule_type'),
      theme:         fd.get('theme') || null,
      keywords:      fd.get('keywords') || null,
    }
    setSubmitting(true)
    await fetch('/api/collect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setSubmitting(false)
    setShowForm(false)
    toast.success('수집 소스가 등록되었습니다.')
    await loadSources()
  }

  async function handleRun(sourceId: string) {
    setRunningId(sourceId)
    await fetch(`/api/collect/${sourceId}/run`, { method: 'POST' })
    setRunningId(null)
    toast.success('수집이 완료되었습니다.')
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
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
        >
          {showForm ? '취소' : '수집 소스 등록'}
        </button>
      </div>

      {/* 슬라이드인 등록 폼 */}
      {showForm && (
        <div className="bg-white rounded-lg border p-5 shadow-sm">
          <h3 className="font-medium text-gray-800 mb-4">수집 소스 등록</h3>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">제목 *</label>
                <input name="title" required placeholder="소스 제목"
                  className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">URL *</label>
                <input name="url" required placeholder="https://api.example.com/data"
                  className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">HTTP 메서드</label>
                <select name="method"
                  className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">인증 방식</label>
                <select name="auth_type" value={authType} onChange={e => setAuthType(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="none">인증 없음</option>
                  <option value="api_key">API 키</option>
                  <option value="bearer">Bearer 토큰</option>
                </select>
              </div>

              {authType === 'api_key' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">헤더 키</label>
                    <input name="auth_key" placeholder="X-API-Key"
                      className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">API 키 값</label>
                    <input name="auth_value" type="password" placeholder="••••••••"
                      className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </>
              )}

              {authType === 'bearer' && (
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Bearer 토큰</label>
                  <input name="auth_value" type="password" placeholder="••••••••"
                    className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              )}

              {/* auth_type=none일 때 hidden input으로 빈 값 전송 */}
              {authType === 'none' && (
                <>
                  <input type="hidden" name="auth_key" value="" />
                  <input type="hidden" name="auth_value" value="" />
                </>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">응답 형식</label>
                <select name="resp_format" value={respFormat} onChange={e => setRespFormat(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="json">JSON</option>
                  <option value="csv">CSV</option>
                </select>
              </div>

              {respFormat === 'json' && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">JSON 경로</label>
                  <input name="json_path" placeholder="$.response.body.items.item"
                    className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">수집 스케줄</label>
                <select name="schedule_type"
                  className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="manual">수동</option>
                  <option value="daily">매일</option>
                  <option value="weekly">매주 월요일</option>
                  <option value="monthly">매월 1일</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">주제</label>
                <input name="theme" placeholder="예: 인구통계"
                  className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">키워드</label>
                <input name="keywords" placeholder="쉼표로 구분"
                  className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            <button type="submit" disabled={submitting}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50">
              {submitting ? '등록 중...' : '등록'}
            </button>
          </form>
        </div>
      )}

      {/* 소스 목록 */}
      {loading ? (
        <div className="space-y-4 animate-pulse">
          <div className="flex justify-between items-center">
            <div className="h-6 bg-gray-200 rounded w-40" />
            <div className="h-9 bg-gray-200 rounded w-28" />
          </div>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-lg border p-4">
              <div className="flex justify-between">
                <div className="space-y-2 flex-1">
                  <div className="h-4 bg-gray-200 rounded w-1/3" />
                  <div className="h-3 bg-gray-100 rounded w-2/3" />
                  <div className="flex gap-2">
                    <div className="h-5 bg-gray-100 rounded-full w-12" />
                    <div className="h-5 bg-gray-100 rounded-full w-16" />
                  </div>
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
