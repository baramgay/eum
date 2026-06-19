'use client'

import { useState } from 'react'
import { Sparkles, GitBranch } from 'lucide-react'
import { Card } from '@/components/ui'
import OntologyGraph from '../OntologyGraph'
import AnalysisPanel from '../AnalysisPanel'
import TextAnalysisPanel from '../TextAnalysisPanel'
import type { OntologyGraphData, GraphLayoutType, AnalyticsResult } from '@/lib/ontology/types'
import type { OntologyNode } from '@/lib/ontology-utils'

type AnalysisMode = 'graph' | 'text'

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
  const [mode, setMode] = useState<AnalysisMode>('graph')

  return (
    <div className="space-y-4">
      {/* 분석 모드 전환 */}
      <div className="flex gap-2">
        <button
          onClick={() => setMode('graph')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${mode === 'graph' ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          그래프 분석
        </button>
        <button
          onClick={() => setMode('text')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${mode === 'text' ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
        >
          <GitBranch className="w-3.5 h-3.5" />
          텍스트 마이닝
        </button>
      </div>

      {mode === 'graph' && (
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
      )}

      {mode === 'text' && (
        <div className="space-y-5">
          <TextAnalysisPanel
            nodes={graph?.nodes ?? []}
            edges={graph?.edges ?? []}
          />
          {/* 그래프 구조 요약 — 접힌 형태로 아래에 배치 */}
          {graph?.nodes?.length ? (
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
              <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-3">그래프 구조 요약</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <div className="text-center p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg">
                  <div className="text-xl font-bold text-indigo-600 dark:text-indigo-400">{graph.nodes.length}</div>
                  <div className="text-[11px] text-gray-500 mt-0.5">노드</div>
                </div>
                <div className="text-center p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
                  <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{graph.edges?.length ?? 0}</div>
                  <div className="text-[11px] text-gray-500 mt-0.5">엣지</div>
                </div>
                <div className="text-center p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                  <div className="text-xl font-bold text-amber-600 dark:text-amber-400">
                    {new Set(graph.nodes.map(n => n.obj_type)).size}
                  </div>
                  <div className="text-[11px] text-gray-500 mt-0.5">노드 유형</div>
                </div>
                <div className="text-center p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                  <div className="text-xl font-bold text-purple-600 dark:text-purple-400">
                    {new Set((graph.edges ?? []).map(e => e.rel)).size}
                  </div>
                  <div className="text-[11px] text-gray-500 mt-0.5">관계 유형</div>
                </div>
              </div>
              <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">노드 유형별 분포</div>
              <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
                {Array.from(
                  graph.nodes.reduce((m, n) => { m.set(n.obj_type, (m.get(n.obj_type) ?? 0) + 1); return m }, new Map<string, number>())
                )
                  .sort((a, b) => b[1] - a[1])
                  .map(([type, count]) => (
                    <div key={type} className="flex items-center gap-2">
                      <span className="text-xs text-gray-600 dark:text-gray-400 w-20 truncate">{type}</span>
                      <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-indigo-400 dark:bg-indigo-500 rounded-full"
                          style={{ width: `${(count / graph.nodes.length) * 100}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-gray-500 w-6 text-right tabular-nums">{count}</span>
                    </div>
                  ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
