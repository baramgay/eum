'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Search, BarChart2, Table2, HelpCircle, ExternalLink } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell,
  ResponsiveContainer, CartesianGrid, LabelList
} from 'recharts'

interface QueryResult {
  intent: string | null
  sigun?: string | null
  columns: string[]
  rows: Record<string, unknown>[]
  hint?: string
  source?: string
  source_url?: string
}

const EXAMPLES = [
  { label: '정착잠재 순위',   q: '청년 정착잠재 순위 보여줘' },
  { label: '창원시 사업체',   q: '창원시 사업체 현황' },
  { label: '거창 청년인구',   q: '거창군 청년 인구 유입 현황' },
  { label: '소득 높은 시군',  q: '소득 높은 시군 순위' },
  { label: '거제 청년센터',   q: '거제시 청년센터' },
  { label: '경남 제조업',     q: '경남 제조업 사업체 현황' },
  { label: '인구 유입 순위',  q: '청년 인구 유입이 많은 시군' },
]

const BAR_COLORS = [
  '#4F46E5','#0891B2','#059669','#D97706','#DC2626',
  '#7C3AED','#BE185D','#0D9488','#B45309','#1D4ED8',
  '#6D28D9','#047857','#9D174D','#1E40AF','#065F46',
  '#7E22CE','#991B1B','#1E3A8A',
]

function toNumber(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v === 'string') return Number(v.replace(/[^0-9.-]/g, '')) || 0
  return 0
}

function isNumericCol(col: string, rows: Record<string, unknown>[]): boolean {
  const LABEL_COLS = ['sigun', '시군명', 'sigun_nm', 'name', 'ftype', 'industry', 'status', '시설유형', '시군구분']
  if (LABEL_COLS.some(l => col.toLowerCase().includes(l.toLowerCase()))) return false
  const sample = rows.slice(0, 10).map(r => r[col])
  const nonEmpty = sample.filter(v => v != null && v !== '')
  return nonEmpty.length > 0 && nonEmpty.every(v =>
    typeof v === 'number' || (typeof v === 'string' && !isNaN(Number(String(v).replace(/[^0-9.-]/g, ''))))
  )
}

function getLabelCol(columns: string[]): string {
  const LABEL_PRIORITY = ['sigun', '시군명', 'sigun_nm', 'name', 'industry', 'ftype', '시설유형']
  return columns.find(c => LABEL_PRIORITY.some(l => c.toLowerCase().includes(l.toLowerCase()))) ?? columns[0]
}

function formatValue(v: unknown): string {
  if (v == null) return '—'
  const str = String(v)
  const n = typeof v === 'number' ? v : Number(str.replace(/[^0-9.-]/g, ''))
  if (!isNaN(n) && str.replace(/[^0-9.-]/g, '') !== '' && typeof v === 'number') {
    return n >= 10000 ? `${(n / 10000).toFixed(1)}만` : n.toLocaleString()
  }
  return str
}

