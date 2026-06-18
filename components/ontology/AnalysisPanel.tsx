'use client'

import { useState, useMemo, useCallback } from 'react'
import { BarChart3, Network, Route, Fingerprint, AlertTriangle, Play, Loader2 } from 'lucide-react'
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

function AnalysisResultView({ result, nodes }: { result: AnalyticsResult; nodes: OntologyNode[] }) {
  const nodeLabel = useCallback((id: string) => nodes.find(n => n.obj_id === id)?.label ?? id, [nodes])

  if (result.type === 'centrality') {
    return (
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{result.metric} 중심성 상위</p>
          <Badge variant="gray" size="sm">{result.results.length}개</Badge>
        </div>
        <div className="overflow-x-auto max-h-64">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 dark:bg-gray-950 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left text-gray-600 dark:text-gray-400">순위</th>
                <th className="px-3 py-2 text-left text-gray-600 dark:text-gray-400">노드</th>
                <th className="px-3 py-2 text-left text-gray-600 dark:text-gray-400">타입</th>
                <th className="px-3 py-2 text-right text-gray-600 dark:text-gray-400">점수</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {result.results.map(r => (
                <tr key={r.obj_id} className="hover:bg-gray-50 dark:hover:bg-gray-950">
                  <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{r.rank}</td>
                  <td className="px-3 py-2 font-medium text-gray-800 dark:text-gray-200">{r.label}</td>
                  <td className="px-3 py-2"><Badge variant="gray" size="sm">{r.obj_type}</Badge></td>
                  <td className="px-3 py-2 text-right font-medium text-indigo-700">{Number(r.score).toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  if (result.type === 'community') {
    return (
      <div className="space-y-3 max-h-64 overflow-y-auto">
        {result.communities.map(c => (
          <div key={c.communityId} className="border rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">커뮤니티 {c.communityId}</p>
              <Badge variant="gray" size="sm">{c.size}개 · density {Number(c.density).toFixed(3)}</Badge>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {c.nodes.slice(0, 12).map(n => (
                <Badge key={n.obj_id} variant="blue" size="sm">{n.label}</Badge>
              ))}
              {c.nodes.length > 12 && <Badge variant="gray" size="sm">+{c.nodes.length - 12}</Badge>}
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (result.type === 'path') {
    if (!result.result) return <p className="text-sm text-gray-500 dark:text-gray-400">경로를 찾을 수 없습니다.</p>
    return (
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">최단 경로</p>
          <Badge variant="gray" size="sm">거리 {result.result.distance}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {result.result.labels.map((label, i) => (
            <span key={i} className="inline-flex items-center gap-1.5">
              <Badge variant="blue" size="sm">{label}</Badge>
              {i < result.result!.labels.length - 1 && <span className="text-gray-400 dark:text-gray-300">→</span>}
            </span>
          ))}
        </div>
      </div>
    )
  }

  if (result.type === 'similarity') {
    return (
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{nodeLabel(result.nodeId)} 유사 노드</p>
          <Badge variant="gray" size="sm">{result.results.length}개</Badge>
        </div>
        <div className="overflow-x-auto max-h-64">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 dark:bg-gray-950 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left text-gray-600 dark:text-gray-400">노드</th>
                <th className="px-3 py-2 text-left text-gray-600 dark:text-gray-400">타입</th>
                <th className="px-3 py-2 text-right text-gray-600 dark:text-gray-400">유사도</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {result.results.map(r => (
                <tr key={r.obj_id} className="hover:bg-gray-50 dark:hover:bg-gray-950">
                  <td className="px-3 py-2 font-medium text-gray-800 dark:text-gray-200">{r.label}</td>
                  <td className="px-3 py-2"><Badge variant="gray" size="sm">{r.obj_type}</Badge></td>
                  <td className="px-3 py-2 text-right font-medium text-indigo-700">{Number(r.score).toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  if (result.type === 'anomaly') {
    return (
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">이상탐지 결과</p>
          <Badge variant="gray" size="sm">{result.results.length}개</Badge>
        </div>
        <div className="overflow-x-auto max-h-64">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 dark:bg-gray-950 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left text-gray-600 dark:text-gray-400">노드</th>
                <th className="px-3 py-2 text-left text-gray-600 dark:text-gray-400">타입</th>
                <th className="px-3 py-2 text-right text-gray-600 dark:text-gray-400">Z-score</th>
                <th className="px-3 py-2 text-left text-gray-600 dark:text-gray-400">사유</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {result.results.map(r => (
                <tr key={r.obj_id} className="hover:bg-gray-50 dark:hover:bg-gray-950">
                  <td className="px-3 py-2 font-medium text-gray-800 dark:text-gray-200">{r.label}</td>
                  <td className="px-3 py-2"><Badge variant="gray" size="sm">{r.obj_type}</Badge></td>
                  <td className="px-3 py-2 text-right font-medium text-red-600">{Number(r.zScore).toFixed(2)}</td>
                  <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{r.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return null
}
