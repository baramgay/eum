'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'

const OntologyGraph = dynamic(() => import('./OntologyGraph'), {
  ssr: false,
  loading: () => <div className="text-gray-400 text-sm py-8 text-center">그래프 로딩 중...</div>,
})

interface OntologyNode { obj_id: string; label: string; obj_type: string; props: string }
interface OntologyEdge { src: string; rel: string; dst: string; weight: number }
interface OntologyGraph { nodes: OntologyNode[]; edges: OntologyEdge[] }
interface Action { key: string; name: string; description: string }

interface ScoredRegion {
  rank: number; sgg_cd: string; sigun: string
  youth_pop: number; net_migration: number
  employees: number; youth_centers: number; priority_score: number
}
interface ActionResult {
  action: string; description: string; method: string
  results: ScoredRegion[]
}

type Tab = '개요' | '그래프' | '노드 목록'
const TABS: Tab[] = ['개요', '그래프', '노드 목록']

export default function OntologyClient() {
  const [graph, setGraph]           = useState<OntologyGraph | null>(null)
  const [actions, setActions]       = useState<Action[]>([])
  const [building, setBuilding]     = useState(false)
  const [sgg, setSgg]               = useState('')
  const [loading, setLoading]       = useState(true)
  const [scoringKey, setScoringKey] = useState<string | null>(null)
  const [actionResult, setActionResult] = useState<ActionResult | null>(null)
  const [scoring, setScoring]       = useState(false)
  const [activeTab, setActiveTab]   = useState<Tab>('개요')

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

  async function runScoring(key: string) {
    if (scoringKey === key) { setScoringKey(null); setActionResult(null); return }
    setScoringKey(key)
    setScoring(true)
    const r = await fetch(`/api/ontology/action/${key}`)
    setActionResult(await r.json())
    setScoring(false)
  }

  useEffect(() => {
    Promise.all([
      loadGraph(),
      fetch('/api/ontology?type=actions').then(r => r.json()).then(setActions),
    ])
  }, [])

  const maxScore = actionResult?.results?.[0]?.priority_score ?? 1

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-800">온톨로지 탐색</h2>
        <button
          onClick={buildOntology} disabled={building}
          className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700 disabled:opacity-50"
        >
          {building ? '구축 중...' : '온톨로지 재구축'}
        </button>
      </div>

      {/* 탭 */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-0">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === t
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {t}
              {t === '그래프' && graph && (
                <span className="ml-1.5 text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                  {graph.nodes?.length ?? 0}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* 시군 필터 (개요·그래프 공용) */}
      {activeTab !== '노드 목록' && (
        <div className="flex gap-2">
          <input
            value={sgg} onChange={e => setSgg(e.target.value)}
            placeholder="시군 코드(예: 48170)로 필터..."
            className="w-64 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button onClick={() => loadGraph(sgg || undefined)}
            className="px-3 py-2 bg-gray-100 text-gray-700 text-sm rounded-md hover:bg-gray-200">
            필터
          </button>
        </div>
      )}

      {/* ===== 개요 탭 ===== */}
      {activeTab === '개요' && (
        <div className="space-y-5">
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
                  {(graph.nodes?.length ?? 0) === 0 && (
                    <p className="text-xs text-amber-600 mt-2">
                      데이터 없음 — <strong>온톨로지 재구축</strong> 버튼을 클릭하세요.
                    </p>
                  )}
                </dl>
              ) : (
                <div className="text-gray-400 text-sm">온톨로지 데이터 없음</div>
              )}
            </div>

            <div className="bg-white rounded-lg border p-4 shadow-sm">
              <h3 className="font-medium text-gray-700 mb-3">정책 액션 — 우선순위 시군</h3>
              {actions.length === 0 ? (
                <div className="text-gray-400 text-sm">액션 없음</div>
              ) : (
                <ul className="space-y-2">
                  {actions.map(a => (
                    <li key={a.key}>
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-sm font-medium text-indigo-700">{a.name}</span>
                          <span className="text-gray-400 text-xs ml-2">{a.key}</span>
                        </div>
                        <button
                          onClick={() => runScoring(a.key)}
                          disabled={scoring && scoringKey !== a.key}
                          className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                            scoringKey === a.key
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-white text-indigo-600 border-indigo-300 hover:bg-indigo-50'
                          } disabled:opacity-40`}
                        >
                          {scoring && scoringKey === a.key ? '분석 중...' : scoringKey === a.key ? '닫기' : '우선순위 보기'}
                        </button>
                      </div>
                      {a.description && <p className="text-gray-500 text-xs mt-0.5">{a.description}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {actionResult && !scoring && (
            <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b bg-indigo-50">
                <h3 className="font-medium text-indigo-800 text-sm">
                  {actionResult.action} — 우선순위 시군 (상위 {actionResult.results.length}개)
                </h3>
                <p className="text-xs text-indigo-600 mt-0.5">{actionResult.method}</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-center text-gray-500 w-10">순위</th>
                      <th className="px-3 py-2 text-left text-gray-600">시군</th>
                      <th className="px-3 py-2 text-right text-gray-600">청년인구</th>
                      <th className="px-3 py-2 text-right text-gray-600">순이동</th>
                      <th className="px-3 py-2 text-right text-gray-600">종사자수</th>
                      <th className="px-3 py-2 text-right text-gray-600">청년센터</th>
                      <th className="px-3 py-2 text-left text-gray-600 min-w-32">우선순위점수</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {actionResult.results.map(r => (
                      <tr key={r.sgg_cd} className="hover:bg-gray-50">
                        <td className="px-3 py-1.5 text-center font-medium text-gray-500">{r.rank}</td>
                        <td className="px-3 py-1.5 font-medium text-gray-800">{r.sigun}</td>
                        <td className="px-3 py-1.5 text-right text-gray-600">{r.youth_pop.toLocaleString()}</td>
                        <td className={`px-3 py-1.5 text-right font-medium ${r.net_migration >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                          {r.net_migration >= 0 ? '+' : ''}{r.net_migration.toLocaleString()}
                        </td>
                        <td className="px-3 py-1.5 text-right text-gray-600">{r.employees.toLocaleString()}</td>
                        <td className="px-3 py-1.5 text-right text-gray-600">{r.youth_centers}</td>
                        <td className="px-3 py-1.5">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-gray-100 rounded-full h-2">
                              <div
                                className="bg-indigo-500 h-2 rounded-full"
                                style={{ width: `${(r.priority_score / maxScore) * 100}%` }}
                              />
                            </div>
                            <span className="text-gray-700 font-medium w-10 text-right">{r.priority_score}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== 그래프 탭 ===== */}
      {activeTab === '그래프' && (
        <div>
          {loading ? (
            <div className="bg-gray-100 rounded-lg h-96 flex items-center justify-center text-gray-400 text-sm">
              데이터 로딩 중...
            </div>
          ) : (
            <OntologyGraph
              nodes={graph?.nodes ?? []}
              edges={graph?.edges ?? []}
              width={900}
              height={580}
            />
          )}
        </div>
      )}

      {/* ===== 노드 목록 탭 ===== */}
      {activeTab === '노드 목록' && (
        <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50 flex justify-between items-center">
            <h3 className="font-medium text-gray-700 text-sm">
              노드 목록 ({graph?.nodes?.length ?? 0}개)
            </h3>
            {(graph?.nodes?.length ?? 0) > 50 && (
              <span className="text-xs text-gray-400">상위 50개 표시</span>
            )}
          </div>
          {!graph?.nodes?.length ? (
            <div className="px-4 py-8 text-center text-gray-400 text-sm">
              노드가 없습니다. 온톨로지를 재구축하세요.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-gray-600">ID</th>
                    <th className="px-4 py-2 text-left text-gray-600">레이블</th>
                    <th className="px-4 py-2 text-left text-gray-600">타입</th>
                    <th className="px-4 py-2 text-left text-gray-600">속성</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {graph.nodes.slice(0, 50).map(n => (
                    <tr key={n.obj_id} className="hover:bg-gray-50">
                      <td className="px-4 py-1.5 font-mono text-gray-500">{n.obj_id}</td>
                      <td className="px-4 py-1.5 text-gray-800">{n.label}</td>
                      <td className="px-4 py-1.5 text-indigo-600">{n.obj_type}</td>
                      <td className="px-4 py-1.5 text-gray-400 font-mono text-xs truncate max-w-48">{n.props}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