export default function AiQueryClient() {
  const searchParams = useSearchParams()
  const [query, setQuery]       = useState('')
  const [result, setResult]     = useState<QueryResult | null>(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [viewMode, setViewMode] = useState<'table'|'chart'>('table')
  const [chartCol, setChartCol] = useState('')
  const [showExamples, setShowExamples] = useState(true)

  useEffect(() => {
    const q = searchParams.get('q')
    if (q) { setQuery(q); ask(q) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function ask(q: string) {
    if (!q.trim()) return
    setLoading(true); setError(''); setResult(null); setShowExamples(false)
    try {
      const r = await fetch(`/api/nlquery?q=${encodeURIComponent(q)}`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const d: QueryResult = await r.json()
      setResult(d)
      const numCols = d.columns.filter(c => isNumericCol(c, d.rows))
      if (numCols.length > 0) { setChartCol(numCols[0]); setViewMode('chart') }
      else setViewMode('table')
    } catch (e) {
      setError(e instanceof Error ? e.message : '질의 처리 중 오류가 발생했습니다.')
    } finally { setLoading(false) }
  }

  const numericCols = result ? result.columns.filter(c => isNumericCol(c, result.rows)) : []
  const labelCol = result ? getLabelCol(result.columns) : ''

  const chartData = result?.rows.slice(0, 18).map(r => ({
    name: String(r[labelCol] ?? '').slice(0, 4),
    v: toNumber(r[chartCol]),
    full: r[labelCol],
  })) ?? []

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-gray-800">AI 자연어 질의</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          경남 청년·사업체·인프라 데이터를 자연어로 질의 · 룰 기반 의도 매칭 (오프라인 동작)
        </p>
      </div>

      {/* 입력 */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && ask(query)}
            placeholder="예: 청년 정착잠재 순위 보여줘"
            className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          onClick={() => ask(query)}
          disabled={loading || !query.trim()}
          className="px-5 py-2.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50 font-medium"
        >
          {loading ? (
            <span className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              처리 중
            </span>
          ) : '질문'}
        </button>
        <button
          onClick={() => setShowExamples(p => !p)}
          className="px-3 py-2.5 border rounded-md text-gray-500 hover:bg-gray-50"
          title="예제 질의"
        >
          <HelpCircle className="w-4 h-4" />
        </button>
      </div>

      {/* 예제 버튼 */}
      {showExamples && (
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map(ex => (
            <button
              key={ex.q}
              onClick={() => { setQuery(ex.q); ask(ex.q) }}
              className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs rounded-full hover:bg-blue-50 hover:text-blue-700 transition-colors"
            >
              {ex.label}
            </button>
          ))}
        </div>
      )}

      {/* 에러 */}
      {error && (
        <div className="bg-red-50 text-red-700 text-sm px-4 py-2.5 rounded-md border border-red-200">
          {error}
        </div>
      )}

      {/* 결과 */}
      {result && (
        <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
          {/* 결과 헤더 */}
          <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              {result.intent && (
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                  {result.intent}
                </span>
              )}
              {result.sigun && (
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                  {result.sigun}
                </span>
              )}
              <span className="text-xs text-gray-400">{result.rows.length}개 결과</span>
            </div>
            {numericCols.length > 0 && (
              <div className="flex items-center gap-2">
                {numericCols.length > 1 && (
                  <select
                    value={chartCol}
                    onChange={e => setChartCol(e.target.value)}
                    className="text-xs border rounded px-2 py-1 text-gray-600 bg-white"
                  >
                    {numericCols.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                )}
                <div className="flex rounded border overflow-hidden">
                  <button
                    onClick={() => setViewMode('table')}
                    className={`flex items-center gap-1 px-2.5 py-1 text-xs ${
                      viewMode === 'table' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <Table2 className="w-3.5 h-3.5" /> 표
                  </button>
                  <button
                    onClick={() => setViewMode('chart')}
                    className={`flex items-center gap-1 px-2.5 py-1 text-xs ${
                      viewMode === 'chart' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <BarChart2 className="w-3.5 h-3.5" /> 차트
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 힌트 */}
          {result.hint && (
            <div className="px-4 py-2 text-sm text-amber-700 bg-amber-50 border-b">
              {result.hint}
            </div>
          )}

          {/* 본문 */}
          {result.rows.length === 0 ? (
            <div className="px-4 py-10 text-center text-gray-400 text-sm">결과 없음</div>
          ) : viewMode === 'chart' && chartCol ? (
            <div className="p-4">
              <p className="text-xs text-gray-400 mb-3">{chartCol}</p>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={chartData} margin={{ top: 16, right: 20, left: 10, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={v => v >= 10000 ? `${(v / 10000).toFixed(0)}만` : v.toLocaleString()}
                  />
                  <Tooltip
                    formatter={(v: unknown) => [Number(v).toLocaleString(), chartCol]}
                    labelFormatter={(_, payload) => String(payload?.[0]?.payload?.full ?? '')}
                  />
                  <Bar dataKey="v" radius={[4, 4, 0, 0]}>
                    <LabelList
                      dataKey="v"
                      position="top"
                      style={{ fontSize: 10, fill: '#6b7280' }}
                      formatter={(v: unknown) => {
                        const n = Number(v)
                        return n >= 10000 ? `${(n / 10000).toFixed(1)}만` : n.toLocaleString()
                      }}
                    />
                    {chartData.map((_, i) => (
                      <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {result.columns.map(c => (
                      <th key={c} className="px-4 py-2 text-left text-gray-600 font-medium text-xs whitespace-nowrap">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {result.rows.map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      {result.columns.map(c => (
                        <td key={c} className="px-4 py-2 text-gray-700 text-sm whitespace-nowrap">
                          {formatValue(row[c])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 출처 */}
          {result.source && (
            <div className="px-4 py-2 bg-gray-50 border-t flex items-center gap-2">
              <span className="text-xs text-gray-400">출처:</span>
              {result.source_url ? (
                <a
                  href={result.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline"
                >
                  {result.source}
                  <ExternalLink className="w-3 h-3" />
                </a>
              ) : (
                <span className="text-xs text-gray-500">{result.source}</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
