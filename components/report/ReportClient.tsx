'use client'
import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  FileText, AlertTriangle, CheckCircle, MinusCircle, Building2, Target, Download, ListTodo, Image as ImageIcon,
  Search, Filter, Loader2, PlusCircle, Save, X,
} from 'lucide-react'
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  PieChart, Pie,
  ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend, Cell,
} from 'recharts'
import PageHeader from '@/components/ui/PageHeader'
import Card from '@/components/ui/Card'
import StatCard from '@/components/ui/StatCard'
import Badge from '@/components/ui/Badge'
import Btn from '@/components/ui/Btn'
import EmptyState from '@/components/ui/EmptyState'
import Skeleton from '@/components/ui/Skeleton'
import CompareClient from './CompareClient'
import { createClient } from '@/lib/supabase/client'

// ── 분석 결과 삽입용 타입 ──────────────────────────────────────
interface AnalysisResultTable {
  title: string
  headers: string[]
  rows: (string | number | null)[][]
  footnotes?: string[]
}

interface LocalHistoryEntry {
  id: string
  dataset_id: string
  dataset_label: string
  analysis_type: string
  result?: {
    ok: boolean
    title?: string
    tables?: AnalysisResultTable[]
    error?: string
  }
  timestamp: number
}

type ReportBlockKind = 'heading' | 'table' | 'text'

interface ReportBlock {
  id: string
  kind: ReportBlockKind
  content: string
  tableData?: { headers: string[]; rows: (string | number | null)[][] }
}

// ── 평가편람 리포트 타입 ────────────────────────────────────────
interface Indicator { name: string; value: string; status: 'ok'|'warn'|'na'; desc: string }
interface Area {
  name: string; weight: number; color: string
  ok: number; total: number; na?: number; score: number
  indicators: Indicator[]
}
interface EvalData {
  overall: number
  total_points: number
  areas: Area[]
  bonus: { synthetic_cases: number; bonus_score: number }
  summary: {
    datasets: number; open: number; ai_ready: number; high_value: number
    api_enabled: number; usage: number
    quality_pass: number; quality_total: number; avg_error_rate: number
    objects: number; links: number
    tenants_on: number; tenants_total: number
    synthetic_cases: number; analysis_records: number
  }
}
interface Tenant { tenant_id: string; name: string; gov_type: string | null }
interface EvalTargets {
  open_rate_goal: number; ai_ready_goal: number; quality_pass_goal: number
  synthetic_goal: number; analysis_goal: number
}

type StatusKey = 'ok' | 'warn' | 'na'
type StatusFilter = 'all' | StatusKey

const STATUS_BADGE: Record<StatusKey, 'green' | 'amber' | 'gray'> = {
  ok:   'green',
  warn: 'amber',
  na:   'gray',
}
const STATUS_ICON: Record<StatusKey, React.ReactNode> = {
  ok:   <CheckCircle className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />,
  warn: <AlertTriangle className="w-3.5 h-3.5 text-yellow-600 dark:text-yellow-400" />,
  na:   <MinusCircle className="w-3.5 h-3.5 text-gray-400 dark:text-gray-300" />,
}
const STATUS_LABEL: Record<StatusKey, string> = { ok: '충족', warn: '미흡', na: 'N/A' }

function indicatorAction(ind: Indicator): { action: string; pts: number; difficulty: '쉬움'|'보통'|'어려움' } {
  const n = ind.name.toLowerCase()
  if (n.includes('개방계획') || n.includes('이행률'))
    return { action: '미개방 데이터셋을 포털에 등록', pts: 8, difficulty: '쉬움' }
  if (n.includes('ai') || n.includes('친화') || n.includes('고가치'))
    return { action: '포털 AI-Ready 탭에서 미충족 항목 보완', pts: 7, difficulty: '보통' }
  if (n.includes('품질진단') || (n.includes('품질') && n.includes('도구')))
    return { action: '품질 탭 → 전체 재검사 실행', pts: 5, difficulty: '쉬움' }
  if (n.includes('값 관리') || (n.includes('오류율') && !n.includes('조치')))
    return { action: '오류율 초과 데이터셋 정제 후 재검사', pts: 18, difficulty: '보통' }
  if (n.includes('조치') || n.includes('보완율'))
    return { action: '품질 미통과 항목 조치 후 재검사 요청', pts: 10, difficulty: '보통' }
  if ((n.includes('분') && n.includes('실적')) || n.includes('정책활용'))
    return { action: '실적 관리 → 분석 실적 탭에 등록', pts: 10, difficulty: '쉬움' }
  if (n.includes('가명') || n.includes('합성'))
    return { action: '실적 관리 → 가명·합성 탭에 등록 (+1점/건)', pts: 5, difficulty: '보통' }
  if (n.includes('메타') || n.includes('공유 실적') || n.includes('입주'))
    return { action: '기관 관리 → 미입주 기관 온볼딩', pts: 8, difficulty: '쉬움' }
  return { action: `${ind.name} 충족 조건 확인 후 데이터 보완`, pts: Math.max(3, Math.round(8)), difficulty: '보통' }
}

const DIFFICULTY_BADGE: Record<string, string> = {
  '쉬움': 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300',
  '보통': 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300',
  '어려움': 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300',
}

function ReportSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
        <Card padding="lg" className="flex flex-col items-center justify-center">
          <Skeleton className="h-4 w-1/2 mb-4" />
          <Skeleton className="h-20 w-1/3 mb-4" />
          <Skeleton className="h-2 w-full mb-6" />
          <div className="grid grid-cols-3 gap-2 w-full">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        </Card>
        <Card padding="md">
          <Skeleton className="h-4 w-1/3 mx-auto mb-4" />
          <Skeleton className="h-52" />
        </Card>
      </div>
      <Card>
        <Skeleton className="h-4 w-1/4 mb-4" />
        <Skeleton className="h-60" />
      </Card>
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <Skeleton className="h-4 w-1/3 mb-4" />
          <Skeleton className="h-52" />
        </Card>
        <Card>
          <Skeleton className="h-4 w-1/3 mb-4" />
          <Skeleton className="h-52" />
        </Card>
      </div>
      <Card>
        <Skeleton className="h-4 w-1/4 mb-4" />
        <Skeleton className="h-8 w-full mb-3" />
        <Skeleton className="h-40" />
      </Card>
    </div>
  )
}

interface Props { role?: string }

const LOCAL_HISTORY_KEY = 'eum_analysis_history'

function loadHistory(): LocalHistoryEntry[] {
  try {
    const raw = localStorage.getItem(LOCAL_HISTORY_KEY)
    if (!raw) return []
    return JSON.parse(raw) as LocalHistoryEntry[]
  } catch {
    return []
  }
}

function makeId(): string {
  return crypto.randomUUID()
}

function blocksToMarkdown(blocks: ReportBlock[]): string {
  return blocks.map(b => {
    if (b.kind === 'heading') return `## ${b.content}\n`
    if (b.kind === 'text') return `${b.content}\n`
    if (b.kind === 'table' && b.tableData) {
      const header = `| ${b.tableData.headers.join(' | ')} |`
      const sep    = `| ${b.tableData.headers.map(() => '---').join(' | ')} |`
      const rows   = b.tableData.rows.slice(0, 20).map(
        r => `| ${r.map(c => String(c ?? '')).join(' | ')} |`
      )
      return [header, sep, ...rows].join('\n') + '\n'
    }
    return ''
  }).join('\n')
}

