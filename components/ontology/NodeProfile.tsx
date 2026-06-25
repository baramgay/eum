'use client'

import { useMemo, useState } from 'react'
import { MessageSquare, Database, ExternalLink, Sparkles, ArrowUp, ArrowDown, Clock, Columns } from 'lucide-react'
import { Card, Badge, Btn } from '@/components/ui'
import type { OntologyNode, OntologyEdge } from '@/lib/ontology-utils'
import { parseProps, getNeighborEdges, getNodeTypeMeta } from '@/lib/ontology-utils'

interface RelatedDataset {
  dataset_id: string
  title: string
  theme: string
  rows: number | null
  updated_at: string | null
  is_open: boolean
  ai_ready: boolean
}

interface NodeProfileProps {
  node: OntologyNode
  edges: OntologyEdge[]
  nodes?: OntologyNode[]
  relatedDatasets?: RelatedDataset[]
  relatedLoading?: boolean
  onAiQuery?: (node: OntologyNode) => void
  onExploreNode?: (node: OntologyNode) => void
  onDatasetClick?: (dataset: RelatedDataset) => void
}

type DatasetSort = 'name' | 'rows' | 'date'
type DatasetFilter = 'all' | 'ai-ready' | 'open'

function parseFreshness(props: Record<string, string>): { label: string; color: string } | null {
  const raw = props['updated_at'] ?? props['last_built'] ?? props['수집일'] ?? props['기준일'] ?? null
  if (!raw) return null
  const date = new Date(raw)
  if (isNaN(date.getTime())) return null
  const diffDays = Math.floor((Date.now() - date.getTime()) / 86400000)
  if (diffDays <= 7) return { label: `${diffDays}일 전`, color: '#10B981' }
  if (diffDays <= 30) return { label: `${diffDays}일 전`, color: '#F59E0B' }
  return { label: `${diffDays}일 전`, color: '#EF4444' }
}

function parseSchema(props: Record<string, string>): string[] {
  const cols = props['columns'] ?? props['schema'] ?? null
  if (!cols) return []
  return cols.split(',').map(c => c.split(':')[0].trim()).filter(Boolean)
}

