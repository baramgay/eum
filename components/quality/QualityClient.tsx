'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2, XCircle, AlertCircle, RefreshCw,
  ChevronDown, ChevronUp, History, BarChart3, ListChecks,
  AlertTriangle, TrendingDown, TrendingUp, Activity, Filter, Download, Search, FileEdit,
} from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell, PieChart, Pie,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts'
import PageHeader from '@/components/ui/PageHeader'
import Card from '@/components/ui/Card'
import SortableTable from '@/components/common/SortableTable'
import StatCard from '@/components/ui/StatCard'
import Badge from '@/components/ui/Badge'
import Btn from '@/components/ui/Btn'
import EmptyState from '@/components/ui/EmptyState'
import Skeleton from '@/components/ui/Skeleton'
import { buildAreaSignals, buildNIASignals, buildQualityIssues, buildAreaComparison, type Severity } from '@/lib/quality'
import NIAQualityGrid from './NIAQualityGrid'
import DataLifecycleTimeline from './DataLifecycleTimeline'
import OneCycleChecklist from './OneCycleChecklist'
import QualityContractEditor from './QualityContractEditor'
import { NIA_CHARACTERISTICS, type NIACharacteristic } from '@/lib/quality-nia'
import type { QualityContract } from '@/lib/quality-contract'

type QualityArea = 'completeness' | 'accuracy' | 'consistency' | 'recency' | 'metadata'

interface RuleDetail { rule: string; violations: number; area?: QualityArea; niaTrait?: NIACharacteristic }

interface QualityResult {
  dataset_id: string
  table: string
  rule_count: number
  checked: number
  errors: number
  error_rate: number
  threshold: number
  passed: boolean
  detail: RuleDetail[]
  ran_at: string
}

interface QualityIssue {
  area: QualityArea
  areaLabel: string
  datasetId: string
  table: string
  rule: string
  violations: number
  severity: Severity
  recommendation: string
}

interface QualityHistoryRow {
  id: string
  dataset_id: string
  table_name: string
  rule_count: number
  checked: number
  errors: number
  error_rate: number
  passed: boolean
  detail: RuleDetail[]
  ran_at: string
}

interface CompareResult {
  current: QualityHistoryRow | null
  previous: QualityHistoryRow | null
  deltaErrors: number
  deltaRate: number
  improved: boolean
}

interface AreaSignal {
  name: QualityArea
  label: string
  status: 'pass' | 'fail' | 'none'
  violations: number
  checked: number
  rules: number
}

const AREA_META: Record<QualityArea, { label: string; color: string; desc: string }> = {
  completeness: { label: '완전성', color: '#3B82F6', desc: '필수 값 누락/결측' },
  accuracy:     { label: '정확성', color: '#10B981', desc: '범위·부호·값 오류' },
  consistency:  { label: '일관성', color: '#8B5CF6', desc: '컬럼 간 정합성' },
  recency:      { label: '최신성', color: '#F59E0B', desc: '연도·기간 적절성' },
  metadata:     { label: '메타데이터', color: '#06B6D4', desc: '코드·용어 표준' },
}

const AREA_ORDER: QualityArea[] = ['completeness', 'accuracy', 'consistency', 'recency', 'metadata']

const CHART_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#EC4899', '#6366F1']

function inferArea(rule: string): QualityArea {
  const n = rule
  if (n.includes('NULL') || n.includes('결측') || n.includes('누락')) return 'completeness'
  if (n.includes('연도') || n.includes('최신') || n.includes('기간')) return 'recency'
  if (n.includes('정합성') || n.includes('중복') || n.includes('일관')) return 'consistency'
  if (n.includes('메타') || n.includes('코드') || n.includes('유효성')) return 'metadata'
  return 'accuracy'
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('ko-KR')
}

function truncateId(id: string) {
  return id.length > 16 ? id.slice(0, 16) + '…' : id
}

function QualitySkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <Skeleton className="h-3 w-2/3 mb-3" />
            <Skeleton className="h-8 w-1/2" />
          </Card>
        ))}
      </div>
      <Card>
        <Skeleton className="h-4 w-1/4 mb-4" />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-gray-50 dark:bg-gray-950 rounded-xl border p-4">
              <Skeleton className="w-8 h-8 rounded-full mx-auto mb-2" />
              <Skeleton className="h-3 w-3/4 mx-auto" />
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <Skeleton className="h-4 w-1/3 mb-4" />
        <Skeleton className="h-64 w-full" />
      </Card>
    </div>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card>
      <EmptyState
        icon={<AlertCircle className="w-6 h-6 text-red-500" />}
        title="데이터를 불러오지 못했습니다"
        description={message}
        action={{ label: '다시 시도', onClick: onRetry }}
      />
    </Card>
  )
}

