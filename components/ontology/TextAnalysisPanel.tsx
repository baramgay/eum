'use client'

import { useState, useCallback, useEffect } from 'react'
import { BarChart3, GitBranch, Hash, Search, Network, List } from 'lucide-react'
import { Card, Btn, Badge } from '@/components/ui'
import type { OntologyNode, OntologyEdge } from '@/lib/ontology-utils'
import type {
  TextAnalysisResponse,
  WordFrequency,
  RelationPattern,
  WordNetworkNode,
  WordNetworkEdge,
} from '@/app/api/ontology/text-analysis/route'
import WordNetworkGraph from './WordNetworkGraph'

interface TextAnalysisPanelProps {
  nodes: OntologyNode[]
  edges: OntologyEdge[]
}

type DetailTab = 'wordcloud' | 'tfidf' | 'relation-pattern'

const DETAIL_TABS: { key: DetailTab; label: string; icon: React.ElementType }[] = [
  { key: 'wordcloud', label: '워드 빈도', icon: Hash },
  { key: 'tfidf', label: 'TF-IDF', icon: BarChart3 },
  { key: 'relation-pattern', label: '관계 패턴', icon: GitBranch },
]

const TYPE_COLOR: Record<string, string> = {
  node:     'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300',
  relation: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300',
  label:    'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300',
  type:     'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300',
}

function WordCloudView({ words }: { words: WordFrequency[] }) {
  if (!words.length) return <p className="text-xs text-gray-400 text-center py-6">키워드가 없습니다.</p>
  const maxVal = Math.max(...words.map(w => w.value))
  return (
    <div className="flex flex-wrap gap-2 p-2">
      {words.map((w, i) => {
        const ratio = w.value / maxVal
        const size = ratio > 0.7 ? 'text-2xl' : ratio > 0.4 ? 'text-lg' : ratio > 0.2 ? 'text-sm' : 'text-xs'
        const cls = TYPE_COLOR[w.type ?? 'node'] ?? TYPE_COLOR.node
        return (
          <span key={i} className={`inline-block px-2 py-1 rounded font-medium ${size} ${cls}`}>
            {w.text}
            <span className="ml-1 text-[10px] opacity-60">{w.value}</span>
          </span>
        )
      })}
    </div>
  )
}

function TfidfView({ items }: { items: TextAnalysisResponse['tfidf'] }) {
  if (!items?.length) return <p className="text-xs text-gray-400 text-center py-6">TF-IDF 결과가 없습니다.</p>
  const top = items.slice(0, 30)
  const maxScore = Math.max(...top.map(i => i.score))
  return (
    <div className="space-y-1">
      {top.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-[11px] text-gray-400 w-5 text-right tabular-nums">{i + 1}</span>
          <span className="text-xs font-mono text-gray-800 dark:text-gray-200 w-24 truncate">{item.term}</span>
          <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-400 dark:bg-indigo-500 rounded-full"
              style={{ width: `${(item.score / maxScore) * 100}%` }}
            />
          </div>
          <span className="text-[11px] text-gray-500 tabular-nums w-14 text-right">{item.score.toFixed(4)}</span>
          <span className="text-[11px] text-gray-400 truncate max-w-[80px]">{item.label}</span>
        </div>
      ))}
    </div>
  )
}

