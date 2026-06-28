'use client'

import { Network, Filter, Sparkles, Target, Database } from 'lucide-react'
import { Card, StatCard, Btn, EmptyState, Skeleton } from '@/components/ui'
import type { OntologyGraphData } from '@/lib/ontology/types'
import type { Action, ActionResult } from '../hooks/useOntologyData'

interface OverviewTabProps {
  graph: OntologyGraphData | null
  loading: boolean
  actions: Action[]
  scoringKey: string | null
  scoring: boolean
  actionResult: ActionResult | null
  degrees: Map<string, number>
  onBuildOntology: () => void
  onRunScoring: (key: string) => void
}

export default function OverviewTab({
  graph,
  loading,
  actions,
  scoringKey,
  scoring,
  actionResult,
  degrees,
  onBuildOntology,
  onRunScoring,
}: OverviewTabProps) {
  const maxScore = actionResult?.results?.[0]?.priority_score ?? 1

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {loading ? (
          <>
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </>
        ) : graph && graph.nodes && graph.nodes.length > 0 ? (
          <>
            <StatCard label="노드" value={graph.nodes.length.toLocaleString()} icon={<Network />} color="blue" />
            <StatCard label="엣지" value={(graph.edges?.length ?? 0).toLocaleString()} icon={<Target />} color="purple" />
            <StatCard
              label="노드 타입"
              value={Array.from(new Set(graph.nodes.map(n => n.obj_type))).length}
              icon={<Filter />}
              color="green"
            />
            <StatCard
              label="평균 연결 수"
              value={Number((graph.edges?.length ? (graph.edges.length * 2) / graph.nodes.length : 0).toFixed(1))}
              icon={<Sparkles />}
              color="amber"
            />
          </>
        ) : (
          <>
            <StatCard label="노드" value="0" icon={<Network />} color="gray" />
            <StatCard label="엣지" value="0" icon={<Sparkles />} color="gray" />
            <StatCard label="노드 타입" value="0" icon={<Filter />} color="gray" />
            <StatCard label="평균 연결 수" value="0" icon={<Sparkles />} color="gray" />
          </>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <h3 className="font-medium text-gray-700 dark:text-gray-300 mb-3">그래프 통계</h3>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : graph && graph.nodes && graph.nodes.length > 0 ? (
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500 dark:text-gray-400">노드 수</dt>
                <dd className="font-medium">{graph.nodes.length.toLocaleString()}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500 dark:text-gray-400">엣지 수</dt>
                <dd className="font-medium">{(graph.edges?.length ?? 0).toLocaleString()}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500 dark:text-gray-400">노드 타입</dt>
                <dd className="font-medium">{Array.from(new Set(graph.nodes.map(n => n.obj_type))).join(', ')}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500 dark:text-gray-400">총 연결 수</dt>
                <dd className="font-medium">
                  {degrees.size > 0 ? Array.from(degrees.values()).reduce((a, b) => a + b, 0).toLocaleString() : 0}
                </dd>
              </div>
            </dl>
          ) : (
            <EmptyState
              icon={<Database />}
              title="온톨로지 데이터 없음"
              description="데이터가 없습니다. 온톨로지 재구축을 실행해 보세요."
              action={{ label: '재구축', onClick: onBuildOntology }}
            />
          )}
        </Card>

        <Card>
          <h3 className="font-medium text-gray-700 dark:text-gray-300 mb-3">정책 액션 — 우선순위 시군</h3>
          {actions.length === 0 ? (
            <EmptyState
              icon={<Sparkles />}
              title="액션 없음"
              description="사용 가능한 정책 액션이 없습니다."
            />
          ) : (
            <ul className="space-y-3">
              {actions.map(a => (
                <li key={a.key}>
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300">{a.name}</span>
                      <span className="text-gray-400 dark:text-gray-300 text-xs ml-2">{a.key}</span>
                    </div>
                    <Btn
                      onClick={() => onRunScoring(a.key)}
                      loading={scoring && scoringKey === a.key}
                      disabled={scoring && scoringKey !== a.key}
                      variant={scoringKey === a.key ? 'primary' : 'secondary'}
                      size="sm"
                    >
                      {scoringKey === a.key ? '닫기' : '우선순위 보기'}
                    </Btn>
                  </div>
                  {a.description && <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">{a.description}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Lineage summary */}
      {graph && graph.nodes && graph.nodes.length > 0 && (
        <Card>
          <h3 className="font-medium text-gray-700 dark:text-gray-300 mb-3">계보 요약</h3>
          <dl className="space-y-1 text-sm">
            {(() => {
              const edgeSet = graph.edges ?? []
              const dstSet = new Set(edgeSet.map(e => e.dst))
              const srcSet = new Set(edgeSet.map(e => e.src))
              const sourceNodes = graph.nodes.filter(n => !dstSet.has(n.obj_id))
              const leafNodes = graph.nodes.filter(n => !srcSet.has(n.obj_id))
              const degreeMap = new Map<string, number>()
              edgeSet.forEach(e => {
                degreeMap.set(e.src, (degreeMap.get(e.src) ?? 0) + 1)
                degreeMap.set(e.dst, (degreeMap.get(e.dst) ?? 0) + 1)
              })
              const sortedByDeg = [...degreeMap.entries()].sort((a, b) => b[1] - a[1])
              const topNode = sortedByDeg[0] ? graph.nodes.find(n => n.obj_id === sortedByDeg[0][0]) : null
              return (
                <>
                  <div className="flex justify-between">
                    <dt className="text-gray-500 dark:text-gray-400">소스 노드 (진입점)</dt>
                    <dd className="font-medium">{sourceNodes.length.toLocaleString()}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500 dark:text-gray-400">리프 노드 (최종 출력)</dt>
                    <dd className="font-medium">{leafNodes.length.toLocaleString()}</dd>
                  </div>
                  {topNode && (
                    <div className="flex justify-between">
                      <dt className="text-gray-500 dark:text-gray-400">최다 연결 노드</dt>
                      <dd className="font-medium text-right">{topNode.label} <span className="text-gray-400 dark:text-gray-300">({sortedByDeg[0][1]})</span></dd>
                    </div>
                  )}
                </>
              )
            })()}
          </dl>
        </Card>
      )}

      {actionResult && !scoring && (
        <div className="bg-white dark:bg-gray-900 rounded-lg border shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-indigo-50 dark:bg-indigo-900/20">
            <h3 className="font-medium text-indigo-800 dark:text-indigo-200 text-sm">
              {actionResult.action} — 우선순위 시군 (상위 {actionResult.results.length}개)
            </h3>
            <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-0.5">{actionResult.method}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 dark:bg-gray-950">
                <tr>
                  <th className="px-3 py-2 text-center text-gray-500 dark:text-gray-400 w-10">순위</th>
                  <th className="px-3 py-2 text-left text-gray-600 dark:text-gray-400">시군</th>
                  <th className="px-3 py-2 text-right text-gray-600 dark:text-gray-400">청년인구</th>
                  <th className="px-3 py-2 text-right text-gray-600 dark:text-gray-400">순이동</th>
                  <th className="px-3 py-2 text-right text-gray-600 dark:text-gray-400">종사자수</th>
                  <th className="px-3 py-2 text-right text-gray-600 dark:text-gray-400">청년센터</th>
                  <th className="px-3 py-2 text-left text-gray-600 dark:text-gray-400 min-w-32">우선순위점수</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {actionResult.results.map(r => (
                  <tr key={r.sgg_cd} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors duration-100">
                    <td className="px-3 py-1.5 text-center font-medium text-gray-500 dark:text-gray-400">{r.rank}</td>
                    <td className="px-3 py-1.5 font-medium text-gray-800 dark:text-gray-200">{r.sigun}</td>
                    <td className="px-3 py-1.5 text-right text-gray-600 dark:text-gray-400">{r.youth_pop.toLocaleString()}</td>
                    <td className={`px-3 py-1.5 text-right font-medium ${r.net_migration >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400'}`}>
                      {r.net_migration >= 0 ? '+' : ''}{r.net_migration.toLocaleString()}
                    </td>
                    <td className="px-3 py-1.5 text-right text-gray-600 dark:text-gray-400">{r.employees.toLocaleString()}</td>
                    <td className="px-3 py-1.5 text-right text-gray-600 dark:text-gray-400">{r.youth_centers}</td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-full h-2">
                          <div
                            className="bg-indigo-500 h-2 rounded-full"
                            style={{ width: `${(r.priority_score / maxScore) * 100}%` }}
                          />
                        </div>
                        <span className="text-gray-700 dark:text-gray-300 font-medium w-10 text-right">{r.priority_score}</span>
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
  )
}
