'use client'

import { useCallback, useMemo } from 'react'
import {
  Search,
  Filter,
  ArrowUpDown,
  X,
  List,
  Trash2,
  Network,
  MessageSquare,
  Copy,
  Check,
} from 'lucide-react'
import { Card, StatCard, Badge, Btn, EmptyState, Skeleton, Input, Select } from '@/components/ui'
import DetailPanel from '../panels/DetailPanel'
import type { OntologyGraphData } from '@/lib/ontology/types'
import type { OntologyNode } from '@/lib/ontology-utils'
import { getNodeTypeMeta } from '@/lib/ontology-utils'
import type { RelatedDataset, ActionResult } from '../hooks/useOntologyData'
import type { NodeSort } from '../hooks/useOntologyFilters'

interface NodeListTabProps {
  graph: OntologyGraphData | null
  loading: boolean
  nodeSearch: string
  setNodeSearch: (value: string) => void
  selectedNode: OntologyNode | null
  setSelectedNode: (node: OntologyNode | null) => void
  nodeSort: NodeSort
  setNodeSort: (value: NodeSort) => void
  typeFilter: string[]
  setTypeFilter: (value: string[]) => void
  nodeTypes: string[]
  typeCounts: Map<string, number>
  toggleType: (type: string) => void
  sortedFilteredNodes: OntologyNode[]
  filteredNodes: OntologyNode[]
  searchSuggestions: OntologyNode[]
  showSearchDropdown: boolean
  setShowSearchDropdown: (value: boolean) => void
  searchInputRef: React.RefObject<HTMLInputElement>
  searchWrapRef: React.RefObject<HTMLDivElement>
  recentSearches: string[]
  clearRecent: () => void
  degrees: Map<string, number>
  resetFilters: () => void
  selectAndSearch: (node: OntologyNode, switchTab?: () => void) => void
  onSwitchToGraph: () => void
  onAiQuery: (node: OntologyNode) => void
  onCopyId: (id: string) => void
  copiedId: boolean
  actionResult: ActionResult | null
  relatedDatasets: RelatedDataset[]
  relatedLoading: boolean
  onExploreNode: (node: OntologyNode) => void
  onDatasetClick: (dataset: RelatedDataset) => void
  onBuildOntology: () => void
}

const SORT_OPTIONS: { value: NodeSort; label: string }[] = [
  { value: 'label-asc', label: '이름 오름차순' },
  { value: 'label-desc', label: '이름 내림차순' },
  { value: 'type', label: '타입별' },
  { value: 'degree-desc', label: '연결 많은 순' },
]

function TableSkeleton() {
  return (
    <div className="px-4 py-6 space-y-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-10" />
          <Skeleton className="h-4 flex-1" />
        </div>
      ))}
    </div>
  )
}

