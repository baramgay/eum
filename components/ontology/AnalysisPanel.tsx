'use client'

import { useState, useMemo, useCallback } from 'react'
import { BarChart3, Network, Route, Fingerprint, AlertTriangle, Play, Download } from 'lucide-react'
import { Card, Badge, Btn } from '@/components/ui'
import { apiClient } from '@/lib/api/client'
import type { OntologyNode, OntologyEdge } from '@/lib/ontology-utils'
import type { AnalyticsPayload, AnalyticsResult } from '@/lib/ontology/types'

type AnalysisType = AnalyticsPayload['type']

interface AnalysisPanelProps {
  nodes: OntologyNode[]
  edges: OntologyEdge[]
  onResult?: (result: AnalyticsResult | null) => void
}

const TABS: { key: AnalysisType; label: string; icon: React.ElementType }[] = [
  { key: 'centrality', label: '중심성', icon: BarChart3 },
  { key: 'community', label: '커뮤니티', icon: Network },
  { key: 'path', label: '경로', icon: Route },
  { key: 'similarity', label: '유사도', icon: Fingerprint },
  { key: 'anomaly', label: '이상탐지', icon: AlertTriangle },
]

const METRICS = [
  { value: 'degree', label: 'Degree' },
  { value: 'weightedDegree', label: 'Weighted Degree' },
  { value: 'betweenness', label: 'Betweenness' },
  { value: 'closeness', label: 'Closeness' },
  { value: 'eigenvector', label: 'Eigenvector' },
]

export default function AnalysisPanel({ nodes, edges, onResult }: AnalysisPanelProps) {
  const [type, setType] = useState<AnalysisType>('centrality')
  const [metric, setMetric] = useState<string>('degree')
  const [source, setSource] = useState('')
  const [target, setTarget] = useState('')
  const [nodeId, setNodeId] = useState('')
  const [top, setTop] = useState<number>(10)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<AnalyticsResult | null>(null)

  const sggNodes = useMemo(
    () => nodes.filter(n => n.obj_type === '시군').sort((a, b) => a.label.localeCompare(b.label, 'ko')),
    [nodes],
  )

  const canRun = useCallback(() => {
    if (type === 'path') return !!source && !!target
    if (type === 'similarity') return !!nodeId
    return true
  }, [type, source, target, nodeId])

  const run = useCallback(async () => {
    if (!canRun()) return
    setLoading(true)
    setError(null)
    try {
      const payload: AnalyticsPayload = { type }
      if (type === 'centrality' || type === 'anomaly') payload.metric = metric as AnalyticsPayload['metric']
      if (type === 'path') { payload.source = source; payload.target = target }
      if (type === 'similarity') { payload.nodeId = nodeId; payload.top = top }
      if ((type === 'centrality' || type === 'anomaly') && top) payload.top = top

      const data = await apiClient<AnalyticsResult>('/api/ontology/analytics', {
        method: 'POST',
        body: payload,
        fallbackMessage: status => `분석 실패 (${status})`,
      })
      setResult(data)
      onResult?.(data)
    } catch (e) {
      setResult(null)
      onResult?.(null)
      setError(e instanceof Error ? e.message : '분석 중 오류가 발생했습니다')
    } finally {
      setLoading(false)
    }
  }, [canRun, type, metric, source, target, nodeId, top, onResult])

  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => { setType(key); setResult(null); setError(null); onResult?.(null) }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              type === key
                ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-950'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {(type === 'centrality' || type === 'anomaly') && (
          <div className="flex flex-col sm:flex-row gap-3">
            <label className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
              Metric
              <select
                value={metric}
                onChange={e => setMetric(e.target.value)}
                className="px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-900"
              >
                {METRICS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </label>
            <label className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
              Top
              <input
                type="number"
                min={1}
                max={100}
                value={top}
                onChange={e => setTop(Number(e.target.value))}
                className="w-20 px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md text-sm"
              />
            </label>
          </div>
        )}

        {type === 'path' && (
          <div className="flex flex-col sm:flex-row gap-3">
            <label className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2 flex-1">
              출발
              <select
                value={source}
                onChange={e => setSource(e.target.value)}
                className="flex-1 min-w-0 px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-900"
              >
                <option value="">선택</option>
                {sggNodes.map(n => <option key={n.obj_id} value={n.obj_id}>{n.label}</option>)}
              </select>
            </label>
            <label className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2 flex-1">
              도착
              <select
                value={target}
                onChange={e => setTarget(e.target.value)}
                className="flex-1 min-w-0 px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-900"
              >
                <option value="">선택</option>
                {sggNodes.map(n => <option key={n.obj_id} value={n.obj_id}>{n.label}</option>)}
              </select>
            </label>
          </div>
        )}

        {type === 'similarity' && (
          <div className="flex flex-col sm:flex-row gap-3">
            <label className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2 flex-1">
              기준 노드
              <select
                value={nodeId}
                onChange={e => setNodeId(e.target.value)}
                className="flex-1 min-w-0 px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-900"
              >
                <option value="">선택</option>
                {nodes
                  .slice()
                  .sort((a, b) => a.label.localeCompare(b.label, 'ko'))
                  .map(n => <option key={n.obj_id} value={n.obj_id}>{n.label} ({n.obj_type})</option>)}
              </select>
            </label>
            <label className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
              Top
              <input
                type="number"
                min={1}
                max={100}
                value={top}
                onChange={e => setTop(Number(e.target.value))}
                className="w-20 px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md text-sm"
              />
            </label>
          </div>
        )}

        <Btn onClick={run} loading={loading} disabled={!canRun()} size="sm">
          <Play className="w-3.5 h-3.5" />
          분석 실행
        </Btn>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-xs text-red-700">
          {error}
        </div>
      )}

      {result && <AnalysisResultView result={result} nodes={nodes} />}
    </Card>
  )
}

