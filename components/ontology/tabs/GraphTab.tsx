'use client'

import { Network } from 'lucide-react'
import { Card, EmptyState, Skeleton } from '@/components/ui'
import OntologyGraph from '../OntologyGraph'
import DetailPanel from '../panels/DetailPanel'
import NodeKpiPanel from '../NodeKpiPanel'
import type { OntologyGraphData, GraphLayoutType, AnalyticsResult } from '@/lib/ontology/types'
import type { OntologyNode } from '@/lib/ontology-utils'
import type { RelatedDataset, ActionResult } from '../hooks/useOntologyData'
import type { ScenarioKey } from '@/lib/ontology/demo-graph-meta'

interface GraphTabProps {
  graph: OntologyGraphData | null
  loading: boolean
  selectedNode: OntologyNode | null
  onSelectNode: (node: OntologyNode | null) => void
  layout: GraphLayoutType
  onLayoutChange: (layout: GraphLayoutType) => void
  activeRels: string[]
  onAiQuery: (node: OntologyNode) => void
  onExploreNode: (node: OntologyNode) => void
  onDatasetClick: (dataset: RelatedDataset) => void
  relatedDatasets: RelatedDataset[]
  relatedLoading: boolean
  copiedId: boolean
  onCopyId: (id: string) => void
  actionResult: ActionResult | null
  analyticsResult: AnalyticsResult | null
  onBuildOntology: () => void
  activeScenario?: ScenarioKey | null
  onNodeUpdated?: (node: OntologyNode) => void
  onNodeDeleted?: (objId: string) => void
}

function GraphSkeleton() {
  return (
    <div
      data-testid="graph-skeleton"
      className="bg-gray-100 dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 h-[400px] md:h-[600px] flex flex-col items-center justify-center animate-pulse"
    >
      <div className="w-16 h-16 rounded-full bg-gray-200 dark:bg-gray-700 mb-4" />
      <Skeleton className="h-4 w-32 mb-2" />
      <Skeleton className="h-3 w-48" />
    </div>
  )
}

function DetailSkeleton() {
  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-48" />
        </div>
        <Skeleton className="h-6 w-6 rounded-full" />
      </div>
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-20 w-full" />
    </Card>
  )
}

export default function GraphTab({
  graph,
  loading,
  selectedNode,
  onSelectNode,
  layout,
  onLayoutChange,
  activeRels,
  onAiQuery,
  onExploreNode,
  onDatasetClick,
  relatedDatasets,
  relatedLoading,
  copiedId,
  onCopyId,
  actionResult,
  analyticsResult,
  onBuildOntology,
  activeScenario,
  onNodeUpdated,
  onNodeDeleted,
}: GraphTabProps) {
  return (
    <div className="grid lg:grid-cols-3 gap-5 items-start">
      <div className="lg:col-span-2 min-w-0">
        {loading ? (
          <GraphSkeleton />
        ) : !graph?.nodes?.length ? (
          <div data-testid="graph-empty-state">
            <EmptyState
              icon={<Network />}
              title="그래프 데이터 없음"
              description="온톨로지를 재구축하면 그래프가 생성됩니다."
              action={{ label: '온톨로지 재구축', onClick: onBuildOntology }}
            />
          </div>
        ) : (
          <OntologyGraph
            nodes={graph.nodes}
            edges={graph.edges ?? []}
            width={900}
            height={600}
            selectedId={selectedNode?.obj_id ?? null}
            onSelect={onSelectNode}
            onDoubleClick={onAiQuery}
            layout={layout}
            onLayoutChange={onLayoutChange}
            relationFilter={activeRels}
            analysisResult={analyticsResult}
          />
        )}
      </div>
      <div className="lg:col-span-1 min-w-0 space-y-4">
        {selectedNode && activeScenario ? (
          <>
            <NodeKpiPanel
              node={selectedNode}
              scenarioKey={activeScenario}
              onClose={() => onSelectNode(null)}
            />
            <DetailPanel
              node={selectedNode}
              actionResult={actionResult}
              relatedDatasets={relatedDatasets}
              relatedLoading={relatedLoading}
              copiedId={copiedId}
              graphNodes={graph?.nodes ?? []}
              graphEdges={graph?.edges ?? []}
              onClose={() => onSelectNode(null)}
              onCopyId={onCopyId}
              onAiQuery={onAiQuery}
              onExploreNode={onExploreNode}
              onDatasetClick={onDatasetClick}
              onNodeUpdated={onNodeUpdated}
              onNodeDeleted={onNodeDeleted}
            />
          </>
        ) : selectedNode ? (
          <DetailPanel
            node={selectedNode}
            actionResult={actionResult}
            relatedDatasets={relatedDatasets}
            relatedLoading={relatedLoading}
            copiedId={copiedId}
            graphNodes={graph?.nodes ?? []}
            graphEdges={graph?.edges ?? []}
            onClose={() => onSelectNode(null)}
            onCopyId={onCopyId}
            onAiQuery={onAiQuery}
            onExploreNode={onExploreNode}
            onDatasetClick={onDatasetClick}
            onNodeUpdated={onNodeUpdated}
            onNodeDeleted={onNodeDeleted}
          />
        ) : relatedLoading ? (
          <DetailSkeleton />
        ) : (
          <Card className="text-center text-gray-400 dark:text-gray-300 py-10">
            <Network className="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-gray-200" />
            <p className="text-sm">그래프의 노드를 클릭하면<br />상세 정보와 연관 개체를 확인할 수 있습니다.</p>
            <p className="text-xs mt-2 text-gray-300 dark:text-gray-200">더블 클릭 시 AI 질의로 이동합니다.</p>
          </Card>
        )}
      </div>
    </div>
  )
}
