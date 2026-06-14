'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Search, BarChart2, Table2, HelpCircle, ExternalLink,
  MessageSquare, Plus, Trash2, Download, Share2, Copy, Check,
  History, Sparkles, Send, MoreVertical, ChevronLeft,
} from 'lucide-react'
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

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  query?: string
  result?: QueryResult
  text?: string
  createdAt: number
}

interface Conversation {
  id: string
  title: string
  messages: ChatMessage[]
  updatedAt: number
}

const STORAGE_KEY = 'eum-ai-conversations'

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

function genId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

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

function buildTitle(query: string): string {
  const trimmed = query.trim()
  return trimmed.length > 22 ? trimmed.slice(0, 22) + '…' : trimmed
}

function exportMarkdown(conv: Conversation): string {
  const date = new Date(conv.updatedAt).toLocaleString('ko-KR')
  let md = `# ${conv.title}\n\n`
  md += `_대화 날짜: ${date}_\n\n`
  conv.messages.forEach(m => {
    if (m.role === 'user') {
      md += `## 질문\n${m.query ?? ''}\n\n`
    } else if (m.result) {
      md += `### 응답 요약\n`
      md += `- 의도: ${m.result.intent ?? '-'}\n`
      md += `- 결과 수: ${m.result.rows.length}행\n`
      if (m.result.source) md += `- 출처: ${m.result.source}\n`
      md += `\n`
      md += `| ${m.result.columns.join(' | ')} |\n`
      md += `| ${m.result.columns.map(() => '---').join(' | ')} |\n`
      m.result.rows.forEach(r => {
        md += `| ${m.result!.columns.map(c => String(r[c] ?? '')).join(' | ')} |\n`
      })
      md += `\n`
    } else if (m.text) {
      md += `> ${m.text}\n\n`
    }
  })
  return md
}

function exportJson(conv: Conversation): string {
  return JSON.stringify(conv, null, 2)
}

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function ResultCard({ message, isLatest }: { message: ChatMessage; isLatest?: boolean }) {
  const result = message.result
  const [viewMode, setViewMode] = useState<'table'|'chart'>('table')
  const [chartCol, setChartCol] = useState('')

  useEffect(() => {
    if (!result) return
    const numCols = result.columns.filter(c => isNumericCol(c, result.rows))
    if (numCols.length > 0) {
      setChartCol(numCols[0])
      setViewMode('chart')
    } else {
      setViewMode('table')
    }
  }, [result])

  if (!result) {
    return (
      <div className="bg-white rounded-lg border shadow-sm px-4 py-3 text-sm text-gray-600">
        {message.text ?? '응답을 받지 못했습니다.'}
      </div>
    )
  }

  const numericCols = result.columns.filter(c => isNumericCol(c, result.rows))
  const labelCol = getLabelCol(result.columns)
  const chartData = result.rows.slice(0, 18).map(r => ({
    name: String(r[labelCol] ?? '').slice(0, 4),
    v: toNumber(r[chartCol]),
    full: r[labelCol],
  }))

  return (
    <div className={`bg-white rounded-lg border shadow-sm overflow-hidden ${isLatest ? 'ring-1 ring-blue-100' : ''}`}>
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

      {result.hint && (
        <div className="px-4 py-2 text-sm text-amber-700 bg-amber-50 border-b">
          {result.hint}
        </div>
      )}

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
                tickFormatter={v => typeof v === 'number' && v >= 10000 ? `${(v / 10000).toFixed(0)}만` : String(v)}
              />
              <Tooltip
                formatter={(v: unknown) => [Number(v).toLocaleString(), chartCol]}
                labelFormatter={(_, payload) => String((payload?.[0]?.payload as { full?: unknown })?.full ?? '')}
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
        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0">
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
  )
}

