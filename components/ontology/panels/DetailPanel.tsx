'use client'

import { useState, useMemo } from 'react'
import { Card, Btn, Input, Textarea } from '@/components/ui'
import { Check, Copy, X, Info, GitMerge, Link2, Pencil, Loader2, Trash2 } from 'lucide-react'
import NodeProfile from '../NodeProfile'
import toast from 'react-hot-toast'
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
  onNodeUpdated?: (updated: OntologyNode) => void
  onNodeDeleted?: (objId: string) => void
}

type Tab = 'info' | 'lineage' | 'related' | 'edit'

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
  onNodeUpdated,
  onNodeDeleted,
}: DetailPanelProps) {
  const [tab, setTab] = useState<Tab>('info')

  /* ── 편집 탭 상태 ── */
  const [editLabel, setEditLabel] = useState(node.label)
  const [editObjType, setEditObjType] = useState(node.obj_type)
  const [editProps, setEditProps] = useState(node.props ?? '')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/ontology/nodes/${encodeURIComponent(node.obj_id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: editLabel, obj_type: editObjType, props: editProps }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? '저장 실패') }
      const updated = await res.json()
      toast.success('저장되었습니다')
      onNodeUpdated?.(updated)
    } catch (e) {
      toast.error(String(e))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm(`"${node.label}" 노드를 삭제하시겠습니까?\n연결된 엣지도 함께 삭제될 수 있습니다.`)) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/ontology/nodes/${encodeURIComponent(node.obj_id)}`, { method: 'DELETE' })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? '삭제 실패') }
      toast.success('삭제되었습니다')
      onNodeDeleted?.(node.obj_id)
      onClose()
    } catch (e) {
      toast.error(String(e))
    } finally {
      setDeleting(false)
    }
  }
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
    { id: 'edit', label: '편집', icon: <Pencil className="w-3 h-3" /> },
  ]

  return (
    <Card className="h-fit lg:sticky lg:top-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-1.5">
          <p className="text-xs text-gray-400 dark:text-gray-300 font-mono break-all">{node.obj_id}</p>
          <Btn onClick={() => onCopyId(node.obj_id)} variant="ghost" size="sm" className="!p-0.5 h-auto" title="ID 복사">
            {copiedId ? <Check className="w-3 h-3 text-green-600 dark:text-green-400" /> : <Copy className="w-3 h-3" />}
          </Btn>
        </div>
        <Btn onClick={onClose} variant="ghost" size="sm" className="!p-1 h-auto flex-shrink-0" title="패널 닫기">
          <X className="w-4 h-4" />
        </Btn>
      </div>

      {/* Priority score bar */}
      {priorityScore !== null && (
        <div className="mb-3 p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-100 dark:border-indigo-800">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-indigo-700 dark:text-indigo-300">우선순위 점수</span>
            <span className="text-sm font-bold text-indigo-800 dark:text-indigo-200">{priorityScore}</span>
          </div>
          <div className="w-full bg-indigo-200 dark:bg-indigo-800 rounded-full h-2">
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
                    <span className="text-[10px] text-gray-400 dark:text-gray-300 italic">{a.rel}</span>
                    <span className="text-xs text-gray-700 dark:text-gray-300 font-medium">{a.node.label}</span>
                    <span className="text-[9px] text-gray-400 dark:text-gray-300">{a.node.obj_type}</span>
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
                    <span className="text-[10px] text-gray-400 dark:text-gray-300 italic">{d.rel}</span>
                    <span className="text-xs text-gray-700 dark:text-gray-300 font-medium">{d.node.label}</span>
                    <span className="text-[9px] text-gray-400 dark:text-gray-300">{d.node.obj_type}</span>
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

      {tab === 'edit' && (
        <div className="space-y-3">
          <p className="text-[10px] font-mono text-gray-400 dark:text-gray-500 break-all">{node.obj_id}</p>
          <div>
            <label htmlFor="detail-edit-label" className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">이름 (Label)</label>
            <Input
              id="detail-edit-label"
              value={editLabel}
              onChange={e => setEditLabel(e.target.value)}
              className="w-full h-9 px-3 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="detail-edit-type" className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">유형 (Type)</label>
            <Input
              id="detail-edit-type"
              value={editObjType}
              onChange={e => setEditObjType(e.target.value)}
              className="w-full h-9 px-3 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="detail-edit-props" className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">속성 (Props)</label>
            <Textarea
              id="detail-edit-props"
              value={editProps}
              onChange={e => setEditProps(e.target.value)}
              rows={4}
              placeholder="key=value;key2=value2"
              className="w-full px-3 py-2 text-xs font-mono bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-1.5 h-8 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              저장
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center justify-center gap-1.5 h-8 px-3 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg disabled:opacity-50 transition-colors"
            >
              {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
              삭제
            </button>
          </div>
        </div>
      )}
    </Card>
  )
}
