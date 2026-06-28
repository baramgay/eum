'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, Pencil, Check, X, Loader2 } from 'lucide-react'
import { Btn, Badge, Input } from '@/components/ui'
import toast from 'react-hot-toast'

interface OntologyNode {
  obj_id: string
  label: string
  obj_type: string
  props?: string
}

interface OntologyEdge {
  src: string
  rel: string
  dst: string
  weight: number
}

interface EditingNode {
  obj_id: string
  label: string
  obj_type: string
  props: string
}

interface AddNodeForm {
  obj_id: string
  label: string
  obj_type: string
  props: string
}

interface AddEdgeForm {
  src: string
  rel: string
  dst: string
  weight: string
}

export default function EditTab() {
  const [nodes, setNodes] = useState<OntologyNode[]>([])
  const [edges, setEdges] = useState<OntologyEdge[]>([])
  const [loadingNodes, setLoadingNodes] = useState(false)
  const [loadingEdges, setLoadingEdges] = useState(false)

  const [editingNodeId, setEditingNodeId] = useState<string | null>(null)
  const [editingNode, setEditingNode] = useState<EditingNode | null>(null)
  const [savingNode, setSavingNode] = useState(false)
  const [deletingNodeId, setDeletingNodeId] = useState<string | null>(null)

  const [showAddNode, setShowAddNode] = useState(false)
  const [addNodeForm, setAddNodeForm] = useState<AddNodeForm>({ obj_id: '', label: '', obj_type: '', props: '' })
  const [addingNode, setAddingNode] = useState(false)

  const [deletingEdge, setDeletingEdge] = useState<string | null>(null)
  const [showAddEdge, setShowAddEdge] = useState(false)
  const [addEdgeForm, setAddEdgeForm] = useState<AddEdgeForm>({ src: '', rel: '', dst: '', weight: '1' })
  const [addingEdge, setAddingEdge] = useState(false)

  const [nodeSearch, setNodeSearch] = useState('')
  const [edgeSearch, setEdgeSearch] = useState('')

  const loadNodes = useCallback(async () => {
    setLoadingNodes(true)
    try {
      const res = await fetch('/api/ontology/nodes')
      if (!res.ok) throw new Error('노드 로드 실패')
      setNodes(await res.json())
    } catch (e) {
      toast.error(String(e))
    } finally {
      setLoadingNodes(false)
    }
  }, [])

  const loadEdges = useCallback(async () => {
    setLoadingEdges(true)
    try {
      const res = await fetch('/api/ontology/edges')
      if (!res.ok) throw new Error('엣지 로드 실패')
      setEdges(await res.json())
    } catch (e) {
      toast.error(String(e))
    } finally {
      setLoadingEdges(false)
    }
  }, [])

  useEffect(() => {
    loadNodes()
    loadEdges()
  }, [loadNodes, loadEdges])

  /* ── 노드 편집 ── */

  const startEditNode = (node: OntologyNode) => {
    setEditingNodeId(node.obj_id)
    setEditingNode({ obj_id: node.obj_id, label: node.label, obj_type: node.obj_type, props: node.props ?? '' })
  }

  const cancelEditNode = () => {
    setEditingNodeId(null)
    setEditingNode(null)
  }

  const saveNode = async () => {
    if (!editingNode) return
    setSavingNode(true)
    try {
      const res = await fetch(`/api/ontology/nodes/${encodeURIComponent(editingNode.obj_id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: editingNode.label, obj_type: editingNode.obj_type, props: editingNode.props }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? '저장 실패') }
      toast.success('노드가 수정되었습니다')
      setEditingNodeId(null)
      setEditingNode(null)
      await loadNodes()
    } catch (e) {
      toast.error(String(e))
    } finally {
      setSavingNode(false)
    }
  }

  const deleteNode = async (id: string) => {
    if (!confirm(`노드 "${id}"를 삭제하면 연결된 엣지도 함께 삭제될 수 있습니다. 계속하시겠습니까?`)) return
    setDeletingNodeId(id)
    try {
      const res = await fetch(`/api/ontology/nodes/${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? '삭제 실패') }
      toast.success('노드가 삭제되었습니다')
      await loadNodes()
      await loadEdges()
    } catch (e) {
      toast.error(String(e))
    } finally {
      setDeletingNodeId(null)
    }
  }

  /* ── 노드 추가 ── */

  const addNode = async () => {
    if (!addNodeForm.label.trim()) { toast.error('label이 필요합니다'); return }
    if (!addNodeForm.obj_type.trim()) { toast.error('유형이 필요합니다'); return }
    setAddingNode(true)
    try {
      const body: Record<string, string> = { label: addNodeForm.label.trim(), obj_type: addNodeForm.obj_type.trim(), props: addNodeForm.props }
      if (addNodeForm.obj_id.trim()) body.obj_id = addNodeForm.obj_id.trim()
      const res = await fetch('/api/ontology/nodes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? '추가 실패') }
      toast.success('노드가 추가되었습니다')
      setAddNodeForm({ obj_id: '', label: '', obj_type: '', props: '' })
      setShowAddNode(false)
      await loadNodes()
    } catch (e) {
      toast.error(String(e))
    } finally {
      setAddingNode(false)
    }
  }

  /* ── 엣지 삭제 ── */

  const edgeKey = (e: OntologyEdge) => `${e.src}|${e.rel}|${e.dst}`

  const deleteEdge = async (edge: OntologyEdge) => {
    const key = edgeKey(edge)
    if (!confirm(`엣지 "${edge.src} → ${edge.rel} → ${edge.dst}"를 삭제하시겠습니까?`)) return
    setDeletingEdge(key)
    try {
      const id = encodeURIComponent(key)
      const res = await fetch(`/api/ontology/edges/${id}`, { method: 'DELETE' })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? '삭제 실패') }
      toast.success('엣지가 삭제되었습니다')
      await loadEdges()
    } catch (e) {
      toast.error(String(e))
    } finally {
      setDeletingEdge(null)
    }
  }

  /* ── 엣지 추가 ── */

  const addEdge = async () => {
    if (!addEdgeForm.src.trim() || !addEdgeForm.rel.trim() || !addEdgeForm.dst.trim()) {
      toast.error('src, rel, dst가 모두 필요합니다')
      return
    }
    setAddingEdge(true)
    try {
      const res = await fetch('/api/ontology/edges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ src: addEdgeForm.src.trim(), rel: addEdgeForm.rel.trim(), dst: addEdgeForm.dst.trim(), weight: Number(addEdgeForm.weight) || 1 }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? '추가 실패') }
      toast.success('엣지가 추가되었습니다')
      setAddEdgeForm({ src: '', rel: '', dst: '', weight: '1' })
      setShowAddEdge(false)
      await loadEdges()
    } catch (e) {
      toast.error(String(e))
    } finally {
      setAddingEdge(false)
    }
  }

  /* ── 필터링 ── */

  const filteredNodes = nodes.filter(n =>
    !nodeSearch || n.label.includes(nodeSearch) || n.obj_id.includes(nodeSearch) || n.obj_type.includes(nodeSearch)
  )
  const filteredEdges = edges.filter(e =>
    !edgeSearch || e.src.includes(edgeSearch) || e.rel.includes(edgeSearch) || e.dst.includes(edgeSearch)
  )

  /* ── 렌더 ── */

  return (
    <div className="space-y-8 p-6">

      {/* 노드 편집 */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">노드 ({nodes.length})</h2>
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder="검색..."
              value={nodeSearch}
              onChange={e => setNodeSearch(e.target.value)}
              className="h-8 px-3 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400 bg-white dark:bg-gray-900"
            />
            <Btn size="sm" variant="primary" onClick={() => setShowAddNode(v => !v)} icon={<Plus size={14} />}>
              노드 추가
            </Btn>
            <button onClick={loadNodes} disabled={loadingNodes} aria-label="새로고침"
              className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 disabled:opacity-40 transition-colors duration-150">
              <Loader2 size={16} className={loadingNodes ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* 노드 추가 폼 */}
        {showAddNode && (
          <div className="mb-4 p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 space-y-3">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">새 노드</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input type="text" placeholder="obj_id (선택, 자동생성 가능)" value={addNodeForm.obj_id}
                onChange={e => setAddNodeForm(f => ({ ...f, obj_id: e.target.value }))}
                className="h-9 px-3 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400 bg-white dark:bg-gray-900" />
              <Input type="text" placeholder="label *" value={addNodeForm.label}
                onChange={e => setAddNodeForm(f => ({ ...f, label: e.target.value }))}
                className="h-9 px-3 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400 bg-white dark:bg-gray-900" />
              <Input type="text" placeholder="유형(obj_type) *" value={addNodeForm.obj_type}
                onChange={e => setAddNodeForm(f => ({ ...f, obj_type: e.target.value }))}
                className="h-9 px-3 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400 bg-white dark:bg-gray-900" />
              <Input type="text" placeholder="props (key=val;key2=val2)" value={addNodeForm.props}
                onChange={e => setAddNodeForm(f => ({ ...f, props: e.target.value }))}
                className="h-9 px-3 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400 bg-white dark:bg-gray-900" />
            </div>
            <div className="flex gap-2">
              <Btn size="sm" variant="primary" onClick={addNode} disabled={addingNode}>
                {addingNode ? <Loader2 size={14} className="animate-spin" /> : '추가'}
              </Btn>
              <Btn size="sm" variant="secondary" onClick={() => setShowAddNode(false)}>취소</Btn>
            </div>
          </div>
        )}

        <div className="overflow-auto max-h-72 border border-gray-200 dark:border-gray-700 rounded-lg">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-400">ID</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-400">Label</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-400">유형</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-400">Props</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-400">작업</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {filteredNodes.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-400 dark:text-gray-500">
                  {loadingNodes ? '로딩 중...' : '노드 없음'}
                </td></tr>
              )}
              {filteredNodes.map(node => (
                <tr key={node.obj_id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors duration-100">
                  {editingNodeId === node.obj_id && editingNode ? (
                    <>
                      <td className="px-3 py-2 text-gray-500 dark:text-gray-400 font-mono text-xs">{node.obj_id}</td>
                      <td className="px-3 py-2">
                        <Input value={editingNode.label} onChange={e => setEditingNode(n => n ? { ...n, label: e.target.value } : n)}
                          className="w-full h-7 px-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-gray-400 bg-white dark:bg-gray-900" />
                      </td>
                      <td className="px-3 py-2">
                        <Input value={editingNode.obj_type} onChange={e => setEditingNode(n => n ? { ...n, obj_type: e.target.value } : n)}
                          className="w-full h-7 px-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-gray-400 bg-white dark:bg-gray-900" />
                      </td>
                      <td className="px-3 py-2">
                        <Input value={editingNode.props} onChange={e => setEditingNode(n => n ? { ...n, props: e.target.value } : n)}
                          className="w-full h-7 px-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-gray-400 bg-white dark:bg-gray-900" />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          <button onClick={saveNode} disabled={savingNode} aria-label="저장"
                            className="p-1 text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-200 disabled:opacity-40 transition-colors duration-150">
                            {savingNode ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                          </button>
                          <button onClick={cancelEditNode} aria-label="취소"
                            className="p-1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors duration-150">
                            <X size={14} />
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-2 font-mono text-xs text-gray-500 dark:text-gray-400 max-w-[12rem] truncate">{node.obj_id}</td>
                      <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">{node.label}</td>
                      <td className="px-3 py-2"><Badge variant="gray">{node.obj_type}</Badge></td>
                      <td className="px-3 py-2 font-mono text-xs text-gray-400 dark:text-gray-500 max-w-[14rem] truncate">{node.props}</td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => startEditNode(node)} aria-label="편집"
                            className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors duration-150">
                            <Pencil size={14} />
                          </button>
                          <button onClick={() => deleteNode(node.obj_id)}
                            disabled={deletingNodeId === node.obj_id}
                            aria-label="삭제"
                            className="p-1 text-gray-400 dark:text-gray-500 hover:text-red-500 disabled:opacity-40 transition-colors duration-150">
                            {deletingNodeId === node.obj_id
                              ? <Loader2 size={14} className="animate-spin" />
                              : <Trash2 size={14} />}
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 엣지 편집 */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">엣지 ({edges.length})</h2>
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder="검색..."
              value={edgeSearch}
              onChange={e => setEdgeSearch(e.target.value)}
              className="h-8 px-3 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400 bg-white dark:bg-gray-900"
            />
            <Btn size="sm" variant="primary" onClick={() => setShowAddEdge(v => !v)} icon={<Plus size={14} />}>
              엣지 추가
            </Btn>
            <button onClick={loadEdges} disabled={loadingEdges} aria-label="새로고침"
              className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 disabled:opacity-40 transition-colors duration-150">
              <Loader2 size={16} className={loadingEdges ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* 엣지 추가 폼 */}
        {showAddEdge && (
          <div className="mb-4 p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 space-y-3">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">새 엣지</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="edge-src" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">src (출발 노드 ID)</label>
                <Input id="edge-src" type="text" placeholder="예: sigun:48121" value={addEdgeForm.src}
                  list="node-ids-src"
                  onChange={e => setAddEdgeForm(f => ({ ...f, src: e.target.value }))}
                  className="w-full h-9 px-3 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400 bg-white dark:bg-gray-900" />
              </div>
              <div>
                <label htmlFor="edge-rel" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">rel (관계 유형)</label>
                <Input id="edge-rel" type="text" placeholder="예: 포함, 인접, 청년이동" value={addEdgeForm.rel}
                  onChange={e => setAddEdgeForm(f => ({ ...f, rel: e.target.value }))}
                  className="w-full h-9 px-3 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400 bg-white dark:bg-gray-900" />
              </div>
              <div>
                <label htmlFor="edge-dst" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">dst (도착 노드 ID)</label>
                <Input id="edge-dst" type="text" placeholder="예: sigun:48127" value={addEdgeForm.dst}
                  list="node-ids-dst"
                  onChange={e => setAddEdgeForm(f => ({ ...f, dst: e.target.value }))}
                  className="w-full h-9 px-3 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400 bg-white dark:bg-gray-900" />
              </div>
              <div>
                <label htmlFor="edge-weight" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">가중치</label>
                <Input id="edge-weight" type="number" min="0" step="0.1" placeholder="1" value={addEdgeForm.weight}
                  onChange={e => setAddEdgeForm(f => ({ ...f, weight: e.target.value }))}
                  className="w-full h-9 px-3 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400 bg-white dark:bg-gray-900" />
              </div>
            </div>
            {/* datalist for autocomplete */}
            <datalist id="node-ids-src">
              {nodes.map(n => <option key={n.obj_id} value={n.obj_id} label={n.label} />)}
            </datalist>
            <datalist id="node-ids-dst">
              {nodes.map(n => <option key={n.obj_id} value={n.obj_id} label={n.label} />)}
            </datalist>
            <div className="flex gap-2">
              <Btn size="sm" variant="primary" onClick={addEdge} disabled={addingEdge}>
                {addingEdge ? <Loader2 size={14} className="animate-spin" /> : '추가'}
              </Btn>
              <Btn size="sm" variant="secondary" onClick={() => setShowAddEdge(false)}>취소</Btn>
            </div>
          </div>
        )}

        <div className="overflow-auto max-h-72 border border-gray-200 dark:border-gray-700 rounded-lg">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-400">src</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-400">rel</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-400">dst</th>
                <th className="px-3 py-2 text-center font-medium text-gray-600 dark:text-gray-400">가중치</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-400">삭제</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {filteredEdges.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-400 dark:text-gray-500">
                  {loadingEdges ? '로딩 중...' : '엣지 없음'}
                </td></tr>
              )}
              {filteredEdges.map(edge => {
                const key = edgeKey(edge)
                return (
                  <tr key={key} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors duration-100">
                    <td className="px-3 py-2 font-mono text-xs text-gray-600 dark:text-gray-400 max-w-[12rem] truncate">{edge.src}</td>
                    <td className="px-3 py-2"><Badge variant="blue">{edge.rel}</Badge></td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-600 dark:text-gray-400 max-w-[12rem] truncate">{edge.dst}</td>
                    <td className="px-3 py-2 text-center text-gray-700 dark:text-gray-300">{edge.weight}</td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => deleteEdge(edge)}
                        disabled={deletingEdge === key}
                        aria-label="엣지 삭제"
                        className="p-1 text-gray-400 dark:text-gray-500 hover:text-red-500 disabled:opacity-40 transition-colors duration-150">
                        {deletingEdge === key
                          ? <Loader2 size={14} className="animate-spin" />
                          : <Trash2 size={14} />}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
