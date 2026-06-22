'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Modal from '@/components/ui/Modal'
import DatasetStats from './DatasetStats'
import { CheckCircle2, XCircle, Loader2, Copy, Check, FileJson, FileSpreadsheet, Terminal, ExternalLink, Sparkles, GitFork, Bot, Bell, BellOff } from 'lucide-react'
import toast from 'react-hot-toast'

interface CatalogItem {
  dataset_id: string; title: string; theme: string; format: string; license: string
  quality_summary: string | null; description: string | null
  updated_at: string | null; rows: number | null
  keywords?: string | null; is_open?: boolean; ai_ready?: boolean; api_enabled?: boolean
  download_count?: number
}

interface SuggestMetaResult {
  title: string
  description: string
  category: string
  keywords: string[]
}

interface AiCheckItem { name: string; pass: boolean; detail: string }
interface AiReadyResult {
  ai_ready: boolean; pass_count: number; total: number; checklist: AiCheckItem[]
}

interface Props {
  item: CatalogItem
  onClose: () => void
}

type ModalTab = 'overview' | 'preview' | 'metadata' | 'api' | 'stats' | 'ai-ready'

const API_BASE = typeof window !== 'undefined' ? window.location.origin : ''

function CodeBlock({ label, code, lang }: { label: string; code: string; lang: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    toast.success(`${label} 예시를 복사했습니다`)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-950 border-b">
        <span className="text-xs font-medium text-gray-600 dark:text-gray-400 flex items-center gap-1.5">
          <Terminal className="w-3.5 h-3.5" /> {label}
        </span>
        <button
          onClick={copy}
          className="text-xs text-gray-500 dark:text-gray-400 hover:text-blue-600 flex items-center gap-1"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? '복사됨' : '복사'}
        </button>
      </div>
      <pre className="text-xs font-mono bg-gray-900 text-green-300 p-3 overflow-x-auto">
<code>{code}</code>
      </pre>
    </div>
  )
}

