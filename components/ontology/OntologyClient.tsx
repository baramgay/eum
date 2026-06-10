'use client'

import { useEffect, useState } from 'react'

interface OntologyNode { id: string; label: string; type: string }
interface OntologyEdge { source: string; target: string; relation: string }
interface OntologyGraph { nodes: OntologyNode[]; edges: OntologyEdge[]; center?: string }
interface Action { key: string; name: string; description: string }

export default function OntologyClient() {
  const [graph, setGraph]     = useState<OntologyGraph | null>(null)
  const [actions, setActions] = useState<Action[]>([])
  const [building, setBuilding] = useState(false)
  const [sgg, setSgg]         = useState('')
  const [loading, setLoading] = useState(true)

  async function loadGraph(sggFilter?: string) {
    setLoading(true)
    const params = sggFilter ? `?sgg=${encodeURIComponent(sggFilter)}` : ''
    const r = await fetch(`/api/ontology${params}`)
    setGraph(await r.json())
    setLoading(false)
  }

  async function buildOntology() {
    setBuilding(true)
    await fetch('/api/ontology', { method: 'POST' })
    await loadGraph(sgg || undefined)
    setBuilding(false)
  }

  useEffect(() => {
    Promise.all([
      loadGraph(),
      fetch('/api/ontology?type=actions').then(r => r.json()).then(setActions),
    ])
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-800">온톨로지 탐색</h2>
        <button
          onClick={buildOntology} disabled={building}
          className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700 disabled:opacity-50"
        >
          {building ? '구축 중...' : '온톨로지 재구축'}
        </button>
      </div>

      <div className="flex gap-2">
        <input
          value={sgg} onChange={e => setSgg(e.target.value)} placeholder="시군 코드(예: 48170)로 필터..."
          className="w-64 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button onClick={() => loadGraph(sgg || undefined)}
          className="px-3 py-2 bg-gray-100 text-gray-700 text-sm rounded-md hover:bg-gray-200">
          필터
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border p-4 shadow-sm">
          <h3 className="font-medium text-gray-700 mb-3">그래프 통계</h3>
          {loading ? (
            <div className="text-gray-400 text-sm">로딩 중...</div>
          ) : graph ? (
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">노드 수</dt>
                <dd className="font-medium">{graph.nodes?.length ?? 0}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">엣지 수</dt>
                <dd className="font-medium">{graph.edges?.length ?? 0}</dd>
              </div>
              {graph.center && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">중심 시군</dt>
                  <dd className="font-medium font-mono text-xs">{graph.center}</dd>
                </div>
              )}
            </dl>
          ) : (
            <div className="text-gray-400 text-sm">온톨로지 데이터 없음</div>
          )}
        </div>

        <div className="bg-white rounded-lg border p-4 shadow-sm">
          <h3 className="font-medium text-gray-700 mb-3">정책 액션</h3>
          {actions.length === 0 ? (
            <div className="text-gray-400 text-sm">액션 없음</div>
          ) : (
            <ul className="space-y-2">
              {actions.map(a => (
                <li key={a.key} className="text-sm">
                  <span className="font-medium text-indigo-700">{a.name}</span>
                  <span className="text-gray-400 text-xs ml-2">{a.key}</span>
                  {a.description && <p className="text-gray-500 text-xs mt-0.5">{a.description}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {graph?.nodes && graph.nodes.length > 0 && (
        <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50">
            <h3 className="font-medium text-gray-700 text-sm">노드 목록 (최대 50개)</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-gray-600">ID</th>
                  <th className="px-4 py-2 text-left text-gray-600">레이블</th>
                  <th className="px-4 py-2 text-left text-gray-600">타입</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {graph.nodes.slice(0, 50).map(n => (
                  <tr key={n.id} className="hover:bg-gray-50">
                    <td className="px-4 py-1.5 font-mono text-gray-500">{n.id}</td>
                    <td className="px-4 py-1.5 text-gray-800">{n.label}</td>
                    <td className="px-4 py-1.5 text-indigo-600">{n.type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
