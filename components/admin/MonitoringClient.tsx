'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Activity, AlertTriangle, CheckCircle2, Clock,
  RefreshCw, Server, TrendingUp, XCircle,
} from 'lucide-react'
import { PageHeader, Btn, Card, Skeleton, EmptyState, Badge } from '@/components/ui'

interface HealthCheck { name: string; status: 'ok' | 'fail' | 'skipped'; message?: string }
interface Health { status: 'ok' | 'degraded'; checks: HealthCheck[] }

interface Metrics {
  api: {
    total: number
    errorCount: number
    errorRate: number
    avgResponseMs: number
    p95ResponseMs: number
  }
  activeJobs: { collections: number; processes: number }
  failures: { collections: number; processes: number }
  window: { since: string; minutes: number }
}

export default function MonitoringClient() {
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [health, setHealth]   = useState<Health | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [mRes, hRes] = await Promise.all([
        fetch('/api/metrics'),
        fetch('/api/health'),
      ])
      if (!mRes.ok) {
        const e = await mRes.json().catch(() => ({ error: '지표를 불러오지 못했습니다' }))
        throw new Error(e.error)
      }
      const m = await mRes.json() as Metrics
      const h = await hRes.json() as Health
      setMetrics(m)
      setHealth(h)
    } catch (err) {
      setError(err instanceof Error ? err.message : '모니터링 데이터를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!autoRefresh) return
    const id = setInterval(() => load(), 30_000)
    return () => clearInterval(id)
  }, [autoRefresh, load])

  if (loading && !metrics) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Card><Skeleton className="h-40" /></Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="시스템 모니터링"
        subtitle="API 지표, 크론 작업, 시스템 상태를 실시간으로 확인합니다"
        action={
          <div className="flex items-center gap-2">
            <Btn
              variant={autoRefresh ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setAutoRefresh(v => !v)}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${autoRefresh ? 'animate-spin' : ''}`} />
              {autoRefresh ? '자동 새로고침 중' : '자동 새로고침'}
            </Btn>
            <Btn variant="secondary" size="sm" onClick={load}>
              <RefreshCw className="w-3.5 h-3.5" />
              새로고침
            </Btn>
          </div>
        }
      />

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          {error}
        </div>
      )}

      {metrics && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card padding="md">
              <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">API 요청 (1시간)</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{metrics.api.total.toLocaleString()}</div>
              <div className="text-xs text-gray-400 dark:text-gray-300 mt-1">5xx {metrics.api.errorCount}건</div>
            </Card>
            <Card padding="md">
              <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">평균 응답 시간</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{Math.round(metrics.api.avgResponseMs)}ms</div>
              <div className="text-xs text-gray-400 dark:text-gray-300 mt-1">p95 {Math.round(metrics.api.p95ResponseMs)}ms</div>
            </Card>
            <Card padding="md">
              <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">오류율</div>
              <div className={`text-2xl font-bold ${metrics.api.errorRate > 0.05 ? 'text-red-600' : 'text-gray-900 dark:text-gray-100'}`}>
                {(metrics.api.errorRate * 100).toFixed(1)}%
              </div>
              <div className="text-xs text-gray-400 dark:text-gray-300 mt-1">임계 5%</div>
            </Card>
            <Card padding="md">
              <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">활성 작업</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {metrics.activeJobs.collections + metrics.activeJobs.processes}
              </div>
              <div className="text-xs text-gray-400 dark:text-gray-300 mt-1">
                수집 {metrics.activeJobs.collections} / 가공 {metrics.activeJobs.processes}
              </div>
            </Card>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <h3 className="font-medium text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
                <XCircle className="w-4 h-4 text-red-500" />
                최근 실패 (1시간)
              </h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">수집 실패</span>
                  <Badge variant={metrics.failures.collections > 0 ? 'red' : 'green'}>
                    {metrics.failures.collections}건
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">가공 실패</span>
                  <Badge variant={metrics.failures.processes > 0 ? 'red' : 'green'}>
                    {metrics.failures.processes}건
                  </Badge>
                </div>
              </div>
            </Card>

            <Card>
              <h3 className="font-medium text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
                <Server className="w-4 h-4 text-blue-500" />
                /api/health 상태
              </h3>
              {health ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {health.status === 'ok' ? (
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-amber-500" />
                    )}
                    <span className="font-medium text-gray-800 dark:text-gray-200">
                      {health.status === 'ok' ? '정상' : '경고'}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {health.checks.map(c => (
                      <div key={c.name} className="flex items-center justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-400 capitalize">{c.name}</span>
                        <Badge
                          variant={c.status === 'ok' ? 'green' : c.status === 'skipped' ? 'gray' : 'red'}
                          size="sm"
                        >
                          {c.status === 'ok' ? '정상' : c.status === 'skipped' ? '비활성' : '실패'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <EmptyState icon={<Activity className="w-6 h-6 text-gray-400 dark:text-gray-300" />} title="상태를 불러오지 못했습니다" />
              )}
            </Card>
          </div>
        </>
      )}

      <div className="text-xs text-gray-400 dark:text-gray-300 flex items-center gap-1">
        <Clock className="w-3.5 h-3.5" />
        {metrics ? `기준 시각: ${new Date(metrics.window.since).toLocaleString('ko-KR')}` : '—'}
      </div>
    </div>
  )
}
