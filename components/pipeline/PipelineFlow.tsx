'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import {
  CheckCircle, AlertTriangle, Clock, ArrowRight, Play, RefreshCw, History,
  Database, Settings2, BarChart2, ShieldCheck, Globe,
} from 'lucide-react'
import { Badge } from '@/components/ui'

// ────── 타입 ──────
interface CollectSource {
  source_id: string
  job?: { status: string; last_run_at: string | null; next_run_at: string | null }
}

interface ProcessPipeline {
  id: string
  rules: unknown[]
}

interface ProcessRun {
  id: string
  status: string
  started_at: string
}

interface Submission {
  submission_id: string
  status: string
  quality_summary: string | null
}

interface AnalysisRecord {
  record_id: string
}

type StepStatus = 'success' | 'running' | 'failed' | 'idle'

interface PipelineStep {
  key: string
  label: string
  desc: string
  status: StepStatus
  count: number
  lastAt: string
  nextAt?: string
  href: string
}

interface PipelineRun {
  id: string
  started_at: string
  duration_sec: number
  steps: { key: string; status: StepStatus; message: string }[]
}

interface FlowStats {
  collectCount: number
  collectStatus: StepStatus
  processCount: number
  processStatus: StepStatus
  analyzeCount: number
  qualityTotal: number
  qualityPass: number
  openCount: number
}

