'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Network,
  Target,
  List,
  Sparkles,
  Database,
  AlertCircle,
  RefreshCw,
  LayoutGrid,
  Pencil,
} from 'lucide-react'
import { PageHeader, Btn, Badge } from '@/components/ui'
import type { GraphLayoutType, AnalyticsResult, OntologyGraphData } from '@/lib/ontology/types'
import type { ScenarioKey } from '@/lib/ontology/demo-graph-meta'
import { SGG_OPTIONS } from '@/lib/regions'
import { useOntologyData } from './hooks/useOntologyData'
import { useRelatedDatasets } from './hooks/useRelatedDatasets'
import { useRecentSearches } from './hooks/useRecentSearches'
import { useOntologyFilters } from './hooks/useOntologyFilters'
import { useOntologyWorkspace } from './hooks/useOntologyWorkspace'
import OverviewTab from './tabs/OverviewTab'
import GraphTab from './tabs/GraphTab'
import NodeListTab from './tabs/NodeListTab'
import AnalysisTab from './tabs/AnalysisTab'
import WorkspaceTab from './tabs/WorkspaceTab'
import EditTab from './tabs/EditTab'
import ScenarioSelector from './ScenarioSelector'

type Tab = '개요' | '그래프' | '노드 목록' | '분석' | '워크스페이스' | '편집'

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: '개요', label: '개요', icon: Network },
  { key: '그래프', label: '그래프', icon: Target },
  { key: '노드 목록', label: '노드 목록', icon: List },
  { key: '분석', label: '분석', icon: Sparkles },
  { key: '워크스페이스', label: '워크스페이스', icon: Database },
  { key: '편집', label: '편집', icon: Pencil },
]

