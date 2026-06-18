'use client'

import { Card, Btn } from '@/components/ui'
import { Check, Copy, X } from 'lucide-react'
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
  const priorityScore = actionResult?.results.find(r => r.sigun === node.label)?.priority_score ?? null
  const maxPriority = actionResult?.results?.[0]?.priority_score ?? 1

  return (
    <Card className="h-fit lg:sticky lg:top-4">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-1.5">
          <p className="text-xs text-gray-400 dark:text-gray-300 font-mono break-all">{node.obj_id}</p>
          <Btn
            onClick={() => onCopyId(node.obj_id)}
            variant="ghost"
            size="sm"
            className="!p-0.5 h-auto"
            title="ID 복사"
          >
            {copiedId ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
          </Btn>
        </div>
        <Btn onClick={onClose} variant="ghost" size="sm" className="!p-1 h-auto flex-shrink-0" title="패널 닫기">
          <X className="w-4 h-4" />
        </Btn>
      </div>

      {priorityScore !== null && (
        <div className="mb-4 p-3 bg-indigo-50 rounded-xl border border-indigo-100">
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
    </Card>
  )
}
