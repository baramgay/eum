'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { createFocusTrap } from '@/lib/focus-trap'
import SortableTable from '@/components/common/SortableTable'
import {
  Search, BarChart2, Table2, HelpCircle, ExternalLink,
  MessageSquare, Plus, Trash2, Download, Share2, Copy, Check,
  History, Sparkles, Send, ChevronLeft, RotateCcw, PieChart as PieChartIcon,
  TrendingUp, AlertCircle, X, Database, Play, Code2,
} from 'lucide-react'
import ResultSummary from './ResultSummary'
import type { ConversationTurn } from '@/lib/nlquery/context'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell,
  ResponsiveContainer, CartesianGrid, LabelList,
  LineChart, Line, PieChart, Pie, Legend,
} from 'recharts'
import Badge from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import Btn from '@/components/ui/Btn'
import Card from '@/components/ui/Card'
import Skeleton from '@/components/ui/Skeleton'
import StatCard from '@/components/ui/StatCard'
import { Input, Select, Textarea } from '@/components/ui'

interface QueryResult {
  intent: string | null
  sigun?: string | null
  columns: string[]
  rows: Record<string, unknown>[]
  hint?: string
  source?: string
  source_url?: string
  follow_up?: string[]
  summary?: string
  topN?: number
  filterDescription?: string
}

interface SourceItem {
  source: 'catalog' | 'ontology'
  title: string
  snippet: string
  url?: string
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  query?: string
  result?: QueryResult
  text?: string
  content?: string
  sources?: SourceItem[]
  createdAt: number
}

interface Conversation {
  id: string
  title: string
  messages: ChatMessage[]
  updatedAt: number
}

interface ExampleItem {
  category: string
  label: string
  q: string
}

const STORAGE_KEY = 'eum-ai-conversations'
const SERVER_CONV_KEY = 'eum-ai-server-conversation-ids'

type AiMode = 'chat' | 'sql'

type ChartType = 'bar' | 'line' | 'pie'

// ---- SQL 질의 모드 타입 ----
interface SqlQueryState {
  question: string
  generatedSql: string
  editedSql: string
  explanation: string
  columns: string[]
  result: Record<string, unknown>[]
  rowCount: number
  loading: boolean
  error: string
  phase: 'idle' | 'generated' | 'executed'
}

