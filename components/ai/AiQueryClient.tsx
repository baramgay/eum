'use client'

import { useState } from 'react'

interface QueryResult {
  intent: string; sigun?: string
  columns: string[]; rows: Record<string, unknown>[]
  hint?: string
}

const EXAMPLE_QUERIES = [
  '창원시 청년 인구는?',
  '고용률이 높은 시군은?',
  '공공시설이 많은 지역은?',
]

export default function AiQueryClient() {
  const [query, setQuery]     = useState('')
  const [result, setResult]   = useState<QueryResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  async function ask(q: string) {
    if (!q.trim()) return
    setLoading(true); setError(''); setResult(null)
    const r = await fetch(`/api/nlquery?q=${encodeURIComponent(q.trim())}`)
    if (!r.ok) { setError('질의 처리 중 오류가 발생했습니다.'); setLoading(false); return }
    setResult(await r.json())
    setLoading(false)
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-gray-800">AI 자연어 질의</h2>
        <p className="text-sm text-gray-500 mt-0.5">경남 데이터에 대해 자연어로 질문하세요.</p>
      </div>

      <div className="bg-white rounded-lg border p-4 shadow-sm space-y-3">
        <div className="flex gap-2">
          <input
            value={query} onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && ask(query)}
            placeholder="예: 창원시 청년 인구는?"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={() => ask(query)} disabled={loading || !query.trim()}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? '...' : '질문'}
          </button>
        </div>
        <div className="flex gap-2 flex-wrap">
          {EXAMPLE_QUERIES.map(q => (
            <button key={q} onClick={() => { setQuery(q); ask(q) }}
              className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200">
              {q}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="bg-red-50 text-red-700 text-sm px-4 py-2 rounded border border-red-200">{error}</div>}

      {result && (
        <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b flex items-center gap-3">
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{result.intent}</span>
            {result.sigun && <span className="text-xs text-gray-500">지역: {result.sigun}</span>}
          </div>
          {result.hint && <div className="px-4 py-2 text-sm text-amber-700 bg-amber-50 border-b">{result.hint}</div>}
          {result.rows.length === 0 ? (
            <div className="px-4 py-6 text-center text-gray-400 text-sm">결과 없음</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>{result.columns.map(c => <th key={c} className="px-4 py-2 text-left text-gray-600 font-medium">{c}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {result.rows.slice(0, 50).map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      {result.columns.map(c => (
                        <td key={c} className="px-4 py-2 text-gray-700">
                          {row[c] != null ? String(row[c]) : '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