// ────── 헬퍼 ──────
function statusBadge(status: StepStatus) {
  switch (status) {
    case 'success': return { icon: CheckCircle, cls: 'bg-green-100 text-green-700 border-green-200', label: '성공' }
    case 'running': return { icon: RefreshCw, cls: 'bg-blue-100 text-blue-700 border-blue-200', label: '진행중' }
    case 'failed':  return { icon: AlertTriangle, cls: 'bg-red-100 text-red-700 border-red-200', label: '실패' }
    default:        return { icon: Clock, cls: 'bg-gray-100 text-gray-500 border-gray-200', label: '대기' }
  }
}

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}분 ${s.toString().padStart(2, '0')}초`
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3600000)
  if (h < 1) return '방금'
  if (h < 24) return `${h}시간 전`
  return `${Math.floor(h / 24)}일 전`
}

function formatDateTime(d: Date | null): string {
  if (!d || isNaN(d.getTime())) return '—'
  return d.toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function deriveStatus(
  items: { status?: string; job?: { status?: string } }[],
  hasItems: boolean,
): StepStatus {
  if (!hasItems) return 'idle'
  const statuses = items.map(i => i.status ?? i.job?.status).filter(Boolean)
  if (statuses.some(s => s === 'running')) return 'running'
  if (statuses.some(s => s === 'failed')) return 'failed'
  if (statuses.some(s => s === 'success' || s === 'done' || s === 'approved')) return 'success'
  return 'idle'
}

// ────── 데이터 처리 흐름 컴포넌트 ──────
export default function PipelineFlow() {
  const [steps, setSteps]       = useState<PipelineStep[]>([])
  const [runs, setRuns]         = useState<PipelineRun[]>([])
  const [running, setRunning]   = useState(false)
  const [loading, setLoading]   = useState(true)
  const [stats, setStats]       = useState<FlowStats>({
    collectCount: 0, collectStatus: 'idle',
    processCount: 0, processStatus: 'idle',
    analyzeCount: 0, qualityTotal: 0, qualityPass: 0, openCount: 0,
  })

  async function loadData() {
    setLoading(true)
    try {
      const [sourcesRes, pipelinesRes, submissionsRes, analysisRes, runsRes] = await Promise.all([
        fetch('/api/collect'),
        fetch('/api/process'),
        fetch('/api/submission?all=true'),
        fetch('/api/pipeline/analysis'),
        fetch('/api/process/runs'),
      ])

      const sources: CollectSource[] = sourcesRes.ok ? await sourcesRes.json() : []
      const pipelines: ProcessPipeline[] = pipelinesRes.ok ? await pipelinesRes.json() : []
      const submissions: Submission[] = submissionsRes.ok ? await submissionsRes.json() : []
      const analysis: AnalysisRecord[] = analysisRes.ok ? await analysisRes.json() : []
      const allRuns: (ProcessRun & { pipeline_id?: string })[] = runsRes.ok ? await runsRes.json() : []

      const collectStatus = deriveStatus(sources as unknown as { job?: { status?: string } }[], sources.length > 0)
      const processStatus = deriveStatus(
        allRuns.map(r => ({ status: r.status })),
        pipelines.length > 0,
      )
      const qualityPass = submissions.filter(s => s.quality_summary?.includes('통과')).length
      const openCount = submissions.filter(s => s.status === 'approved').length

      const nowStr = formatDateTime(new Date())
      const lastCollectRun = sources
        .filter(s => s.job?.last_run_at)
        .sort((a, b) => new Date(b.job!.last_run_at!).getTime() - new Date(a.job!.last_run_at!).getTime())[0]
      const nextCollectRun = sources
        .filter(s => s.job?.next_run_at)
        .sort((a, b) => new Date(a.job!.next_run_at!).getTime() - new Date(b.job!.next_run_at!).getTime())[0]
      const lastProcessRun = allRuns
        .filter(r => r.started_at)
        .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())[0]

      const newSteps: PipelineStep[] = [
        {
          key: 'collect', label: '수집', desc: '시군 공공DB · API · 파일',
          status: collectStatus, count: sources.length,
          lastAt: lastCollectRun ? formatDateTime(new Date(lastCollectRun.job!.last_run_at!)) : nowStr,
          nextAt: nextCollectRun ? formatDateTime(new Date(nextCollectRun.job!.next_run_at!)) : undefined,
          href: '/collect',
        },
        {
          key: 'process', label: '가공', desc: '정제·표준화·파생변수',
          status: processStatus, count: pipelines.length,
          lastAt: lastProcessRun ? formatDateTime(new Date(lastProcessRun.started_at)) : nowStr,
          href: '/process',
        },
        {
          key: 'analyze', label: '분석', desc: '통계·머신러닝·시계열',
          status: analysis.length > 0 ? 'success' : 'idle', count: analysis.length,
          lastAt: analysis.length > 0 ? nowStr : '—',
          href: '/analytics',
        },
        {
          key: 'quality', label: '품질', desc: '규칙기반 진단·오류율',
          status: submissions.length > 0 ? (qualityPass === submissions.length ? 'success' : 'failed') : 'idle',
          count: submissions.length,
          lastAt: submissions.length > 0 ? nowStr : '—',
          href: '/quality',
        },
        {
          key: 'open', label: '개방', desc: '포털 등록·API·카탈로그',
          status: openCount > 0 ? 'success' : 'idle', count: openCount,
          lastAt: openCount > 0 ? nowStr : '—',
          href: '/portal',
        },
      ]
      setSteps(newSteps)
      setStats({
        collectCount: sources.length,
        collectStatus,
        processCount: pipelines.length,
        processStatus,
        analyzeCount: analysis.length,
        qualityTotal: submissions.length,
        qualityPass,
        openCount,
      })

      // 최근 실행 이력: processing_runs 기반 + 가상 단계 매핑
      const recentRuns: PipelineRun[] = allRuns.slice(0, 5).map(r => {
        const stepStatus: StepStatus = r.status === 'done' ? 'success' : r.status === 'failed' ? 'failed' : 'idle'
        return {
          id: r.id,
          started_at: r.started_at,
          duration_sec: 0,
          steps: newSteps.map(s => ({
            key: s.key,
            status: s.key === 'process' ? stepStatus : (s.status === 'success' ? 'success' : 'idle'),
            message: s.key === 'process' ? `파이프라인 ${r.status}` : `${s.label} 단계`,
          })),
        }
      })
      setRuns(recentRuns)
    } catch {
      // 오류 시 빈 상태로 표시
      setSteps([])
      setRuns([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  function runPipeline() {
    setRunning(true)
    setSteps(prev => prev.map((s, i) => i === 0 ? { ...s, status: 'running' } : { ...s, status: 'idle' }))

    const stepDelay = 900
    steps.forEach((_, idx) => {
      setTimeout(() => {
        setSteps(prev => prev.map((s, i) => {
          if (i < idx) return { ...s, status: 'success' }
          if (i === idx) return { ...s, status: 'running' }
          return { ...s, status: 'idle' }
        }))
      }, stepDelay * idx)
    })

    setTimeout(() => {
      setSteps(prev => prev.map(s => ({ ...s, status: 'success' })))
      const newRun: PipelineRun = {
        id: `run-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${String(runs.length + 1).padStart(3,'0')}`,
        started_at: new Date().toISOString(),
        duration_sec: Math.floor(steps.length * stepDelay / 1000),
        steps: steps.map(s => ({ key: s.key, status: 'success', message: `${s.label} 단계 완료` })),
      }
      setRuns(prev => [newRun, ...prev])
      setRunning(false)
    }, stepDelay * steps.length)
  }

  const stepIcons: Record<string, ReactNode> = {
    collect: <Database className="w-4 h-4" />,
    process: <Settings2 className="w-4 h-4" />,
    analyze: <BarChart2 className="w-4 h-4" />,
    quality: <ShieldCheck className="w-4 h-4" />,
    open:    <Globe className="w-4 h-4" />,
  }

  return (
    <div className="space-y-6">
      {/* 단계 흐름 카드 */}
      <div className="bg-white rounded-xl border shadow-sm p-5">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-base font-semibold text-gray-800">수집 → 가공 → 분석 → 품질 → 개방</h3>
            <p className="text-xs text-gray-500 mt-0.5">데이터가 플랫폼을 통과하는 5단계 자동 파이프라인</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={loadData}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 border text-gray-600 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              새로고침
            </button>
            <button
              onClick={runPipeline}
              disabled={running || steps.length === 0}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <Play className="w-4 h-4" />
              {running ? '실행 중...' : '파이프라인 실행'}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 animate-pulse">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-32 bg-gray-100 rounded-xl" />
            ))}
          </div>
        ) : steps.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">
            파이프라인 단계 데이터를 불러올 수 없습니다.
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row items-stretch gap-3">
            {steps.map((step, idx) => {
              const { icon: Icon, cls, label } = statusBadge(step.status)
              return (
                <div key={step.key} className="flex-1 flex flex-col">
                  <Link
                    href={step.href}
                    className={`flex-1 rounded-xl border p-4 transition-colors hover:shadow-sm bg-white group`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
                        <Icon className={`w-3 h-3 ${step.status === 'running' ? 'animate-spin' : ''}`} />
                        {label}
                      </span>
                      <span className="text-xs text-gray-400 group-hover:text-blue-500 transition-colors">{stepIcons[step.key]}</span>
                    </div>
                    <p className="text-sm font-semibold text-gray-800 group-hover:text-blue-700 transition-colors">{step.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{step.desc}</p>
                    <div className="mt-3 text-xs text-gray-400 space-y-0.5">
                      <p>건수: <span className="font-medium text-gray-600">{step.count.toLocaleString()}건</span></p>
                      <p>마지막: {step.lastAt}</p>
                      {step.nextAt && <p>다음: {step.nextAt}</p>}
                    </div>
                  </Link>
                  {idx < steps.length - 1 && (
                    <div className="hidden lg:flex items-center justify-center py-2">
                      <ArrowRight className="w-4 h-4 text-gray-300" />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 통계 요약 */}
      {!loading && steps.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border p-4">
            <p className="text-xs text-gray-500">수집 소스</p>
            <p className="text-2xl font-bold text-blue-600">{stats.collectCount}</p>
            <Badge variant={stats.collectStatus === 'success' ? 'green' : stats.collectStatus === 'failed' ? 'red' : stats.collectStatus === 'running' ? 'blue' : 'gray'}>
              {stats.collectStatus === 'success' ? '정상' : stats.collectStatus === 'failed' ? '실패' : stats.collectStatus === 'running' ? '진행중' : '대기'}
            </Badge>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <p className="text-xs text-gray-500">가공 파이프라인</p>
            <p className="text-2xl font-bold text-purple-600">{stats.processCount}</p>
            <Badge variant={stats.processStatus === 'success' ? 'green' : stats.processStatus === 'failed' ? 'red' : stats.processStatus === 'running' ? 'blue' : 'gray'}>
              {stats.processStatus === 'success' ? '정상' : stats.processStatus === 'failed' ? '실패' : stats.processStatus === 'running' ? '진행중' : '대기'}
            </Badge>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <p className="text-xs text-gray-500">품질진단 통과</p>
            <p className="text-2xl font-bold text-green-600">{stats.qualityPass}<span className="text-sm text-gray-400 font-normal">/{stats.qualityTotal}</span></p>
            <Badge variant={stats.qualityTotal > 0 && stats.qualityPass === stats.qualityTotal ? 'green' : stats.qualityTotal > 0 ? 'amber' : 'gray'}>
              {stats.qualityTotal > 0 ? `${Math.round((stats.qualityPass / stats.qualityTotal) * 100)}%` : '—'}
            </Badge>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <p className="text-xs text-gray-500">개방 데이터셋</p>
            <p className="text-2xl font-bold text-emerald-600">{stats.openCount}</p>
            <Badge variant={stats.openCount > 0 ? 'green' : 'gray'}>
              {stats.openCount > 0 ? '개방중' : '대기'}
            </Badge>
          </div>
        </div>
      )}

      {/* 실행 이력 타임라인 */}
      <div className="bg-white rounded-xl border shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <History className="w-4 h-4 text-gray-500" />
          <h3 className="text-base font-semibold text-gray-800">파이프라인 실행 이력</h3>
        </div>
        {loading ? (
          <div className="space-y-4 animate-pulse">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-20 bg-gray-100 rounded-lg" />
            ))}
          </div>
        ) : runs.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">
            최근 실행 이력이 없습니다.
          </div>
        ) : (
          <div className="relative pl-4">
            <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-gray-100" />
            {runs.map((run) => (
              <div key={run.id} className="relative mb-5 last:mb-0">
                <div className={`absolute -left-[9px] top-1.5 w-4 h-4 rounded-full border-2 bg-white ${
                  run.steps.some(s => s.status === 'failed') ? 'border-red-400' : 'border-green-400'
                }`} />
                <div className="ml-6">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-800">{run.id}</span>
                    <span className="text-xs text-gray-400">{timeAgo(run.started_at)} · 소요 {formatDuration(run.duration_sec)}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-5 gap-2">
                    {run.steps.map(s => {
                      const { cls } = statusBadge(s.status)
                      return (
                        <div key={s.key} className={`text-center rounded-lg border p-2 ${cls.replace(/text-\w+-\d+/g, '').replace(/border-\w+-\d+/g, 'border-gray-100')} bg-gray-50`}>
                          <p className={`text-xs font-semibold ${cls.match(/text-\w+-\d+/)?.[0] ?? 'text-gray-600'}`}>
                            {steps.find(x => x.key === s.key)?.label}
                          </p>
                          <p className="text-[10px] text-gray-400 mt-0.5 truncate" title={s.message}>
                            {s.status === 'success' ? '성공' : s.status === 'failed' ? '실패' : '—'}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