function RelationPatternView({ patterns, summary }: { patterns?: RelationPattern[]; summary?: string }) {
  if (!patterns?.length) return <p className="text-xs text-gray-400 text-center py-6">관계 패턴이 없습니다.</p>
  return (
    <div className="space-y-3">
      {summary && (
        <div className="px-3 py-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
          <GitBranch className="w-3.5 h-3.5 flex-shrink-0" />
          {summary}
        </div>
      )}
      {patterns.map((p, i) => (
        <div key={i} className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">{p.rel}</span>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-gray-500">{p.count}건</span>
              <span className="text-[11px] text-gray-400">평균 가중치 {p.avgWeight}</span>
            </div>
          </div>
          <div className="space-y-1">
            {p.examples.map((ex, j) => (
              <div key={j} className="flex items-center gap-1.5 text-[11px] text-gray-500">
                <span className="text-gray-700 dark:text-gray-300 font-medium truncate max-w-[80px]">{ex.src}</span>
                <span className="text-gray-400">→</span>
                <span className="text-gray-700 dark:text-gray-300 font-medium truncate max-w-[80px]">{ex.dst}</span>
                <span className="ml-auto text-gray-400">w={ex.weight}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function TextAnalysisPanel({ nodes, edges }: TextAnalysisPanelProps) {
  const [networkNodes, setNetworkNodes] = useState<WordNetworkNode[]>([])
  const [networkEdges, setNetworkEdges] = useState<WordNetworkEdge[]>([])
  const [networkSummary, setNetworkSummary] = useState<string>('')
  const [networkLoading, setNetworkLoading] = useState(false)
  const [networkError, setNetworkError] = useState<string | null>(null)

  const [showDetail, setShowDetail] = useState(false)
  const [detailTab, setDetailTab] = useState<DetailTab>('wordcloud')
  const [detailResult, setDetailResult] = useState<TextAnalysisResponse | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const loadNetwork = useCallback(async () => {
    if (!nodes.length) return
    setNetworkLoading(true)
    setNetworkError(null)
    try {
      const res = await fetch('/api/ontology/text-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodes, edges, analysisType: 'word-network' }),
      })
      if (!res.ok) throw new Error(await res.text())
      const data: TextAnalysisResponse = await res.json()
      setNetworkNodes(data.wordNetworkNodes ?? [])
      setNetworkEdges(data.wordNetworkEdges ?? [])
      setNetworkSummary(data.summary ?? '')
    } catch (e) {
      setNetworkError(e instanceof Error ? e.message : '분석 오류')
    } finally {
      setNetworkLoading(false)
    }
  }, [nodes, edges])

  const loadDetail = useCallback(async (type: DetailTab) => {
    setDetailTab(type)
    setDetailLoading(true)
    try {
      const res = await fetch('/api/ontology/text-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodes, edges, analysisType: type }),
      })
      if (!res.ok) throw new Error(await res.text())
      const data: TextAnalysisResponse = await res.json()
      setDetailResult(data)
    } catch {
      setDetailResult(null)
    } finally {
      setDetailLoading(false)
    }
  }, [nodes, edges])

  // Auto-load network when nodes arrive
  useEffect(() => {
    if (nodes.length > 0) loadNetwork()
  }, [loadNetwork])

  if (!nodes.length) {
    return (
      <Card className="text-center py-10 text-gray-400 dark:text-gray-500">
        <Search className="w-8 h-8 mx-auto mb-3 opacity-50" />
        <p className="text-sm">그래프 데이터가 없습니다. 시나리오를 선택하거나 온톨로지를 구축하세요.</p>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Network className="w-4 h-4 text-indigo-500" />
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">단어 연관 네트워크</span>
          {networkSummary && (
            <Badge variant="gray" size="sm">{networkSummary}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Btn
            onClick={loadNetwork}
            loading={networkLoading}
            variant="ghost"
            size="sm"
          >
            새로고침
          </Btn>
          <button
            onClick={() => {
              setShowDetail(d => {
                if (!d) loadDetail(detailTab)
                return !d
              })
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              showDetail
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            <List className="w-3.5 h-3.5" />
            상세 분석
          </button>
        </div>
      </div>

      {/* Word Network Graph */}
      <Card className="p-2">
        {networkLoading && (
          <div className="flex items-center justify-center py-16 gap-2 text-sm text-gray-400">
            <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            네트워크 분석 중...
          </div>
        )}
        {networkError && !networkLoading && (
          <div className="py-6 text-center text-sm text-red-500">{networkError}</div>
        )}
        {!networkLoading && !networkError && networkNodes.length > 0 && (
          <WordNetworkGraph nodes={networkNodes} edges={networkEdges} height={460} />
        )}
        {!networkLoading && !networkError && networkNodes.length === 0 && (
          <div className="py-10 text-center text-xs text-gray-400">분석할 키워드가 없습니다.</div>
        )}
      </Card>

      {/* Detailed analysis panel */}
      {showDetail && (
        <div className="space-y-3">
          <div className="flex gap-1 flex-wrap">
            {DETAIL_TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => loadDetail(key)}
                disabled={detailLoading}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
                  detailTab === key
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>

          <Card>
            {detailLoading && (
              <div className="flex items-center justify-center py-8 gap-2 text-sm text-gray-400">
                <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                분석 중...
              </div>
            )}
            {!detailLoading && detailResult && (
              <div className="p-1">
                {detailResult.type === 'wordcloud' && <WordCloudView words={detailResult.words ?? []} />}
                {detailResult.type === 'tfidf' && <TfidfView items={detailResult.tfidf} />}
                {detailResult.type === 'relation-pattern' && (
                  <RelationPatternView patterns={detailResult.relationPatterns} summary={detailResult.summary} />
                )}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Stats footer */}
      <div className="flex gap-4 text-[11px] text-gray-400">
        <span>노드 {nodes.length}개</span>
        <span>엣지 {edges.length}개</span>
        <span>유형 {new Set(nodes.map(n => n.obj_type)).size}가지</span>
        {networkNodes.length > 0 && <span>키워드 {networkNodes.length}개 · 연관 {networkEdges.length}건</span>}
      </div>
    </div>
  )
}
