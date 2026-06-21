'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  RotateCcw,
  Pause,
  Play,
  Maximize,
  Minimize,
  Camera,
  Move,
  ZoomIn,
  ZoomOut,
  RefreshCw,
  LayoutTemplate,
  Search,
  X,
  Map,
  HelpCircle,
} from 'lucide-react'
import { Btn } from '@/components/ui'
import type { GraphLayoutType } from '@/lib/ontology/types'
import type { OntologyNode } from '@/lib/ontology-utils'

export interface GraphToolbarProps {
  layout: GraphLayoutType
  onLayoutChange: (layout: GraphLayoutType) => void
  paused: boolean
  onTogglePhysics: () => void
  onReheat: () => void
  onFit: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  onResetZoom: () => void
  fullscreen: boolean
  onToggleFullscreen: () => void
  exporting: boolean
  onExportPng: () => void
  activeRels: Set<string>
  relTypes: string[]
  edgeColors: Record<string, string>
  showNodeLabels: boolean
  onToggleNodeLabels: () => void
  showRelLabels: boolean
  onToggleRelLabels: () => void
  onToggleRel: (rel: string) => void
  nodes: OntologyNode[]
  selectedNodeId?: string | null
  onSelectNode: (node: OntologyNode) => void
  years?: number[]
  yearFilter?: number | null
  onYearChange?: (year: number | null) => void
  showMap?: boolean
  onToggleMap?: () => void
}

const LAYOUT_OPTIONS: { value: GraphLayoutType; label: string; title: string }[] = [
  { value: 'force',       label: 'Force',       title: '물리 기반 자동 배치' },
  { value: 'cluster',     label: 'Cluster',     title: '시군별 군집화' },
  { value: 'galaxy',      label: 'Galaxy',      title: '넓은 군집 배치' },
  { value: 'circular',    label: 'Circular',    title: '원형 배치' },
  { value: 'hierarchical',label: 'Hierarchical',title: '계층 트리 배치' },
  { value: 'radial',      label: 'Radial',      title: '방사형 배치' },
  { value: 'geo',         label: 'Geo',         title: '실제 지리좌표 배치' },
  { value: 'time',        label: 'Time',        title: '시간축 배치' },
]

const LAYOUT_HELP = LAYOUT_OPTIONS

