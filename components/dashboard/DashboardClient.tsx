'use client'

import { useCallback, useEffect, useState, useRef } from 'react'
import { RefreshCw, AlertTriangle } from 'lucide-react'
import { useRealtime } from '@/components/realtime/RealtimeProvider'
import { subscribeTable } from '@/lib/supabase/realtime'
import PageHeader from '@/components/ui/PageHeader'
import Card from '@/components/ui/Card'
import EmptyState from '@/components/ui/EmptyState'
import Skeleton from '@/components/ui/Skeleton'
import Btn from '@/components/ui/Btn'
import ScoreGaugeWidget from './widgets/ScoreGaugeWidget'
import PipelineStatusWidget from './widgets/PipelineStatusWidget'
import PipelineDetailWidget from './widgets/PipelineDetailWidget'
import CollectionTrendWidget from './widgets/CollectionTrendWidget'
import RecentAnalysisWidget from './widgets/RecentAnalysisWidget'
import QualityWidget from './widgets/QualityWidget'
import QualitySignalWidget from './widgets/QualitySignalWidget'
import AnalysisFavoritesWidget from './widgets/AnalysisFavoritesWidget'
import SubmissionStatusWidget from './widgets/SubmissionStatusWidget'
import MigrationChartWidget from './widgets/MigrationChartWidget'
import PopulationTrendWidget from './widgets/PopulationTrendWidget'
import SettlementRankWidget from './widgets/SettlementRankWidget'
import DataUsageWidget from './widgets/DataUsageWidget'
import LineageWidget from './widgets/LineageWidget'
import GovernanceWidget from './widgets/GovernanceWidget'
import SyntheticBonusWidget from './widgets/SyntheticBonusWidget'

export interface AreaScore { name: string; score: number; color: string; weight: number }
export interface CollectionTrendRow {
  date: string
  runs: number
  rows: number
  ok: number
  fail: number
}

export interface Indicators {
  overall: number; areas: AreaScore[]; summary: string
  bonus?: { synthetic_cases: number; bonus_score: number }
  pipeline?: {
    collect_sources: number
    last_run_ok: number
    last_run_fail: number
    rows_today: number
    analysis_today: number
    process_today: number
  }
  qualityAvg?: { passRate: number; topIssues: string[] }
  trend?: CollectionTrendRow[]
}

export interface UsageData {
  topDownloads: { datasetId: string; title: string; count: number }[]
  recentDatasets: { datasetId: string; title: string; updatedAt: string }[]
  period: string
}

export interface AnalysisRun {
  id: string
  analysis_type: string
  dataset_label: string
  result_title: string | null
  created_at: string
}

export interface QualityRuleDetail { rule: string; violations: number }
export interface QualitySummary {
  passed: boolean
  error_rate: number
  threshold: number
  detail: QualityRuleDetail[]
}

export interface MigrationRow { sigun: string; net: number; inflow: number; outflow: number }
export interface PopulationTrendRow { year: number; total: number; net: number }
export interface SettlementRow {
  sigun: string; rank: number; settlement_score: number
  youth_pop_2025: number; youth_pop_change_rate: number
  living_index: number; income_monthly: number
}
export interface ChartData {
  migration: MigrationRow[]
  trend: PopulationTrendRow[]
  submissions: Record<string, number>
  year: number
  migYear: number
}

export function ScoreGauge({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <Card padding="md">
      <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">{label}</div>
      <div className="flex items-end gap-2">
        <span className="text-3xl font-bold" style={{ color }}>{value.toFixed(1)}</span>
        <span className="text-gray-400 dark:text-gray-300 text-sm mb-1">/ 100</span>
      </div>
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mt-2">
        <div className="h-2 rounded-full transition-all" style={{ width: `${value}%`, backgroundColor: color }} />
      </div>
    </Card>
  )
}

export const SUB_STATUS = [
  { key: 'submitted', label: '대기',   color: 'amber' as const },
  { key: 'review',    label: '검토중', color: 'blue'  as const },
  { key: 'approved',  label: '승인',   color: 'green' as const },
  { key: 'rejected',  label: '반려',   color: 'red'   as const },
]

export const formatK = (v: number) =>
  Math.abs(v) >= 10000 ? `${(v / 10000).toFixed(1)}만` : v.toLocaleString()

export const GRADE_COLOR = ['#6D28D9','#2563EB','#0891B2','#059669','#65A30D','#D97706','#DC2626']

