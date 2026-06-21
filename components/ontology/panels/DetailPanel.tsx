'use client'

import { useState, useMemo } from 'react'
import { Card, Btn } from '@/components/ui'
import { Check, Copy, X, Info, GitMerge, Link2 } from 'lucide-react'
import NodeProfile from '../NodeProfile'
import type { OntologyNode } from '@/lib/ontology-utils'
import type { RelatedDataset, ActionResult } from '../hooks/useOntologyData'

interface DetailPanelProps {
  node: OntologyNode
  actionResult: ActionResult | null
  relatedDatasets: RelatedDataset[]
  relatedLoading: boolean
  copiedId: boolean
  graphNodes: OntologyNode[]
  graphEdges: { src: string; rel: string; dst: string; weight: number }[]
  onClose: () => void
  onCopyId: (id: string) => void
  onAiQuery: (node: OntologyNode) => void
  onExploreNode: (node: OntologyNode) => void
  onDatasetClick: (dataset: RelatedDataset) => void
}

type Tab = 'info' | 'lineage' | 'related'

function buildLineageChain(
  nodeId: string,
  edges: { src: string; rel: string; dst: string; weight: number }[],
  nodes: OntologyNode[],
  direction: 'up' | 'down',
  depth = 0,
  visited = new Set<string>()
): Array<{ node: OntologyNode; rel: string; depth: number }> {
  if (depth > 3 || visited.has(nodeId)) return []
  visited.add(nodeId)
  const results: Array<{ node: OntologyNode; rel: string; depth: number }> = []
  const nodeMap = new Map(nodes.map(n => [n.obj_id, n]))
  const connected = direction === 'up'
    ? edges.filter(e => e.dst === nodeId)
    : edges.filter(e => e.src === nodeId)
  for (const e of connected) {
    const otherId = direction === 'up' ? e.src : e.dst
    const other = nodeMap.get(otherId)
    if (!other) continue
    results.push({ node: other, rel: e.rel, depth })
    results.push(...buildLineageChain(otherId, edges, nodes, direction, depth + 1, new Set(visited)))
  }
  return results
}

export default function DetailPanel({
  node,
  actionResult,
  relatedDatasets,
  relatedLoading,
  copiedId,
  graphNodes,
  graphEdges,
  onClose,
  onCopyId,
  onAiQuery,
  onExploreNode,
  onDatasetClick,
}: DetailPanelProps) {
  const [tab, setTab] = useState<Tab>('info')
  const priorityScore = actionResult?.results.find(r => r.sigun === node.label)?.priority_score ?? null
  const maxPriority = actionResult?.results?.[0]?.priority_score ?? 1

  const ancestors = useMemo(
    () => buildLineageChain(node.obj_id, graphEdges, graphNodes, 'up'),
    [node.obj_id, graphEdges, graphNodes]
  )
  const descendants = useMemo(
    () => buildLineageChain(node.obj_id, graphEdges, graphNodes, 'down'),
    [node.obj_id, graphEdges, graphNodes]
  )

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'info', label: '정보', icon: <Info className="w-3 h-3" /> },
    { id: 'lineage', label: '계보', icon: <GitMerge className="w-3 h-3" /> },
    { id: 'related', label: '관련', icon: <Link2 className="w-3 h-3" /> },
  ]

  return (
    <Card className="h-fit lg:sticky lg:top-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-1.5">
          <p className="text-xs text-gray-400 dark:text-gray-300 font-mono break-all">{node.obj_id}</p>
          <Btn onClick={() => onCopyId(node.obj_id)} variant="ghost" size="sm" className="!p-0.5 h-auto" title="ID 복사">
            {copiedId ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
          </Btn>
        </div>
        <Btn onClick={onClose} variant="ghost" size="sm" className="!p-1 h-auto flex-shrink-0" title="패널 닫기">
          <X className="w-4 h-4" />
        </Btn>
      </div>

      {/* Priority score bar */}
      {priorityScore !== null && (
        <div className="mb-3 p-3 bg-indigo-50 rounded-xl border border-indigo-100">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-indigo-700">우선순위 점수</span>
            <span className="text-sm font-bold text-indigo-800">{priorityScore}</span>
          </div>
          <div className="w-full bg-indigo-200 rounded-full h-2">
            <div
              className="bg-indigo-500 h-2 rounded-full transition-all"
              style={{ width: `${Math.max(4, (priorityScore / maxPriority) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-0.5 mb-4 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1 py-1 text-xs font-medium rounded-md transition-all ${
              tab === t.id
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'info' && (
        <NodeProfile
          node={node}
          edges={graphEdges}
          nodes={graphNodes}
          relatedDatasets={relatedDatasets}
          relatedLoading={relatedLoading}
          onAiQuery={onAiQuery}
          onExploreNode={onExploreNode}
          onDatasetClick={onDatasetClick}
        />
      )}

      {tab === 'lineage' && (
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">상위 노드 (입력)</p>
            {ancestors.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-gray-300 py-3 text-center">상위 노드 없음</p>
            ) : (
              <ul className="space-y-1.5">
                {ancestors.slice(0, 8).map((a, i) => (
                  <li key={`${a.node.obj_id}-${i}`} className="flex items-center gap-2" style={{ paddingLeft: `${a.depth * 12}px` }}>
                    <span className="text-[10px] text-blue-400">←</span>
                    <span className="text-[10px] text-gray-400 italic">{a.rel}</span>
                    <span className="text-xs text-gray-700 dark:text-gray-300 font-medium">{a.node.label}</span>
                    <span className="text-[9px] text-gray-400">{a.node.obj_type}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">하위 노드 (출력)</p>
            {descendants.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-gray-300 py-3 text-center">하위 노드 없음</p>
            ) : (
              <ul className="space-y-1.5">
                {descendants.slice(0, 8).map((d, i) => (
                  <li key={`${d.node.obj_id}-${i}`} className="flex items-center gap-2" style={{ paddingLeft: `${d.depth * 12}px` }}>
                    <span className="text-[10px] text-emerald-400">→</span>
                    <span className="text-[10px] text-gray-400 italic">{d.rel}</span>
                    <span className="text-xs text-gray-700 dark:text-gray-300 font-medium">{d.node.label}</span>
                    <span className="text-[9px] text-gray-400">{d.node.obj_type}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {tab === 'related' && (
        <NodeProfile
          node={node}
          edges={graphEdges}
          nodes={graphNodes}
          relatedDatasets={relatedDatasets}
          relatedLoading={relatedLoading}
          onAiQuery={onAiQuery}
          onExploreNode={onExploreNode}
          onDatasetClick={onDatasetClick}
        />
      )}
    </Card>
  )
}
