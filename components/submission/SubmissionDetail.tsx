'use client'

import { useEffect, useState } from 'react'

interface SubmissionMeta {
  submission_id: string; tenant_id: string; title: string
  description: string | null; theme: string | null; keywords: string | null
  license: string | null; format: string | null; table_name: string
  rows: number; status: string; quality_summary: string | null
  decision_note: string | null; submitted_at: string; decided_at: string | null
}

interface Comment {
  comment_id: string; submission_id: string
  comment: string; created_at: string
}

interface DetailData {
  meta: SubmissionMeta
  preview: Record<string, unknown>[]
  comments: Comment[]
}

interface Props {
  submissionId: string
  role: string
  onClose: () => void
  onDecisionComplete: () => void
}

const STATUS_LABEL: Record<string, string> = {
  submitted: '검토 대기', review: '검토 중', approved: '승인', rejected: '반려',
}
const STATUS_COLOR: Record<string, string> = {
  submitted: 'bg-yellow-100 text-yellow-700',
  review:    'bg-blue-100 text-blue-700',
  approved:  'bg-green-100 text-green-700',
  rejected:  'bg-red-100 text-red-700',
}

type Tab = 'info' | 'preview' | 'comments'

export default function SubmissionDetail({ submissionId, role, onClose, onDecisionComplete }: Props) {
  const [detail, setDetail]       = useState<DetailData | null>(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [note, setNote]           = useState('')
  const [comment, setComment]     = useState('')
  const [activeTab, setActiveTab] = useState<Tab>('info')

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch(`/api/submission/${submissionId}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); setLoading(false); return }
        setDetail(d)
        setNote(d.meta.decision_note ?? '')
        setLoading(false)
      })
      .catch(() => { setError('데이터를 불러오는 중 오류가 발생했습니다.'); setLoading(false) })
  }, [submissionId])

  async function decide(status: 'approved' | 'rejected' | 'review') {
    setSubmitting(true)
    const r = await fetch(`/api/submission/${submissionId}/decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, decision_note: note }),
    })
    setSubmitting(false)
    if (r.ok) {
      onDecisionComplete()
    } else {
      const d = await r.json()
      setError(d.error ?? '처리 중 오류가 발생했습니다.')
    }
  }

  async function addComment() {
    if (!comment.trim()) return
    setSubmitting(true)
    const r = await fetch(`/api/submission/${submissionId}/comment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment: comment.trim() }),
    })
    setSubmitting(false)
    if (r.ok && detail) {
      const newComment: Comment = {
        comment_id:    crypto.randomUUID(),
        submission_id: submissionId,
        comment:       comment.trim(),
        created_at:    new Date().toISOString(),
      }
      setDetail({ ...detail, comments: [...detail.comments, newComment] })
      setComment('')
    }
  }

  const previewCols = detail?.preview?.length
    ? Object.keys(detail.preview[0]).slice(0, 8)
    : []

  return (
    <div className="fixed inset-0 z-40">
      {/* 오버레이 */}
      <button
        type="button"
        aria-label="상세 패널 닫기"
        className="fixed inset-0 bg-black/40"
        onClick={onClose}
      />

      {/* 슬라이드오버 패널 */}
      <div className="fixed right-0 top-0 h-full w-full max-w-2xl bg-white dark:bg-gray-900 shadow-xl flex flex-col z-50">
        {/* 헤더 */}
        <div className="px-5 py-4 border-b bg-gray-50 dark:bg-gray-950 flex items-start justify-between shrink-0">
          <div>
            {loading ? (
              <div className="h-5 w-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            ) : detail ? (
              <>
                <h3 className="font-semibold text-gray-800 dark:text-gray-200 text-base leading-snug">{detail.meta.title}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLOR[detail.meta.status] ?? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}>
                    {STATUS_LABEL[detail.meta.status] ?? detail.meta.status}
                  </span>
                  <span className="text-xs text-gray-400 dark:text-gray-300 font-mono">{detail.meta.tenant_id}</span>
                </div>
              </>
            ) : null}
          </div>
          <button onClick={onClose} className="text-gray-400 dark:text-gray-300 hover:text-gray-600 dark:hover:text-gray-400 text-xl leading-none p-1 -mt-1">×</button>
        </div>

        {/* 탭바 */}
        <div className="flex border-b shrink-0 bg-white dark:bg-gray-900">
          {(['info', 'preview', 'comments'] as Tab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {tab === 'info' ? '기본 정보' : tab === 'preview' ? '데이터 미리보기' : `코멘트 ${detail ? `(${detail.comments.length})` : ''}`}
            </button>
          ))}
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center h-40 text-gray-400 dark:text-gray-300">로딩 중...</div>
          )}

          {error && (
            <div className="m-5 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
          )}

          {!loading && detail && (
            <>
              {/* 기본 정보 탭 */}
              {activeTab === 'info' && (
                <div className="p-5 space-y-5">
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
                    {[
                      ['데이터셋 ID', detail.meta.submission_id],
                      ['기관 코드',   detail.meta.tenant_id],
                      ['주제',       detail.meta.theme ?? '—'],
                      ['포맷',       detail.meta.format ?? '—'],
                      ['행 수',      `${detail.meta.rows.toLocaleString()}행`],
                      ['라이선스',   detail.meta.license ?? '—'],
                      ['등록일',     new Date(detail.meta.submitted_at).toLocaleString('ko-KR')],
                      ['결정일',     detail.meta.decided_at ? new Date(detail.meta.decided_at).toLocaleString('ko-KR') : '—'],
                    ].map(([dt, dd]) => (
                      <div key={dt}>
                        <dt className="text-xs text-gray-400 dark:text-gray-300">{dt}</dt>
                        <dd className="text-sm text-gray-800 dark:text-gray-200 font-medium mt-0.5 break-all">{dd}</dd>
                      </div>
                    ))}
                  </dl>

                  {detail.meta.description && (
                    <div>
                      <p className="text-xs text-gray-400 dark:text-gray-300 mb-1">설명</p>
                      <p className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-950 rounded p-3">{detail.meta.description}</p>
                    </div>
                  )}

                  {detail.meta.quality_summary && (
                    <div className={`px-4 py-3 rounded-lg border text-sm ${
                      detail.meta.quality_summary.includes('통과')
                        ? 'bg-green-50 border-green-200 text-green-800'
                        : 'bg-yellow-50 border-yellow-200 text-yellow-800'
                    }`}>
                      <span className="font-medium">품질 요약: </span>{detail.meta.quality_summary}
                    </div>
                  )}

                  {/* 센터 심사 패널 */}
                  {role === 'center' && (
                    <div className="border rounded-lg p-4 space-y-3 bg-gray-50 dark:bg-gray-950">
                      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">심사 처리</h4>
                      <div>
                        <label htmlFor="review-note" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">결정 메모 (사유)</label>
                        <textarea
                          id="review-note"
                          value={note}
                          onChange={e => setNote(e.target.value)}
                          rows={3}
                          placeholder="승인 또는 반려 사유를 입력하세요..."
                          className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => decide('approved')} disabled={submitting}
                          className="flex-1 py-2 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 disabled:opacity-50 font-medium"
                        >
                          승인
                        </button>
                        <button
                          onClick={() => decide('review')} disabled={submitting}
                          className="flex-1 py-2 bg-yellow-500 text-white text-sm rounded-md hover:bg-yellow-600 disabled:opacity-50 font-medium"
                        >
                          검토 중
                        </button>
                        <button
                          onClick={() => decide('rejected')} disabled={submitting}
                          className="flex-1 py-2 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 disabled:opacity-50 font-medium"
                        >
                          반려
                        </button>
                      </div>
                      {detail.meta.decision_note && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">현재 결정 메모: {detail.meta.decision_note}</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* 데이터 미리보기 탭 */}
              {activeTab === 'preview' && (
                <div className="p-5">
                  {detail.preview.length === 0 ? (
                    <div className="text-center py-12 text-gray-400 dark:text-gray-300">업로드된 파일이 없습니다.</div>
                  ) : (
                    <>
                      <p className="text-xs text-gray-400 dark:text-gray-300 mb-3">
                        최대 20행 · {previewCols.length}개 컬럼{Object.keys(detail.preview[0]).length > 8 ? ` (전체 ${Object.keys(detail.preview[0]).length}개 중 8개 표시)` : ''}
                      </p>
                      <div className="overflow-x-auto border rounded-lg">
                        <table className="w-full text-xs">
                          <thead className="bg-gray-50 dark:bg-gray-950">
                            <tr>
                              {previewCols.map(c => (
                                <th key={c} className="px-3 py-2 text-left text-gray-600 dark:text-gray-400 font-medium whitespace-nowrap">{c}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {detail.preview.slice(0, 20).map((row, i) => (
                              <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-950">
                                {previewCols.map(c => (
                                  <td key={c} className="px-3 py-1.5 text-gray-700 dark:text-gray-300 font-mono whitespace-nowrap">
                                    {row[c] != null ? String(row[c]) : <span className="text-gray-300 dark:text-gray-200">null</span>}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* 코멘트 탭 */}
              {activeTab === 'comments' && (
                <div className="p-5 space-y-4">
                  {detail.comments.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 dark:text-gray-300 text-sm">코멘트가 없습니다.</div>
                  ) : (
                    <div className="space-y-3">
                      {detail.comments.map(c => (
                        <div key={c.comment_id} className="bg-gray-50 dark:bg-gray-950 rounded-lg px-4 py-3 border">
                          <p className="text-sm text-gray-800 dark:text-gray-200">{c.comment}</p>
                          <p className="text-xs text-gray-400 dark:text-gray-300 mt-1.5">
                            {new Date(c.created_at).toLocaleString('ko-KR')}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {role === 'center' && (
                    <div className="border-t pt-4 space-y-2">
                      <label htmlFor="new-comment" className="block text-xs font-medium text-gray-600 dark:text-gray-400">새 코멘트</label>
                      <textarea
                        id="new-comment"
                        value={comment}
                        onChange={e => setComment(e.target.value)}
                        rows={3}
                        placeholder="컨설팅 의견을 입력하세요..."
                        className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        onClick={addComment}
                        disabled={submitting || !comment.trim()}
                        className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
                      >
                        {submitting ? '등록 중...' : '코멘트 등록'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