export const PERIOD_LABELS: Record<string, string> = { month: '월', q: '분기', year: '연' }

export const ANALYSIS_TYPE_LABEL: Record<string, string> = {
  descriptives:        '기술통계량',
  frequencies:         '빈도 분석',
  normality:           '정규성 검정',
  crosstab:            '교차 분석',
  correlation:         '상관 분석',
  independent_ttest:   '독립표본 t-검정',
  one_way_anova:       '일원분산분석',
  linear_regression:   '선형 회귀분석',
  survival:            '생존 분석',
  timeseries_decompose:'시계열 분해',
}

export type MigrationFilter = 'all' | 'top-in' | 'top-out' | 'city' | 'county'
export const MIGRATION_FILTERS: { key: MigrationFilter; label: string }[] = [
  { key: 'all',     label: '전체 시군' },
  { key: 'top-in',  label: '상위 순유입' },
  { key: 'top-out', label: '상위 순유출' },
  { key: 'city',    label: '시 단위' },
  { key: 'county',  label: '군 단위' },
]

export function timeAgo(isoStr: string) {
  const diffMs = Date.now() - new Date(isoStr).getTime()
  const m = Math.floor(diffMs / 60000)
  if (m < 1)   return '방금'
  if (m < 60)  return `${m}분 전`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h}시간 전`
  return `${Math.floor(h / 24)}일 전`
}

async function parseApiResponse<T>(res: Response): Promise<T> {
  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    if (res.status === 401) {
      return Promise.reject(new Error('세션이 만료되었습니다. 다시 로그인해주세요.'))
    }
    return Promise.reject(new Error(`서버에서 예상치 못한 응답을 받았습니다 (${res.status}).`))
  }
  const data = await res.json()
  if (!res.ok) {
    return Promise.reject(new Error(data?.error ?? `요청 실패 (${res.status})`))
  }
  return data as T
}

function safeJson<T>(res: Response, fallback: T): Promise<T> {
  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) return Promise.resolve(fallback)
  return res.json().catch(() => fallback)
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card>
      <EmptyState
        icon={<AlertTriangle className="w-6 h-6 text-red-500" />}
        title="데이터를 불러오지 못했습니다"
        description={message}
        action={{ label: '다시 시도', onClick: onRetry }}
      />
    </Card>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} padding="md">
            <Skeleton className="h-4 w-2/3 mb-3" />
            <Skeleton className="h-8 w-1/2 mb-2" />
            <Skeleton className="h-2 w-full" />
          </Card>
        ))}
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <Card><Skeleton className="h-4 w-1/3 mb-4" /><Skeleton className="h-40" /></Card>
        <Card><Skeleton className="h-4 w-1/4 mb-4" /><Skeleton className="h-40" /></Card>
      </div>
      <Card><Skeleton className="h-4 w-1/3 mb-4" /><Skeleton className="h-64" /></Card>
    </div>
  )
}

export default function DashboardClient() {
  const [data, setData]           = useState<Indicators | null>(null)
  const [charts, setCharts]       = useState<ChartData | null>(null)
  const [settlement, setSettlement] = useState<SettlementRow[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [recentRuns, setRecentRuns] = useState<AnalysisRun[]>([])
  const [qualityDims, setQualityDims] = useState<{ name: string; label: string; status: 'pass'|'fail'|'none' }[]>([])
  const [autoRefresh, setAutoRefresh] = useState(false)

  const loadDashboard = useCallback(() => {
    setLoading(true)
    setError(null)
    Promise.all([
      fetch('/api/overview').then(parseApiResponse<Indicators>),
      fetch('/api/charts').then(parseApiResponse<ChartData>),
      fetch('/api/settlement').then(parseApiResponse<SettlementRow[]>),
    ]).then(([ov, ch, si]) => {
      setData(ov)
      setCharts(ch)
      setSettlement(si)
      setLoading(false)
    }).catch(err => {
      console.error('[Dashboard] 데이터 로드 오류:', err)
      const message = err?.message ?? '데이터를 불러올 수 없습니다.'
      if (typeof window !== 'undefined' && message.includes('세션이 만료')) {
        window.location.href = '/login'
        return
      }
      setError(message)
      setLoading(false)
    })
  }, [])

  const refreshRecentRuns = useCallback(() => {
    fetch('/api/analytics/runs?limit=5')
      .then(r => r.ok ? safeJson<AnalysisRun[]>(r, []) : [])
      .then(d => setRecentRuns(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [])

  useEffect(() => { loadDashboard() }, [loadDashboard])

  useEffect(() => {
    if (!autoRefresh) return
    const id = setInterval(() => loadDashboard(), 30_000)
    return () => clearInterval(id)
  }, [autoRefresh, loadDashboard])

  useEffect(() => { refreshRecentRuns() }, [refreshRecentRuns])

  // 실시간 구독: 처리/수집 이벤트 발생 시 지표 새로고침
  const realtime = useRealtime()
  const debounceRef = useRef<number | null>(null)
  const triggerRefresh = useCallback(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => {
      loadDashboard()
      refreshRecentRuns()
    }, 500)
  }, [loadDashboard, refreshRecentRuns])

  useEffect(() => {
    const subs = [
      subscribeTable(realtime, 'processing_runs', triggerRefresh, { event: 'INSERT' }),
      subscribeTable(realtime, 'collection_logs', triggerRefresh, { event: 'INSERT' }),
    ]
    return () => { subs.forEach(s => s.unsubscribe()) }
  }, [realtime, triggerRefresh])

  useEffect(() => {
    fetch('/api/quality')
      .then(r => r.ok ? safeJson<QualitySummary[]>(r, []) : [])
      .then((results: QualitySummary[]) => {
        if (!Array.isArray(results) || results.length === 0) return
        const dims: Record<string, { violations: number; hasRules: boolean }> = {
          completeness: { violations: 0, hasRules: false },
          accuracy:     { violations: 0, hasRules: false },
          consistency:  { violations: 0, hasRules: false },
          recency:      { violations: 0, hasRules: false },
          metadata:     { violations: 0, hasRules: false },
        }
        for (const r of results) {
          for (const d of r.detail) {
            const n = d.rule
            let dim = 'accuracy'
            if (n.includes('NULL') || n.includes('결측')) dim = 'completeness'
            else if (n.includes('연도'))                  dim = 'recency'
            else if (n.includes('정합성'))                dim = 'consistency'
            dims[dim].violations += d.violations
            dims[dim].hasRules = true
          }
        }
        const LABEL: Record<string, string> = {
          completeness: '완전성', accuracy: '정확성', consistency: '일관성', recency: '최신성', metadata: '메타데이터',
        }
        setQualityDims(Object.entries(dims).map(([name, { violations, hasRules }]) => ({
          name, label: LABEL[name],
          status: !hasRules ? 'none' : violations === 0 ? 'pass' : 'fail',
        })))
      })
      .catch(() => {})
  }, [])

  if (loading) return <DashboardSkeleton />
  if (error || !data) return <ErrorState message={error ?? '데이터를 불러올 수 없습니다.'} onRetry={loadDashboard} />

  return (
    <div className="space-y-8">
      <PageHeader
        title="대시보드"
        subtitle={data.summary}
        action={
          <div className="flex items-center gap-2">
            <Btn
              variant={autoRefresh ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setAutoRefresh(v => !v)}
              title="30초마다 자동 새로고침"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${autoRefresh ? 'animate-spin' : ''}`} />
              {autoRefresh ? '자동 새로고침 중' : '자동 새로고침'}
            </Btn>
            <Btn variant="secondary" size="sm" onClick={loadDashboard}>
              <RefreshCw className="w-3.5 h-3.5" />
              새로고침
            </Btn>
          </div>
        }
      />

      <ScoreGaugeWidget overall={data.overall} areas={data.areas} />

      {data.bonus && <SyntheticBonusWidget bonus={data.bonus} />}

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        <PipelineStatusWidget pipeline={data.pipeline} />
        <CollectionTrendWidget trend={data.trend} />
        <RecentAnalysisWidget recentRuns={recentRuns} />
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <PipelineDetailWidget />
        <QualitySignalWidget />
        <AnalysisFavoritesWidget />
      </div>

      <QualityWidget qualityDims={qualityDims} qualityAvg={data.qualityAvg} />

      {charts && (
        <>
          <SubmissionStatusWidget submissions={charts.submissions} />
          <MigrationChartWidget migration={charts.migration} migYear={charts.migYear} />
          <PopulationTrendWidget trend={charts.trend} year={charts.year} />
        </>
      )}

      {settlement.length > 0 && <SettlementRankWidget settlement={settlement} />}

      <DataUsageWidget />

      <GovernanceWidget />

      <div className="col-span-full">
        <LineageWidget />
      </div>
    </div>
  )
}
