'use client'

import { useEffect, useState } from 'react'
import DatasetStats from './DatasetStats'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'

interface CatalogItem {
  dataset_id: string; title: string; theme: string; format: string; license: string
  quality_summary: string | null; description: string | null
  updated_at: string | null; rows: number | null
  keywords?: string | null; is_open?: boolean; api_enabled?: boolean
}

interface AiCheckItem { name: string; pass: boolean; detail: string }
interface AiReadyResult {
  ai_ready: boolean; pass_count: number; total: number; checklist: AiCheckItem[]
}

interface Props {
  item: CatalogItem
  onClose: () => void
}

export default function DatasetModal({ item, onClose }: Props) {
  const [modalTab, setModalTab] = useState<'info' | 'stats' | 'ai-ready'>('info')
  const [aiData, setAiData]     = useState<AiReadyResult | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError]   = useState<string | null>(null)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

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

  const TABS = [
    { key: 'info',     label: '정보' },
    { key: 'stats',    label: '통계' },
    { key: 'ai-ready', label: 'AI-Ready' },
  ] as const

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      {/* 오버레이 */}
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />

      {/* 모달 카드 */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg z-50 max-h-[90vh] flex flex-col">
        {/* 헤더 */}
        <div className="px-6 pt-5 pb-3 border-b flex-shrink-0">
          <button
            onClick={onClose}
            className="absolute right-4 top-4 text-gray-400 hover:text-gray-600 text-xl leading-none"
          >×</button>
          <h3 className="font-semibold text-gray-800 text-base pr-6">{item.title}</h3>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{item.theme}</span>
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{item.format}</span>
            {item.quality_summary && (
              <span className={`text-xs px-2 py-0.5 rounded ${
                item.quality_summary.includes('통과')
                  ? 'bg-green-100 text-green-700'
                  : 'bg-yellow-100 text-yellow-700'
              }`}>
                {item.quality_summary.includes('통과') ? '품질 통과' : '품질 확인 필요'}
              </span>
            )}
            {item.api_enabled && (
              <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">API</span>
            )}
          </div>
          {/* 탭 버튼 */}
          <div className="flex gap-1 mt-3">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setModalTab(tab.key)}
                className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
                  modalTab === tab.key
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* 본문 (스크롤 가능) */}
        <div className="px-6 py-5 overflow-y-auto flex-1">
          {modalTab === 'info' && (
            <div className="space-y-4">
              {item.description && (
                <p className="text-sm text-gray-600 leading-relaxed">{item.description}</p>
              )}

              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-t pt-4">
                <div>
                  <dt className="text-xs text-gray-400">라이선스</dt>
                  <dd className="text-sm text-gray-800 font-medium mt-0.5">{item.license || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-400">데이터 규모</dt>
                  <dd className="text-sm text-gray-800 font-medium mt-0.5">
                    {item.rows != null ? `${item.rows.toLocaleString()}행` : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-400">최종 업데이트</dt>
                  <dd className="text-sm text-gray-800 font-medium mt-0.5">
                    {item.updated_at ? new Date(item.updated_at).toLocaleDateString('ko-KR') : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-400">데이터셋 ID</dt>
                  <dd className="text-xs text-gray-500 font-mono mt-0.5 break-all">{item.dataset_id}</dd>
                </div>
                {item.keywords && (
                  <div className="col-span-2">
                    <dt className="text-xs text-gray-400">키워드</dt>
                    <dd className="flex flex-wrap gap-1 mt-0.5">
                      {item.keywords.split(',').map(k => k.trim()).filter(Boolean).map(k => (
                        <span key={k} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{k}</span>
                      ))}
                    </dd>
                  </div>
                )}
              </dl>

              {item.quality_summary && (
                <div className={`px-4 py-2.5 rounded-lg text-xs ${
                  item.quality_summary.includes('통과')
                    ? 'bg-green-50 text-green-700'
                    : 'bg-yellow-50 text-yellow-700'
                }`}>
                  {item.quality_summary}
                </div>
              )}

              {/* 다운로드 버튼 */}
              <div className="flex gap-2 pt-2">
                <a
                  href={`/api/catalog/${item.dataset_id}/download?format=csv`}
                  download
                  className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                >
                  CSV 다운로드
                </a>
                <a
                  href={`/api/catalog/${item.dataset_id}/download?format=json`}
                  download
                  className="px-3 py-1.5 text-xs bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
                >
                  JSON 다운로드
                </a>
              </div>
            </div>
          )}

          {modalTab === 'stats' && (
            <DatasetStats datasetId={item.dataset_id} />
          )}

          {modalTab === 'ai-ready' && (
            <div className="space-y-4">
              {aiLoading && (
                <div className="flex items-center justify-center py-10 gap-2 text-gray-400">
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
                      ? 'bg-green-50 border-green-200'
                      : 'bg-yellow-50 border-yellow-200'
                  }`}>
                    {aiData.ai_ready
                      ? <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0" />
                      : <XCircle className="w-6 h-6 text-yellow-600 flex-shrink-0" />
                    }
                    <div>
                      <p className={`text-sm font-semibold ${aiData.ai_ready ? 'text-green-700' : 'text-yellow-700'}`}>
                        {aiData.ai_ready ? 'AI-Ready 충족' : 'AI-Ready 미충족'}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
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
                          c.pass ? 'bg-white border-green-100' : 'bg-red-50 border-red-100'
                        }`}
                      >
                        {c.pass
                          ? <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                          : <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                        }
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800">{c.name}</p>
                          {!c.pass && c.detail && (
                            <p className="text-xs text-red-600 mt-0.5">{c.detail}</p>
                          )}
                          {c.pass && c.detail && (
                            <p className="text-xs text-gray-400 mt-0.5">{c.detail}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <p className="text-xs text-gray-400 border-t pt-3">
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
            className="w-full py-2 border border-gray-300 rounded-md text-sm text-gray-600 hover:bg-gray-50"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}
