'use client'

import { useMemo } from 'react'
import { MessageSquare, Database, ExternalLink, Sparkles } from 'lucide-react'
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
  const props = parseProps(node.props)
  const meta = getNodeTypeMeta(node.obj_type)
  const nodeEdges = getNeighborEdges(node.obj_id, edges)
  const degree = nodeEdges.length

  const nodeMap = useMemo(() => {
    const map = new Map<string, OntologyNode>()
    nodes?.forEach(n => map.set(n.obj_id, n))
    return map
  }, [nodes])

  const neighborIds = new Set<string>()
  nodeEdges.forEach(e => {
    const otherId = e.src === node.obj_id ? e.dst : e.src
    neighborIds.add(otherId)
  })

  const uniqueNeighbors = Array.from(neighborIds)
  const neighborCountByType = uniqueNeighbors.reduce((acc, id) => {
    const neighbor = nodeMap.get(id)
    const key = neighbor?.obj_type ?? 'unknown'
    acc.set(key, (acc.get(key) ?? 0) + 1)
    return acc
  }, new Map<string, number>())

  const propEntries = Object.entries(props)

  return (
    <Card className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div
          className="w-4 h-4 rounded-full ring-2 ring-gray-100 flex-shrink-0 mt-1"
          style={{ backgroundColor: meta.color }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-base">{node.label}</h3>
            <Badge variant={meta.badge}>{node.obj_type}</Badge>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-300 font-mono break-all mt-1">{node.obj_id}</p>
        </div>
      </div>

      {/* Degree summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gray-50 dark:bg-gray-950 rounded-xl p-3 border border-gray-100 text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400">연결 수</p>
          <p className="text-lg font-bold text-gray-800 dark:text-gray-200">{degree}</p>
        </div>
        <div className="bg-gray-50 dark:bg-gray-950 rounded-xl p-3 border border-gray-100 text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400">이웃 수</p>
          <p className="text-lg font-bold text-gray-800 dark:text-gray-200">{uniqueNeighbors.length}</p>
        </div>
      </div>

      {/* Props table */}
      {propEntries.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">속성</p>
            <Badge variant="gray" size="sm">{propEntries.length}개</Badge>
          </div>
          <div className="space-y-1.5 bg-gray-50 dark:bg-gray-950 rounded-xl p-3 border border-gray-100">
            {propEntries.map(([k, v]) => (
              <div key={k} className="flex justify-between text-xs gap-3">
                <span className="text-gray-500 dark:text-gray-400 flex-shrink-0">{k}</span>
                <span className="font-medium text-gray-700 dark:text-gray-300 text-right break-words">{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Neighbor counts by relation */}
      {neighborCountByType.size > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">관계별 이웃</p>
          <div className="flex flex-wrap gap-2">
            {Array.from(neighborCountByType.entries()).map(([rel, count]) => (
              <Badge key={rel} variant="blue" size="sm">{rel} {count}</Badge>
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
          {!relatedLoading && <Badge variant="gray" size="sm">{relatedDatasets.length}개</Badge>}
        </div>
        {relatedLoading ? (
          <div className="space-y-2">
            <div className="h-12 w-full bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
            <div className="h-12 w-full bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
          </div>
        ) : relatedDatasets.length === 0 ? (
          <div className="text-center py-5 bg-gray-50 dark:bg-gray-950 rounded-xl border border-gray-100">
            <Database className="w-8 h-8 mx-auto mb-2 text-gray-300 dark:text-gray-200" />
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">매칭된 데이터셋이 없습니다</p>
            <p className="text-[10px] text-gray-400 dark:text-gray-300 mt-0.5">AI 질의로 더 넓은 데이터를 찾아보세요.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {relatedDatasets.slice(0, 5).map(ds => (
              <li key={ds.dataset_id}>
                <button
                  onClick={() => onDatasetClick?.(ds)}
                  className="w-full flex items-center justify-between p-2 border rounded-md hover:bg-blue-50 transition-colors text-left"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{ds.title}</p>
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
    </Card>
  )
}
