'use client'

import { SCENARIO_META } from '@/lib/ontology/demo-graph-meta'
import type { ScenarioKey } from '@/lib/ontology/demo-graph-meta'

interface ScenarioSelectorProps {
  onSelect: (key: ScenarioKey) => void
  onFreeExplore: () => void
  loading?: boolean
}

const ANALYSIS_LABEL: Record<string, string> = {
  centrality: '중심성 분석',
  community: '커뮤니티 탐지',
  anomaly: '이상탐지',
}
const LAYOUT_LABEL: Record<string, string> = {
  cluster: 'Cluster 레이아웃',
  radial: 'Radial 레이아웃',
  force: 'Force 레이아웃',
  geo: 'Geo Grid 레이아웃',
}
const ACCENT_BG: Record<string, string> = {
  '#EF4444': 'from-red-500 to-orange-500',
  '#3B82F6': 'from-blue-500 to-indigo-500',
  '#10B981': 'from-emerald-500 to-teal-500',
  '#F59E0B': 'from-amber-500 to-orange-500',
}

export default function ScenarioSelector({ onSelect, onFreeExplore, loading }: ScenarioSelectorProps) {
  return (
    <div className="py-4">
      <div className="text-center mb-8">
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">어떤 분석을 시작할까요?</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5">
          경남 18개 시군 샘플 데이터로 즉시 시각화됩니다 — Supabase 재구축 불필요
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4 max-w-3xl mx-auto">
        {SCENARIO_META.map(s => {
          const gradientClass = ACCENT_BG[s.accentColor] ?? 'from-indigo-500 to-purple-500'
          return (
            <button
              key={s.key}
              onClick={() => !loading && onSelect(s.key)}
              disabled={loading}
              className="group relative text-left bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5 hover:border-indigo-400 dark:hover:border-indigo-500 hover:shadow-lg transition-all duration-150 overflow-hidden focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {/* 상단 컬러 바 */}
              <div className={`absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r ${gradientClass} opacity-0 group-hover:opacity-100 transition-opacity`} />

              <span className="text-3xl block mb-3">{s.icon}</span>
              <div className="font-semibold text-gray-900 dark:text-gray-100 text-sm mb-2">{s.title}</div>
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mb-3 line-clamp-3">{s.description}</p>

              <div className="flex flex-wrap gap-1.5 mb-3">
                {s.dataSources.map(src => (
                  <span key={src} className="text-[11px] px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-800">
                    {src}
                  </span>
                ))}
                <span className="text-[11px] px-2 py-0.5 rounded bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-100 dark:border-purple-800">
                  {ANALYSIS_LABEL[s.analysisType]}
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-100 dark:border-green-800">
                  {LAYOUT_LABEL[s.layout]}
                </span>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-800">
                <span className="text-[11px] text-gray-400 dark:text-gray-500">노드 {s.nodeCount} · 엣지 {s.edgeCount}</span>
                <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400 group-hover:translate-x-0.5 transition-transform">
                  시작하기 →
                </span>
              </div>
            </button>
          )
        })}
      </div>

      <div className="max-w-3xl mx-auto mt-4">
        <button
          onClick={onFreeExplore}
          disabled={loading}
          className="w-full py-3 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl text-sm text-gray-500 dark:text-gray-400 hover:border-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-all disabled:opacity-50"
        >
          🔎 &nbsp;<strong>직접 탐색</strong> — 시나리오 없이 전체 그래프를 자유롭게 탐색합니다
        </button>
      </div>

      <div className="max-w-3xl mx-auto mt-4 px-4 py-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
        <span>⚡</span>
        <span>샘플 데이터는 클라이언트에서 직접 로드됩니다 — 재구축 없이 즉시 시각화 가능합니다</span>
      </div>
    </div>
  )
}