function SeverityBadge({ severity }: { severity: Severity }) {
  const config = {
    critical: { label: '심각', className: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 ring-red-200 dark:ring-red-800' },
    high:     { label: '높음', className: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 ring-orange-200 dark:ring-orange-800' },
    medium:   { label: '보통', className: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 ring-amber-200 dark:ring-amber-800' },
    low:      { label: '낮음', className: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 ring-blue-200 dark:ring-blue-800' },
  }[severity]
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ring-1 ${config.className}`}>
      {config.label}
    </span>
  )
}

function downloadHistoryCSV(history: QualityHistoryRow[], tableName: string) {
  const headers = ['검사일', '오류율(%)', '오류건수', '검사건수', '규칙수', '결과']
  const rows = history.map(h => [
    formatDate(h.ran_at),
    h.error_rate.toFixed(4),
    h.errors.toLocaleString(),
    h.checked.toLocaleString(),
    h.rule_count.toLocaleString(),
    h.passed ? '통과' : '실패',
  ])
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${tableName}_quality_history.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

type TabKey = 'results' | 'issues' | 'history' | 'nia' | 'lifecycle' | 'contract' | 'gap'

type GapStatus = 'green' | 'yellow' | 'red'

interface GapAreaResult {
  label: string
  status: GapStatus
  value?: number
  unit?: string
  missing?: string[]
}

interface GapReport {
  dataset_id: string
  areas: {
    A: GapAreaResult
    B: GapAreaResult
    C: GapAreaResult
    D: GapAreaResult
    E: GapAreaResult
  }
}

export default function QualityClient() {
  const [results, setResults]   = useState<QualityResult[]>([])
  const [history, setHistory]   = useState<QualityHistoryRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [running, setRunning]   = useState(false)
  const [activeTab, setActiveTab] = useState<TabKey>('results')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [selectedDataset, setSelectedDataset] = useState<string>('')
  const [resultDatasetFilter, setResultDatasetFilter] = useState<string>('all')
  const [compare, setCompare]   = useState<CompareResult | null>(null)
  const [areaFilter, setAreaFilter] = useState<QualityArea | 'all'>('all')
  const [contractData, setContractData] = useState<QualityContract | null>(null)
  const [contractLoading, setContractLoading] = useState(false)
  const [gapReport, setGapReport] = useState<GapReport | null>(null)
  const [gapLoading, setGapLoading] = useState(false)
  const [gapError, setGapError] = useState<string | null>(null)

  const loadContract = useCallback(async (datasetId: string) => {
    if (!datasetId) return
    setContractLoading(true)
    try {
      const res = await fetch(`/api/catalog/${encodeURIComponent(datasetId)}`)
      if (!res.ok) return
      const data = await res.json()
      setContractData(data?.quality_contract ?? null)
    } catch {
      setContractData(null)
    } finally {
      setContractLoading(false)
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch('/api/quality')
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const d = await r.json()
      const arr = Array.isArray(d) ? d : d.results ?? []
      setResults(arr)
      if (arr.length > 0) setSelectedDataset(prev => prev || arr[0].dataset_id)
    } catch (e) {
      console.error(e)
      setResults([])
      setError('품질 검사 결과를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadHistory = useCallback(async () => {
    try {
      const qs = selectedDataset ? `?dataset_id=${encodeURIComponent(selectedDataset)}` : ''
      const r = await fetch(`/api/quality?view=history${qs}`)
      const d = await r.json()
      setHistory(Array.isArray(d) ? d : [])
    } catch (e) {
      console.error(e)
      setHistory([])
    }
  }, [selectedDataset])

  const loadCompare = useCallback(async () => {
    if (!selectedDataset) return
    try {
      const r = await fetch(`/api/quality?view=compare&dataset_id=${encodeURIComponent(selectedDataset)}`)
      const d = await r.json()
      setCompare(d as CompareResult)
    } catch (e) {
      console.error(e)
      setCompare(null)
    }
  }, [selectedDataset])

  async function runAll() {
    setRunning(true)
    try {
      await fetch('/api/quality', { method: 'POST' })
      await load()
      if (activeTab === 'history') await loadHistory()
      if (activeTab === 'history' || activeTab === 'issues') await loadCompare()
    } finally {
      setRunning(false)
    }
  }

  useEffect(() => { load() }, [load])
  const loadGapReport = useCallback(async (datasetId: string) => {
    if (!datasetId) return
    setGapLoading(true)
    setGapError(null)
    try {
      const res = await fetch(`/api/quality/gap-report?dataset_id=${encodeURIComponent(datasetId)}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setGapReport(await res.json())
    } catch {
      setGapError('갭 분석 데이터를 불러오지 못했습니다.')
      setGapReport(null)
    } finally {
      setGapLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'history') loadHistory()
    if (activeTab === 'history' || activeTab === 'issues') loadCompare()
    if (activeTab === 'contract' && selectedDataset) loadContract(selectedDataset)
    if (activeTab === 'gap' && selectedDataset) loadGapReport(selectedDataset)
  }, [activeTab, selectedDataset, loadHistory, loadCompare, loadContract, loadGapReport])

  const signals = useMemo(() => buildAreaSignals(results), [results])
  const issues  = useMemo(() => buildQualityIssues(results), [results])
  const filteredIssues = useMemo(() =>
    areaFilter === 'all' ? issues : issues.filter(i => i.area === areaFilter),
  [issues, areaFilter])

  const filteredResults = useMemo(() =>
    resultDatasetFilter === 'all'
      ? results
      : results.filter(r => r.dataset_id === resultDatasetFilter),
  [results, resultDatasetFilter])

  useEffect(() => {
    if (resultDatasetFilter !== 'all' && !results.find(r => r.dataset_id === resultDatasetFilter)) {
      setResultDatasetFilter('all')
    }
  }, [results, resultDatasetFilter])

  const passedCount   = results.filter(r => r.passed).length
  const totalDatasets = results.length
  const totalErrors   = results.reduce((s, r) => s + r.errors, 0)
  const avgErrorRate  = totalDatasets ? results.reduce((s, r) => s + r.error_rate, 0) / totalDatasets : 0

  const allHaveResults  = totalDatasets > 0
  const valueManagePass = allHaveResults && results.every(r => r.error_rate <= r.threshold)
  const actionPass      = allHaveResults && results.every(r => r.passed)

  const issueCountsByArea = useMemo(() => {
    const counts: Record<QualityArea | 'all', number> = {
      all: issues.length,
      completeness: 0, accuracy: 0, consistency: 0, recency: 0, metadata: 0,
    }
    for (const i of issues) counts[i.area] += 1
    return counts
  }, [issues])

  // 차트 데이터
  const areaChartData = useMemo(() => signals.map(s => ({
    name: s.label,
    위반: s.violations,
    규칙: s.rules,
    color: AREA_META[s.name].color,
  })), [signals])

  const areaScoreData = useMemo(() => signals.map(s => {
    const checked = Math.max(1, s.checked)
    const score = s.rules === 0 ? 100 : Math.max(0, (1 - s.violations / checked) * 100)
    return {
      area: s.label,
      score: Number(score.toFixed(1)),
      fullMark: 100,
      color: AREA_META[s.name].color,
    }
  }), [signals])

  const datasetRadarData = useMemo(() => {
    const target = resultDatasetFilter === 'all' ? null : filteredResults[0]
    if (!target) return []
    const perRule = target.rule_count > 0 ? target.checked / target.rule_count : 0
    const dims: Record<QualityArea, { violations: number; checked: number }> = {
      completeness: { violations: 0, checked: 0 },
      accuracy:     { violations: 0, checked: 0 },
      consistency:  { violations: 0, checked: 0 },
      recency:      { violations: 0, checked: 0 },
      metadata:     { violations: 0, checked: 0 },
    }
    for (const d of target.detail) {
      const area = d.area ?? inferArea(d.rule)
      dims[area].violations += d.violations
      dims[area].checked += Math.max(1, Math.round(perRule))
    }
    return AREA_ORDER.map(area => {
      const v = dims[area]
      const checked = Math.max(1, v.checked)
      const score = Math.max(0, (1 - v.violations / checked) * 100)
      return { area: AREA_META[area].label, score: Number(score.toFixed(1)), fullMark: 100 }
    })
  }, [filteredResults, resultDatasetFilter])

  const areaCompareData = useMemo(() => {
    if (!compare?.current) return []
    return buildAreaComparison(compare.current, compare.previous)
  }, [compare])

  // NIA 9대 특성 점수 — niaTrait 직접 집계 (buildNIASignals)
  const niaScores = useMemo(() => buildNIASignals(results), [results])

  const historyChartData = useMemo(() => {
    return [...history].reverse().map(h => ({
      label: new Date(h.ran_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      오류율: h.error_rate,
      오류건수: h.errors,
      passed: h.passed,
    }))
  }, [history])

  const historyNIAChartData = useMemo(() => {
    const NIA_KEYS = Object.keys(NIA_CHARACTERISTICS) as NIACharacteristic[]
    return [...history].reverse().map(h => {
      const agg: Record<string, { v: number; c: number }> = {}
      for (const d of (h.detail ?? [])) {
        const trait = d.niaTrait
        if (!trait) continue
        if (!agg[trait]) agg[trait] = { v: 0, c: 0 }
        agg[trait].v += d.violations
        agg[trait].c += 1
      }
      const point: Record<string, number | string> = {
        label: new Date(h.ran_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }),
      }
      for (const k of NIA_KEYS) {
        const s = agg[k]
        point[k] = s ? Math.max(0, (1 - s.v / Math.max(1, s.c)) * 100) : -1
      }
      return point
    })
  }, [history])

  const hasNIAHistory = useMemo(
    () => historyNIAChartData.some(d =>
      (Object.keys(NIA_CHARACTERISTICS) as NIACharacteristic[]).some(k => (d[k] as number) >= 0)
    ),
    [historyNIAChartData],
  )

  const datasetStatusData = useMemo(() => filteredResults.map(r => ({
    name: r.table,
    오류율: r.error_rate,
    passed: r.passed,
  })), [filteredResults])

  return (
    <div className="space-y-5">
      <PageHeader
        title="품질 진단"
        subtitle="데이터셋별 규칙 기반 품질진단 및 이력 비교"
        action={
          <Btn onClick={runAll} loading={running} disabled={running}>
            <RefreshCw className={`w-4 h-4 ${running ? 'animate-spin' : ''}`} />
            전체 재검사
          </Btn>
        }
      />

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="검사 데이터셋" value={`${passedCount}/${totalDatasets}`} color="blue" icon={<Activity className="w-5 h-5" />} />
        <StatCard label="총 오류" value={totalErrors.toLocaleString()} color={totalErrors > 0 ? 'red' : 'green'} icon={<AlertTriangle className="w-5 h-5" />} />
        <StatCard label="평균 오류율" value={`${avgErrorRate.toFixed(4)}%`} color={avgErrorRate > 0.001 ? 'amber' : 'green'} icon={<BarChart3 className="w-5 h-5" />} />
        <StatCard label="통과율" value={`${totalDatasets ? Math.round(passedCount / totalDatasets * 100) : 0}%`} color="purple" icon={<CheckCircle2 className="w-5 h-5" />} />
      </div>

      {/* 5영역 품질 신호등 */}
      {totalDatasets > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">품질 5영역 신호등</h3>
            <span className="text-xs text-gray-400 dark:text-gray-300">영역별 위반 현황</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {signals.map(sig => (
              <Card
                key={sig.name}
                padding="sm"
                className={`text-center ${
                  sig.status === 'pass' ? 'bg-green-50/50 dark:bg-green-900/15 border-green-200 dark:border-green-800' :
                  sig.status === 'fail' ? 'bg-red-50/50 dark:bg-red-900/15 border-red-200 dark:border-red-800' :
                  'bg-gray-50 dark:bg-gray-950 border-gray-200 dark:border-gray-700'
                }`}
              >
                <div className="flex justify-center mb-2">
                  {sig.status === 'pass' ? (
                    <CheckCircle2 className="w-8 h-8 text-green-500" />
                  ) : sig.status === 'fail' ? (
                    <XCircle className="w-8 h-8 text-red-500" />
                  ) : (
                    <AlertCircle className="w-8 h-8 text-gray-300 dark:text-gray-200" />
                  )}
                </div>
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{sig.label}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{AREA_META[sig.name].desc}</p>
                <p className={`text-xs font-medium mt-2 ${
                  sig.status === 'pass' ? 'text-green-600 dark:text-green-400' :
                  sig.status === 'fail' ? 'text-red-600' : 'text-gray-400 dark:text-gray-300'
                }`}>
                  {sig.status === 'none' ? '미측정' : sig.violations === 0 ? '이상 없음' : `${sig.violations.toLocaleString()}건 위반`}
                </p>
                {sig.rules > 0 && (
                  <p className="text-[10px] text-gray-400 dark:text-gray-300 mt-1">규칙 {sig.rules}종 · 검사 {sig.checked.toLocaleString()}건</p>
                )}
              </Card>
            ))}
          </div>
        </Card>
      )}

      {/* 5영역 품질 레이더 차트 */}
      {totalDatasets > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">품질 5영역 레이더</h3>
            <span className="text-xs text-gray-400 dark:text-gray-300">100점에 가까울수록 양호</span>
          </div>
          <div className="h-72 flex items-center justify-center">
            <figure
              className="w-full h-full"
              role="img"
              aria-label={`품질 5영역 레이더 차트, 데이터셋 ${totalDatasets}개`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={areaScoreData} margin={{ top: 8, right: 32, bottom: 8, left: 32 }}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="area" tick={{ fontSize: 12 }} />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 10 }} tickCount={6} />
                  <Tooltip formatter={(v: unknown) => [`${v}점`, '품질 점수']} />
                  <Radar
                    name="품질 점수"
                    dataKey="score"
                    stroke="#3B82F6"
                    fill="#3B82F6"
                    fillOpacity={0.25}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </figure>
          </div>
        </Card>
      )}

      {/* 평가편람 영역 요약 배지 */}
      {totalDatasets > 0 && (
        <div className="flex flex-wrap gap-2 p-3 bg-gray-50 dark:bg-gray-950 rounded-xl border">
          <span className="text-xs text-gray-500 dark:text-gray-400 self-center mr-1">평가편람 품질 영역:</span>
          {[
            { code: '①-2', label: '품질진단 도구 적용', pass: allHaveResults },
            { code: '②',   label: '데이터 값 관리',     pass: valueManagePass },
            { code: '③',   label: '진단결과 조치',      pass: actionPass },
          ].map(b => (
            <Badge
              key={b.code}
              variant={b.pass ? 'green' : 'red'}
            >
              <span className="inline-flex items-center gap-1">
                {b.pass ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                {b.code} {b.label}
              </span>
            </Badge>
          ))}
        </div>
      )}

      {/* 탭 */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex gap-6" aria-label="품질진단 탭">
          {[
            { key: 'results',   label: '진단 결과',       icon: ListChecks },
            { key: 'issues',    label: '이슈 상세',       icon: AlertTriangle },
            { key: 'history',   label: '이력 비교',       icon: History },
            { key: 'nia',       label: 'NIA 9대 특성',    icon: BarChart3 },
            { key: 'lifecycle', label: '데이터 생애주기', icon: Activity },
            { key: 'contract',  label: '품질 계약 편집',  icon: FileEdit },
            { key: 'gap',       label: '갭 분석',         icon: AlertCircle },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as TabKey)}
              className={`flex items-center gap-1.5 pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {loading ? (
        <QualitySkeleton />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : results.length === 0 ? (
        <Card>
          <EmptyState
            icon={<AlertCircle className="w-6 h-6 text-gray-400 dark:text-gray-300" />}
            title="품질 검사 결과가 없습니다"
            description="전체 재검사를 실행하여 데이터셋 품질을 진단해 보세요."
            action={{ label: '전체 재검사', onClick: runAll }}
          />
        </Card>
      ) : (
        <>
          {/* 진단 결과 탭 */}
          {activeTab === 'results' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-gray-900 rounded-xl border px-4 py-3">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-gray-400 dark:text-gray-300" />
                  <label htmlFor="dataset-filter" className="text-sm text-gray-600 dark:text-gray-400">데이터셋</label>
                  <select
                    id="dataset-filter"
                    value={resultDatasetFilter}
                    onChange={e => setResultDatasetFilter(e.target.value)}
                    className="text-sm border-gray-300 dark:border-gray-600 rounded-lg focus:ring-blue-500 focus:border-blue-500 py-1.5 pl-2 pr-8 bg-gray-50 dark:bg-gray-950"
                  >
                    <option value="all">전체 데이터셋</option>
                    {results.map(r => (
                      <option key={r.dataset_id} value={r.dataset_id}>{r.table}</option>
                    ))}
                  </select>
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400">{filteredResults.length}개 데이터셋 표시 중</span>
              </div>

              {filteredResults.length === 0 ? (
                <Card>
                  <EmptyState
                    icon={<Search className="w-6 h-6 text-gray-400 dark:text-gray-300" />}
                    title="선택한 데이터셋에 대한 결과가 없습니다"
                    description="다른 데이터셋을 선택하거나 전체 데이터셋을 조회해 보세요."
                  />
                </Card>
              ) : filteredResults.map(r => {
                const isOpen = expanded[r.dataset_id]
                const byArea = AREA_ORDER.map(area => ({
                  area,
                  label: AREA_META[area].label,
                  items: r.detail.filter(d => (d.area ?? inferArea(d.rule)) === area),
                })).filter(g => g.items.length > 0)

                return (
                  <Card key={r.dataset_id} padding="sm" hover className="overflow-hidden">
                    <button
                      type="button"
                      className={`w-full px-4 py-3 flex items-center justify-between text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${r.passed ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}
                      onClick={() => setExpanded(p => ({ ...p, [r.dataset_id]: !p[r.dataset_id] }))}
                      aria-expanded={isOpen}
                      aria-label={`${r.table} 품질 결과 상세 ${isOpen ? '닫기' : '펼치기'}`}
                    >
                      <div className="flex items-center gap-3">
                        <Badge variant={r.passed ? 'green' : 'red'}>{r.passed ? '통과' : '실패'}</Badge>
                        <span className="font-medium text-gray-800 dark:text-gray-200 text-sm font-mono">{r.table}</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">규칙 {r.rule_count}종 · 검사 {r.checked.toLocaleString()}건</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-500 dark:text-gray-400">오류율 {r.error_rate.toFixed(4)}%</span>
                        {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400 dark:text-gray-300" /> : <ChevronDown className="w-4 h-4 text-gray-400 dark:text-gray-300" />}
                      </div>
                    </button>

                    {isOpen && (
                      <div className="p-4 space-y-4">
                        {byArea.map(g => (
                          <div key={g.area}>
                            <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: AREA_META[g.area].color }} />
                              {g.label}
                            </h4>
                            <SortableTable
                              caption={`${g.label} 규칙별 위반 현황`}
                              data={g.items}
                              keyExtractor={(_, i) => String(i)}
                              minWidth={500}
                              tableClassName="text-xs border rounded-lg overflow-hidden"
                              columns={[
                                {
                                  key: 'rule',
                                  label: '규칙',
                                  render: d => d.rule,
                                },
                                {
                                  key: 'violations',
                                  label: '위반',
                                  align: 'right',
                                  sortable: true,
                                  sortValue: d => d.violations,
                                  className: 'w-32',
                                  render: d => (
                                    <Badge variant={d.violations === 0 ? 'green' : 'red'}>
                                      {d.violations === 0 ? '이상 없음' : `${d.violations.toLocaleString()}건 위반`}
                                    </Badge>
                                  ),
                                },
                              ]}
                            />
                          </div>
                        ))}
                        <div className="text-right text-xs text-gray-400 dark:text-gray-300 pt-2">
                          검사일: {formatDate(r.ran_at)}
                        </div>
                      </div>
                    )}
                  </Card>
                )
              })}

              {/* 데이터셋별 오류율 차트 */}
              <Card>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">데이터셋별 오류율</h3>
                <div className="h-64">
                  <figure
                    className="w-full h-full"
                    role="img"
                    aria-label={`데이터셋별 오류율 막대 차트, ${datasetStatusData.length}개 데이터셋`}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={datasetStatusData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(v: unknown) => [`${Number(v).toFixed(4)}%`, '오류율']} />
                        <Bar dataKey="오류율" radius={[4, 4, 0, 0]}>
                          {datasetStatusData.map((entry, i) => (
                            <Cell key={i} fill={entry.passed ? '#10B981' : '#EF4444'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </figure>
                </div>
              </Card>

              {/* 선택 데이터셋 레이더 차트 */}
              {datasetRadarData.length > 0 && (
                <Card>
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">선택 데이터셋 품질 5영역</h3>
                  <div className="h-72 flex items-center justify-center">
                    <figure
                      className="w-full h-full"
                      role="img"
                      aria-label={`선택 데이터셋 품질 5영역 레이더 차트`}
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <RadarChart data={datasetRadarData} margin={{ top: 8, right: 32, bottom: 8, left: 32 }}>
                          <PolarGrid />
                          <PolarAngleAxis dataKey="area" tick={{ fontSize: 12 }} />
                          <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 10 }} tickCount={6} />
                          <Tooltip formatter={(v: unknown) => [`${v}점`, '품질 점수']} />
                          <Radar name="품질 점수" dataKey="score" stroke="#10B981" fill="#10B981" fillOpacity={0.25} />
                        </RadarChart>
                      </ResponsiveContainer>
                    </figure>
                  </div>
                </Card>
              )}
            </div>
          )}

          {/* 이슈 상세 탭 */}
          {activeTab === 'issues' && (
            <div className="space-y-4">
              <Card className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">영역 필터:</span>
                {(['all', ...AREA_ORDER] as const).map(key => {
                  const active = areaFilter === key
                  const label = key === 'all' ? '전체' : AREA_META[key].label
                  const count = issueCountsByArea[key]
                  return (
                    <button
                      key={key}
                      onClick={() => setAreaFilter(key)}
                      className={`inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                        active
                          ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400'
                          : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                    >
                      {label}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${active ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'}`}>
                        {count}
                      </span>
                    </button>
                  )
                })}
              </Card>

              {filteredIssues.length === 0 ? (
                <Card>
                  <EmptyState
                    icon={<CheckCircle2 className="w-6 h-6 text-green-500" />}
                    title="해당 영역에 품질 이슈가 없습니다"
                    description="모든 품질 규칙이 정상입니다."
                  />
                </Card>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredIssues.slice(0, 20).map((issue, idx) => (
                      <Card key={idx} padding="sm" hover className="border-l-4" style={{ borderLeftColor: AREA_META[issue.area].color }}>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Badge variant={issue.area === 'completeness' ? 'blue' : issue.area === 'accuracy' ? 'green' : issue.area === 'consistency' ? 'purple' : issue.area === 'recency' ? 'amber' : 'gray'}>
                                {issue.areaLabel}
                              </Badge>
                              <SeverityBadge severity={issue.severity} />
                            </div>
                            <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mt-1.5">{issue.rule}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 font-mono">{issue.table} · {truncateId(issue.datasetId)}</p>
                          </div>
                          <span className="text-lg font-bold text-red-600 dark:text-red-400">{issue.violations.toLocaleString()}</span>
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-3 bg-gray-50 dark:bg-gray-950 p-2 rounded-lg">{issue.recommendation}</p>
                      </Card>
                    ))}
                  </div>

                  {filteredIssues.length > 20 && (
                    <p className="text-center text-xs text-gray-400 dark:text-gray-300">외 {filteredIssues.length - 20}건의 이슈가 더 있습니다.</p>
                  )}
                </>
              )}

              {/* 영역별 이슈 분포 차트 */}
              <Card>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">영역별 이슈 분포</h3>
                <div className="h-64 flex items-center justify-center">
                  <figure
                    className="w-full h-full"
                    role="img"
                    aria-label={`영역별 이슈 분포 원형 차트, 총 ${issues.length}건 이슈`}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={areaChartData.filter(d => d.위반 > 0)}
                          dataKey="위반"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          label={({ name, value }) => `${name}: ${value}`}
                        >
                          {areaChartData.filter(d => d.위반 > 0).map((entry, i) => (
                            <Cell key={i} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </figure>
                </div>
              </Card>
            </div>
          )}

          {/* 이력 비교 탭 */}
          {activeTab === 'history' && (
            <div className="space-y-4">
              <Card className="flex flex-wrap items-center gap-3">
                <label htmlFor="quality-dataset" className="text-sm text-gray-600 dark:text-gray-400">데이터셋 선택:</label>
                <select
                  id="quality-dataset"
                  value={selectedDataset}
                  onChange={e => setSelectedDataset(e.target.value)}
                  className="px-3 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
                >
                  {results.map(r => (
                    <option key={r.dataset_id} value={r.dataset_id}>{r.table} ({truncateId(r.dataset_id)})</option>
                  ))}
                </select>
              </Card>

              {compare && compare.current && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card className="text-center">
                      <p className="text-xs text-gray-500 dark:text-gray-400">현재 오류율</p>
                      <p className={`text-2xl font-bold mt-1 ${compare.current.passed ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {compare.current.error_rate.toFixed(4)}%
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-300 mt-1">{formatDate(compare.current.ran_at)}</p>
                    </Card>
                    <Card className="text-center">
                      <p className="text-xs text-gray-500 dark:text-gray-400">이전 대비 오류율</p>
                      <p className={`text-2xl font-bold mt-1 flex items-center justify-center gap-1 ${compare.improved ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {compare.improved ? <TrendingDown className="w-5 h-5" /> : <TrendingUp className="w-5 h-5" />}
                        {compare.deltaRate > 0 ? '+' : ''}{compare.deltaRate.toFixed(4)}%
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-300 mt-1">{compare.previous ? formatDate(compare.previous.ran_at) : '이전 이력 없음'}</p>
                    </Card>
                    <Card className="text-center">
                      <p className="text-xs text-gray-500 dark:text-gray-400">오류 건수 변화</p>
                      <p className={`text-2xl font-bold mt-1 ${compare.deltaErrors <= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {compare.deltaErrors > 0 ? '+' : ''}{compare.deltaErrors.toLocaleString()}건
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-300 mt-1">현재 {compare.current.errors.toLocaleString()}건</p>
                    </Card>
                  </div>

                  {/* 영역별 이력 비교 차트 */}
                  {areaCompareData.length > 0 && (
                    <Card>
                      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">영역별 위반 변화 (현재 − 이전)</h3>
                      <div className="h-64">
                        <figure
                          className="w-full h-full"
                          role="img"
                          aria-label="영역별 위반 변화 비교 막대 차트"
                        >
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={areaCompareData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} />
                              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                              <YAxis tick={{ fontSize: 11 }} />
                              <Tooltip formatter={(v: any, n: any) => [`${Number(v).toLocaleString()}건`, n === 'current' ? '현재' : '이전']} />
                              <Legend />
                              <Bar dataKey="current" name="현재" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                              <Bar dataKey="previous" name="이전" fill="#94A3B8" radius={[4, 4, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </figure>
                      </div>
                    </Card>
                  )}
                </>
              )}

              {history.length === 0 ? (
                <Card>
                  <EmptyState
                    icon={<History className="w-6 h-6 text-gray-300 dark:text-gray-200" />}
                    title="선택한 데이터셋의 진단 이력이 없습니다"
                    description="전체 재검사를 실행하면 이력이 쌓입니다."
                  />
                </Card>
              ) : (
                <Card>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">오류율 추이</h3>
                  </div>
                  <div className="h-72">
                    <figure
                      className="w-full h-full"
                      role="img"
                      aria-label={`오류율 추이 선 차트, 이력 ${historyChartData.length}건`}
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={historyChartData} margin={{ top: 8, right: 16, left: 8, bottom: 24 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="label" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={50} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip formatter={(v: unknown) => [`${Number(v).toFixed(4)}%`, '오류율']} />
                          <Legend />
                          <Line type="monotone" dataKey="오류율" stroke="#EF4444" strokeWidth={2} dot={{ r: 4 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </figure>
                  </div>
                </Card>
              )}

              {history.length > 0 && hasNIAHistory && (
                <Card>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">NIA 특성별 점수 추이</h3>
                    <span className="text-xs text-gray-400 dark:text-gray-500">측정된 특성만 표시</span>
                  </div>
                  <div className="h-72">
                    <figure className="w-full h-full" role="img" aria-label="NIA 9대 특성 점수 추이 선 차트">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={historyNIAChartData} margin={{ top: 8, right: 16, left: 8, bottom: 24 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="label" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={50} />
                          <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} unit="%" />
                          <Tooltip formatter={(v: unknown) => [`${Number(v).toFixed(2)}%`, '']} />
                          <Legend wrapperStyle={{ fontSize: 10 }} />
                          {(Object.keys(NIA_CHARACTERISTICS) as NIACharacteristic[])
                            .filter(k => historyNIAChartData.some(d => (d[k] as number) >= 0))
                            .map(k => (
                              <Line
                                key={k}
                                type="monotone"
                                dataKey={k}
                                name={NIA_CHARACTERISTICS[k].shortLabel}
                                stroke={NIA_CHARACTERISTICS[k].color}
                                strokeWidth={2}
                                dot={{ r: 3 }}
                                connectNulls={false}
                              />
                            ))}
                        </LineChart>
                      </ResponsiveContainer>
                    </figure>
                  </div>
                </Card>
              )}

              {history.length > 0 && (
                <Card>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">이력 목록</h3>
                    <Btn
                      size="sm"
                      variant="secondary"
                      onClick={() => downloadHistoryCSV(history, results.find(r => r.dataset_id === selectedDataset)?.table ?? 'dataset')}
                    >
                      <Download className="w-3.5 h-3.5" />
                      CSV 다운로드
                    </Btn>
                  </div>
                  <SortableTable
                    caption="품질 진단 이력 목록"
                    data={history}
                    keyExtractor={h => h.id}
                    minWidth={600}
                    columns={[
                      {
                        key: 'ran_at',
                        label: '검사일',
                        sortable: true,
                        sortValue: h => new Date(h.ran_at),
                        render: h => formatDate(h.ran_at),
                      },
                      {
                        key: 'error_rate',
                        label: '오류율',
                        align: 'right',
                        sortable: true,
                        sortValue: h => h.error_rate,
                        render: h => <span className="tabular-nums">{h.error_rate.toFixed(4)}%</span>,
                      },
                      {
                        key: 'errors',
                        label: '오류건수',
                        align: 'right',
                        sortable: true,
                        sortValue: h => h.errors,
                        render: h => <span className="tabular-nums">{h.errors.toLocaleString()}</span>,
                      },
                      {
                        key: 'checked',
                        label: '검사건수',
                        align: 'right',
                        sortable: true,
                        sortValue: h => h.checked,
                        render: h => <span className="tabular-nums">{h.checked.toLocaleString()}</span>,
                      },
                      {
                        key: 'passed',
                        label: '결과',
                        align: 'center',
                        render: h => <Badge variant={h.passed ? 'green' : 'red'}>{h.passed ? '통과' : '실패'}</Badge>,
                      },
                    ]}
                  />
                </Card>
              )}
            </div>
          )}

          {/* NIA 9대 품질 특성 탭 */}
          {activeTab === 'nia' && (() => {
            const measuredNIA = niaScores.filter(s => s.score >= 0)
            const niaRadarData = measuredNIA.map(s => ({
              area: NIA_CHARACTERISTICS[s.characteristic].shortLabel,
              score: s.score,
              fullMark: 100,
            }))
            return (
              <div className="space-y-4">
                {/* NIA 레이더 차트 */}
                {niaRadarData.length >= 3 && (
                  <Card>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">NIA 9대 특성 레이더</h3>
                      <span className="text-xs text-gray-400 dark:text-gray-500">측정된 {measuredNIA.length}개 특성</span>
                    </div>
                    <div className="h-72">
                      <figure className="w-full h-full" role="img" aria-label="NIA 9대 특성 레이더 차트">
                        <ResponsiveContainer width="100%" height="100%">
                          <RadarChart data={niaRadarData} margin={{ top: 8, right: 40, bottom: 8, left: 40 }}>
                            <PolarGrid />
                            <PolarAngleAxis dataKey="area" tick={{ fontSize: 11 }} />
                            <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 10 }} tickCount={6} />
                            <Tooltip formatter={(v: unknown) => [`${Number(v).toFixed(2)}점`, 'NIA 점수']} />
                            <Radar name="NIA 점수" dataKey="score" stroke="#8B5CF6" fill="#8B5CF6" fillOpacity={0.25} />
                          </RadarChart>
                        </ResponsiveContainer>
                      </figure>
                    </div>
                  </Card>
                )}

                <Card>
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">NIA AI 데이터 품질관리 가이드라인 v4.0 — 9대 품질 특성</h3>
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      {measuredNIA.length}개 측정 / {niaScores.length - measuredNIA.length}개 미측정
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                    준비성·완전성·유용성·기준 적합성·다양성·의미 정확성·구문 정확성·알고리즘 적정성·유효성
                  </p>
                  <NIAQualityGrid scores={niaScores} />
                </Card>

                <Card>
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">1-Cycle 자가점검 체크리스트</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                    샘플(착수) → 초기(5~10%) → 중간(30%) → 보완(50%) → 최종(100%) 5단계 품질 점검
                  </p>
                  <OneCycleChecklist datasetId={selectedDataset ?? undefined} />
                </Card>
              </div>
            )
          })()}

          {/* 데이터 생애주기 탭 */}
          {activeTab === 'lifecycle' && (
            <div className="space-y-4">
              <Card>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">4단계 데이터 생애주기</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                  데이터 획득·수집 → 정제 → 가공·어노테이션 → 학습 데이터 검증
                </p>
                <DataLifecycleTimeline />
              </Card>

              <Card>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">생애주기 단계별 품질 특성 연계</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="text-left py-2 pr-4 font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">생애주기 단계</th>
                        <th className="text-left py-2 font-medium text-gray-600 dark:text-gray-400">핵심 품질 특성</th>
                        <th className="text-left py-2 pl-4 font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">현황</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {([
                        { stage: 'acquisition', chars: ['readiness','completeness','usefulness','diversity'] as NIACharacteristic[] },
                        { stage: 'cleansing',   chars: ['completeness','standardConformance','diversity','syntacticAccuracy'] as NIACharacteristic[] },
                        { stage: 'annotation',  chars: ['usefulness','standardConformance','semanticAccuracy','syntacticAccuracy'] as NIACharacteristic[] },
                        { stage: 'validation',  chars: ['algorithmicAdequacy','validity'] as NIACharacteristic[] },
                      ] as const).map(row => {
                        const stageScores = row.chars.map(c => niaScores.find(s => s.characteristic === c))
                        const avgScore = stageScores
                          .filter(s => s && s.score >= 0)
                          .reduce((sum, s, _, arr) => sum + (s!.score / arr.length), 0)
                        const hasData = stageScores.some(s => s && s.score >= 0)
                        return (
                          <tr key={row.stage}>
                            <td className="py-2 pr-4 font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                              {row.stage === 'acquisition' ? '📥 획득·수집' :
                               row.stage === 'cleansing'   ? '🔧 정제' :
                               row.stage === 'annotation'  ? '🏷️ 가공·어노테이션' : '✅ 검증'}
                            </td>
                            <td className="py-2">
                              <div className="flex flex-wrap gap-1">
                                {row.chars.map(c => (
                                  <span key={c} className="px-1.5 py-0.5 rounded text-white text-[10px]"
                                    style={{ backgroundColor: NIA_CHARACTERISTICS[c].color + 'cc' }}>
                                    {NIA_CHARACTERISTICS[c].shortLabel}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="py-2 pl-4 tabular-nums font-medium">
                              {hasData ? (
                                <span className={avgScore >= 99 ? 'text-emerald-600 dark:text-emerald-400' : avgScore >= 90 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}>
                                  {avgScore.toFixed(1)}%
                                </span>
                              ) : (
                                <span className="text-gray-400 dark:text-gray-500">미측정</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}

          {/* 갭 분석 탭 */}
          {activeTab === 'gap' && (
            <div className="space-y-4">
              <Card className="flex flex-wrap items-center gap-3">
                <Filter className="w-4 h-4 text-gray-400 dark:text-gray-300" />
                <label htmlFor="gap-dataset-select" className="text-sm text-gray-600 dark:text-gray-400">데이터셋 선택</label>
                <select
                  id="gap-dataset-select"
                  value={selectedDataset}
                  onChange={e => {
                    setSelectedDataset(e.target.value)
                    setGapReport(null)
                    loadGapReport(e.target.value)
                  }}
                  className="text-sm border-gray-300 dark:border-gray-600 rounded-lg focus:ring-blue-500 focus:border-blue-500 py-1.5 pl-2 pr-8 bg-gray-50 dark:bg-gray-950"
                >
                  <option value="">선택하세요</option>
                  {results.map(r => (
                    <option key={r.dataset_id} value={r.dataset_id}>{r.table}</option>
                  ))}
                </select>
                {gapReport && (
                  <Btn
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      if (!selectedDataset) return
                      const res = await fetch(`/api/quality/gap-report?dataset_id=${encodeURIComponent(selectedDataset)}`)
                      if (!res.ok) return
                      const json = await res.json()
                      const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' })
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = `gap-report-${selectedDataset}.json`
                      document.body.appendChild(a)
                      a.click()
                      a.remove()
                      URL.revokeObjectURL(url)
                    }}
                  >
                    <Download className="w-3.5 h-3.5" />
                    갭 리포트 JSON 다운로드
                  </Btn>
                )}
              </Card>

              {!selectedDataset ? (
                <Card>
                  <EmptyState
                    icon={<AlertCircle className="w-6 h-6 text-gray-400 dark:text-gray-300" />}
                    title="데이터셋을 선택하세요"
                    description="갭 분석을 실행할 데이터셋을 위에서 선택하세요"
                  />
                </Card>
              ) : gapLoading ? (
                <QualitySkeleton />
              ) : gapError ? (
                <ErrorState message={gapError} onRetry={() => loadGapReport(selectedDataset)} />
              ) : gapReport ? (
                <Card>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">5대 영역 갭 분석</h3>
                    <span className="text-xs text-gray-400 dark:text-gray-500">데이터셋 {truncateId(gapReport.dataset_id)}</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    {(Object.entries(gapReport.areas) as [string, GapAreaResult][]).map(([key, area]) => {
                      const statusColor = area.status === 'green'
                        ? 'bg-green-500'
                        : area.status === 'yellow'
                          ? 'bg-amber-400'
                          : 'bg-red-500'
                      const cardBg = area.status === 'green'
                        ? 'bg-green-50/50 dark:bg-green-900/15 border-green-200 dark:border-green-800'
                        : area.status === 'yellow'
                          ? 'bg-amber-50/50 dark:bg-amber-900/15 border-amber-200 dark:border-amber-800'
                          : 'bg-red-50/50 dark:bg-red-900/15 border-red-200 dark:border-red-800'
                      const valueColor = area.status === 'green'
                        ? 'text-green-700 dark:text-green-400'
                        : area.status === 'yellow'
                          ? 'text-amber-700 dark:text-amber-400'
                          : 'text-red-700 dark:text-red-400'

                      return (
                        <div
                          key={key}
                          className={`rounded-xl border p-4 text-center flex flex-col items-center gap-2 ${cardBg}`}
                        >
                          <div className="flex items-center gap-1.5">
                            <span className={`w-3 h-3 rounded-full ${statusColor}`} />
                            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">영역 {key}</span>
                          </div>
                          <p className="text-sm font-bold text-gray-800 dark:text-gray-200">{area.label}</p>
                          {area.missing !== undefined ? (
                            <div className={`text-xs font-medium ${valueColor}`}>
                              {area.missing.length === 0
                                ? '누락 없음'
                                : `누락: ${area.missing.join(', ')}`}
                            </div>
                          ) : (
                            <p className={`text-lg font-bold tabular-nums ${valueColor}`}>
                              {area.value?.toLocaleString()}
                              <span className="text-xs font-normal ml-0.5">{area.unit}</span>
                            </p>
                          )}
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                            area.status === 'green' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' :
                            area.status === 'yellow' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' :
                            'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                          }`}>
                            {area.status === 'green' ? '양호' : area.status === 'yellow' ? '주의' : '위험'}
                          </span>
                        </div>
                      )
                    })}
                  </div>

                  <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-950 rounded-xl border text-xs text-gray-500 dark:text-gray-400 space-y-1.5">
                    <p className="font-semibold text-gray-600 dark:text-gray-300 mb-2">기준 안내</p>
                    <p>A 완전성 — null_rate &gt; 5% 위험 / &gt; 2% 주의</p>
                    <p>B 정확성 — 구문정확성·유효성 위반 건수 0 양호 / 100건 미만 주의 / 100건 이상 위험</p>
                    <p>C 일관성 — duplicate_rate &gt; 5% 위험 / &gt; 1% 주의</p>
                    <p>D 최신성 — 마지막 수집 후 &gt; 30일 위험 / &gt; 7일 주의</p>
                    <p>E 메타데이터 — title·description·category 누락 여부</p>
                  </div>
                </Card>
              ) : null}
            </div>
          )}

          {/* 품질 계약 편집 탭 */}
          {activeTab === 'contract' && (
            <div className="space-y-4">
              {/* 데이터셋 선택 */}
              <Card>
                <div className="flex flex-wrap items-center gap-3">
                  <Filter className="w-4 h-4 text-gray-400 dark:text-gray-300" />
                  <label htmlFor="contract-dataset-select" className="text-sm text-gray-600 dark:text-gray-400">데이터셋 선택</label>
                  <select
                    id="contract-dataset-select"
                    value={selectedDataset}
                    onChange={e => {
                      setSelectedDataset(e.target.value)
                      setContractData(null)
                      loadContract(e.target.value)
                    }}
                    className="text-sm border-gray-300 dark:border-gray-600 rounded-lg focus:ring-blue-500 focus:border-blue-500 py-1.5 pl-2 pr-8 bg-gray-50 dark:bg-gray-950"
                  >
                    <option value="">선택하세요</option>
                    {results.map(r => (
                      <option key={r.dataset_id} value={r.dataset_id}>{r.table}</option>
                    ))}
                  </select>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {contractData ? `현재 ${contractData.rules.length}개 규칙` : '규칙 없음'}
                  </span>
                </div>
              </Card>

              {contractLoading ? (
                <Card>
                  <div className="text-xs text-gray-400 dark:text-gray-500 text-center py-6">
                    품질 계약 로드 중…
                  </div>
                </Card>
              ) : !selectedDataset ? (
                <Card>
                  <EmptyState
                    icon={<FileEdit className="w-6 h-6 text-gray-400 dark:text-gray-300" />}
                    title="데이터셋을 선택하세요"
                    description="품질 계약을 편집할 데이터셋을 위에서 선택하세요"
                  />
                </Card>
              ) : (
                <Card>
                  <QualityContractEditor
                    datasetId={selectedDataset}
                    initialContract={contractData}
                    onSaved={contract => setContractData(contract)}
                  />
                </Card>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