export default function AiQueryClient() {
  const searchParams = useSearchParams()
  const scrollRef = useRef<HTMLDivElement>(null)

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showExamples, setShowExamples] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [copiedShare, setCopiedShare] = useState(false)

  const currentConv = useMemo(
    () => conversations.find(c => c.id === currentId) ?? null,
    [conversations, currentId]
  )

  // load from localStorage
  useEffect(() => {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null
      if (raw) {
        const parsed: Conversation[] = JSON.parse(raw)
        if (Array.isArray(parsed) && parsed.length > 0) {
          setConversations(parsed)
          setCurrentId(parsed[0].id)
          return
        }
      }
    } catch {
      // ignore corrupt storage
    }
    createNewConversation()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // persist
  useEffect(() => {
    if (typeof window !== 'undefined' && conversations.length > 0) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations))
    }
  }, [conversations])

  // handle URL shared query
  useEffect(() => {
    const q = searchParams?.get('q')
    if (q) {
      const active = conversations.find(c => c.id === currentId)
      if (!active || active.messages.length > 0) {
        createNewConversation(buildTitle(q))
      }
      setQuery(q)
      ask(q)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // auto scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [currentConv?.messages, loading])

  function createNewConversation(title = '새 대화') {
    const id = genId()
    const conv: Conversation = { id, title, messages: [], updatedAt: Date.now() }
    setConversations(prev => [conv, ...prev])
    setCurrentId(id)
    setQuery('')
    setError('')
    setShowExamples(true)
    return id
  }

  function switchConversation(id: string) {
    setCurrentId(id)
    setQuery('')
    setError('')
  }

  function deleteConversation(id: string) {
    setConversations(prev => {
      const next = prev.filter(c => c.id !== id)
      if (currentId === id) {
        if (next.length > 0) {
          setCurrentId(next[0].id)
        } else {
          createNewConversation()
        }
      }
      return next
    })
  }

  function addMessage(message: ChatMessage) {
    setConversations(prev => prev.map(c => {
      if (c.id !== currentId) return c
      const messages = [...c.messages, message]
      const title = c.title === '새 대화' && message.role === 'user' && message.query
        ? buildTitle(message.query)
        : c.title
      return { ...c, title, messages, updatedAt: Date.now() }
    }))
  }

  async function ask(q: string) {
    if (!q.trim()) return
    if (!currentId) createNewConversation(buildTitle(q))
    setLoading(true); setError(''); setShowExamples(false)

    const userMsg: ChatMessage = { id: genId(), role: 'user', query: q, createdAt: Date.now() }
    addMessage(userMsg)

    try {
      const r = await fetch(`/api/nlquery?q=${encodeURIComponent(q)}`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const d: QueryResult = await r.json()
      const assistantMsg: ChatMessage = { id: genId(), role: 'assistant', result: d, createdAt: Date.now() }
      addMessage(assistantMsg)
    } catch (e) {
      setError(e instanceof Error ? e.message : '질의 처리 중 오류가 발생했습니다.')
      const failMsg: ChatMessage = {
        id: genId(), role: 'assistant',
        text: e instanceof Error ? e.message : '질의 처리 중 오류가 발생했습니다.',
        createdAt: Date.now()
      }
      addMessage(failMsg)
    } finally {
      setLoading(false)
      setQuery('')
    }
  }

  function handleExport(format: 'markdown' | 'json') {
    if (!currentConv) return
    const date = new Date().toISOString().slice(0, 10)
    if (format === 'markdown') {
      download(`eum-ai-${date}.md`, exportMarkdown(currentConv), 'text/markdown')
    } else {
      download(`eum-ai-${date}.json`, exportJson(currentConv), 'application/json')
    }
  }

  async function handleShare() {
    if (!currentConv) return
    const firstUserQuery = currentConv.messages.find(m => m.role === 'user')?.query
    const url = new URL(window.location.href)
    url.search = firstUserQuery ? `?q=${encodeURIComponent(firstUserQuery)}` : ''
    try {
      await navigator.clipboard.writeText(url.toString())
      setCopiedShare(true)
      setTimeout(() => setCopiedShare(false), 1500)
    } catch {
      // ignore
    }
  }

  const messages = currentConv?.messages ?? []

  return (
    <div className="flex h-[calc(100vh-140px)] min-h-[560px] gap-4">
      {/* 사이드바 */}
      <aside
        className={`${sidebarOpen ? 'w-64' : 'w-0 opacity-0'} transition-all duration-300 flex flex-col bg-white border rounded-lg shadow-sm overflow-hidden`}
      >
        <div className="p-3 border-b">
          <button
            onClick={() => createNewConversation()}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" /> 새 대화
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {conversations.map(conv => (
            <div
              key={conv.id}
              onClick={() => switchConversation(conv.id)}
              className={`group flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer text-sm ${
                conv.id === currentId ? 'bg-blue-50 text-blue-800' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <MessageSquare className="w-4 h-4 shrink-0 opacity-60" />
              <span className="truncate flex-1">{conv.title}</span>
              <button
                onClick={e => { e.stopPropagation(); deleteConversation(conv.id) }}
                className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-600 transition-opacity"
                title="삭제"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
        <div className="p-3 border-t text-xs text-gray-400 flex items-center gap-1.5">
          <History className="w-3.5 h-3.5" />
          {conversations.length}개 대화 저장됨
        </div>
      </aside>

      {/* 메인 채팅 영역 */}
      <div className="flex-1 flex flex-col bg-white border rounded-lg shadow-sm overflow-hidden">
        {/* 헤더 */}
        <div className="px-4 py-3 border-b flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(o => !o)}
            className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-md"
            title="대화 목록"
          >
            {sidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <History className="w-4 h-4" />}
          </button>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-800">AI 자연어 질의</h2>
            <p className="text-xs text-gray-500">
              경남 청년·사업체·인프라 데이터를 자연어로 질의 · 룰 기반 의도 매칭
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleShare}
              className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-600 border rounded-md hover:bg-gray-50"
              title="대화 링크 복사"
            >
              {copiedShare ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Share2 className="w-3.5 h-3.5" />}
              {copiedShare ? '복사됨' : '공유'}
            </button>
            <div className="relative group">
              <button
                className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-600 border rounded-md hover:bg-gray-50"
                title="대화 내용 저장"
              >
                <Download className="w-3.5 h-3.5" /> 내보내기
              </button>
              <div className="absolute right-0 top-full mt-1 hidden group-hover:block bg-white border rounded-md shadow-lg py-1 z-20 min-w-[120px]">
                <button
                  onClick={() => handleExport('markdown')}
                  className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                >
                  Markdown (.md)
                </button>
                <button
                  onClick={() => handleExport('json')}
                  className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                >
                  JSON (.json)
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 채팅 메시지 */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-5">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 gap-4">
              <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center">
                <Sparkles className="w-8 h-8 text-blue-500" />
              </div>
              <div>
                <p className="text-gray-600 font-medium">경남 공공데이터에 대해 자연어로 질의필 수 있습니다.</p>
                <p className="text-sm mt-1">아래 추천 질문을 선택하거나 직접 입력필세요.</p>
              </div>
            </div>
          ) : (
            messages.map((m, idx) => (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[92%] ${m.role === 'user' ? 'ml-8' : 'mr-8'}`}>
                  {m.role === 'user' ? (
                    <div className="bg-blue-600 text-white px-4 py-2.5 rounded-2xl rounded-tr-sm text-sm shadow-sm">
                      {m.query}
                    </div>
                  ) : (
                    <ResultCard message={m} isLatest={idx === messages.length - 1} />
                  )}
                  <div className={`text-[10px] text-gray-400 mt-1 ${m.role === 'user' ? 'text-right' : 'text-left'}`}>
                    {new Date(m.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            ))
          )}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-white border rounded-lg px-4 py-3 shadow-sm flex items-center gap-3 text-sm text-gray-600">
                <span className="w-4 h-4 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                데이터를 조회하고 있습니다…
              </div>
            </div>
          )}

          {error && messages.length === 0 && (
            <div className="bg-red-50 text-red-700 text-sm px-4 py-2.5 rounded-md border border-red-200">
              {error}
            </div>
          )}
        </div>

        {/* 입력 영역 */}
        <div className="p-4 border-t bg-gray-50">
          {showExamples && messages.length === 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {EXAMPLES.map(ex => (
                <button
                  key={ex.q}
                  onClick={() => { setQuery(ex.q); ask(ex.q) }}
                  className="px-3 py-1.5 bg-white border text-gray-600 text-xs rounded-full hover:border-blue-400 hover:text-blue-700 transition-colors"
                >
                  <Sparkles className="w-3 h-3 inline-block mr-1 text-amber-500" />
                  {ex.label}
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && ask(query)}
                placeholder="예: 청년 정착잠재 순위 보여줘"
                className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
            <button
              onClick={() => ask(query)}
              disabled={loading || !query.trim()}
              className="px-5 py-2.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50 font-medium flex items-center gap-1.5"
            >
              {loading ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  처리 중
                </>
              ) : (
                <><Send className="w-4 h-4" /> 질문</>
              )}
            </button>
            <button
              onClick={() => setShowExamples(p => !p)}
              className={`px-3 py-2.5 border rounded-md text-gray-500 hover:bg-gray-50 ${showExamples ? 'bg-blue-50 border-blue-200 text-blue-600' : ''}`}
              title="추천 질문"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[11px] text-gray-400 mt-2">
            이 응답은 룰 기반 평가로 생성되며, 실제 정책 판단 시 담당 부서 데이터를 확인필세요.
          </p>
        </div>
      </div>
    </div>
  )
}