export default function OntologyClient() {
  const router = useRouter()

  const {
    graph,
    actions,
    building,
    sgg,
    setSgg,
    loading,
    error,
    setError,
    scoringKey,
    scoring,
    actionResult,
    loadGraph,
    buildOntology,
    runScoring,
  } = useOntologyData()

  const { recentSearches, saveSearch, clearRecent } = useRecentSearches()

  const [activeTab, setActiveTab] = useState<Tab>('개요')
  const [layout, setLayout] = useState<GraphLayoutType>('force')
  const [analyticsResult, setAnalyticsResult] = useState<AnalyticsResult | null>(null)
  const [copiedId, setCopiedId] = useState(false)

  // 시나리오 데모 그래프 상태 — useOntologyFilters보다 먼저 선언해야 함
  const [activeScenario, setActiveScenario] = useState<ScenarioKey | null>(null)
  const [demoGraph, setDemoGraph] = useState<OntologyGraphData | null>(null)
  const [demoLoading, setDemoLoading] = useState(false)
  const [showScenarioSelector, setShowScenarioSelector] = useState(false)

  // Supabase 그래프가 없으면 데모 그래프 사용
  const activeGraph = graph ?? demoGraph

  const {
    nodeSearch,
    setNodeSearch,
    selectedNode,
    setSelectedNode,
    typeFilter,
    setTypeFilter,
    activeRels,
    setActiveRels,
    nodeSort,
    setNodeSort,
    showSearchDropdown,
    setShowSearchDropdown,
    searchInputRef,
    searchWrapRef,
    degrees,
    nodeTypes,
    typeCounts,
    filteredNodes,
    sortedFilteredNodes,
    searchSuggestions,
    resetFilters,
    selectAndSearch,
    toggleType,
  } = useOntologyFilters(activeGraph, saveSearch)

  const { relatedDatasets, relatedLoading } = useRelatedDatasets(selectedNode)

  useEffect(() => {
    if (activeTab !== '분석') setAnalyticsResult(null)
  }, [activeTab])

  const handleScenarioSelect = useCallback(async (key: ScenarioKey) => {
    setDemoLoading(true)
    setShowScenarioSelector(false)
    try {
      const res = await fetch(`/api/ontology/demo-graph/${key}`)
      if (!res.ok) throw new Error(await res.text())
      const data: OntologyGraphData = await res.json()
      setDemoGraph(data)
      setActiveScenario(key)
      setActiveTab('그래프')
    } catch (e) {
      // 오류 시 selector 다시 표시
      setShowScenarioSelector(true)
    } finally {
      setDemoLoading(false)
    }
  }, [])

  const handleLayoutChange = useCallback((next: GraphLayoutType) => {
    setLayout(next)
  }, [])

  const handleAiQuery = useCallback(
    (node: { obj_id: string; obj_type: string; label: string }) => {
      router.push(`/ai?q=${encodeURIComponent(node.label)}`)
    },
    [router]
  )

  const copyId = useCallback((id: string) => {
    navigator.clipboard.writeText(id).then(() => {
      setCopiedId(true)
      setTimeout(() => setCopiedId(false), 1500)
    })
  }, [])

  const onDatasetClick = useCallback(
    (dataset: { dataset_id: string }) => {
      router.push(`/portal?id=${encodeURIComponent(dataset.dataset_id)}`)
    },
    [router]
  )

  const workspace = useOntologyWorkspace({
    graph: activeGraph,
    sgg,
    layout,
    selectedNode,
    activeRels,
    typeFilter,
    nodeSearch,
    setSgg,
    setLayout: handleLayoutChange,
    setSelectedNode,
    setTypeFilter,
    setActiveRels,
    setNodeSearch,
    setActiveTab,
    loadGraph,
  })

  const sggName = sgg ? SGG_OPTIONS.find(o => o.code === sgg)?.name ?? sgg : ''

  return (
    <div className="space-y-5">
      <PageHeader
        title="온톨로지 탐색"
        subtitle="경남 청년 정책 지식 그래프 · 객체·관계·액션 기반 분석"
        action={
          <Btn onClick={buildOntology} loading={building} size="md">
            온톨로지 재구축
          </Btn>
        }
      />

      {/* 탭 */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex gap-0">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === key
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
              {key === '그래프' && graph && (
                <span className="ml-1.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded-full">
                  {graph.nodes?.length ?? 0}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* 공통 오류 안내 */}
      {error && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-red-700">데이터를 불러오지 못했습니다</p>
            <p className="text-xs text-red-600 mt-0.5 break-words">{error}</p>
          </div>
          <Btn
            onClick={() => loadGraph(sgg || undefined)}
            variant="secondary"
            size="sm"
            className="flex-shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" /> 다시 시도
          </Btn>
        </div>
      )}

      {/* 시군 필터 (Supabase 그래프 전용 — 데모 모드에서는 숨김) */}
      {activeTab !== '노드 목록' && !activeScenario && (
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={sgg}
            onChange={e => setSgg(e.target.value)}
            className="w-48 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-900"
            aria-label="시군 선택"
          >
            <option value="">전체 시군</option>
            {SGG_OPTIONS.map(o => (
              <option key={o.code} value={o.code}>
                {o.name}
              </option>
            ))}
          </select>
          <Btn onClick={() => loadGraph(sgg || undefined)} loading={loading} variant="secondary" size="sm">
            필터
          </Btn>
          {sgg && (
            <Btn
              onClick={() => {
                setSgg('')
                loadGraph()
              }}
              variant="ghost"
              size="sm"
            >
              초기화
            </Btn>
          )}
        </div>
      )}

      {/* 데모 모드 활성 배너 */}
      {activeScenario && (
        <div className="flex items-center justify-between px-4 py-2 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg">
          <div className="flex items-center gap-2 text-xs text-indigo-700 dark:text-indigo-300">
            <span className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
            <span>샘플 데이터 모드 — {activeScenario}</span>
            <span className="text-indigo-400">|</span>
            <span>{demoGraph?.nodes?.length ?? 0}개 노드 · {demoGraph?.edges?.length ?? 0}개 엣지</span>
          </div>
          <button
            onClick={() => setShowScenarioSelector(true)}
            className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200 font-medium"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            시나리오 변경
          </button>
        </div>
      )}

      {/* ScenarioSelector — 개요 탭 초기 or showScenarioSelector=true */}
      {(activeTab === '개요' && !activeGraph?.nodes?.length) || showScenarioSelector ? (
        <ScenarioSelector
          onSelect={handleScenarioSelect}
          onFreeExplore={() => {
            setShowScenarioSelector(false)
            setActiveTab('그래프')
          }}
          loading={demoLoading}
        />
      ) : activeTab === '개요' ? (
        <OverviewTab
          graph={activeGraph}
          loading={loading}
          actions={actions}
          scoringKey={scoringKey}
          scoring={scoring}
          actionResult={actionResult}
          degrees={degrees}
          onBuildOntology={buildOntology}
          onRunScoring={runScoring}
        />
      ) : null}

      {activeTab === '그래프' && !showScenarioSelector && (
        <GraphTab
          graph={activeGraph}
          loading={loading || demoLoading}
          selectedNode={selectedNode}
          onSelectNode={setSelectedNode}
          layout={layout}
          onLayoutChange={handleLayoutChange}
          activeRels={activeRels}
          onAiQuery={handleAiQuery}
          onExploreNode={setSelectedNode}
          onDatasetClick={onDatasetClick}
          relatedDatasets={relatedDatasets}
          relatedLoading={relatedLoading}
          copiedId={copiedId}
          onCopyId={copyId}
          actionResult={actionResult}
          analyticsResult={analyticsResult}
          onBuildOntology={buildOntology}
          activeScenario={activeScenario}
        />
      )}

      {activeTab === '노드 목록' && !showScenarioSelector && (
        <NodeListTab
          graph={activeGraph}
          loading={loading}
          nodeSearch={nodeSearch}
          setNodeSearch={setNodeSearch}
          selectedNode={selectedNode}
          setSelectedNode={setSelectedNode}
          nodeSort={nodeSort}
          setNodeSort={setNodeSort}
          typeFilter={typeFilter}
          setTypeFilter={setTypeFilter}
          nodeTypes={nodeTypes}
          typeCounts={typeCounts}
          toggleType={toggleType}
          sortedFilteredNodes={sortedFilteredNodes}
          filteredNodes={filteredNodes}
          searchSuggestions={searchSuggestions}
          showSearchDropdown={showSearchDropdown}
          setShowSearchDropdown={setShowSearchDropdown}
          searchInputRef={searchInputRef}
          searchWrapRef={searchWrapRef}
          recentSearches={recentSearches}
          clearRecent={clearRecent}
          degrees={degrees}
          resetFilters={resetFilters}
          selectAndSearch={selectAndSearch}
          onSwitchToGraph={() => setActiveTab('그래프')}
          onAiQuery={handleAiQuery}
          onCopyId={copyId}
          copiedId={copiedId}
          actionResult={actionResult}
          relatedDatasets={relatedDatasets}
          relatedLoading={relatedLoading}
          onExploreNode={node => {
            setSelectedNode(node)
            setActiveTab('그래프')
          }}
          onDatasetClick={onDatasetClick}
          onBuildOntology={buildOntology}
        />
      )}

      {activeTab === '분석' && !showScenarioSelector && (
        <AnalysisTab
          graph={activeGraph}
          layout={layout}
          selectedNode={selectedNode}
          onSelectNode={setSelectedNode}
          onLayoutChange={handleLayoutChange}
          activeRels={activeRels}
          onAiQuery={handleAiQuery}
          analyticsResult={analyticsResult}
          onAnalyticsResult={setAnalyticsResult}
          onBuildOntology={buildOntology}
        />
      )}

      {activeTab === '워크스페이스' && !showScenarioSelector && (
        <WorkspaceTab
          snapshot={workspace.buildSnapshot()}
          onLoadSnapshot={workspace.loadSnapshot}
          sggName={sggName}
          layout={layout}
          selectedNodeLabel={selectedNode?.label ?? ''}
          activeTypeCount={typeFilter.length}
          activeRelCount={activeRels.length}
          nodeSearch={nodeSearch}
        />
      )}

      {activeTab === '편집' && <EditTab />}
    </div>
  )
}
