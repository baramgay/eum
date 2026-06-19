'use client'

import { TrendingUp, TrendingDown, Minus, X } from 'lucide-react'
import { extractNodeKpis } from '@/lib/ontology/demo-graph-meta'
import type { ScenarioKey } from '@/lib/ontology/demo-graph-meta'
import type { OntologyNode } from '@/lib/ontology-utils'

interface NodeKpiPanelProps {
  node: OntologyNode
  scenarioKey: ScenarioKey | null
  onClose: () => void
}

export default function NodeKpiPanel({ node, scenarioKey, onClose }: NodeKpiPanelProps) {
  const kpis = scenarioKey ? extractNodeKpis(scenarioKey, node.obj_id, node.props) : []

  const props: Record<string, string> = {}
  for (const part of node.props.split(';')) {
    const eq = part.indexOf('=')
    if (eq !== -1) props[part.slice(0, eq).trim()] = part.slice(eq + 1).trim()
  }

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-indigo-500" />
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate max-w-[180px]">{node.label}</span>
          <span className="text-[11px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">{node.obj_type}</span>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-0.5">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* KPI 카드들 */}
      {kpis.length > 0 ? (
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {kpis.map((kpi, i) => (
            <div
              key={i}
              className={`flex items-center justify-between px-4 py-2.5 ${kpi.highlight ? 'bg-red-50 dark:bg-red-900/20' : ''}`}
            >
              <span className="text-xs text-gray-500 dark:text-gray-400">{kpi.label}</span>
              <div className="flex items-center gap-1.5">
                <span className={`text-sm font-semibold tabular-nums ${kpi.highlight ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'}`}>
                  {kpi.value}
                </span>
                {kpi.unit && <span className="text-[11px] text-gray-400">{kpi.unit}</span>}
                {kpi.trend === 'up' && <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />}
                {kpi.trend === 'down' && <TrendingDown className="w-3.5 h-3.5 text-red-500" />}
                {kpi.trend === 'neutral' && <Minus className="w-3.5 h-3.5 text-gray-400" />}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* 시나리오 없거나 도메인 노드인 경우 props 그대로 표시 */
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {Object.entries(props).filter(([k]) => !['size', 'color'].includes(k)).map(([k, v]) => (
            <div key={k} className="flex items-center justify-between px-4 py-2.5">
              <span className="text-xs text-gray-500 dark:text-gray-400">{k}</span>
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100 tabular-nums">{v}</span>
            </div>
          ))}
        </div>
      )}

      {/* 노드 ID */}
      <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800">
        <span className="text-[10px] text-gray-400 font-mono break-all">{node.obj_id}</span>
      </div>
    </div>
  )
}
