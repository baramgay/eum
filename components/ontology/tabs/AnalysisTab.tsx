'use client'

import { Sparkles } from 'lucide-react'
import { Card } from '@/components/ui'
import OntologyGraph from '../OntologyGraph'
import AnalysisPanel from '../AnalysisPanel'
import type { OntologyGraphData, GraphLayoutType, AnalyticsResult } from '@/lib/ontology/types'
import type { OntologyNode } from '@/lib/ontology-utils'

interface AnalysisTabProps {
  graph: OntologyGraphData | null
  layout: GraphLayoutType
  selectedNode: OntologyNode | null
  onSelectNode: (node: OntologyNode | null) => void
  onLayoutChange: (layout: GraphLayoutType) => void
  activeRels: string[]
  onAiQuery: (node: OntologyNode) => void
  analyticsResult?: AnalyticsResult | null
  onAnalyticsResult: (result: AnalyticsResult | null) => void
  onBuildOntology: () => void
}

export default function AnalysisTab({
  graph,
  layout,
  selectedNode,
  onSelectNode,
  onLayoutChange,
  activeRels,
  onAiQuery,
  analyticsResult = null,
  onAnalyticsResult,
  onBuildOntology,
}: AnalysisTabProps) {
  return (
    <div className="grid lg:grid-cols-3 gap-5 items-start">
      <div className="lg:col-span-2 min-w-0">
        {!graph?.nodes?.length ? (
          <Card className="text-center text-gray-400 dark:text-gray-300 py-10">
            <Sparkles className="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-gray-200" />
            <p className="text-sm">그래프 데이터가 없습니다.<br />온톨로지 재구축 후 분석을 실행하세요.</p>
          </Card>
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
      <div className="lg:col-span-1 min-w-0">
        {graph ? (
          <AnalysisPanel nodes={graph.nodes} edges={graph.edges ?? []} onResult={onAnalyticsResult} />
        ) : (
          <Card className="text-center text-gray-400 dark:text-gray-300 py-10">
            <Sparkles className="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-gray-200" />
            <p className="text-sm">그래프 데이터가 없습니다.<br />온톨로지 재구축 후 분석을 실행하세요.</p>
          </Card>
        )}
      </div>
    </div>
  )
}
