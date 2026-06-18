'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence } from 'framer-motion'
import { ReducedMotionDiv, ReducedMotionButton } from '@/components/ui/ReducedMotionWrapper'
import {
  CheckCircle, AlertTriangle, Clock, ArrowRight, Play, RefreshCw, History,
  Database, Settings2, BarChart2, ShieldCheck, Globe, ChevronRight,
} from 'lucide-react'
import { Badge } from '@/components/ui'
import SortableTable from '@/components/common/SortableTable'

// ────── 타입 ──────
type StepStatus = 'success' | 'running' | 'failed' | 'idle'
type StepKey = 'collect' | 'process' | 'analyze' | 'quality' | 'open'

interface FlowItem {
  id: string
  title: string
  status: string
  detail?: string
  tenant_id?: string
}

interface PipelineStep {
  key: StepKey
  label: string
  desc: string
  status: StepStatus
  count: number
  lastAt: string | null
  nextAt?: string | null
  href: string
  items: FlowItem[]
}

interface TimelineRun {
  id: string
  started_at: string
  source: StepKey
  source_label: string
  status: StepStatus
  message: string
  tenant_id?: string
}

interface FlowData {
  steps: PipelineStep[]
  runs: TimelineRun[]
  stats: {
    collectCount: number
    processCount: number
    analyzeCount: number
    qualityPass: number
    qualityTotal: number
    openCount: number
  }
}