function SqlQueryPanel() {
  const [state, setState] = useState<SqlQueryState>({
    question: '',
    generatedSql: '',
    editedSql: '',
    explanation: '',
    columns: [],
    result: [],
    rowCount: 0,
    loading: false,
    error: '',
    phase: 'idle',
  })
  const [copied, setCopied] = useState(false)

  function update(patch: Partial<SqlQueryState>) {
    setState(prev => ({ ...prev, ...patch }))
  }

  async function generate() {
    if (!state.question.trim()) return
    update({ loading: true, error: '', phase: 'idle' })
    try {
      const res = await fetch('/api/nl-to-sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: state.question }),
      })
      const data = await res.json()
      if (!res.ok) {
        update({ loading: false, error: data.error ?? `HTTP ${res.status}` })
        return
      }
      update({
        loading: false,
        generatedSql: data.sql,
        editedSql: data.sql,
        explanation: data.explanation,
        columns: data.columns,
        result: data.result,
        rowCount: data.rowCount,
        phase: 'executed',
        error: '',
      })
    } catch (e) {
      update({ loading: false, error: e instanceof Error ? e.message : '요청 실패' })
    }
  }

  async function runSql() {
    if (!state.editedSql.trim()) return
    update({ loading: true, error: '' })
    try {
      const res = await fetch('/api/nl-to-sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: state.question, sql: state.editedSql }),
      })
      const data = await res.json()
      if (!res.ok) {
        update({ loading: false, error: data.error ?? `HTTP ${res.status}` })
        return
      }
      update({
        loading: false,
        columns: data.columns,
        result: data.result,
        rowCount: data.rowCount,
        phase: 'executed',
        error: '',
      })
    } catch (e) {
      update({ loading: false, error: e instanceof Error ? e.message : '실행 실패' })
    }
  }

  async function copySql() {
    try {
      await navigator.clipboard.writeText(state.editedSql)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* ignore */ }
  }

  function reset() {
    setState({
      question: '',
      generatedSql: '',
      editedSql: '',
      explanation: '',
      columns: [],
      result: [],
      rowCount: 0,
      loading: false,
      error: '',
      phase: 'idle',
    })
  }

  return (
    <div className="flex flex-col gap-4 h-full overflow-y-auto p-4">
      {/* 질문 입력 */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Database className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-300" />
          <Input
            value={state.question}
            onChange={e => update({ question: e.target.value })}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && generate()}
            placeholder="예: datasets 테이블에서 최근 10개 항목 보여줘"
            className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-500 bg-white dark:bg-gray-900"
            aria-label="자연어 질문 입력"
          />
        </div>
        <Btn
          onClick={generate}
          variant="primary"
          size="md"
          loading={state.loading}
          disabled={!state.question.trim()}
          className="px-5"
        >
          <Sparkles className="w-4 h-4" /> SQL 생성
        </Btn>
        {state.phase !== 'idle' && (
          <Btn onClick={reset} variant="secondary" size="md" className="px-3" title="초기화">
            <RotateCcw className="w-4 h-4" />
          </Btn>
        )}
      </div>

      {/* 오류 */}
      {state.error && (
        <Card className="!p-3 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 dark:text-red-300">{state.error}</p>
        </Card>
      )}

      {/* 생성된 SQL */}
      {state.phase !== 'idle' && (
        <Card className="!p-0 overflow-hidden">
          <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-950 border-b flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Code2 className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">생성된 SQL</span>
              {state.explanation && (
                <span className="text-xs text-gray-400 dark:text-gray-300 truncate max-w-[280px]">
                  — {state.explanation}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Btn onClick={copySql} variant="secondary" size="sm" className="text-xs">
                {copied ? <Check className="w-3.5 h-3.5 text-green-600 dark:text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? '복사됨' : '복사'}
              </Btn>
              <Btn
                onClick={runSql}
                variant="primary"
                size="sm"
                loading={state.loading}
                disabled={!state.editedSql.trim()}
                className="text-xs"
              >
                <Play className="w-3.5 h-3.5" /> 실행
              </Btn>
            </div>
          </div>
          <Textarea
            value={state.editedSql}
            onChange={e => update({ editedSql: e.target.value })}
            rows={Math.max(3, Math.min(state.editedSql.split('\n').length + 1, 10))}
            spellCheck={false}
            className="w-full px-4 py-3 font-mono text-xs bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 resize-none focus:outline-none focus:ring-2 focus:ring-inset focus:ring-gray-400"
            aria-label="SQL 편집기"
          />
        </Card>
      )}

      {/* 결과 테이블 */}
      {state.phase === 'executed' && (
        <Card className="!p-0 overflow-hidden">
          <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-950 border-b flex items-center gap-2">
            <Table2 className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">결과</span>
            <span className="text-xs text-gray-400 dark:text-gray-300">{state.rowCount}행</span>
          </div>
          {state.result.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-gray-400 dark:text-gray-300">
              결과 없음
            </div>
          ) : (
            <SortableTable
              caption="SQL 질의 결과"
              ariaLabel="SQL 질의 결과 표"
              maxHeight={400}
              data={state.result}
              keyExtractor={(_, i) => String(i)}
              columns={state.columns.map(c => ({
                key: c,
                label: c,
                render: row => {
                  const v = (row as Record<string, unknown>)[c]
                  if (v == null) return '—'
                  return String(v)
                },
              }))}
            />
          )}
        </Card>
      )}

      {state.phase === 'idle' && !state.error && (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-12 text-gray-400 dark:text-gray-300">
          <Database className="w-10 h-10 mb-3 opacity-30" />
          <p className="text-sm">자연어로 질문하면 SQL을 자동으로 생성하고 실행합니다.</p>
          <p className="text-xs mt-1 text-gray-300 dark:text-gray-500">
            생성된 SQL은 직접 수정한 뒤 실행할 수 있습니다.
          </p>
        </div>
      )}
    </div>
  )
}

const DEFAULT_EXAMPLES: ExampleItem[] = [
  { category: '정착', label: '정착잠재 순위',   q: '청년 정착잠재 순위 보여줘' },
  { category: '사업체', label: '창원시 사업체',   q: '창원시 사업체 현황' },
  { category: '인구', label: '거창 청년인구',   q: '거창군 청년 인구 유입 현황' },
  { category: '소득', label: '소득 높은 시군',  q: '소득 높은 시군 순위' },
  { category: '시설', label: '거제 청년센터',   q: '거제시 청년센터' },
  { category: '제조업', label: '경남 제조업',     q: '경남 제조업 사업체 현황' },
  { category: '인구', label: '인구 유입 순위',  q: '청년 인구 유입이 많은 시군' },
]

const CATEGORY_COLORS: Record<string, string> = {
  '정착': 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
  '사업체': 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  '인구': 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  '소득': 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
  '시설': 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300',
  '제조업': 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300',
}

const BAR_COLORS = [
  '#4F46E5','#0891B2','#059669','#D97706','#DC2626',
  '#7C3AED','#BE185D','#0D9488','#B45309','#1D4ED8',
  '#6D28D9','#047857','#9D174D','#1E40AF','#065F46',
  '#7E22CE','#991B1B','#1E3A8A',
]

const PIE_COLORS = [
  '#4F46E5','#0891B2','#059669','#D97706','#DC2626',
  '#7C3AED','#BE185D','#0D9488','#B45309','#1D4ED8',
  '#6D28D9','#047857',
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

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 60) return '방금'
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`
  return `${Math.floor(diff / 86400)}일 전`
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

function detectPreferredChart(columns: string[], rows: Record<string, unknown>[]): ChartType {
  const numericCols = columns.filter(c => isNumericCol(c, rows))
  const labelCol = getLabelCol(columns)
  const labelValues = new Set(rows.map(r => String(r[labelCol])))
  // 구성/비율 데이터는 파이 차트 우선
  if (numericCols.length === 1 && labelValues.size >= 3 && labelValues.size <= 12 && rows.length <= 15) {
    return 'pie'
  }
  // 시계열 성향은 라인 차트
  const timeLike = /년|year|월|month|분기|quarter/.test(labelCol)
  if (numericCols.length >= 1 && timeLike && rows.length >= 3) return 'line'
  return 'bar'
}

function SourceBadge({
  source,
  sourceUrl,
  datasetId,
  rowCount,
}: {
  source?: string
  sourceUrl?: string
  datasetId?: string
  rowCount?: number
}) {
  if (!source) return null

  const label = datasetId && rowCount != null
    ? `출처: ${source} — ${rowCount.toLocaleString()}건 기반`
    : source

  const content = (
    <span className="inline-flex items-center gap-1.5">
      <Badge variant="blue" size="sm">출처</Badge>
      <span className="text-xs text-gray-600 dark:text-gray-400">{label}</span>
      {(sourceUrl || datasetId) && <ExternalLink className="w-3 h-3 text-gray-400 dark:text-gray-300" />}
    </span>
  )

  if (datasetId) {
    return (
      <a
        href={`/portal?id=${encodeURIComponent(datasetId)}`}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors cursor-pointer"
        title="데이터셋 포털에서 보기"
      >
        {content}
      </a>
    )
  }
  if (sourceUrl) {
    return (
      <a
        href={sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
        title="출처 페이지 새 창 열기"
      >
        {content}
      </a>
    )
  }
  return <div className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-gray-50 dark:bg-gray-950">{content}</div>
}

function Sources({ sources }: { sources?: SourceItem[] }) {
  if (!sources || sources.length === 0) return null
  return (
    <div className="w-full">
      <p className="text-[11px] text-gray-400 dark:text-gray-300 mb-1.5">참고 자료</p>
      <ul className="space-y-1">
        {sources.map((s, i) => (
          <li key={i} className="text-xs text-gray-600 dark:text-gray-400">
            {s.url ? (
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400 transition-colors duration-150"
              >
                <Badge variant="gray" size="sm">{s.source}</Badge>
                <span className="font-medium">{s.title}</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            ) : (
              <span className="inline-flex items-center gap-1">
                <Badge variant="gray" size="sm">{s.source}</Badge>
                <span className="font-medium">{s.title}</span>
              </span>
            )}
            <span className="block text-[11px] text-gray-400 dark:text-gray-300 truncate">{s.snippet}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ResultCard({
  message,
  isLatest,
  onFollowUp,
  onRetry,
}: {
  message: ChatMessage
  isLatest?: boolean
  onFollowUp?: (q: string) => void
  onRetry?: () => void
}) {
  const result = message.result
  const [viewMode, setViewMode] = useState<'table'|'chart'>('table')
  const [chartType, setChartType] = useState<ChartType>('bar')
  const [chartCol, setChartCol] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!result) return
    const numCols = result.columns.filter(c => isNumericCol(c, result.rows))
    if (numCols.length > 0) {
      setChartCol(numCols[0])
      setViewMode('chart')
      setChartType(detectPreferredChart(result.columns, result.rows))
    } else {
      setViewMode('table')
    }
  }, [result])

  if (!result) {
    return (
      <Card className={`!p-0 overflow-hidden ${isLatest ? 'ring-1 ring-red-100' : ''}`}>
        <div className="px-4 py-3 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
            {message.content ?? message.text ?? '응답을 받지 못했습니다.'}
          </div>
        </div>
        {message.sources && message.sources.length > 0 && (
          <div className="px-4 py-2 bg-gray-50 dark:bg-gray-950 border-t">
            <Sources sources={message.sources} />
          </div>
        )}
        {onRetry && (
          <div className="px-4 py-2 bg-gray-50 dark:bg-gray-950 border-t flex items-center gap-2">
            <Btn onClick={onRetry} variant="ghost" size="sm" className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 transition-colors duration-150">
              <RotateCcw className="w-3.5 h-3.5" /> 다시 시도
            </Btn>
          </div>
        )}
      </Card>
    )
  }

  const numericCols = result.columns.filter(c => isNumericCol(c, result.rows))
  const labelCol = getLabelCol(result.columns)
  const chartData = result.rows.slice(0, 18).map(r => ({
    name: String(r[labelCol] ?? '').slice(0, 5),
    v: toNumber(r[chartCol]),
    full: r[labelCol],
  }))
  const pieData = result.rows.slice(0, 12).map(r => ({
    name: String(r[labelCol] ?? '기타'),
    value: toNumber(r[chartCol]),
  })).filter(d => d.value > 0)

  async function copyResult() {
    if (!result) return
    const text = [
      result.intent ? `의도: ${result.intent}` : '',
      `결과 ${result.rows.length}행`,
      result.columns.join('\t'),
      ...result.rows.map(r => result.columns.map(c => String(r[c] ?? '')).join('\t')),
    ].filter(Boolean).join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // ignore
    }
  }

  return (
    <Card className={`!p-0 overflow-hidden ${isLatest ? 'ring-1 ring-blue-100' : ''}`}>
      <div className="px-4 py-3 bg-gray-50 dark:bg-gray-950 border-b flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {result.intent && (
            <Badge variant="purple" size="sm">{result.intent}</Badge>
          )}
          {result.sigun && (
            <Badge variant="gray" size="sm">{result.sigun}</Badge>
          )}
          <span className="text-xs text-gray-400 dark:text-gray-300">{result.rows.length}개 결과</span>
        </div>
        <div className="flex items-center gap-2">
          {numericCols.length > 0 && (
            <div className="flex items-center gap-2">
              {numericCols.length > 1 && (
                <Select
                  value={chartCol}
                  onChange={e => setChartCol(e.target.value)}
                  className="text-xs border rounded px-2 py-1 text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-900"
                >
                  {numericCols.map(c => <option key={c} value={c}>{c}</option>)}
                </Select>
              )}
              <div className="flex rounded border overflow-hidden">
                <button
                  onClick={() => setViewMode('table')}
                  className={`flex items-center gap-1 px-2.5 py-1 text-xs ${
                    viewMode === 'table' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  <Table2 className="w-3.5 h-3.5" /> 표
                </button>
                <button
                  onClick={() => setViewMode('chart')}
                  className={`flex items-center gap-1 px-2.5 py-1 text-xs ${
                    viewMode === 'chart' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  <BarChart2 className="w-3.5 h-3.5" /> 차트
                </button>
              </div>
            </div>
          )}
          <Btn
            onClick={copyResult}
            variant="secondary"
            size="sm"
            className="text-xs"
            title="결과 복사"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-green-600 dark:text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? '복사됨' : '복사'}
          </Btn>
        </div>
      </div>

      {result.hint && (
        <div className="px-4 py-2 text-sm text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border-b">
          {result.hint}
        </div>
      )}

      {message.content && (
        <div className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap border-b">
          {message.content}
        </div>
      )}

      <ResultSummary
        summary={result.summary}
        topN={result.topN}
        filterDescription={result.filterDescription}
      />

      {result.rows.length === 0 ? (
        <div className="px-4 py-10 text-center text-gray-400 dark:text-gray-300 text-sm">결과 없음</div>
      ) : viewMode === 'chart' && chartCol ? (
        <figure
          className="p-4"
          role="img"
          aria-label={`${chartCol} 기준 ${chartType === 'pie' ? '구성 비율' : chartType === 'line' ? '추이' : '비교'} 차트, ${chartData.length}개 항목`}
        >
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{chartCol}</p>
            <div className="flex rounded border overflow-hidden">
              <button
                onClick={() => setChartType('bar')}
                className={`flex items-center gap-1 px-2 py-1 text-xs ${chartType === 'bar' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                title="막대 차트"
                aria-label="막대 차트"
              >
                <BarChart2 className="w-3 h-3" />
              </button>
              <button
                onClick={() => setChartType('line')}
                className={`flex items-center gap-1 px-2 py-1 text-xs ${chartType === 'line' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                title="선 차트"
                aria-label="선 차트"
              >
                <TrendingUp className="w-3 h-3" />
              </button>
              <button
                onClick={() => setChartType('pie')}
                className={`flex items-center gap-1 px-2 py-1 text-xs ${chartType === 'pie' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                title="원형 차트"
                aria-label="원형 차트"
              >
                <PieChartIcon className="w-3 h-3" />
              </button>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={320}>
            {chartType === 'line' ? (
              <LineChart data={chartData} margin={{ top: 16, right: 20, left: 10, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v: unknown) => [Number(v).toLocaleString(), chartCol]}
                  labelFormatter={(_, payload) => String((payload?.[0]?.payload as { full?: unknown })?.full ?? '')}
                />
                <Line type="monotone" dataKey="v" stroke="#4F46E5" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            ) : chartType === 'pie' ? (
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={entry => `${entry.name}: ${Number(entry.value).toLocaleString()}`}
                >
                  {pieData.map((_, i) => (
                    <Cell key={`cell-${i}`} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: unknown) => Number(v).toLocaleString()} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            ) : (
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
            )}
          </ResponsiveContainer>
        </figure>
      ) : (
        <SortableTable
          caption="질의 결과"
          ariaLabel="질의 결과 표"
          maxHeight={384}
          data={result.rows}
          keyExtractor={(_, i) => String(i)}
          columns={result.columns.map(c => ({
            key: c,
            label: c,
            render: row => formatValue((row as Record<string, unknown>)[c]),
          }))}
        />
      )}

      <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-950 border-t space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SourceBadge
            source={result.source}
            sourceUrl={result.source_url}
            datasetId={result.intent?.startsWith('데이터셋조회:') ? result.intent.slice('데이터셋조회:'.length) : undefined}
            rowCount={result.source ? result.rows.length : undefined}
          />
          {result.follow_up && result.follow_up.length > 0 && onFollowUp && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-gray-400 dark:text-gray-300">추천:</span>
              {result.follow_up.map(q => (
                <button
                  key={q}
                  onClick={() => onFollowUp(q)}
                  className="text-[11px] px-2 py-1 rounded-full bg-white dark:bg-gray-900 border text-gray-600 dark:text-gray-400 hover:border-blue-400 hover:text-blue-700 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          )}
        </div>
        {message.sources && message.sources.length > 0 && <Sources sources={message.sources} />}
      </div>
    </Card>
  )
}

export default function AiQueryClient() {
  const searchParams = useSearchParams()
  const scrollRef = useRef<HTMLDivElement>(null)

  const [aiMode, setAiMode] = useState<AiMode>('chat')
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showExamples, setShowExamples] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [copiedShare, setCopiedShare] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const exportMenuRef = useRef<HTMLDivElement>(null)
  const exportBtnRef = useRef<HTMLDivElement>(null)
  const [sidebarSearch, setSidebarSearch] = useState('')
  const [exampleCategory, setExampleCategory] = useState('전체')
  const [examples, setExamples] = useState<ExampleItem[]>(DEFAULT_EXAMPLES)
  const [serverConvIds, setServerConvIds] = useState<Record<string, string>>({})

  const currentConv = useMemo(
    () => conversations.find(c => c.id === currentId) ?? null,
    [conversations, currentId]
  )

  const exampleCategories = useMemo(
    () => ['전체', ...Array.from(new Set(examples.map(e => e.category)))],
    [examples]
  )

  const filteredExamples = useMemo(
    () => exampleCategory === '전체' ? examples : examples.filter(e => e.category === exampleCategory),
    [exampleCategory, examples]
  )

  const filteredConversations = useMemo(
    () => sidebarSearch.trim()
      ? conversations.filter(c => c.title.toLowerCase().includes(sidebarSearch.toLowerCase()))
      : conversations,
    [conversations, sidebarSearch]
  )

  const stats = useMemo(() => {
    const userMsgs = currentConv?.messages.filter(m => m.role === 'user').length ?? 0
    const resultMsgs = currentConv?.messages.filter(m => m.role === 'assistant' && m.result).length ?? 0
    return {
      totalConversations: conversations.length,
      questions: userMsgs,
      results: resultMsgs,
      lastActivity: currentConv ? timeAgo(currentConv.updatedAt) : '-',
    }
  }, [conversations.length, currentConv])

  // load from localStorage
  useEffect(() => {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null
      const serverRaw = typeof window !== 'undefined' ? window.localStorage.getItem(SERVER_CONV_KEY) : null
      if (serverRaw) {
        const parsed = JSON.parse(serverRaw)
        if (parsed && typeof parsed === 'object') {
          setServerConvIds(parsed)
        }
      }
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

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(SERVER_CONV_KEY, JSON.stringify(serverConvIds))
    }
  }, [serverConvIds])

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

  useEffect(() => {
    if (!exportOpen || !exportMenuRef.current) return
    const trap = createFocusTrap(exportMenuRef.current, {
      onClose: () => setExportOpen(false),
      escapeCloses: true,
      returnFocus: true,
    })
    return () => trap.destroy()
  }, [exportOpen])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node
      if (exportOpen && !exportBtnRef.current?.contains(target) && !exportMenuRef.current?.contains(target)) {
        setExportOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [exportOpen])

  // 동적 추천 질문 로드
  useEffect(() => {
    let cancelled = false
    fetch('/api/ai/examples')
      .then(r => r.ok ? r.json() : null)
      .then((data: { examples?: ExampleItem[] } | null) => {
        if (cancelled || !data?.examples?.length) return
        setExamples(data.examples)
      })
      .catch(() => {
        // 네트워크 오류 시 기본 예시 유지
      })
    return () => { cancelled = true }
  }, [])

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
    setServerConvIds(prev => {
      const next: Record<string, string> = { ...prev }
      delete next[id]
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

  function getContextPayload(): ConversationTurn[] {
    const msgs = currentConv?.messages ?? []
    return msgs
      .map((m): ConversationTurn | null => {
        // 오류 메시지 턴은 문맥 추론에 혼란을 주지 않도록 제외
        if (m.role === 'assistant' && !m.result) return null
        return {
          role: m.role,
          text: m.query ?? m.text,
          intent: m.result?.intent,
          sigun: m.result?.sigun,
          topN: m.result?.topN,
          filterDescription: m.result?.filterDescription,
        }
      })
      .filter((t): t is ConversationTurn => t !== null)
  }

  function messageContent(m: ChatMessage): string {
    if (m.role === 'user') return m.query ?? ''
    if (m.content) return m.content
    if (m.text) return m.text
    if (m.result) return m.result.summary ?? `의도: ${m.result.intent ?? '-'}, ${m.result.rows.length}개 결과`
    return ''
  }

  function buildChatMessages(q: string, retry: boolean): { role: 'user' | 'assistant'; content: string }[] {
    const prior = (currentConv?.messages ?? [])
      .filter((m): m is ChatMessage => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: messageContent(m) }))
      .filter((m) => m.content.trim())

    const msgs = [...prior]
    const last = msgs[msgs.length - 1]
    if (!retry || last?.role !== 'user') {
      msgs.push({ role: 'user', content: q })
    }
    return msgs
  }

  async function ask(q: string, retry = false) {
    if (!q.trim()) return
    if (!currentId) createNewConversation(buildTitle(q))
    setLoading(true); setError(''); setShowExamples(false)

    if (!retry) {
      const userMsg: ChatMessage = { id: genId(), role: 'user', query: q, createdAt: Date.now() }
      addMessage(userMsg)
    }

    try {
      const serverConvId = currentId ? serverConvIds[currentId] : undefined
      const r = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: buildChatMessages(q, retry), conversation_id: serverConvId }),
      })
      const d: {
        content?: string
        result?: QueryResult
        sources?: SourceItem[]
        conversation_id?: string
        error?: string
      } = await r.json()
      if (!r.ok) {
        throw new Error(d.error || `HTTP ${r.status}`)
      }
      if (d.conversation_id && currentId) {
        const localId = currentId
        const serverId = d.conversation_id
        setServerConvIds(prev => ({ ...prev, [localId]: serverId }))
      }
      const assistantMsg: ChatMessage = {
        id: genId(),
        role: 'assistant',
        content: d.content,
        result: d.result,
        sources: d.sources,
        createdAt: Date.now(),
      }
      addMessage(assistantMsg)
    } catch (e) {
      const msg = e instanceof Error ? e.message : '질의 처리 중 오류가 발생했습니다.'
      setError(msg)
      const failMsg: ChatMessage = {
        id: genId(), role: 'assistant',
        text: msg,
        createdAt: Date.now()
      }
      addMessage(failMsg)
    } finally {
      setLoading(false)
      setQuery('')
    }
  }

  function retryLast() {
    const lastUser = currentConv?.messages.slice().reverse().find(m => m.role === 'user' && m.query)
    if (lastUser?.query) {
      ask(lastUser.query, true)
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
    <div className="flex flex-col md:flex-row h-[calc(100vh-140px)] min-h-[560px] gap-4">
      {/* 사이드바 — 대화형 AI 모드에서만 표시 */}
      <aside
        className={`transition-all duration-300 flex flex-col bg-white dark:bg-gray-900 border rounded-lg shadow-sm overflow-hidden ${
          aiMode === 'chat' && sidebarOpen ? 'w-full md:w-64 h-48 md:h-auto opacity-100' : 'w-0 h-0 md:h-auto opacity-0 overflow-hidden'
        }`}
        aria-label="대화 목록"
      >
        <div className="p-3 border-b space-y-2">
          <Btn onClick={() => createNewConversation()} variant="primary" size="md" className="w-full justify-center">
            <Plus className="w-4 h-4" /> 새 대화
          </Btn>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-gray-300" />
            <Input
              type="text"
              value={sidebarSearch}
              onChange={e => setSidebarSearch(e.target.value)}
              placeholder="대화 검색..."
              className="w-full pl-8 pr-7 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900"
            />
            {sidebarSearch && (
              <button
                onClick={() => setSidebarSearch('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 dark:text-gray-300 hover:text-gray-600 dark:hover:text-gray-400 transition-colors duration-150"
                title="검색어 지우기"
                aria-label="검색어 지우기"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredConversations.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-gray-400 dark:text-gray-300">
              {sidebarSearch ? '검색 결과가 없습니다' : '저장된 대화가 없습니다'}
            </div>
          ) : (
            filteredConversations.map(conv => (
              <div
                key={conv.id}
                className={`group flex items-center gap-2 rounded-md text-sm ${
                  conv.id === currentId ? 'text-blue-800' : 'text-gray-700 dark:text-gray-300'
                }`}
              >
                <button
                  type="button"
                  onClick={() => switchConversation(conv.id)}
                  className={`flex items-center gap-2 flex-1 min-w-0 px-3 py-2 rounded-md text-left ${
                    conv.id === currentId
                      ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  <MessageSquare className="w-4 h-4 shrink-0 opacity-60" />
                  <span className="truncate flex-1">{conv.title}</span>
                </button>
                <button
                  onClick={() => deleteConversation(conv.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 dark:text-gray-300 hover:text-red-600 transition-opacity"
                  title="삭제"
                  aria-label="대화 삭제"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
        <div className="p-3 border-t text-xs text-gray-400 dark:text-gray-300 flex items-center gap-1.5">
          <History className="w-3.5 h-3.5" />
          {sidebarSearch
            ? `${filteredConversations.length}/${conversations.length}개 대화`
            : `${conversations.length}개 대화 저장됨`}
        </div>
      </aside>

      {/* 메인 채팅 영역 */}
      <div className="flex-1 flex flex-col bg-white dark:bg-gray-900 border rounded-lg shadow-sm overflow-hidden">
        {/* 헤더 */}
        <div className="px-4 py-3 border-b flex items-center gap-3">
          {aiMode === 'chat' && (
            <button
              onClick={() => setSidebarOpen(o => !o)}
              className="p-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors duration-150"
              title="대화 목록"
              aria-label="대화 목록"
              aria-expanded={sidebarOpen}
            >
              {sidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <History className="w-4 h-4" />}
            </button>
          )}
          <div className="flex-1 min-w-0">
            {/* 모드 전환 탭 */}
            <div className="flex items-center gap-1 mb-0.5">
              <div className="flex rounded-md border overflow-hidden">
                <button
                  onClick={() => setAiMode('chat')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                    aiMode === 'chat'
                      ? 'bg-gray-800 text-white'
                      : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                  aria-pressed={aiMode === 'chat'}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  대화형 AI
                </button>
                <button
                  onClick={() => setAiMode('sql')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                    aiMode === 'sql'
                      ? 'bg-gray-800 text-white'
                      : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                  aria-pressed={aiMode === 'sql'}
                >
                  <Database className="w-3.5 h-3.5" />
                  SQL 질의
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {aiMode === 'chat'
                ? '경남 청년·사업체·인프라 데이터를 자연어로 질의 · RAG + 도구 호출 기반'
                : '자연어로 SQL을 자동 생성·편집·실행 · SELECT 전용 안전 실행'}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Btn
              onClick={handleShare}
              variant="secondary"
              size="sm"
              title="대화 링크 복사"
            >
              {copiedShare ? <Check className="w-3.5 h-3.5 text-green-600 dark:text-green-400" /> : <Share2 className="w-3.5 h-3.5" />}
              {copiedShare ? '복사됨' : '공유'}
            </Btn>
            <div className="relative" ref={exportBtnRef}>
              <Btn
                variant="secondary"
                size="sm"
                title="대화 내용 저장"
                aria-expanded={exportOpen}
                aria-haspopup="menu"
                aria-controls="ai-export-menu"
                onClick={() => setExportOpen(v => !v)}
              >
                <Download className="w-3.5 h-3.5" /> 내보내기
              </Btn>
              {exportOpen && (
                <div
                  id="ai-export-menu"
                  ref={exportMenuRef}
                  role="menu"
                  aria-label="대화 낳기 옵션"
                  className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-900 border rounded-md shadow-lg py-1 z-20 min-w-[120px]"
                >
                    <button
                      role="menuitem"
                      onClick={() => { setExportOpen(false); handleExport('markdown') }}
                      className="w-full text-left px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors duration-150"
                    >
                      Markdown (.md)
                    </button>
                    <button
                      role="menuitem"
                      onClick={() => { setExportOpen(false); handleExport('json') }}
                      className="w-full text-left px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors duration-150"
                    >
                      JSON (.json)
                    </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 상단 요약 KPI — 대화형 모드에서만 표시 */}
        {aiMode === 'chat' && conversations.length > 0 && (
          <div className="px-4 py-3 border-b bg-gray-50/50 dark:bg-gray-800/50 grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="총 대화" value={stats.totalConversations} color="blue" icon={<MessageSquare className="w-5 h-5" />} />
            <StatCard label="현재 질문" value={stats.questions} color="purple" icon={<HelpCircle className="w-5 h-5" />} />
            <StatCard label="결과 수" value={stats.results} color="green" icon={<BarChart2 className="w-5 h-5" />} />
            <StatCard label="마지막 활동" value={stats.lastActivity} color="amber" icon={<History className="w-5 h-5" />} />
          </div>
        )}

        {/* SQL 질의 모드 패널 */}
        {aiMode === 'sql' && (
          <div className="flex-1 overflow-hidden">
            <SqlQueryPanel />
          </div>
        )}

        {/* 채팅 메시지 — 대화형 모드에서만 표시 */}
        <div ref={scrollRef} className={`flex-1 overflow-y-auto p-4 space-y-5 ${aiMode === 'sql' ? 'hidden' : ''}`}>
          {messages.length === 0 ? (
            <EmptyState
              icon={<Sparkles className="w-8 h-8 text-blue-500" />}
              title="경남 공공데이터에 대해 자연어로 질의할 수 있습니다"
              description="아래 추천 질문을 선택하거나 직접 입력하세요."
              action={{ label: '새 대화 시작', onClick: () => createNewConversation() }}
            />
          ) : (
            messages.map((m, idx) => (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[92%] ${m.role === 'user' ? 'ml-8' : 'mr-8'}`}>
                  {m.role === 'user' ? (
                    <div className="bg-blue-600 text-white px-4 py-2.5 rounded-2xl rounded-tr-sm text-sm shadow-sm">
                      {m.query}
                    </div>
                  ) : (
                    <ResultCard
                      message={m}
                      isLatest={idx === messages.length - 1}
                      onFollowUp={q => ask(q)}
                      onRetry={retryLast}
                    />
                  )}
                  <div className={`text-[10px] text-gray-400 dark:text-gray-300 mt-1 ${m.role === 'user' ? 'text-right' : 'text-left'}`}>
                    {new Date(m.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            ))
          )}

          {loading && (
            <div className="flex justify-start">
              <Card className="!p-4 w-full max-w-xl space-y-3">
                <div className="flex items-center gap-2">
                  <Skeleton className="w-4 h-4 rounded-full" />
                  <Skeleton className="w-32 h-4" />
                </div>
                <Skeleton className="w-full h-24" />
                <div className="flex gap-2">
                  <Skeleton className="w-20 h-8" />
                  <Skeleton className="w-20 h-8" />
                </div>
              </Card>
            </div>
          )}

          {error && messages.length === 0 && (
            <Card className="!p-4 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-red-800 dark:text-red-200">질의 처리 중 오류가 발생했습니다</p>
                <p className="text-sm text-red-700 dark:text-red-300 mt-0.5">{error}</p>
              </div>
              <Btn
                onClick={retryLast}
                variant="secondary"
                size="sm"
                loading={loading}
                className="border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors duration-150"
              >
                <RotateCcw className="w-3.5 h-3.5" /> 다시 시도
              </Btn>
            </Card>
          )}
        </div>

        {/* 입력 영역 — 대화형 모드에서만 표시 */}
        <div className={`p-4 border-t bg-gray-50 dark:bg-gray-950 ${aiMode === 'sql' ? 'hidden' : ''}`}>
          {showExamples && messages.length === 0 && (
            <div className="mb-3 space-y-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-gray-400 dark:text-gray-300 mr-1">추천:</span>
                {exampleCategories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setExampleCategory(cat)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      exampleCategory === cat
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-blue-400 hover:text-blue-700'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {filteredExamples.map(ex => (
                  <button
                    key={ex.q}
                    onClick={() => { setQuery(ex.q); ask(ex.q) }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-gray-900 border text-gray-600 dark:text-gray-400 text-xs rounded-full hover:border-blue-400 hover:text-blue-700 transition-colors"
                  >
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${CATEGORY_COLORS[ex.category] || 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}>
                      {ex.category}
                    </span>
                    <Sparkles className="w-3 h-3 text-amber-500" />
                    {ex.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-300" />
              <Input
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && ask(query)}
                placeholder="예: 청년 정착잠재 순위 보여줘"
                className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900"
              />
            </div>
            <Btn
              onClick={() => ask(query)}
              variant="primary"
              size="md"
              loading={loading}
              disabled={!query.trim()}
              className="px-5"
            >
              <Send className="w-4 h-4" /> 질문
            </Btn>
            <Btn
              onClick={() => setShowExamples(p => !p)}
              variant="secondary"
              size="md"
              className={`px-3 ${showExamples ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40' : ''}`}
              title="추천 질문"
              aria-label="추천 질문"
            >
              <HelpCircle className="w-4 h-4" />
            </Btn>
            {messages.length > 0 && (
              <Btn
                onClick={retryLast}
                variant="secondary"
                size="md"
                loading={loading}
                className="px-3"
                title="마지막 질문 재시도"
                aria-label="마지막 질문 재시도"
              >
                <RotateCcw className="w-4 h-4" />
              </Btn>
            )}
          </div>
          <p className="text-[11px] text-gray-400 dark:text-gray-300 mt-2">
            이 응답은 검색된 컨텍스트와 도구 호출 결과를 바탕으로 생성되며, 실제 정책 판단 시 담당 부서 데이터를 확인하세요.
          </p>
        </div>
      </div>
    </div>
  )
}