function TypeChip({
  type,
  count,
  active,
  onClick,
}: {
  type: string
  count: number
  active: boolean
  onClick: () => void
}) {
  const meta = getNodeTypeMeta(type)
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors ${
        active
          ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/40'
          : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-300 line-through hover:bg-gray-50 dark:hover:bg-gray-950'
      }`}
      title={active ? '클릭하여 제외' : '클릭하여 포함'}
    >
      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: meta.color }} />
      {type}
      <span
        className={`text-[10px] px-1.5 py-0 rounded-full ${
          active ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
        }`}
      >
        {count}
      </span>
    </button>
  )
}

export default function NodeListTab({
  graph,
  loading,
  nodeSearch,
  setNodeSearch,
  selectedNode,
  setSelectedNode,
  nodeSort,
  setNodeSort,
  typeFilter,
  setTypeFilter,
  nodeTypes,
  typeCounts,
  toggleType,
  sortedFilteredNodes,
  filteredNodes,
  searchSuggestions,
  showSearchDropdown,
  setShowSearchDropdown,
  searchInputRef,
  searchWrapRef,
  recentSearches,
  clearRecent,
  degrees,
  resetFilters,
  selectAndSearch,
  onSwitchToGraph,
  onAiQuery,
  onCopyId,
  copiedId,
  actionResult,
  relatedDatasets,
  relatedLoading,
  onExploreNode,
  onDatasetClick,
  onBuildOntology,
}: NodeListTabProps) {
  const typeBadgeVariant = (type: string): React.ComponentProps<typeof Badge>['variant'] =>
    getNodeTypeMeta(type).badge

  const hasActiveFilters = useMemo(
    () =>
      Boolean(nodeSearch) ||
      recentSearches.length > 0 ||
      nodeSort !== 'label-asc' ||
      typeFilter.length !== nodeTypes.length,
    [nodeSearch, recentSearches.length, nodeSort, typeFilter.length, nodeTypes.length]
  )

  const onSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && searchSuggestions.length > 0) {
        selectAndSearch(searchSuggestions[0], onSwitchToGraph)
      } else if (e.key === 'Escape') {
        searchInputRef.current?.blur()
      }
    },
    [searchSuggestions, selectAndSearch, onSwitchToGraph, searchInputRef]
  )

  return (
    <div className="space-y-3">
      {/* 요약 KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {loading ? (
          <>
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </>
        ) : (
          <>
            <StatCard label="전체 노드" value={(graph?.nodes?.length ?? 0).toLocaleString()} icon={<Network />} color="blue" />
            <StatCard label="필터 결과" value={sortedFilteredNodes.length.toLocaleString()} icon={<Filter />} color="purple" />
            <StatCard
              label="평균 연결 수"
              value={
                filteredNodes.length > 0
                  ? Number(
                      (
                        filteredNodes.reduce((sum, n) => sum + (degrees.get(n.obj_id) ?? 0), 0) /
                        filteredNodes.length
                      ).toFixed(1)
                    )
                  : 0
              }
              icon={<List />}
              color="amber"
            />
            <StatCard label="활성 타입" value={typeFilter.length} icon={<List />} color="green" />
          </>
        )}
      </div>

      {/* 필터 */}
      <div className="flex flex-col lg:flex-row gap-3">
        <div ref={searchWrapRef} className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-300" />
          <Input
            ref={searchInputRef}
            value={nodeSearch}
            onChange={e => {
              setNodeSearch(e.target.value)
              setSelectedNode(null)
              setShowSearchDropdown(true)
            }}
            onFocus={() => setShowSearchDropdown(true)}
            onKeyDown={onSearchKeyDown}
            placeholder="레이블·타입·ID 검색... (Enter로 첫 결과 선택)"
            className="w-full pl-9 pr-8 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          />
          {nodeSearch && (
            <Btn
              onClick={() => setNodeSearch('')}
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1/2 -translate-y-1/2 !p-1 h-auto text-gray-400 dark:text-gray-300 hover:text-gray-600 dark:hover:text-gray-400"
              aria-label="검색어 지우기"
              title="검색어 지우기"
            >
              <X className="w-4 h-4" />
            </Btn>
          )}
          {showSearchDropdown && searchSuggestions.length > 0 && nodeSearch.trim() && (
            <div className="absolute z-20 mt-1 w-full bg-white dark:bg-gray-900 border rounded-md shadow-lg max-h-60 overflow-y-auto">
              {searchSuggestions.map(n => (
                <button
                  key={n.obj_id}
                  onClick={() => selectAndSearch(n, onSwitchToGraph)}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-indigo-50 dark:hover:bg-indigo-900/20 flex items-center justify-between"
                >
                  <span className="truncate">{n.label}</span>
                  <span className="text-xs text-gray-400 dark:text-gray-300 ml-2 flex-shrink-0">{n.obj_type}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ArrowUpDown className="w-4 h-4 text-gray-400 dark:text-gray-300" />
          <Select
            value={nodeSort}
            onChange={e => setNodeSort(e.target.value as NodeSort)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            aria-label="노드 정렬"
          >
            {SORT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" /> 타입
          </span>
          {nodeTypes.map(type => (
            <TypeChip
              key={type}
              type={type}
              count={typeCounts.get(type) ?? 0}
              active={typeFilter.includes(type)}
              onClick={() => toggleType(type)}
            />
          ))}
          <div className="flex items-center gap-1 ml-1">
            <Btn
              onClick={() => setTypeFilter(nodeTypes)}
              disabled={typeFilter.length === nodeTypes.length}
              variant="secondary"
              size="sm"
            >
              전체
            </Btn>
            <Btn
              onClick={() => setTypeFilter([])}
              disabled={typeFilter.length === 0}
              variant="secondary"
              size="sm"
            >
              해제
            </Btn>
          </div>
        </div>
        {hasActiveFilters && (
          <div className="flex items-center gap-2">
            <Btn onClick={resetFilters} variant="ghost" size="sm">
              초기화
            </Btn>
          </div>
        )}
      </div>

      {/* 활성 필터 요약 */}
      {(nodeSearch || typeFilter.length !== nodeTypes.length) && (
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
          <span>필터:</span>
          {nodeSearch && (
            <span className="inline-flex items-center gap-1">
              <Badge variant="blue" size="sm">검색 &quot;{nodeSearch}&quot;</Badge>
              <Btn onClick={() => setNodeSearch('')} variant="ghost" size="sm" className="!p-0.5 h-auto" title="검색어 지우기">
                <X className="w-3 h-3" />
              </Btn>
            </span>
          )}
          {typeFilter.length !== nodeTypes.length && (
            <Badge variant="gray" size="sm">
              타입 {typeFilter.length}/{nodeTypes.length}
            </Badge>
          )}
        </div>
      )}

      {recentSearches.length > 0 && !nodeSearch.trim() && (
        <div className="flex items-center gap-2 flex-wrap text-xs text-gray-500 dark:text-gray-400">
          <span>최근 검색:</span>
          {recentSearches.map(s => (
            <button
              key={s}
              onClick={() => setNodeSearch(s)}
              className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
            >
              {s}
            </button>
          ))}
          <button onClick={clearRecent} className="text-gray-400 dark:text-gray-300 hover:text-red-500 flex items-center gap-0.5">
            <Trash2 className="w-3 h-3" /> 비우기
          </button>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-4 items-start">
        {/* 노드 테이블 */}
        <Card className="lg:col-span-2 overflow-hidden !p-0 min-w-0">
          <div className="px-4 py-3 border-b bg-gray-50 dark:bg-gray-950 flex justify-between items-center">
            <h3 className="font-medium text-gray-700 dark:text-gray-300 text-sm">
              {nodeSearch ? `검색 결과 ${sortedFilteredNodes.length}개` : `노드 목록 (${graph?.nodes?.length ?? 0}개)`}
            </h3>
            <div className="flex items-center gap-2">
              {sortedFilteredNodes.length > 50 && (
                <span className="text-xs text-gray-400 dark:text-gray-300">상위 50개 표시</span>
              )}
            </div>
          </div>
          {loading ? (
            <TableSkeleton />
          ) : !graph?.nodes?.length ? (
            <EmptyState
              icon={<List />}
              title="노드가 없습니다"
              description="온톨로지를 재구축하면 노드 목록이 생성됩니다."
              action={{ label: '재구축', onClick: onBuildOntology }}
            />
          ) : sortedFilteredNodes.length === 0 ? (
            <EmptyState
              icon={<Search />}
              title="검색 결과가 없습니다"
              description="다른 키워드나 필터를 선택해 보세요."
              action={{ label: '필터 초기화', onClick: resetFilters }}
            />
          ) : (
            <div className="overflow-x-auto max-h-[600px]">
              <table className="w-full text-xs min-w-[680px]">
                <thead className="bg-gray-50 dark:bg-gray-950 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-2 text-left text-gray-600 dark:text-gray-400">레이블</th>
                    <th className="px-4 py-2 text-left text-gray-600 dark:text-gray-400">타입</th>
                    <th className="px-4 py-2 text-left text-gray-600 dark:text-gray-400">연결</th>
                    <th className="px-4 py-2 text-left text-gray-600 dark:text-gray-400">속성 (요약)</th>
                    <th className="px-4 py-2 text-right text-gray-600 dark:text-gray-400">동작</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sortedFilteredNodes.slice(0, 50).map(n => (
                    <tr
                      key={n.obj_id}
                      className={`group cursor-pointer ${
                        selectedNode?.obj_id === n.obj_id ? 'bg-indigo-50' : 'hover:bg-gray-50 dark:hover:bg-gray-950'
                      }`}
                      onClick={() => setSelectedNode(n)}
                    >
                      <td className="px-4 py-2 font-medium text-gray-800 dark:text-gray-200">{n.label}</td>
                      <td className="px-4 py-2">
                        <Badge variant={typeBadgeVariant(n.obj_type)}>{n.obj_type}</Badge>
                      </td>
                      <td className="px-4 py-2 text-gray-500 dark:text-gray-400">{degrees.get(n.obj_id) ?? 0}</td>
                      <td className="px-4 py-2 text-gray-400 dark:text-gray-300 font-mono truncate max-w-40" title={n.props}>
                        {n.props || '—'}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex items-center justify-end gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                          <Btn
                            onClick={e => {
                              e.stopPropagation()
                              onAiQuery(n)
                            }}
                            variant="ghost"
                            size="sm"
                            className="!p-1 h-auto"
                            title="AI 질의"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                          </Btn>
                          <Btn
                            onClick={e => {
                              e.stopPropagation()
                              onCopyId(n.obj_id)
                            }}
                            variant="ghost"
                            size="sm"
                            className="!p-1 h-auto"
                            title="ID 복사"
                          >
                            {copiedId ? <Check className="w-3.5 h-3.5 text-green-600 dark:text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </Btn>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* 노드 상세 패널 */}
        <div className="min-w-0">
          {selectedNode ? (
            <DetailPanel
              node={selectedNode}
              actionResult={actionResult}
              relatedDatasets={relatedDatasets}
              relatedLoading={relatedLoading}
              copiedId={copiedId}
              graphNodes={graph?.nodes ?? []}
              graphEdges={graph?.edges ?? []}
              onClose={() => setSelectedNode(null)}
              onCopyId={onCopyId}
              onAiQuery={onAiQuery}
              onExploreNode={onExploreNode}
              onDatasetClick={onDatasetClick}
            />
          ) : (
            <Card className="text-center text-gray-400 dark:text-gray-300 py-10">
              <List className="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-gray-200" />
              <p className="text-sm">노드를 클릭하면<br />상세 정보가 표시됩니다</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