export default function ReportClient({ role }: Props) {
  const isCenter = role === 'center'
  const searchParams = useSearchParams()
  const router = useRouter()

  // ── 분석 결과 삽입 블록 ────────────────────────────────────
  const [reportBlocks, setReportBlocks]   = useState<ReportBlock[]>([])
  const [insertBanner, setInsertBanner]   = useState<string | null>(null)
  const [saving, setSaving]               = useState(false)
  const [saveStatus, setSaveStatus]       = useState<'idle' | 'saved' | 'error'>('idle')
  const [reportId, setReportId]           = useState<string | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const insertParam = searchParams.get('insert')
    const idParam     = searchParams.get('id')
    if (insertParam !== 'analytics' || !idParam) return

    const history = loadHistory()
    const entry = history.find(h => h.id === idParam) ?? history[0]
    if (!entry) {
      setInsertBanner('분석 결과를 찾을 수 없습니다.')
      return
    }

    const ts = new Date(entry.timestamp).toLocaleString('ko-KR')
    const newBlocks: ReportBlock[] = [
      {
        id: makeId(),
        kind: 'heading',
        content: `분석 결과 — ${entry.analysis_type} (${ts})`,
      },
    ]

    if (entry.result?.tables && entry.result.tables.length > 0) {
      const t = entry.result.tables[0]
      newBlocks.push({
        id: makeId(),
        kind: 'table',
        content: t.title,
        tableData: { headers: t.headers, rows: t.rows.slice(0, 20) },
      })
    }

    if (entry.result?.title) {
      newBlocks.push({
        id: makeId(),
        kind: 'text',
        content: `데이터셋: ${entry.dataset_label}`,
      })
    }

    setReportBlocks(prev => [...prev, ...newBlocks])
    setInsertBanner(`"${entry.analysis_type}" 분석 결과가 보고서에 삽입되었습니다.`)

    const url = new URL(window.location.href)
    url.searchParams.delete('insert')
    url.searchParams.delete('id')
    router.replace(url.pathname + (url.search || ''))
  }, [searchParams, router])

  // ── Supabase 자동 저장 (debounce 2초) ───────────────────────
  const saveToSupabase = useCallback(async (blocks: ReportBlock[]) => {
    if (blocks.length === 0) return
    setSaving(true)
    try {
      const supabase = createClient()
      if (reportId) {
        await supabase.from('reports').update({ blocks, updated_at: new Date().toISOString() }).eq('id', reportId)
      } else {
        const { data: row } = await supabase
          .from('reports')
          .insert({ title: '분석 보고서', blocks })
          .select('id')
          .single()
        if (row) setReportId(row.id)
      }
      setSaveStatus('saved')
    } catch {
      setSaveStatus('error')
    } finally {
      setSaving(false)
    }
  }, [reportId])

  useEffect(() => {
    if (reportBlocks.length === 0) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => saveToSupabase(reportBlocks), 2000)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [reportBlocks, saveToSupabase])

  function removeBlock(id: string) {
    setReportBlocks(prev => prev.filter(b => b.id !== id))
  }

  function exportMarkdown() {
    const md = blocksToMarkdown(reportBlocks)
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `분석보고서_${new Date().toISOString().slice(0, 10)}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const [data, setData]         = useState<EvalData | null>(null)
  const [targets, setTargets]   = useState<EvalTargets | null>(null)
  const [tenants, setTenants]   = useState<Tenant[]>([])
  const [selectedTenant, setSelectedTenant] = useState<string>('')
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [reportMode, setReportMode] = useState<'report' | 'compare'>('report')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // center 역할이면 기관 목록 로드
  useEffect(() => {
    if (!isCenter) return
    fetch('/api/tenants')
      .then(r => r.json())
      .then((d: Tenant[]) => setTenants(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [isCenter])

  const loadData = useCallback(async (tenantId?: string) => {
    setLoading(true)
    setError(null)
    const qs = tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : ''
    try {
      const [evalRes, targetRes] = await Promise.all([
        fetch(`/api/evaluation${qs}`),
        fetch(`/api/pipeline/targets${qs}`),
      ])
      if (!evalRes.ok) throw new Error(`HTTP ${evalRes.status}`)
      const [evalData, targetData] = await Promise.all([
        evalRes.json() as Promise<EvalData>,
        targetRes.ok ? (targetRes.json() as Promise<EvalTargets>) : Promise.resolve(null),
      ])
      setData(evalData)
      setTargets(targetData)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (reportMode === 'compare') return
    loadData(selectedTenant || undefined)
  }, [loadData, selectedTenant, reportMode])

  const today = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric'
  })

  function downloadCSV() {
    if (!data) return
    const rows = [
      ['영역', '지표명', '현황', '상태', '설명'],
      ...data.areas.flatMap(area =>
        area.indicators.map(ind => [
          area.name, ind.name, ind.value, STATUS_LABEL[ind.status], ind.desc,
        ])
      ),
    ]
    const csv = rows
      .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `평가리포트_${today}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const reportRef = useRef<HTMLDivElement>(null)
  const [downloadingPng, setDownloadingPng] = useState(false)
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [downloadingEvidence, setDownloadingEvidence] = useState(false)

  async function downloadPNG() {
    if (!reportRef.current || !data) return
    setDownloadingPng(true)
    try {
      const html2canvas = (await import('html2canvas')).default
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
      })
      const url = canvas.toDataURL('image/png')
      const a = document.createElement('a')
      a.href = url
      a.download = `평가리포트_${today}.png`
      a.click()
    } catch (e) {
      console.error('[Report] PNG 다운로드 실패:', e)
      alert('PNG 저장에 실패했습니다.')
    } finally {
      setDownloadingPng(false)
    }
  }

  async function downloadPDF() {
    if (!data) return
    setDownloadingPdf(true)
    try {
      const qs = new URLSearchParams()
      if (selectedTenant) qs.set('tenant_id', selectedTenant)
      const res = await fetch(`/api/report/pdf?${qs.toString()}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `평가리포트_${today}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('[Report] PDF 다운로드 실패:', e)
      alert('PDF 저장에 실패했습니다.')
    } finally {
      setDownloadingPdf(false)
    }
  }

  async function downloadEvidence() {
    if (!data) return
    setDownloadingEvidence(true)
    try {
      const { jsPDF } = await import('jspdf')
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const margin = 14
      let y = margin

      // Title
      doc.setFontSize(16)
      doc.setFont('helvetica', 'bold')
      doc.text('EUM 플랫폼 평가 증빙 자료', margin, y)
      y += 8

      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(120, 120, 120)
      doc.text(`산출일: ${today}`, margin, y)
      y += 10
      doc.setTextColor(0, 0, 0)

      // Section 1: Overall score
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.text('1. 종합 점수', margin, y)
      y += 6
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.text(`종합 점수: ${data.overall.toFixed(1)}점 / 100점`, margin + 4, y)
      y += 5
      doc.text(`가점: ${data.bonus?.bonus_score ?? 0}점`, margin + 4, y)
      y += 5
      doc.text(`데이터셋 수: ${data.summary.datasets}개`, margin + 4, y)
      y += 5
      doc.text(`개방 데이터셋: ${data.summary.open}개`, margin + 4, y)
      y += 5
      doc.text(`AI-Ready: ${data.summary.ai_ready}개`, margin + 4, y)
      y += 10

      // Section 2: Area scores
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.text('2. 영역별 점수', margin, y)
      y += 6

      const colW = [60, 25, 25, 25, 25]
      const headers = ['영역', '점수', '충족', '미충족', '비중']
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      headers.forEach((h, i) => {
        doc.text(h, margin + colW.slice(0, i).reduce((a, b) => a + b, 0), y)
      })
      y += 5
      doc.setFont('helvetica', 'normal')
      for (const area of data.areas) {
        if (y > 260) { doc.addPage(); y = margin }
        const cells = [
          area.name,
          `${area.score.toFixed(1)}`,
          `${area.ok}`,
          `${area.total - area.ok - (area.na ?? 0)}`,
          `${area.weight}%`,
        ]
        cells.forEach((c, i) => {
          doc.text(c, margin + colW.slice(0, i).reduce((a, b) => a + b, 0), y)
        })
        y += 5
      }
      y += 6

      // Section 3: Quality summary
      if (y > 240) { doc.addPage(); y = margin }
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.text('3. 품질 현황', margin, y)
      y += 6
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.text(`품질 점검 건수: ${data.summary.quality_total}건`, margin + 4, y)
      y += 5
      doc.text(`품질 통과 건수: ${data.summary.quality_pass}건`, margin + 4, y)
      y += 5
      const qRate = data.summary.quality_total
        ? ((data.summary.quality_pass / data.summary.quality_total) * 100).toFixed(1)
        : '0.0'
      doc.text(`품질 통과율: ${qRate}%`, margin + 4, y)

      const filename = `평가증빙_${today}.pdf`
      doc.save(filename)
    } catch (e) {
      console.error('[Report] 증빙 PDF 실패:', e)
      alert('증빙 PDF 생성에 실패했습니다.')
    } finally {
      setDownloadingEvidence(false)
    }
  }

  const scoreColor = (s: number) =>
    s >= 80 ? '#16a34a' : s >= 60 ? '#d97706' : '#dc2626'

  const totalPoints  = data?.total_points ?? 200
  const actualPoints = data ? Math.round(data.overall * totalPoints / 100) : 0
  const bonusScore   = data?.bonus?.bonus_score ?? 0
  const grandTotal   = actualPoints + bonusScore

  const openRate    = data?.summary.datasets ? data.summary.open / data.summary.datasets * 100 : 0
  const aiReadyRate = data?.summary.datasets ? data.summary.ai_ready / data.summary.datasets * 100 : 0
  const qPassRate   = data?.summary.quality_total ? data.summary.quality_pass / data.summary.quality_total * 100 : 0

  const goalItems = (targets && data) ? [
    { label: '개방률',     current: openRate,    goal: targets.open_rate_goal,    fmt: (v: number) => `${v.toFixed(0)}%` },
    { label: 'AI-Ready',  current: aiReadyRate,  goal: targets.ai_ready_goal,     fmt: (v: number) => `${v.toFixed(0)}%` },
    { label: '품질 통과율', current: qPassRate,   goal: targets.quality_pass_goal, fmt: (v: number) => `${v.toFixed(0)}%` },
    { label: '분석 실적',   current: data.summary.analysis_records ?? 0, goal: targets.analysis_goal, fmt: (v: number) => `${Math.round(v)}건` },
    { label: '가명·합성',   current: data.summary.synthetic_cases   ?? 0, goal: targets.synthetic_goal, fmt: (v: number) => `${Math.round(v)}건` },
  ] : []

  const selectedTenantName = tenants.find(t => t.tenant_id === selectedTenant)?.name

  // To-Do: warn 지표 → 우선순위 액션 아이템
  const actionItems = data ? data.areas.flatMap(area =>
    area.indicators
      .filter(ind => ind.status === 'warn')
      .map(ind => ({ area: area.name, ind, ...indicatorAction(ind) }))
  ).sort((a, b) => b.pts - a.pts) : []

  const totalPotentialPts = actionItems.reduce((s, a) => s + a.pts, 0)

  const radarData = data ? data.areas.map(a => ({ subject: a.name, score: a.score, fullMark: 100 })) : []

  const statusDistribution = data ? [
    { name: '충족', value: data.areas.reduce((s, a) => s + a.ok, 0), color: '#16a34a' },
    { name: '미흡', value: data.areas.reduce((s, a) => s + (a.total - a.ok - (a.na ?? 0)), 0), color: '#d97706' },
    { name: 'N/A', value: data.areas.reduce((s, a) => s + (a.na ?? 0), 0), color: '#9ca3af' },
  ] : []

  const readinessData = data ? [
    { name: 'AI-Ready', value: data.summary.ai_ready, max: data.summary.datasets, color: '#7c3aed' },
    { name: '품질 통과', value: data.summary.quality_pass, max: data.summary.quality_total, color: '#059669' },
  ] : []

  const weightedScoreData = data ? data.areas.map(a => ({
    name: a.name,
    score: Math.round(a.score * a.weight / 100),
    max: a.weight,
  })) : []

  // 지표 필터링
  const allIndicators = useMemo(() => {
    if (!data) return []
    return data.areas.flatMap(area => area.indicators.map(ind => ({ area: area.name, ind })))
  }, [data])

  const statusCounts = useMemo(() => ({
    all: allIndicators.length,
    ok: allIndicators.filter(({ ind }) => ind.status === 'ok').length,
    warn: allIndicators.filter(({ ind }) => ind.status === 'warn').length,
    na: allIndicators.filter(({ ind }) => ind.status === 'na').length,
  }), [allIndicators])

  const filteredAreas = useMemo(() => {
    if (!data) return []
    const q = searchQuery.trim().toLowerCase()
    return data.areas.map(area => ({
      ...area,
      indicators: area.indicators.filter(ind => {
        const matchesStatus = statusFilter === 'all' || ind.status === statusFilter
        const matchesSearch = !q ||
          ind.name.toLowerCase().includes(q) ||
          ind.desc.toLowerCase().includes(q) ||
          area.name.toLowerCase().includes(q)
        return matchesStatus && matchesSearch
      }),
    })).filter(area => area.indicators.length > 0)
  }, [data, statusFilter, searchQuery])

  const hasActiveFilters = statusFilter !== 'all' || searchQuery.trim().length > 0

  if (loading && reportMode === 'report') return <ReportSkeleton />

  if ((error || !data) && reportMode === 'report') return (
    <EmptyState
      icon={<AlertTriangle className="w-8 h-8 text-red-500" />}
      title="리포트를 불러올 수 없습니다"
      description={error ?? '데이터를 불러올 수 없습니다.'}
      action={{ label: '다시 시도', onClick: () => loadData(selectedTenant || undefined) }}
    />
  )

  return (
    <div className="space-y-6 print:space-y-6">

      {/* ── 분석 결과 삽입 배너 ── */}
      {insertBanner && (
        <div className="flex items-center justify-between gap-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-3 text-sm text-blue-800 dark:text-blue-300 print:hidden">
          <div className="flex items-center gap-2">
            <PlusCircle className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
            <span>{insertBanner}</span>
          </div>
          <button onClick={() => setInsertBanner(null)} className="text-blue-500 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-200 transition-colors duration-150">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── 삽입된 분석 결과 블록 ── */}
      {reportBlocks.length > 0 && (
        <div className="space-y-4 print:space-y-4">
          <div className="flex items-center justify-between print:hidden">
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">삽입된 분석 결과</h2>
            <div className="flex items-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin text-gray-400 dark:text-gray-300" />}
              {!saving && saveStatus === 'saved' && (
                <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" /> 저장됨
                </span>
              )}
              {!saving && saveStatus === 'error' && (
                <span className="text-xs text-red-500 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> 저장 실패
                </span>
              )}
              <Btn
                variant="ghost"
                size="sm"
                onClick={() => saveToSupabase(reportBlocks)}
                disabled={saving}
              >
                <Save className="w-4 h-4" /> 저장
              </Btn>
              <Btn variant="secondary" size="sm" onClick={exportMarkdown}>
                <Download className="w-4 h-4" /> 마크다운
              </Btn>
              <Btn variant="ghost" size="sm" onClick={() => window.print()}>
                <FileText className="w-4 h-4" /> PDF 출력
              </Btn>
            </div>
          </div>

          {reportBlocks.map(block => (
            <div key={block.id} className="relative group">
              <button
                onClick={() => removeBlock(block.id)}
                className="absolute -top-2 -right-2 z-10 w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-red-100 hover:text-red-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity print:hidden"
              >
                <X className="w-3 h-3" />
              </button>

              {block.kind === 'heading' && (
                <h2 className="text-lg font-bold text-gray-800 dark:text-gray-200 border-b border-gray-200 dark:border-gray-700 pb-2">
                  {block.content}
                </h2>
              )}

              {block.kind === 'text' && (
                <p className="text-sm text-gray-600 dark:text-gray-400">{block.content}</p>
              )}

              {block.kind === 'table' && block.tableData && (
                <Card>
                  {block.content && (
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">{block.content}</p>
                  )}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 dark:bg-gray-950">
                          {block.tableData.headers.map((h, i) => (
                            <th key={i} className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {block.tableData.rows.map((row, ri) => (
                          <tr key={ri} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors duration-100">
                            {row.map((cell, ci) => (
                              <td key={ci} className="px-3 py-2 text-gray-700 dark:text-gray-300">
                                {cell === null ? '' : String(cell)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </div>
          ))}

          <hr className="border-gray-200 dark:border-gray-700 print:hidden" />
        </div>
      )}

      {/* 헤더 */}
      <PageHeader
        title="데이터 관리 역량 평가편람 대응 리포트"
        subtitle={`경남빅데이터센터 이음(EUM) 플랫폼 · 산출일: ${today}`}
        action={
          <div className="flex items-center gap-2 flex-wrap justify-end print:hidden">
            {/* center 역할 — 기관 선택 드롭다운 */}
            {isCenter && reportMode === 'report' && (
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-gray-400 dark:text-gray-300 flex-shrink-0" />
                <select
                  value={selectedTenant}
                  onChange={e => setSelectedTenant(e.target.value)}
                  className="text-sm border border-gray-200 dark:border-gray-700 rounded-md px-3 py-1.5 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  <option value="">전체 집계</option>
                  {tenants.map(t => (
                    <option key={t.tenant_id} value={t.tenant_id}>{t.name}</option>
                  ))}
                </select>
              </div>
            )}
            {data && reportMode === 'report' && (
              <>
                <Btn variant="secondary" size="sm" onClick={downloadCSV}>
                  <Download className="w-4 h-4" />
                  증빙 CSV
                </Btn>
                <Btn variant="ghost" size="sm" onClick={downloadPNG} loading={downloadingPng} disabled={downloadingPng}>
                  <ImageIcon className="w-4 h-4" />
                  {downloadingPng ? '생성 중...' : 'PNG 저장'}
                </Btn>
                <Btn variant="ghost" size="sm" onClick={downloadPDF} loading={downloadingPdf} disabled={downloadingPdf}>
                  <FileText className="w-4 h-4" />
                  {downloadingPdf ? '생성 중...' : 'PDF 저장'}
                </Btn>
                <Btn variant="secondary" size="sm" onClick={downloadEvidence} loading={downloadingEvidence} disabled={downloadingEvidence}>
                  <Download className="w-4 h-4" />
                  {downloadingEvidence ? '생성 중...' : '평가 증빙 내보내기'}
                </Btn>
              </>
            )}
            <Btn size="sm" onClick={() => window.print()}>
              <FileText className="w-4 h-4" />
              PDF 출력
            </Btn>
          </div>
        }
      />

      {/* center 전용 모드 탭 */}
      {isCenter && (
        <div className="flex gap-1 border-b dark:border-gray-700 pb-0 print:hidden">
          {(['report', 'compare'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setReportMode(mode)}
              className={`px-4 py-2 text-sm font-medium rounded-t-md border-b-2 transition-colors ${
                reportMode === mode
                  ? 'border-blue-600 text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              {mode === 'report' ? '평가 리포트' : '기관 비교'}
            </button>
          ))}
        </div>
      )}

      {/* 기관 비교 모드 */}
      {reportMode === 'compare' && <CompareClient />}

      {/* 리포트 요약 배너 */}
      {reportMode === 'report' && data && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-sm text-blue-800 dark:text-blue-300 print:hidden">
          <p>
            <strong>{selectedTenantName ?? '전체 집계'}</strong> 기준{' '}
            <strong>{today}</strong> 자동 산출 결과, 종합 점수는{' '}
            <strong>{actualPoints}점</strong>
            {bonusScore > 0 && ` (가점 포함 ${grandTotal}점)`}입니다.
            {' '}5개 영역 중 <strong>{data.areas.filter(a => a.score >= 60).length}개</strong>가 양호하고,
            {' '}우선 개선 액션은 <strong>{actionItems.length}개</strong> 식별되었습니다.
          </p>
        </div>
      )}

      {/* 리포트 모드 */}
      {reportMode === 'report' && data && (
        <div ref={reportRef} className="space-y-8 print:space-y-6">
          {/* 인쇄용 제목 (화면에선 숨김) */}
          <div className="hidden print:block">
            <h2 className="text-xl font-bold">데이터 관리 역량 평가편람 대응 리포트</h2>
            {selectedTenantName && <p className="text-sm text-gray-600 dark:text-gray-400">기관: {selectedTenantName}</p>}
            <p className="text-sm text-gray-500 dark:text-gray-400">산출일: {today}</p>
          </div>

          {/* 종합 점수 + 레이더 */}
          <div className="grid md:grid-cols-2 gap-6">
            <Card padding="lg" className="flex flex-col items-center justify-center">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">종합 평가 점수 (2026 편람 기준)</p>
              <div className="flex items-end gap-2">
                <div className="text-7xl font-extrabold" style={{ color: scoreColor(data.overall) }}>
                  {actualPoints}
                </div>
                <div className="pb-2 text-gray-400 dark:text-gray-300 text-base">/ {totalPoints}점</div>
              </div>
              {bonusScore > 0 && (
                <div className="mt-1 flex items-center gap-1.5 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-full px-3 py-1">
                  <span className="text-green-700 dark:text-green-300 text-sm font-semibold">+{bonusScore}점 가점</span>
                  <span className="text-green-600 dark:text-green-400 text-xs">→ 합계 {grandTotal}점</span>
                </div>
              )}
              <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2 mt-3">
                <div
                  className="h-2 rounded-full transition-all"
                  style={{ width: `${data.overall}%`, backgroundColor: scoreColor(data.overall) }}
                />
              </div>
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3 w-full">
                <StatCard
                  label="등록 데이터셋"
                  value={data.summary.datasets}
                  color="blue"
                  icon={<FileText className="w-5 h-5 text-blue-500" />}
                />
                <StatCard
                  label="개방 데이터셋"
                  value={data.summary.open}
                  color="green"
                  icon={<CheckCircle className="w-5 h-5 text-green-500" />}
                />
                <StatCard
                  label="입주 기관"
                  value={`${data.summary.tenants_on}/${data.summary.tenants_total}`}
                  color="purple"
                  icon={<Building2 className="w-5 h-5 text-purple-500" />}
                />
                <StatCard
                  label="AI-Ready"
                  value={data.summary.ai_ready}
                  color="amber"
                  icon={<Target className="w-5 h-5 text-amber-500" />}
                />
                <StatCard
                  label="분석 실적"
                  value={data.summary.analysis_records ?? 0}
                  color="blue"
                  icon={<ListTodo className="w-5 h-5 text-blue-500" />}
                />
                <StatCard
                  label="가명·합성"
                  value={data.summary.synthetic_cases ?? 0}
                  color="green"
                  icon={<CheckCircle className="w-5 h-5 text-green-500" />}
                />
              </div>
            </Card>
            <Card padding="md">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2 text-center">5개 영역 레이더</p>
              <ResponsiveContainer width="100%" height={220}>
                <RadarChart data={radarData}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v) => [`${v}점`, '점수']} />
                  <Radar
                    name="점수" dataKey="score"
                    stroke="#4F46E5" fill="#4F46E5" fillOpacity={0.25}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </Card>
          </div>

          {/* 영역별 점수 bar 차트 */}
          <Card>
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">영역별 점수 분포</p>
            <p className="text-xs text-gray-400 dark:text-gray-300 mb-4">가중치 적용 전 영역 만점 기준 점수</p>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={data.areas.map(a => ({ name: a.name, score: a.score, weight: a.weight, color: a.color }))}
                margin={{ top: 4, right: 20, left: 20, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v, name, props) => [`${v}점 / 가중치 ${props.payload.weight}점`, name as string]}
                />
                <Legend />
                <Bar dataKey="score" name="영역 점수" radius={[4, 4, 0, 0]}>
                  {data.areas.map((a, i) => (
                    <Cell key={`cell-${i}`} fill={a.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* 추가 시각화 차트 */}
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">평가 지표 상태 분포</p>
              <p className="text-xs text-gray-400 dark:text-gray-300 mb-4">5개 영역 지표의 충족·미흡·N/A 비율</p>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Tooltip formatter={(v, n) => [`${v}건`, n as string]} />
                  <Legend verticalAlign="bottom" height={24} />
                  <Pie data={statusDistribution} dataKey="value" nameKey="name" cx="50%" cy="45%" outerRadius={80} label>
                    {statusDistribution.map((entry, i) => (
                      <Cell key={`cell-${i}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </Card>
            <Card>
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">AI-Ready 및 품질진단 통과율</p>
              <p className="text-xs text-gray-400 dark:text-gray-300 mb-4">전체 데이터셋 대비 AI-Ready·품질 통과 건수</p>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Tooltip formatter={(v, n, p) => [`${v}건 / ${p?.payload?.max}건`, n as string]} />
                  <Legend verticalAlign="bottom" height={24} />
                  <Pie data={readinessData} dataKey="value" nameKey="name" cx="50%" cy="45%" innerRadius={55} outerRadius={80} label>
                    {readinessData.map((entry, i) => (
                      <Cell key={`cell-${i}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </Card>
          </div>

          <Card>
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">영역별 가중치 반영 점수</p>
            <p className="text-xs text-gray-400 dark:text-gray-300 mb-4">영역 가중치를 적용한 실제 기여 점수</p>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={weightedScoreData} layout="vertical" margin={{ top: 4, right: 20, left: 40, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" domain={[0, 'dataMax + 5']} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} />
                <Tooltip formatter={(v, n, p) => [`${v}점 / 만점 ${p?.payload?.max}점`, n as string]} />
                <Legend />
                <Bar dataKey="score" name="가중치 반영 점수" radius={[0, 4, 4, 0]}>
                  {weightedScoreData.map((entry, i) => (
                    <Cell key={`cell-${i}`} fill={data?.areas[i]?.color ?? '#3b82f6'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* 목표 대비 현황 패널 */}
          {goalItems.length > 0 && (
            <Card className="p-0 overflow-hidden">
              <div className="px-5 py-3 flex items-center gap-2 border-b bg-gray-50 dark:bg-gray-950">
                <Target className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="font-semibold text-gray-800 dark:text-gray-200 text-sm">목표 대비 현황</span>
                <span className="text-xs text-gray-400 dark:text-gray-300 ml-1">실적 관리 페이지에서 목표를 수정할 수 있습니다</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 divide-x divide-y md:divide-y-0 divide-gray-100 dark:divide-gray-700">
                {goalItems.map(item => {
                  const pct = item.goal > 0 ? Math.min(item.current / item.goal * 100, 100) : 0
                  const met = item.current >= item.goal
                  return (
                    <div key={item.label} className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{item.label}</p>
                      <div className="flex items-baseline gap-1 mb-1.5">
                        <span className={`text-base font-bold ${met ? 'text-green-700 dark:text-green-400' : 'text-gray-800 dark:text-gray-200'}`}>
                          {item.fmt(item.current)}
                        </span>
                        <span className="text-xs text-gray-400 dark:text-gray-300">/ 목표 {item.fmt(item.goal)}</span>
                      </div>
                      <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full transition-all ${met ? 'bg-green-500' : 'bg-blue-500'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className={`text-xs mt-1 ${met ? 'text-green-600' : 'text-gray-400 dark:text-gray-300'}`}>
                        {met ? '목표 달성' : `${pct.toFixed(0)}% 달성`}
                      </p>
                    </div>
                  )
                })}
              </div>
            </Card>
          )}

          {/* 개선 액션 아이템 To-Do */}
          {actionItems.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800 overflow-hidden">
              <div className="px-5 py-3 flex items-center gap-2 border-b border-amber-200 dark:border-amber-800">
                <ListTodo className="w-4 h-4 text-amber-700 dark:text-amber-400" />
                <span className="font-semibold text-amber-800 dark:text-amber-300 text-sm">
                  우선 개선 액션 — {actionItems.length}개 지표 미충족
                </span>
                <span className="text-xs text-amber-600 dark:text-amber-400 ml-1">점수 기여도 높은 순</span>
                {totalPotentialPts > 0 && (
                  <span className="ml-auto text-xs font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-800/60 px-2 py-0.5 rounded-full">
                    최대 +{totalPotentialPts}점 획득 가능
                  </span>
                )}
              </div>
              <div className="divide-y divide-amber-100 dark:divide-amber-800/50">
                {actionItems.slice(0, 6).map((item, i) => (
                  <div key={i} className="px-5 py-3 flex items-start gap-3 hover:bg-amber-100/50 dark:hover:bg-amber-900/30 transition-colors">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 text-xs font-bold flex items-center justify-center mt-0.5">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">{item.area}</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">›</span>
                        <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{item.action}</span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{item.ind.name} · {item.ind.desc}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className="text-xs font-bold text-amber-700 dark:text-amber-300">+{item.pts}점 기여</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${DIFFICULTY_BADGE[item.difficulty]}`}>
                        {item.difficulty}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              {actionItems.length > 6 && (
                <div className="px-5 py-2 text-xs text-amber-600 dark:text-amber-400 text-right border-t border-amber-200 dark:border-amber-800">
                  + {actionItems.length - 6}개 항목은 아래 영역별 상세에서 확인
                </div>
              )}
            </div>
          )}

          {/* 영역별 인디케이터 필터 */}
          <Card className="print:hidden">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Filter className="w-4 h-4 text-gray-400 dark:text-gray-300" />
                <span className="text-sm text-gray-600 dark:text-gray-400">상태 필터</span>
                {(['all', 'ok', 'warn', 'na'] as StatusFilter[]).map(key => (
                  <button
                    key={key}
                    onClick={() => setStatusFilter(key)}
                    className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors ${
                      statusFilter === key
                        ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 font-medium'
                        : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                  >
                    {key === 'all' ? '전체' : STATUS_LABEL[key as StatusKey]}
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                      statusFilter === key ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                    }`}>
                      {statusCounts[key === 'all' ? 'all' : key as StatusKey]}
                    </span>
                  </button>
                ))}
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-300" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="지표명, 설명, 영역 검색"
                  className="w-full md:w-64 pl-9 pr-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500"
                />
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>
                {filteredAreas.reduce((sum, a) => sum + a.indicators.length, 0)}개 지표 표시 중
                {hasActiveFilters && ' (필터 적용됨)'}
              </span>
              {hasActiveFilters && (
                <Btn
                  variant="ghost"
                  size="sm"
                  onClick={() => { setStatusFilter('all'); setSearchQuery('') }}
                >
                  필터 초기화
                </Btn>
              )}
            </div>
          </Card>

          {/* 영역별 인디케이터 */}
          {filteredAreas.length > 0 ? filteredAreas.map(area => (
            <div key={area.name} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
              <div
                className="px-5 py-3 flex items-center justify-between border-b"
                style={{ backgroundColor: area.color + '15' }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: area.color }} />
                  <span className="font-semibold text-gray-800 dark:text-gray-200">{area.name}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">가중치 {area.weight}점</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold" style={{ color: scoreColor(area.score) }}>
                    {Math.round(area.score * area.weight / 100)}
                    <span className="text-xs font-normal text-gray-400 dark:text-gray-300 ml-0.5">/ {area.weight}점</span>
                  </span>
                  <div className="w-24 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className="h-2 rounded-full transition-all"
                      style={{ width: `${area.score}%`, backgroundColor: area.color }}
                    />
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-950">
                    <tr>
                      <th className="px-4 py-2 text-left text-gray-500 dark:text-gray-400 font-medium text-xs">지표명</th>
                      <th className="px-4 py-2 text-center text-gray-500 dark:text-gray-400 font-medium text-xs w-24">현황</th>
                      <th className="px-4 py-2 text-center text-gray-500 dark:text-gray-400 font-medium text-xs w-28">상태</th>
                      <th className="px-4 py-2 text-left text-gray-500 dark:text-gray-400 font-medium text-xs">설명</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {area.indicators.map(ind => (
                      <tr key={ind.name} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors duration-100">
                        <td className="px-4 py-2 text-gray-800 dark:text-gray-200">{ind.name}</td>
                        <td className="px-4 py-2 text-center font-medium text-gray-700 dark:text-gray-300">{ind.value}</td>
                        <td className="px-4 py-2 whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1">
                            {STATUS_ICON[ind.status]}
                            <Badge variant={STATUS_BADGE[ind.status]} size="sm">
                              {STATUS_LABEL[ind.status]}
                            </Badge>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-gray-400 dark:text-gray-300 text-xs">{ind.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )) : (
            <EmptyState
              icon={<Search className="w-8 h-8 text-gray-400 dark:text-gray-300" />}
              title="표시할 지표가 없습니다"
              description="필터를 초기화하거나 다른 검색어를 입력해 보세요."
              action={{ label: '필터 초기화', onClick: () => { setStatusFilter('all'); setSearchQuery('') } }}
            />
          )}

          {/* 인쇄용 푸터 */}
          <div className="hidden print:block text-center text-xs text-gray-400 dark:text-gray-300 mt-8 border-t pt-4">
            경상남도 · 이음(EUM) 공공데이터 개방 플랫폼 · {today} 자동 산출
          </div>
        </div>
      )}
    </div>
  )
}