export default function GraphToolbar({
  layout,
  onLayoutChange,
  paused,
  onTogglePhysics,
  onReheat,
  onFit,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  fullscreen,
  onToggleFullscreen,
  exporting,
  onExportPng,
  activeRels,
  relTypes,
  edgeColors,
  showNodeLabels,
  onToggleNodeLabels,
  showRelLabels,
  onToggleRelLabels,
  onToggleRel,
  nodes,
  selectedNodeId,
  onSelectNode,
  years = [],
  yearFilter,
  onYearChange,
  showMap = false,
  onToggleMap,
}: GraphToolbarProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const helpRef = useRef<HTMLDivElement>(null)

  const suggestions = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    if (!q) return []
    return nodes
      .filter(n =>
        n.label.toLowerCase().includes(q) ||
        n.obj_type.toLowerCase().includes(q) ||
        n.obj_id.toLowerCase().includes(q)
      )
      .slice(0, 8)
  }, [nodes, searchTerm])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
      if (helpRef.current && !helpRef.current.contains(e.target as Node)) {
        setShowHelp(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = useCallback((node: OntologyNode) => {
    setSearchTerm('')
    setIsOpen(false)
    onSelectNode(node)
  }, [onSelectNode])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && suggestions.length > 0) {
      e.preventDefault()
      handleSelect(suggestions[0])
    } else if (e.key === 'Escape') {
      setIsOpen(false)
      inputRef.current?.blur()
    }
  }, [suggestions, handleSelect])

  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <div ref={wrapRef} className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-gray-300" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setIsOpen(true) }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder="노드 검색..."
            disabled={nodes.length === 0}
            className="w-40 pl-7 pr-7 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-900 disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:text-gray-400 dark:disabled:text-gray-300"
            aria-label="그래프 노드 검색"
            aria-expanded={isOpen}
            aria-controls={isOpen ? 'graph-toolbar-search-list' : undefined}
            aria-autocomplete="list"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => { setSearchTerm(''); setIsOpen(false); inputRef.current?.focus() }}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-300 hover:text-gray-600 dark:hover:text-gray-400"
              aria-label="검색어 지우기"
              title="검색어 지우기"
            >
              <X className="w-3 h-3" />
            </button>
          )}
          {isOpen && searchTerm.trim() && (
            <div
              id="graph-toolbar-search-list"
              className="absolute z-20 mt-1 w-56 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg max-h-60 overflow-y-auto"
              role="listbox"
            >
              {suggestions.length > 0 ? (
                suggestions.map(n => (
                  <button
                    key={n.obj_id}
                    type="button"
                    role="option"
                    aria-selected={selectedNodeId === n.obj_id}
                    onClick={() => handleSelect(n)}
                    className={`w-full px-3 py-2 text-left text-sm flex items-center justify-between hover:bg-indigo-50 ${
                      selectedNodeId === n.obj_id ? 'bg-indigo-50 text-indigo-700' : ''
                    }`}
                  >
                    <span className="truncate pr-2">{n.label}</span>
                    <span className="text-xs text-gray-400 dark:text-gray-300 flex-shrink-0">{n.obj_type}</span>
                  </button>
                ))
              ) : (
                <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">검색 결과 없음</div>
              )}
            </div>
          )}
        </div>

        <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
          <LayoutTemplate className="w-3.5 h-3.5" /> 레이아웃
        </span>
        <select
          value={layout}
          onChange={e => onLayoutChange(e.target.value as GraphLayoutType)}
          className="text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-900"
          aria-label="그래프 레이아웃 선택"
          title="레이아웃 방식을 선택합니다"
        >
          {LAYOUT_OPTIONS.map(o => (
            <option key={o.value} value={o.value} title={o.title}>{o.label}</option>
          ))}
        </select>

        <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 ml-2">관계 필터</span>
        {relTypes.map(rel => (
          <button
            key={rel}
            onClick={() => onToggleRel(rel)}
            title={`관계 "${rel}" ${activeRels.has(rel) ? '숨기기' : '표시'}`}
            className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
              activeRels.has(rel)
                ? 'text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600'
                : 'text-gray-400 dark:text-gray-300 border-gray-200 dark:border-gray-700 line-through'
            }`}
            style={{ backgroundColor: activeRels.has(rel) ? `${edgeColors[rel]}33` : 'transparent' }}
          >
            {rel}
          </button>
        ))}

        {years.length > 0 && (
          <div className="flex items-center gap-2 ml-3">
            <span className="text-xs text-gray-500 dark:text-gray-400">연도</span>
            <input
              type="range"
              min={years[0]}
              max={years[years.length - 1]}
              step={1}
              value={yearFilter ?? years[years.length - 1]}
              onChange={e => onYearChange?.(Number(e.target.value))}
              className="w-24 accent-indigo-600"
              aria-label="연도 필터"
              title={`연도 필터: ${yearFilter ?? years[years.length - 1]}년`}
            />
            <button
              type="button"
              onClick={() => onYearChange?.(null)}
              title="전체 연도 표시"
              className={`text-[11px] px-2 py-0.5 rounded-full border ${
                yearFilter === null
                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                  : 'text-gray-500 border-gray-200 hover:bg-gray-50'
              }`}
            >
              전체
            </button>
          </div>
        )}

        <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 ml-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showNodeLabels}
            onChange={onToggleNodeLabels}
            className="rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500"
          />
          노드명
        </label>
        <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showRelLabels}
            onChange={onToggleRelLabels}
            className="rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500"
          />
          관계명
        </label>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Btn onClick={onZoomIn} variant="secondary" size="sm" title="줌 인 (+)">
          <ZoomIn className="w-3.5 h-3.5" />
        </Btn>
        <Btn onClick={onZoomOut} variant="secondary" size="sm" title="줌 아웃 (-)">
          <ZoomOut className="w-3.5 h-3.5" />
        </Btn>
        <Btn onClick={onFit} variant="secondary" size="sm" title="화면 맞춤">
          <Move className="w-3.5 h-3.5" /> 전체 보기
        </Btn>
        <Btn onClick={onTogglePhysics} variant="secondary" size="sm" title="물리 시뮬레이션 켜기/끄기">
          {paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
          {paused ? '재개' : '정지'}
        </Btn>
        <Btn onClick={onResetZoom} variant="secondary" size="sm" title="초기 위치로 복귀">
          <RotateCcw className="w-3.5 h-3.5" /> 초기 위치
        </Btn>
        <Btn onClick={onReheat} variant="secondary" size="sm" title="물리 기반 자동 배치 (Force Layout)">
          <RefreshCw className="w-3.5 h-3.5" /> 레이아웃
        </Btn>
        <Btn onClick={onToggleFullscreen} variant="secondary" size="sm" title="전체화면">
          {fullscreen ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
        </Btn>
        <Btn
          onClick={onToggleMap}
          variant={showMap ? 'primary' : 'secondary'}
          size="sm"
          title="지도 오버레이 (Kakao Map 통합 TODO)"
        >
          <Map className="w-3.5 h-3.5" /> 지도
        </Btn>
        <Btn onClick={onExportPng} loading={exporting} variant="secondary" size="sm" title="PNG 내보내기">
          <Camera className="w-3.5 h-3.5" /> PNG
        </Btn>

        {/* Help button */}
        <div ref={helpRef} className="relative">
          <button
            type="button"
            title="도움말"
            onClick={() => setShowHelp(v => !v)}
            className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-xs font-bold"
            aria-label="그래프 도움말"
          >
            <HelpCircle className="w-3.5 h-3.5" />
          </button>

          {showHelp && (
            <div className="absolute right-0 top-9 z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl p-4 min-w-[280px]">
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-200 mb-2">레이아웃 종류</p>
              <ul className="space-y-1 mb-3">
                {LAYOUT_HELP.map(o => (
                  <li key={o.value} className="flex gap-2 text-xs text-gray-600 dark:text-gray-300">
                    <span className="font-medium text-gray-700 dark:text-gray-200 w-20 flex-shrink-0">{o.label}</span>
                    <span>{o.title}</span>
                  </li>
                ))}
              </ul>
              <div className="border-t border-gray-100 dark:border-gray-700 pt-2">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  <span className="font-medium text-gray-700 dark:text-gray-200">Physics:</span> 시뮬레이션 활성화 시 노드가 서로 밀고 당기며 자동 배치됩니다
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