export default function NodeProfile({
  node,
  edges,
  nodes,
  relatedDatasets = [],
  relatedLoading = false,
  onAiQuery,
  onExploreNode,
  onDatasetClick,
}: NodeProfileProps) {
  const [dsSort, setDsSort] = useState<DatasetSort>('name')
  const [dsFilter, setDsFilter] = useState<DatasetFilter>('all')

  const props = parseProps(node.props)
  const meta = getNodeTypeMeta(node.obj_type)
  const nodeEdges = getNeighborEdges(node.obj_id, edges)

  const nodeMap = useMemo(() => {
    const map = new Map<string, OntologyNode>()
    nodes?.forEach(n => map.set(n.obj_id, n))
    return map
  }, [nodes])

  // Directed upstream/downstream split
  const upstream = nodeEdges.filter(e => e.dst === node.obj_id)
  const downstream = nodeEdges.filter(e => e.src === node.obj_id)
  const uniqueNeighborIds = new Set<string>()
  nodeEdges.forEach(e => uniqueNeighborIds.add(e.src === node.obj_id ? e.dst : e.src))

  // Neighbor count by type
  const neighborCountByType = Array.from(uniqueNeighborIds).reduce((acc, id) => {
    const t = nodeMap.get(id)?.obj_type ?? 'unknown'
    acc.set(t, (acc.get(t) ?? 0) + 1)
    return acc
  }, new Map<string, number>())
  const maxNeighborCount = Math.max(...neighborCountByType.values(), 1)

  const freshness = parseFreshness(props)
  const schema = parseSchema(props)
  const propEntries = Object.entries(props).filter(([k]) => !['columns', 'schema', 'updated_at', 'last_built', '수집일', '기준일'].includes(k))

  // Related datasets with sort + filter
  const filteredDatasets = useMemo(() => {
    let list = [...relatedDatasets]
    if (dsFilter === 'ai-ready') list = list.filter(d => d.ai_ready)
    if (dsFilter === 'open') list = list.filter(d => d.is_open)
    if (dsSort === 'rows') list.sort((a, b) => (b.rows ?? 0) - (a.rows ?? 0))
    else if (dsSort === 'date') list.sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''))
    else list.sort((a, b) => a.title.localeCompare(b.title))
    return list
  }, [relatedDatasets, dsSort, dsFilter])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div
          className="w-4 h-4 rounded-full ring-2 ring-gray-100 dark:ring-gray-700 flex-shrink-0 mt-1"
          style={{ backgroundColor: meta.color }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-base">{node.label}</h3>
            <Badge variant={meta.badge}>{node.obj_type}</Badge>
            {freshness && (
              <span
                className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                style={{ background: freshness.color + '22', color: freshness.color }}
              >
                <Clock className="w-2.5 h-2.5" />{freshness.label}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-300 font-mono break-all mt-1">{node.obj_id}</p>
        </div>
      </div>

      {/* Upstream / Downstream */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gray-50 dark:bg-gray-950 rounded-xl p-3 border border-gray-100 dark:border-gray-700 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <ArrowUp className="w-3 h-3 text-blue-400" />
            <p className="text-xs text-gray-500 dark:text-gray-400">입력 (상위)</p>
          </div>
          <p className="text-lg font-bold text-gray-800 dark:text-gray-200">{upstream.length}</p>
        </div>
        <div className="bg-gray-50 dark:bg-gray-950 rounded-xl p-3 border border-gray-100 dark:border-gray-700 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <ArrowDown className="w-3 h-3 text-emerald-400" />
            <p className="text-xs text-gray-500 dark:text-gray-400">출력 (하위)</p>
          </div>
          <p className="text-lg font-bold text-gray-800 dark:text-gray-200">{downstream.length}</p>
        </div>
      </div>

      {/* Schema / Columns */}
      {schema.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Columns className="w-3 h-3 text-gray-400 dark:text-gray-500" />
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">컬럼 ({schema.length})</p>
          </div>
          <div className="flex flex-wrap gap-1">
            {schema.slice(0, 12).map(col => (
              <span key={col} className="text-[10px] px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded font-mono text-gray-600 dark:text-gray-300">{col}</span>
            ))}
            {schema.length > 12 && <span className="text-[10px] text-gray-400 dark:text-gray-500">+{schema.length - 12}</span>}
          </div>
        </div>
      )}

      {/* Props table */}
      {propEntries.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">속성</p>
            <Badge variant="gray" size="sm">{propEntries.length}개</Badge>
          </div>
          <div className="space-y-1.5 bg-gray-50 dark:bg-gray-950 rounded-xl p-3 border border-gray-100 dark:border-gray-700">
            {propEntries.map(([k, v]) => (
              <div key={k} className="flex justify-between text-xs gap-3">
                <span className="text-gray-500 dark:text-gray-400 flex-shrink-0">{k}</span>
                <span className="font-medium text-gray-700 dark:text-gray-300 text-right break-words">{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Neighbor distribution bar */}
      {neighborCountByType.size > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">이웃 분포</p>
          <div className="space-y-1.5">
            {Array.from(neighborCountByType.entries()).sort(([, a], [, b]) => b - a).slice(0, 6).map(([type, count]) => (
              <div key={type} className="flex items-center gap-2">
                <span className="text-[10px] text-gray-500 dark:text-gray-400 w-14 flex-shrink-0 truncate">{type}</span>
                <div className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-400 transition-all"
                    style={{ width: `${(count / maxNeighborCount) * 100}%` }}
                  />
                </div>
                <span className="text-[10px] text-gray-500 dark:text-gray-400 w-4 text-right">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Related datasets */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 text-blue-500" />
            관련 데이터셋
          </p>
          {!relatedLoading && <Badge variant="gray" size="sm">{filteredDatasets.length}개</Badge>}
        </div>
        {/* Sort + filter chips */}
        {relatedDatasets.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {(['all', 'ai-ready', 'open'] as DatasetFilter[]).map(f => (
              <button
                key={f}
                onClick={() => setDsFilter(f)}
                className={`text-[10px] px-2 py-0.5 rounded-full border transition-all ${dsFilter === f ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-blue-300'}`}
              >
                {f === 'all' ? '전체' : f === 'ai-ready' ? 'AI Ready' : '공개'}
              </button>
            ))}
            <span className="text-gray-300 dark:text-gray-600">|</span>
            {(['name', 'rows', 'date'] as DatasetSort[]).map(s => (
              <button
                key={s}
                onClick={() => setDsSort(s)}
                className={`text-[10px] px-2 py-0.5 rounded-full border transition-all ${dsSort === s ? 'bg-gray-700 text-white border-gray-700 dark:bg-gray-200 dark:text-gray-900 dark:border-gray-200' : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-400'}`}
              >
                {s === 'name' ? '이름' : s === 'rows' ? '행수' : '날짜'}
              </button>
            ))}
          </div>
        )}
        {relatedLoading ? (
          <div className="space-y-2">
            <div className="h-12 w-full bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
            <div className="h-12 w-full bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
          </div>
        ) : filteredDatasets.length === 0 ? (
          <div className="text-center py-5 bg-gray-50 dark:bg-gray-950 rounded-xl border border-gray-100 dark:border-gray-700">
            <Database className="w-8 h-8 mx-auto mb-2 text-gray-300 dark:text-gray-200" />
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">매칭된 데이터셋이 없습니다</p>
            <p className="text-[10px] text-gray-400 dark:text-gray-300 mt-0.5">AI 질의로 더 넓은 데이터를 찾아보세요.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {filteredDatasets.slice(0, 5).map(ds => (
              <li key={ds.dataset_id}>
                <button
                  onClick={() => onDatasetClick?.(ds)}
                  className="w-full flex items-center justify-between p-2 border border-gray-200 dark:border-gray-700 rounded-md hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors text-left"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1 flex-wrap">
                      <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{ds.title}</p>
                      {ds.ai_ready && <span className="text-[9px] px-1 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded font-medium">AI</span>}
                      {ds.is_open && <span className="text-[9px] px-1 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded font-medium">공개</span>}
                    </div>
                    <p className="text-[10px] text-gray-400 dark:text-gray-300">{ds.theme} · {ds.rows != null ? `${ds.rows.toLocaleString()}행` : '—'}</p>
                  </div>
                  <ExternalLink className="w-3 h-3 text-gray-400 dark:text-gray-300 flex-shrink-0 ml-2" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        {onAiQuery && (
          <Btn onClick={() => onAiQuery(node)} className="flex-1" size="sm">
            <MessageSquare className="w-3.5 h-3.5" />
            AI 질의
          </Btn>
        )}
        {onExploreNode && (
          <Btn onClick={() => onExploreNode(node)} variant="secondary" className="flex-1" size="sm">
            <Sparkles className="w-3.5 h-3.5" />
            중심으로 탐색
          </Btn>
        )}
      </div>
    </div>
  )
}