function DatasetPreview({ datasetId }: { datasetId: string }) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/catalog/${datasetId}/download?format=json&limit=10`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then((d: { data?: Record<string, unknown>[]; rows?: Record<string, unknown>[] }) => {
        setRows(d.data ?? d.rows ?? [])
        setLoading(false)
      })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [datasetId])

  if (loading) return <div className="text-center py-8 text-gray-400 dark:text-gray-300 text-sm">미리보기 로드 중...</div>
  if (error) return <div className="text-center py-8 text-red-500 text-sm">{error}</div>
  if (rows.length === 0) return <div className="text-center py-8 text-gray-400 dark:text-gray-300 text-sm">미리보기 데이터가 없습니다.</div>

  const cols = Object.keys(rows[0]).slice(0, 8)
  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-400 dark:text-gray-300">최대 10행 · {cols.length}개 컬럼 미리보기</p>
      <div className="overflow-x-auto rounded border text-xs">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-950">
            <tr>
              {cols.map(c => (
                <th key={c} className="px-3 py-2 text-left text-gray-600 dark:text-gray-400 font-medium whitespace-nowrap">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row, i) => (
              <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-950">
                {cols.map(c => (
                  <td key={c} className="px-3 py-1.5 text-gray-700 dark:text-gray-300 font-mono whitespace-nowrap">
                    {row[c] != null ? String(row[c]) : <span className="text-gray-300 dark:text-gray-200">null</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function DatasetModal({ item, onClose }: Props) {
  const router = useRouter()
  const [modalTab, setModalTab] = useState<ModalTab>('overview')
  const [aiData, setAiData]     = useState<AiReadyResult | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError]   = useState<string | null>(null)
  const [related, setRelated]   = useState<CatalogItem[]>([])
  const [relatedLoading, setRelatedLoading] = useState(false)

  const [subscribed, setSubscribed]     = useState(false)
  const [subLoading, setSubLoading]     = useState(false)

  const [suggestLoading, setSuggestLoading] = useState(false)
  const [suggestError, setSuggestError]     = useState<string | null>(null)
  const [metaForm, setMetaForm] = useState<SuggestMetaResult | null>(null)
  const [saveLoading, setSaveLoading] = useState(false)

  const handleSuggestMeta = async () => {
    setSuggestLoading(true)
    setSuggestError(null)
    try {
      const res = await fetch(`/api/catalog/${item.dataset_id}/suggest-meta`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const data = await res.json() as SuggestMetaResult
      setMetaForm(data)
    } catch (e) {
      setSuggestError(e instanceof Error ? e.message : String(e))
    } finally {
      setSuggestLoading(false)
    }
  }

  const handleSaveMeta = async () => {
    if (!metaForm) return
    setSaveLoading(true)
    try {
      const res = await fetch(`/api/catalog/${item.dataset_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: metaForm.title,
          description: metaForm.description,
          theme: metaForm.category,
          keywords: metaForm.keywords.join(', '),
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      toast.success('메타데이터가 저장되었습니다')
      setMetaForm(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '저장에 실패했습니다')
    } finally {
      setSaveLoading(false)
    }
  }

  // 구독 상태 초기 로드
  useEffect(() => {
    fetch(`/api/catalog/${item.dataset_id}/subscribe`)
      .then(r => r.json())
      .then((d: { subscribed?: boolean }) => setSubscribed(!!d.subscribed))
      .catch(() => {})
  }, [item.dataset_id])

  const handleSubscribeToggle = async () => {
    setSubLoading(true)
    try {
      const method = subscribed ? 'DELETE' : 'POST'
      const res = await fetch(`/api/catalog/${item.dataset_id}/subscribe`, { method })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      setSubscribed(!subscribed)
      toast.success(subscribed ? '구독이 해제되었습니다' : '구독이 등록되었습니다')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '구독 처리에 실패했습니다')
    } finally {
      setSubLoading(false)
    }
  }

  // AI-Ready 탭 전환 시 데이터 로드
  useEffect(() => {
    if (modalTab !== 'ai-ready' || aiData || aiLoading) return
    setAiLoading(true)
    setAiError(null)
    fetch(`/api/catalog/${item.dataset_id}/ai-ready`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then((d: AiReadyResult) => { setAiData(d); setAiLoading(false) })
      .catch(e => { setAiError(e.message); setAiLoading(false) })
  }, [modalTab, item.dataset_id, aiData, aiLoading])

  // 개요 탭: 동일 주제 관련 데이터셋 로드
  useEffect(() => {
    if (modalTab !== 'overview') return
    setRelatedLoading(true)
    fetch(`/api/catalog?theme=${encodeURIComponent(item.theme)}&pageSize=20`)
      .then(r => r.json())
      .then((d: { items?: CatalogItem[] }) => {
        setRelated((d.items ?? []).filter(x => x.dataset_id !== item.dataset_id).slice(0, 4))
        setRelatedLoading(false)
      })
      .catch(() => setRelatedLoading(false))
  }, [modalTab, item.theme, item.dataset_id])

  const TABS: { key: ModalTab; label: string }[] = [
    { key: 'overview', label: '개요' },
    { key: 'preview',  label: '미리보기' },
    { key: 'metadata', label: '메타데이터' },
    { key: 'api',      label: 'API 예시' },
    { key: 'stats',    label: '통계' },
    { key: 'ai-ready', label: 'AI-Ready' },
  ]

  const apiCurl = `# 메타데이터 조회\ncurl -H "x-api-key: eum_xxxxxx" \\\n  "${API_BASE}/api/v1/datasets/${item.dataset_id}"\n\n# 데이터 다운로드 (CSV)\ncurl -H "x-api-key: eum_xxxxxx" \\\n  "${API_BASE}/api/v1/datasets/${item.dataset_id}/data?format=csv&limit=100" \\\n  -o ${item.dataset_id}.csv`

  const apiJs = `// JavaScript (fetch)\nconst res = await fetch(\n  \`${API_BASE}/api/v1/datasets/${item.dataset_id}/data?format=json&limit=100\`,\n  { headers: { 'x-api-key': 'eum_xxxxxx' } }\n);\nconst data = await res.json();\nconsole.log(data);`

  const apiPython = `# Python (requests)\nimport requests\n\nurl = "${API_BASE}/api/v1/datasets/${item.dataset_id}/data"\nheaders = {"x-api-key": "eum_xxxxxx"}\nparams = {"format": "json", "limit": 100}\n\nres = requests.get(url, headers=headers, params=params)\nprint(res.json())`

  return (
    <Modal
      open
      onClose={onClose}
      title={item.title}
      description={`${item.theme} 데이터셋 상세 정보`}
      size="lg"
      className="max-w-2xl"
      showCloseButton={false}
    >
      {/* 헤더 */}
      <div className="px-6 pt-5 pb-3 border-b flex-shrink-0">
        <div className="absolute right-4 top-4 flex items-center gap-2">
          <button
            onClick={handleSubscribeToggle}
            disabled={subLoading}
            aria-label={subscribed ? '구독 해제' : '구독'}
            className={`p-1.5 rounded-md transition-colors ${
              subscribed
                ? 'text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950'
                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            {subLoading ? <Loader2 size={16} className="animate-spin" /> : subscribed ? <BellOff size={16} /> : <Bell size={16} />}
          </button>
          <button
            onClick={onClose}
            className="text-gray-400 dark:text-gray-300 hover:text-gray-600 dark:hover:text-gray-400 text-xl leading-none"
            aria-label="닫기"
          >×</button>
        </div>
        <h3 className="font-semibold text-gray-800 dark:text-gray-200 text-base pr-6">{item.title}</h3>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded">{item.theme}</span>
            <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded">{item.format}</span>
            {item.quality_summary && (
              <span className={`text-xs px-2 py-0.5 rounded ${
                item.quality_summary.includes('통과')
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                  : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
              }`}>
                {item.quality_summary.includes('통과') ? '품질 통과' : '품질 확인 필요'}
              </span>
            )}
            {item.api_enabled && (
              <span className="text-xs bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded">API</span>
            )}
            {item.ai_ready && (
              <span className="text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded">AI-Ready</span>
            )}
          </div>
          {/* 탭 버튼 */}
          <div className="flex gap-1 mt-3 flex-wrap">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setModalTab(tab.key)}
                className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
                  modalTab === tab.key
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* 본문 (스크롤 가능) */}
        <div className="px-6 py-5 overflow-y-auto flex-1">
          {modalTab === 'overview' && (
            <div className="space-y-4">
              {item.description && (
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{item.description}</p>
              )}

              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-t pt-4">
                <div>
                  <dt className="text-xs text-gray-400 dark:text-gray-300">라이선스</dt>
                  <dd className="text-sm text-gray-800 dark:text-gray-200 font-medium mt-0.5">{item.license || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-400 dark:text-gray-300">데이터 규모</dt>
                  <dd className="text-sm text-gray-800 dark:text-gray-200 font-medium mt-0.5">
                    {item.rows != null ? `${item.rows.toLocaleString()}행` : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-400 dark:text-gray-300">최종 업데이트</dt>
                  <dd className="text-sm text-gray-800 dark:text-gray-200 font-medium mt-0.5">
                    {item.updated_at ? new Date(item.updated_at).toLocaleDateString('ko-KR') : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-400 dark:text-gray-300">데이터셋 ID</dt>
                  <dd className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-0.5 break-all">{item.dataset_id}</dd>
                </div>
                {item.keywords && (
                  <div className="col-span-2">
                    <dt className="text-xs text-gray-400 dark:text-gray-300">키워드</dt>
                    <dd className="flex flex-wrap gap-1 mt-0.5">
                      {item.keywords.split(',').map(k => k.trim()).filter(Boolean).map(k => (
                        <button
                          key={k}
                          onClick={() => { router.push(`/portal?q=${encodeURIComponent(k)}`); onClose() }}
                          className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 px-1.5 py-0.5 rounded"
                        >
                          {k}
                        </button>
                      ))}
                    </dd>
                  </div>
                )}
              </dl>

              {item.quality_summary && (
                <div className={`px-4 py-2.5 rounded-lg text-xs ${
                  item.quality_summary.includes('통과')
                    ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                    : 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300'
                }`}>
                  {item.quality_summary}
                </div>
              )}

              {/* 다운로드 + 액션 버튼 */}
              <div className="flex flex-wrap gap-2 pt-2">
                <a
                  href={`/api/catalog/${item.dataset_id}/download?format=csv`}
                  download
                  className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors flex items-center gap-1"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" /> CSV 다운로드
                </a>
                <a
                  href={`/api/catalog/${item.dataset_id}/download?format=json`}
                  download
                  className="px-3 py-1.5 text-xs bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors flex items-center gap-1"
                >
                  <FileJson className="w-3.5 h-3.5" /> JSON 다운로드
                </a>
                <button
                  onClick={() => { router.push(`/process?source_id=${encodeURIComponent(item.dataset_id)}`); onClose() }}
                  className="px-3 py-1.5 text-xs bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors flex items-center gap-1"
                >
                  <GitFork className="w-3.5 h-3.5" /> 가공 파이프라인에 추가
                </button>
                <button
                  onClick={() => { router.push(`/ai?q=${encodeURIComponent(item.title)}`); onClose() }}
                  className="px-3 py-1.5 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors flex items-center gap-1"
                >
                  <Bot className="w-3.5 h-3.5" /> AI로 질의
                </button>
              </div>

              {/* 관련 데이터셋 */}
              <div className="border-t pt-4">
                <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">같은 주제 데이터셋</p>
                {relatedLoading ? (
                  <p className="text-xs text-gray-400 dark:text-gray-300">불러오는 중...</p>
                ) : related.length === 0 ? (
                  <p className="text-xs text-gray-400 dark:text-gray-300">관련 데이터셋이 없습니다.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {related.map(r => (
                      <li key={r.dataset_id}>
                        <button
                          onClick={() => { router.push(`/portal?highlight=${encodeURIComponent(r.dataset_id)}`); onClose() }}
                          className="w-full text-left flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-950 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md text-xs group"
                        >
                          <span className="text-gray-700 dark:text-gray-300 truncate pr-2">{r.title}</span>
                          <ExternalLink className="w-3 h-3 text-gray-400 dark:text-gray-300 group-hover:text-gray-600 dark:group-hover:text-gray-400 flex-shrink-0" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {modalTab === 'preview' && (
            <DatasetPreview datasetId={item.dataset_id} />
          )}

          {modalTab === 'metadata' && (
            <div className="space-y-4">
              <dl className="grid grid-cols-1 gap-y-3 text-sm">
                {[
                  ['제목', item.title],
                  ['주제', item.theme],
                  ['포맷', item.format],
                  ['라이선스', item.license || '—'],
                  ['데이터셋 ID', item.dataset_id],
                  ['행 수', item.rows != null ? `${item.rows.toLocaleString()}행` : '—'],
                  ['최종 업데이트', item.updated_at ? new Date(item.updated_at).toLocaleString('ko-KR') : '—'],
                  ['개방 여부', item.is_open ? '개방' : '비개방'],
                  ['API 제공', item.api_enabled ? '제공' : '미제공'],
                  ['AI-Ready', item.ai_ready ? '충족' : '미충족'],
                  ['다운로드 수', `${(item.download_count ?? 0).toLocaleString()}회`],
                  ['품질 요약', item.quality_summary || '—'],
                ].map(([dt, dd]) => (
                  <div key={dt} className="flex border-b border-gray-100 pb-2 last:border-0">
                    <dt className="w-28 shrink-0 text-xs text-gray-400 dark:text-gray-300">{dt}</dt>
                    <dd className="text-sm text-gray-800 dark:text-gray-200 font-medium break-all">{dd}</dd>
                  </div>
                ))}
                {item.keywords && (
                  <div className="flex border-b border-gray-100 pb-2 last:border-0">
                    <dt className="w-28 shrink-0 text-xs text-gray-400 dark:text-gray-300">키워드</dt>
                    <dd className="flex flex-wrap gap-1">
                      {item.keywords.split(',').map(k => k.trim()).filter(Boolean).map(k => (
                        <button
                          key={k}
                          onClick={() => { router.push(`/portal?q=${encodeURIComponent(k)}`); onClose() }}
                          className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 px-1.5 py-0.5 rounded"
                        >
                          {k}
                        </button>
                      ))}
                    </dd>
                  </div>
                )}
              </dl>

              {/* AI 메타데이터 제안 */}
              <div className="border-t pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-gray-600 dark:text-gray-400">AI 메타데이터 제안</p>
                  <button
                    onClick={handleSuggestMeta}
                    disabled={suggestLoading}
                    className="px-3 py-1.5 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 transition-colors flex items-center gap-1"
                  >
                    {suggestLoading
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> 분석 중...</>
                      : <><Sparkles className="w-3.5 h-3.5" /> AI 제안 받기</>
                    }
                  </button>
                </div>

                {suggestError && (
                  <p className="text-xs text-red-500">{suggestError}</p>
                )}

                {metaForm && (
                  <div className="space-y-3 bg-purple-50 dark:bg-purple-950 rounded-lg p-4">
                    <p className="text-xs text-purple-600 dark:text-purple-400 font-medium">AI 제안 결과 — 수정 후 저장하세요</p>
                    <div className="space-y-2">
                      <div>
                        <label className="text-xs text-gray-500 dark:text-gray-400">제목</label>
                        <input
                          value={metaForm.title}
                          onChange={e => setMetaForm(f => f ? { ...f, title: e.target.value } : f)}
                          className="mt-0.5 w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 focus:outline-none focus:ring-1 focus:ring-purple-500"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 dark:text-gray-400">설명</label>
                        <textarea
                          value={metaForm.description}
                          onChange={e => setMetaForm(f => f ? { ...f, description: e.target.value } : f)}
                          rows={3}
                          className="mt-0.5 w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 focus:outline-none focus:ring-1 focus:ring-purple-500 resize-none"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 dark:text-gray-400">카테고리</label>
                        <input
                          value={metaForm.category}
                          onChange={e => setMetaForm(f => f ? { ...f, category: e.target.value } : f)}
                          className="mt-0.5 w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 focus:outline-none focus:ring-1 focus:ring-purple-500"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 dark:text-gray-400">키워드 (쉼표 구분)</label>
                        <input
                          value={metaForm.keywords.join(', ')}
                          onChange={e => setMetaForm(f => f ? { ...f, keywords: e.target.value.split(',').map(k => k.trim()).filter(Boolean) } : f)}
                          className="mt-0.5 w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 focus:outline-none focus:ring-1 focus:ring-purple-500"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={handleSaveMeta}
                        disabled={saveLoading}
                        className="px-4 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
                      >
                        {saveLoading ? '저장 중...' : '저장'}
                      </button>
                      <button
                        onClick={() => setMetaForm(null)}
                        className="px-4 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 transition-colors"
                      >
                        취소
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {modalTab === 'api' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                아래 예시는 <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">{item.dataset_id}</code> 데이터셋을 조회하는 방법입니다.
                API 키는 <b>개방 API 관리</b> 탭에서 발급받을 수 있습니다.
              </p>
              <CodeBlock label="cURL" code={apiCurl} lang="bash" />
              <CodeBlock label="JavaScript" code={apiJs} lang="javascript" />
              <CodeBlock label="Python" code={apiPython} lang="python" />
            </div>
          )}

          {modalTab === 'stats' && (
            <DatasetStats datasetId={item.dataset_id} />
          )}

          {modalTab === 'ai-ready' && (
            <div className="space-y-4">
              {aiLoading && (
                <div className="flex items-center justify-center py-10 gap-2 text-gray-400 dark:text-gray-300">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  AI-Ready 체크 중...
                </div>
              )}
              {aiError && (
                <div className="text-center py-8 text-red-500 text-sm">{aiError}</div>
              )}
              {aiData && (
                <>
                  {/* 종합 결과 뱃지 */}
                  <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
                    aiData.ai_ready
                      ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                      : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
                  }`}>
                    {aiData.ai_ready
                      ? <CheckCircle2 className="w-6 h-6 text-green-600 dark:text-green-400 flex-shrink-0" />
                      : <XCircle className="w-6 h-6 text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
                    }
                    <div>
                      <p className={`text-sm font-semibold ${aiData.ai_ready ? 'text-green-700 dark:text-green-300' : 'text-yellow-700 dark:text-yellow-300'}`}>
                        {aiData.ai_ready ? 'AI-Ready 충족' : 'AI-Ready 미충족'}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        8개 항목 중 {aiData.pass_count}개 통과
                      </p>
                    </div>
                    <div className="ml-auto">
                      <div className="text-2xl font-extrabold" style={{ color: aiData.ai_ready ? '#16a34a' : '#d97706' }}>
                        {aiData.pass_count}/{aiData.total}
                      </div>
                    </div>
                  </div>

                  {/* 체크리스트 항목 */}
                  <div className="space-y-2">
                    {aiData.checklist.map((c, i) => (
                      <div
                        key={i}
                        className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border ${
                          c.pass ? 'bg-white dark:bg-gray-900 border-green-100 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-800'
                        }`}
                      >
                        {c.pass
                          ? <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                          : <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                        }
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{c.name}</p>
                          {!c.pass && c.detail && (
                            <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{c.detail}</p>
                          )}
                          {c.pass && c.detail && (
                            <p className="text-xs text-gray-400 dark:text-gray-300 mt-0.5">{c.detail}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <p className="text-xs text-gray-400 dark:text-gray-300 border-t pt-3">
                    2026 데이터 관리 역량 평가편람 II. 개방 영역 ② AI친화·고가치 데이터 기준
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        <div className="px-6 pb-5 flex-shrink-0">
          <button
            onClick={onClose}
            className="w-full py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-950"
          >
            닫기
          </button>
        </div>
    </Modal>
  )
}