// ────── 헬퍼 ──────
const STEP_META: Record<StepKey, { icon: typeof Database; color: string; bg: string; border: string }> = {
  collect: { icon: Database,   color: 'text-blue-600',   bg: 'bg-blue-50',   border: 'border-blue-200' },
  process: { icon: Settings2,  color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200' },
  analyze: { icon: BarChart2,  color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-200' },
  quality: { icon: ShieldCheck, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  open:    { icon: Globe,      color: 'text-amber-600',  bg: 'bg-amber-50',  border: 'border-amber-200' },
}

function statusMeta(status: StepStatus) {
  switch (status) {
    case 'success': return { icon: CheckCircle, cls: 'bg-green-100 text-green-700 border-green-200', label: '성공' }
    case 'running': return { icon: RefreshCw, cls: 'bg-blue-100 text-blue-700 border-blue-200', label: '진행중' }
    case 'failed':  return { icon: AlertTriangle, cls: 'bg-red-100 text-red-700 border-red-200', label: '실패' }
    default:        return { icon: Clock, cls: 'bg-gray-100 text-gray-500 border-gray-200', label: '대기' }
  }
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return '방금'
  if (m < 60) return `${m}분 전`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}시간 전`
  return `${Math.floor(h / 24)}일 전`
}

function statusFromString(s?: string): StepStatus {
  if (s === 'running') return 'running'
  if (s === 'done' || s === 'success' || s === 'approved') return 'success'
  if (s === 'failed' || s === 'error' || s === 'rejected') return 'failed'
  return 'idle'
}

// ────── 서브컴포넌트 ──────
function StepCard({
  step,
  index,
  total,
  active,
  onClick,
}: {
  step: PipelineStep
  index: number
  total: number
  active: boolean
  onClick: () => void
}) {
  const meta = STEP_META[step.key]
  const Icon = meta.icon
  const { icon: StatusIcon, cls, label } = statusMeta(step.status)

  return (
    <div className="relative flex-1 min-w-[140px]">
      <ReducedMotionButton
        onClick={onClick}
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.98 }}
        className={`w-full text-left rounded-xl border p-4 transition-all bg-white hover:shadow-md ${
          active ? `ring-2 ring-offset-2 ring-blue-400 border-blue-300` : 'border-gray-200'
        }`}
      >
        <div className="flex items-center justify-between mb-2">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
            <StatusIcon className={`w-3 h-3 ${step.status === 'running' ? 'animate-spin' : ''}`} />
            {label}
          </span>
          <span className={`p-1.5 rounded-lg ${meta.bg} ${meta.color}`}>
            <Icon className="w-4 h-4" />
          </span>
        </div>
        <p className="text-sm font-bold text-gray-800">{step.label}</p>
        <p className="text-xs text-gray-500 mt-0.5">{step.desc}</p>
        <div className="mt-3 text-xs text-gray-500 space-y-0.5">
          <p>건수: <span className="font-semibold text-gray-700">{step.count.toLocaleString()}건</span></p>
          <p>마지막: {formatDateTime(step.lastAt)}</p>
          {step.nextAt && <p>다음: {formatDateTime(step.nextAt)}</p>}
        </div>
      </ReducedMotionButton>
      {index < total - 1 && (
        <div className="hidden lg:flex absolute top-1/2 -right-3 -translate-y-1/2 z-10 items-center">
          <ArrowRight className="w-4 h-4 text-gray-300" />
        </div>
      )}
    </div>
  )
}

function StepDetail({ step, onClose }: { step: PipelineStep; onClose: () => void }) {
  const meta = STEP_META[step.key]
  const Icon = meta.icon

  return (
    <ReducedMotionDiv
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="bg-white rounded-xl border shadow-sm overflow-hidden"
    >
      <div className={`px-5 py-3 border-b flex items-center justify-between ${meta.bg}`}>
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${meta.color}`} />
          <h4 className="text-sm font-bold text-gray-800">{step.label} 단계 상세</h4>
          <span className="text-xs text-gray-500">({step.items.length}건)</span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={step.href}
            className="text-xs flex items-center gap-0.5 text-blue-600 hover:underline"
          >
            관리로 이동 <ChevronRight className="w-3 h-3" />
          </Link>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
        </div>
      </div>
      <div className="max-h-80 overflow-auto">
        {step.items.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">등록된 항목이 없습니다.</div>
        ) : (
          <SortableTable
            caption={`${step.label} 단계 상세 항목`}
            data={step.items}
            keyExtractor={item => item.id}
            columns={[
              {
                key: 'status',
                label: '상태',
                sortable: true,
                sortValue: item => item.status,
                render: item => {
                  const itemStatus = statusFromString(item.status)
                  const { cls } = statusMeta(itemStatus)
                  return (
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${cls}`}>
                      {item.status}
                    </span>
                  )
                },
              },
              {
                key: 'title',
                label: '이름',
                sortable: true,
                sortValue: item => item.title,
                render: item => <span className="font-medium text-gray-800">{item.title}</span>,
              },
              {
                key: 'detail',
                label: '상세',
                render: item => <span className="text-xs text-gray-500">{item.detail ?? '—'}</span>,
              },
            ]}
          />
        )}
      </div>
    </ReducedMotionDiv>
  )
}

function Timeline({ runs }: { runs: TimelineRun[] }) {
  if (runs.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm">
        최근 실행 이력이 없습니다.
      </div>
    )
  }

  return (
    <div className="relative pl-5">
      <div className="absolute left-[9px] top-2 bottom-2 w-0.5 bg-gray-100" />
      {runs.map((run, idx) => {
        const { icon: StatusIcon, cls } = statusMeta(run.status)
        const meta = STEP_META[run.source]
        const Icon = meta.icon
        return (
          <ReducedMotionDiv
            key={`${run.id}-${idx}`}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.05 }}
            className="relative mb-4 last:mb-0"
          >
            <div className={`absolute -left-[11px] top-1.5 w-5 h-5 rounded-full border-2 bg-white flex items-center justify-center ${cls.replace(/bg-\w+-100/, 'border-current').replace(/text-\w+-700/, '')}`}>
              <StatusIcon className={`w-2.5 h-2.5 ${run.status === 'running' ? 'animate-spin' : ''}`} />
            </div>
            <div className="ml-6 bg-white border rounded-lg p-3 hover:shadow-sm transition-shadow">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${meta.bg} ${meta.color} ${meta.border}`}>
                  <Icon className="w-3 h-3" />
                  {run.source_label}
                </span>
                <span className="text-xs text-gray-400">{timeAgo(run.started_at)}</span>
                <span className="text-xs text-gray-300">·</span>
                <span className="text-xs text-gray-400">{formatDateTime(run.started_at)}</span>
              </div>
              <p className="text-sm text-gray-700 mt-1.5">{run.message}</p>
            </div>
          </ReducedMotionDiv>
        )}
      )}
    </div>
  )
}

// ────── 메인 컴포넌트 ──────
export default function PipelineFlow() {
  const [data, setData] = useState<FlowData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [activeStep, setActiveStep] = useState<StepKey | null>(null)
  const [demoRunning, setDemoRunning] = useState(false)

  const loadData = useCallback(async () => {
    setRefreshing(true)
    try {
      const res = await fetch('/api/pipeline/flow')
      if (!res.ok) throw new Error('flow 데이터 로드 실패')
      const json: FlowData = await res.json()
      setData(json)
      setActiveStep(prev => (prev ? prev : json.steps[0]?.key ?? null))
    } catch {
      setData(null)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const activeStepData = useMemo(
    () => data?.steps.find(s => s.key === activeStep) ?? null,
    [data, activeStep]
  )

  function runDemo() {
    if (!data) return
    setDemoRunning(true)
    const order: StepKey[] = ['collect', 'process', 'analyze', 'quality', 'open']
    setData(prev => {
      if (!prev) return prev
      return {
        ...prev,
        steps: prev.steps.map(s => ({ ...s, status: s.key === 'collect' ? 'running' : 'idle' })),
      }
    })

    order.forEach((key, idx) => {
      setTimeout(() => {
        setData(prev => {
          if (!prev) return prev
          return {
            ...prev,
            steps: prev.steps.map(s => {
              const i = order.indexOf(s.key)
              if (i < idx) return { ...s, status: 'success' as StepStatus }
              if (i === idx) return { ...s, status: 'running' as StepStatus }
              return { ...s, status: 'idle' as StepStatus }
            }),
          }
        })
      }, 800 * idx)
    })

    setTimeout(() => {
      setData(prev => {
        if (!prev) return prev
        const now = new Date().toISOString()
        const newRun: TimelineRun = {
          id: `demo-${Date.now()}`,
          started_at: now,
          source: 'open',
          source_label: '개방',
          status: 'success',
          message: '데모 파이프라인 전체 완료',
        }
        return {
          ...prev,
          steps: prev.steps.map(s => ({ ...s, status: 'success' as StepStatus, lastAt: now })),
          runs: [newRun, ...prev.runs].slice(0, 20),
        }
      })
      setDemoRunning(false)
    }, 800 * order.length)
  }

  return (
    <div className="space-y-6">
      {/* 흐름도 카드 */}
      <div className="bg-white rounded-xl border shadow-sm p-5">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-base font-bold text-gray-800">수집 → 가공 → 분석 → 품질 → 개방</h3>
            <p className="text-xs text-gray-500 mt-0.5">데이터가 플랫폼을 통과하는 5단계 자동 파이프라인</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={loadData}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-2 border text-gray-600 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              새로고침
            </button>
            <button
              onClick={runDemo}
              disabled={demoRunning || loading || !data}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <Play className="w-4 h-4" />
              {demoRunning ? '실행 중...' : '흐름 데모'}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 animate-pulse">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-36 bg-gray-100 rounded-xl" />
            ))}
          </div>
        ) : !data ? (
          <div className="text-center py-12 text-gray-400 text-sm">
            파이프라인 데이터를 불러올 수 없습니다.
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-4">
            {data.steps.map((step, idx) => (
              <StepCard
                key={step.key}
                step={step}
                index={idx}
                total={data.steps.length}
                active={activeStep === step.key}
                onClick={() => setActiveStep(step.key)}
              />
            ))}
          </div>
        )}

        {/* SVG 연결선 (데스크톱) */}
        {!loading && data && (
          <svg className="hidden lg:block w-full h-2 mt-2" preserveAspectRatio="none">
            <line x1="0" y1="1" x2="100%" y2="1" stroke="#e5e7eb" strokeWidth="2" strokeDasharray="4 4" />
          </svg>
        )}
      </div>

      {/* 단계 상세 + 통계 */}
      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <AnimatePresence mode="wait">
              {activeStepData ? (
                <StepDetail key={activeStepData.key} step={activeStepData} onClose={() => setActiveStep(null)} />
              ) : (
                <div className="bg-gray-50 border border-dashed rounded-xl p-8 text-center text-gray-400 text-sm">
                  단계를 선택하면 상세 항목이 표시됩니다.
                </div>
              )}
            </AnimatePresence>
          </div>
          <div className="space-y-3">
            <div className="bg-white rounded-xl border p-4">
              <p className="text-xs text-gray-500">수집 소스</p>
              <p className="text-2xl font-bold text-blue-600">{data.stats.collectCount}</p>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <p className="text-xs text-gray-500">가공 파이프라인</p>
              <p className="text-2xl font-bold text-purple-600">{data.stats.processCount}</p>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <p className="text-xs text-gray-500">품질진단 통과</p>
              <p className="text-2xl font-bold text-green-600">
                {data.stats.qualityPass}<span className="text-sm text-gray-400 font-normal">/{data.stats.qualityTotal}</span>
              </p>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <p className="text-xs text-gray-500">개방 데이터셋</p>
              <p className="text-2xl font-bold text-amber-600">{data.stats.openCount}</p>
            </div>
          </div>
        </div>
      )}

      {/* 실행 이력 타임라인 */}
      <div className="bg-white rounded-xl border shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <History className="w-4 h-4 text-gray-500" />
          <h3 className="text-base font-bold text-gray-800">파이프라인 실행 이력</h3>
        </div>
        {loading ? (
          <div className="space-y-4 animate-pulse">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-20 bg-gray-100 rounded-lg" />
            ))}
          </div>
        ) : (
          <Timeline runs={data?.runs ?? []} />
        )}
      </div>
    </div>
  )
}