const COMM_COLORS = [
  { bg: 'bg-indigo-500', light: 'bg-indigo-50 dark:bg-indigo-900/20', text: 'text-indigo-700 dark:text-indigo-300', border: 'border-indigo-200 dark:border-indigo-800' },
  { bg: 'bg-emerald-500', light: 'bg-emerald-50 dark:bg-emerald-900/20', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-200 dark:border-emerald-800' },
  { bg: 'bg-amber-500',   light: 'bg-amber-50 dark:bg-amber-900/20',   text: 'text-amber-700 dark:text-amber-300',   border: 'border-amber-200 dark:border-amber-800'   },
  { bg: 'bg-rose-500',    light: 'bg-rose-50 dark:bg-rose-900/20',    text: 'text-rose-700 dark:text-rose-300',    border: 'border-rose-200 dark:border-rose-800'    },
  { bg: 'bg-violet-500',  light: 'bg-violet-50 dark:bg-violet-900/20',  text: 'text-violet-700 dark:text-violet-300',  border: 'border-violet-200 dark:border-violet-800'  },
  { bg: 'bg-cyan-500',    light: 'bg-cyan-50 dark:bg-cyan-900/20',    text: 'text-cyan-700 dark:text-cyan-300',    border: 'border-cyan-200 dark:border-cyan-800'    },
  { bg: 'bg-pink-500',    light: 'bg-pink-50 dark:bg-pink-900/20',    text: 'text-pink-700 dark:text-pink-300',    border: 'border-pink-200 dark:border-pink-800'    },
  { bg: 'bg-orange-500',  light: 'bg-orange-50 dark:bg-orange-900/20',  text: 'text-orange-700 dark:text-orange-300',  border: 'border-orange-200 dark:border-orange-800'  },
]

function BarRow({ label, subLabel, score, maxScore, rank, color = 'indigo' }: {
  label: string; subLabel?: string; score: number; maxScore: number; rank?: number; color?: string
}) {
  const pct = maxScore > 0 ? (score / maxScore) * 100 : 0
  const barColor = color === 'red'
    ? 'bg-red-500 dark:bg-red-400'
    : color === 'emerald'
    ? 'bg-emerald-500 dark:bg-emerald-400'
    : 'bg-indigo-500 dark:bg-indigo-400'
  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-gray-50 dark:border-gray-800 last:border-0">
      {rank !== undefined && (
        <span className="text-[11px] text-gray-400 w-5 text-right tabular-nums flex-shrink-0">{rank}</span>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{label}</span>
          {subLabel && <span className="text-[10px] text-gray-400 flex-shrink-0">{subLabel}</span>}
        </div>
        <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <span className="text-[11px] font-medium text-gray-600 dark:text-gray-400 tabular-nums w-14 text-right flex-shrink-0">
        {score >= 1 ? score.toFixed(2) : score.toFixed(4)}
      </span>
    </div>
  )
}

function downloadAnalysisCSV(result: AnalyticsResult) {
  let headers: string[] = []
  let rows: string[][] = []
  let filename = 'analysis'

  if (result.type === 'centrality') {
    headers = ['순위', '노드ID', '레이블', '유형', `${result.metric} 점수`]
    rows = result.results.map(r => [String(r.rank), r.obj_id, r.label, r.obj_type, r.score.toFixed(6)])
    filename = `centrality_${result.metric}`
  } else if (result.type === 'community') {
    headers = ['클러스터ID', '크기', '밀도', '노드ID', '노드레이블', '노드유형']
    for (const c of result.communities) {
      for (const n of c.nodes) {
        rows.push([String(c.communityId), String(c.size), c.density.toFixed(4), n.obj_id, n.label, n.obj_type])
      }
    }
    filename = 'community'
  } else if (result.type === 'path' && result.result) {
    headers = ['순서', '노드ID', '레이블', '관계', '가중치']
    const { path, labels, edges: pe } = result.result
    path.forEach((id, i) => {
      const hop = pe[i]
      rows.push([String(i + 1), id, labels[i], hop?.rel ?? '-', hop ? hop.weight.toFixed(4) : '-'])
    })
    filename = 'shortest_path'
  } else if (result.type === 'similarity') {
    headers = ['순위', '노드ID', '레이블', '유형', '유사도']
    rows = result.results.map((r, i) => [String(i + 1), r.obj_id, r.label, r.obj_type, r.score.toFixed(6)])
    filename = 'similarity'
  } else if (result.type === 'anomaly') {
    headers = ['순위', '노드ID', '레이블', '유형', 'Z-Score', '이유']
    rows = result.results.map((r, i) => [String(i + 1), r.obj_id, r.label, r.obj_type, r.zScore.toFixed(4), r.reason])
    filename = 'anomaly'
  }

  const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `ontology_${filename}.csv`
  document.body.appendChild(a); a.click(); a.remove()
  URL.revokeObjectURL(url)
}

function AnalysisResultView({ result, nodes }: { result: AnalyticsResult; nodes: OntologyNode[] }) {
  const nodeLabel = useCallback((id: string) => nodes.find(n => n.obj_id === id)?.label ?? id, [nodes])

  if (result.type === 'centrality') {
    const maxScore = Math.max(...result.results.map(r => r.score), 0.0001)
    const METRIC_DESC: Record<string, string> = {
      degree: '연결 수',
      weightedDegree: '가중 연결',
      betweenness: '매개 중심성',
      closeness: '근접 중심성',
      eigenvector: '위세 중심성',
    }
    return (
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{result.metric} 중심성</p>
            <p className="text-[11px] text-gray-400 mt-0.5">{METRIC_DESC[result.metric] ?? result.metric}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="gray" size="sm">상위 {result.results.length}개</Badge>
            <button onClick={() => downloadAnalysisCSV(result)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600" title="CSV 다운로드">
              <Download className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto px-1">
          {result.results.map(r => (
            <BarRow
              key={r.obj_id}
              rank={r.rank}
              label={r.label}
              subLabel={r.obj_type}
              score={r.score}
              maxScore={maxScore}
            />
          ))}
        </div>
      </div>
    )
  }

  if (result.type === 'community') {
    const total = result.communities.reduce((s, c) => s + c.size, 0)
    const avgDensity = result.communities.length
      ? result.communities.reduce((s, c) => s + c.density, 0) / result.communities.length
      : 0
    const maxDensity = Math.max(...result.communities.map(c => c.density), 0.0001)
    return (
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">커뮤니티 탐지</p>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {result.communities.length}개 군집 · 평균 밀도 {avgDensity.toFixed(3)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="gray" size="sm">노드 {total}개</Badge>
            <button onClick={() => downloadAnalysisCSV(result)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600" title="CSV 다운로드">
              <Download className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {result.communities.map(c => {
            const col = COMM_COLORS[c.communityId % COMM_COLORS.length]
            const pct = maxDensity > 0 ? (c.density / maxDensity) * 100 : 0
            return (
              <div key={c.communityId} className={`rounded-xl border p-3 ${col.border}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${col.bg}`} />
                    <span className={`text-xs font-semibold ${col.text}`}>클러스터 {c.communityId}</span>
                  </div>
                  <span className="text-[11px] text-gray-500">{c.size}개 노드</span>
                </div>
                <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden mb-2">
                  <div className={`h-full rounded-full ${col.bg}`} style={{ width: `${pct}%` }} />
                </div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-gray-400">밀도 {Number(c.density).toFixed(3)}</span>
                  <span className="text-[10px] text-gray-400">{(pct).toFixed(0)}% of max</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {c.nodes.slice(0, 10).map(n => (
                    <span key={n.obj_id} className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${col.light} ${col.text}`}>
                      {n.label}
                    </span>
                  ))}
                  {c.nodes.length > 10 && (
                    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] text-gray-400 bg-gray-50 dark:bg-gray-800">
                      +{c.nodes.length - 10}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  if (result.type === 'path') {
    if (!result.result) {
      return (
        <div className="text-center py-6">
          <Route className="w-8 h-8 mx-auto mb-2 text-gray-300" />
          <p className="text-sm text-gray-500 dark:text-gray-400">두 노드 사이에 경로가 없습니다.</p>
        </div>
      )
    }
    const { labels, distance, edges: pathEdges } = result.result
    return (
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">최단 경로</p>
          <div className="flex items-center gap-2">
            <Badge variant="gray" size="sm">{labels.length - 1}홉</Badge>
            <Badge variant="blue" size="sm">거리 {Number(distance).toFixed(3)}</Badge>
            <button onClick={() => downloadAnalysisCSV(result)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600" title="CSV 다운로드">
              <Download className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <div className="space-y-1.5">
          {labels.map((label, i) => (
            <div key={i}>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${i === 0 ? 'bg-indigo-500' : i === labels.length - 1 ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                <span className={`text-xs font-medium px-2 py-1 rounded-lg ${
                  i === 0 ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300'
                  : i === labels.length - 1 ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
                  : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                }`}>{label}</span>
                {i === 0 && <span className="text-[10px] text-gray-400">출발</span>}
                {i === labels.length - 1 && <span className="text-[10px] text-gray-400">도착</span>}
              </div>
              {i < labels.length - 1 && pathEdges?.[i] && (
                <div className="flex items-center gap-2 ml-1 my-0.5">
                  <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 ml-0.5" />
                  <span className="text-[10px] text-gray-400 bg-gray-50 dark:bg-gray-800 px-1.5 py-0.5 rounded">
                    {pathEdges[i].rel} (w={pathEdges[i].weight})
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (result.type === 'similarity') {
    const maxScore = Math.max(...result.results.map(r => r.score), 0.0001)
    return (
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              유사 노드 — {nodeLabel(result.nodeId)}
            </p>
            <p className="text-[11px] text-gray-400 mt-0.5">Jaccard 계수 기반</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="gray" size="sm">{result.results.length}개</Badge>
            <button onClick={() => downloadAnalysisCSV(result)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600" title="CSV 다운로드">
              <Download className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto px-1">
          {result.results.map((r, i) => (
            <BarRow
              key={r.obj_id}
              rank={i + 1}
              label={r.label}
              subLabel={r.obj_type}
              score={r.score}
              maxScore={maxScore}
              color="emerald"
            />
          ))}
        </div>
      </div>
    )
  }

  if (result.type === 'anomaly') {
    const maxZ = Math.max(...result.results.map(r => Math.abs(r.zScore)), 2)
    return (
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">이상탐지</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Z-score ≥ 2.0 이상 노드</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="gray" size="sm">{result.results.length}개</Badge>
            <button onClick={() => downloadAnalysisCSV(result)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600" title="CSV 다운로드">
              <Download className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        {result.results.length === 0 ? (
          <div className="text-center py-6">
            <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            <p className="text-xs text-gray-400">이상 노드가 감지되지 않았습니다.</p>
          </div>
        ) : (
          <div className="max-h-72 overflow-y-auto space-y-2 px-1">
            {result.results.map(r => {
              const absZ = Math.abs(r.zScore)
              const pct = (absZ / maxZ) * 100
              const severity = absZ >= 3.5 ? 'bg-red-500' : absZ >= 2.5 ? 'bg-orange-500' : 'bg-yellow-500'
              return (
                <div key={r.obj_id} className="flex items-start gap-2 py-1.5 border-b border-gray-50 dark:border-gray-800 last:border-0">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{r.label}</span>
                      <span className="text-[10px] text-gray-400 flex-shrink-0">{r.obj_type}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden mb-1">
                      <div className={`h-full rounded-full ${severity}`} style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-[10px] text-gray-500">{r.reason}</p>
                  </div>
                  <span className="text-xs font-semibold text-red-600 dark:text-red-400 tabular-nums flex-shrink-0 mt-0.5">
                    {r.zScore >= 0 ? '+' : ''}{Number(r.zScore).toFixed(2)}σ
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return null
}
