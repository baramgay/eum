/**
 * 텍스트 분석 API
 * 그래프 노드 레이블·props에서 키워드 빈도·TF-IDF·관계 패턴을 추출한다.
 */
import { NextResponse } from 'next/server'
import type { OntologyNode, OntologyEdge } from '@/lib/ontology-utils'

export interface TextAnalysisRequest {
  nodes: OntologyNode[]
  edges: OntologyEdge[]
  analysisType: 'wordcloud' | 'tfidf' | 'network-text' | 'relation-pattern' | 'cooccurrence' | 'word-network'
}

export interface WordFrequency {
  text: string
  value: number
  type?: string
}

export interface RelationPattern {
  rel: string
  count: number
  avgWeight: number
  examples: Array<{ src: string; dst: string; weight: number }>
}

export interface CooccurrenceLink {
  src: string
  dst: string
  count: number
  rels: string[]
}

export interface WordNetworkNode {
  id: string
  text: string
  freq: number
  type: 'label' | 'relation' | 'type'
}

export interface WordNetworkEdge {
  src: string
  dst: string
  weight: number
}

export interface TextAnalysisResponse {
  type: TextAnalysisRequest['analysisType']
  words?: WordFrequency[]
  relationPatterns?: RelationPattern[]
  cooccurrence?: CooccurrenceLink[]
  tfidf?: Array<{ term: string; score: number; nodeId: string; label: string }>
  wordNetworkNodes?: WordNetworkNode[]
  wordNetworkEdges?: WordNetworkEdge[]
  summary?: string
}

const STOPWORDS = new Set([
  '이', '가', '을', '를', '은', '는', '의', '에', '에서', '으로', '로', '와', '과',
  '도', '만', '도', '까지', '부터', '이고', '이며', '하고', '에게', '한테', '보다',
  '그', '이', '저', '것', '들', '수', '때', '후', '전', '간', '내', '외',
  '및', '또는', '또', '그리고', '하여', '함', '하다', '되다', '있다', '없다',
  '이다', '이며', '이고', '아니다', '이라', '으로서', '로서',
  '대한', '통해', '위한', '위해', '관한', '관련', '기반', '중심',
])

function parseProps(raw: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    result[part.slice(0, eq).trim()] = part.slice(eq + 1).trim()
  }
  return result
}

function tokenize(text: string): string[] {
  return text
    .replace(/[0-9.+\-_]/g, ' ')
    .split(/[\s,;=:\/\(\)\[\]]+/)
    .map(t => t.trim())
    .filter(t => t.length >= 2 && !/^\d+$/.test(t) && !STOPWORDS.has(t))
}

function computeTfIdf(docs: Array<{ id: string; label: string; tokens: string[] }>) {
  const N = docs.length
  const df = new Map<string, number>()
  for (const doc of docs) {
    const unique = new Set(doc.tokens)
    for (const t of unique) df.set(t, (df.get(t) ?? 0) + 1)
  }
  const results: Array<{ term: string; score: number; nodeId: string; label: string }> = []
  for (const doc of docs) {
    const tf = new Map<string, number>()
    for (const t of doc.tokens) tf.set(t, (tf.get(t) ?? 0) + 1)
    for (const [term, freq] of tf) {
      const idf = Math.log(N / (df.get(term) ?? 1))
      const score = (freq / doc.tokens.length) * idf
      if (score > 0.01) results.push({ term, score: parseFloat(score.toFixed(4)), nodeId: doc.id, label: doc.label })
    }
  }
  results.sort((a, b) => b.score - a.score)
  return results.slice(0, 100)
}

export async function POST(req: Request) {
  let body: TextAnalysisRequest
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '요청 본문 파싱 오류' }, { status: 400 })
  }

  const { nodes, edges, analysisType } = body
  if (!nodes?.length) {
    return NextResponse.json({ error: '노드 데이터가 없습니다.' }, { status: 400 })
  }

  const response: TextAnalysisResponse = { type: analysisType }

  if (analysisType === 'wordcloud' || analysisType === 'tfidf') {
    // 노드 레이블 + props 키 + rel 타입 빈도 계산
    const freq = new Map<string, { count: number; type: string }>()

    for (const node of nodes) {
      const tokens = tokenize(node.label + ' ' + node.obj_type)
      for (const t of tokens) {
        const e = freq.get(t)
        freq.set(t, { count: (e?.count ?? 0) + 1, type: 'node' })
      }
    }
    for (const edge of edges) {
      const tokens = tokenize(edge.rel)
      for (const t of tokens) {
        const e = freq.get(t)
        freq.set(t, { count: (e?.count ?? 0) + 1, type: 'relation' })
      }
    }

    const words: WordFrequency[] = Array.from(freq.entries())
      .map(([text, { count, type }]) => ({ text, value: count, type }))
      .filter(w => w.value >= 1)
      .sort((a, b) => b.value - a.value)
      .slice(0, 80)

    response.words = words

    if (analysisType === 'tfidf') {
      const docs = nodes.map(n => ({
        id: n.obj_id,
        label: n.label,
        tokens: tokenize(n.label + ' ' + n.obj_type + ' ' + n.props),
      }))
      response.tfidf = computeTfIdf(docs)
    }
  }

  if (analysisType === 'relation-pattern') {
    const patternMap = new Map<string, { count: number; totalWeight: number; examples: Array<{ src: string; dst: string; weight: number }> }>()
    const nodeLabel = new Map(nodes.map(n => [n.obj_id, n.label]))

    for (const e of edges) {
      const p = patternMap.get(e.rel)
      if (p) {
        p.count++
        p.totalWeight += e.weight
        if (p.examples.length < 3) p.examples.push({ src: nodeLabel.get(e.src) ?? e.src, dst: nodeLabel.get(e.dst) ?? e.dst, weight: e.weight })
      } else {
        patternMap.set(e.rel, { count: 1, totalWeight: e.weight, examples: [{ src: nodeLabel.get(e.src) ?? e.src, dst: nodeLabel.get(e.dst) ?? e.dst, weight: e.weight }] })
      }
    }

    response.relationPatterns = Array.from(patternMap.entries())
      .map(([rel, { count, totalWeight, examples }]) => ({
        rel, count, avgWeight: parseFloat((totalWeight / count).toFixed(2)), examples,
      }))
      .sort((a, b) => b.count - a.count)

    response.summary = `총 ${edges.length}개 관계, ${patternMap.size}가지 관계 유형`
  }

  if (analysisType === 'network-text') {
    // 노드 타입별 집계 + 관계 빈도 (간단한 네트워크 텍스트 분석)
    const typeCounts = new Map<string, number>()
    for (const n of nodes) typeCounts.set(n.obj_type, (typeCounts.get(n.obj_type) ?? 0) + 1)

    const words: WordFrequency[] = Array.from(typeCounts.entries())
      .map(([text, value]) => ({ text: `[${text}]`, value: value * 3, type: 'type' }))

    // 엣지 rel 빈도도 추가
    const relCounts = new Map<string, number>()
    for (const e of edges) relCounts.set(e.rel, (relCounts.get(e.rel) ?? 0) + 1)
    for (const [text, value] of relCounts) {
      words.push({ text, value, type: 'relation' })
    }

    // 노드 레이블 (상위 빈도)
    const labelFreq = new Map<string, number>()
    for (const n of nodes) {
      for (const t of tokenize(n.label)) labelFreq.set(t, (labelFreq.get(t) ?? 0) + 1)
    }
    for (const [text, value] of labelFreq) {
      if (value >= 2) words.push({ text, value, type: 'label' })
    }

    response.words = words.sort((a, b) => b.value - a.value).slice(0, 80)
    response.summary = `노드 ${nodes.length}개 (${typeCounts.size}가지 유형), 관계 ${edges.length}개 (${relCounts.size}가지)`
  }

  if (analysisType === 'word-network') {
    // Build word frequency from node labels + obj_types
    const labelFreq = new Map<string, number>()
    const relFreq = new Map<string, number>()
    const typeFreq = new Map<string, number>()

    for (const node of nodes) {
      for (const t of tokenize(node.label)) labelFreq.set(t, (labelFreq.get(t) ?? 0) + 1)
      typeFreq.set(node.obj_type, (typeFreq.get(node.obj_type) ?? 0) + 1)
    }
    for (const edge of edges) {
      for (const t of tokenize(edge.rel)) relFreq.set(t, (relFreq.get(t) ?? 0) + 1)
    }

    // Top words per category, deduplicated
    const seen = new Set<string>()
    const wnNodes: WordNetworkNode[] = []

    const addWords = (freq: Map<string, number>, type: WordNetworkNode['type'], topN: number) => {
      Array.from(freq.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, topN)
        .forEach(([text, f]) => {
          if (!seen.has(text)) { seen.add(text); wnNodes.push({ id: text, text, freq: f, type }) }
        })
    }
    addWords(labelFreq, 'label', 35)
    addWords(relFreq, 'relation', 15)
    addWords(typeFreq, 'type', 10)

    const wordSet = new Set(wnNodes.map(w => w.id))

    // Co-occurrence: two words appear in the same node label
    const coMap = new Map<string, number>()
    for (const node of nodes) {
      const tokens = Array.from(new Set([
        ...tokenize(node.label),
        node.obj_type,
      ])).filter(t => wordSet.has(t))
      for (let i = 0; i < tokens.length; i++) {
        for (let j = i + 1; j < tokens.length; j++) {
          const key = [tokens[i], tokens[j]].sort().join('\x00')
          coMap.set(key, (coMap.get(key) ?? 0) + 1)
        }
      }
    }

    // Also: words linked via shared edge relation
    for (const edge of edges) {
      const srcNode = nodes.find(n => n.obj_id === edge.src)
      const dstNode = nodes.find(n => n.obj_id === edge.dst)
      if (!srcNode || !dstNode) continue
      const relTokens = tokenize(edge.rel).filter(t => wordSet.has(t))
      const srcTokens = tokenize(srcNode.label).filter(t => wordSet.has(t)).slice(0, 2)
      const dstTokens = tokenize(dstNode.label).filter(t => wordSet.has(t)).slice(0, 2)
      for (const rt of relTokens) {
        for (const st of [...srcTokens, ...dstTokens]) {
          if (rt === st) continue
          const key = [rt, st].sort().join('\x00')
          coMap.set(key, (coMap.get(key) ?? 0) + 0.5)
        }
      }
    }

    const wnEdges: WordNetworkEdge[] = Array.from(coMap.entries())
      .filter(([, w]) => w >= 1)
      .map(([key, weight]) => {
        const [src, dst] = key.split('\x00')
        return { src, dst, weight: parseFloat(weight.toFixed(1)) }
      })
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 120)

    response.wordNetworkNodes = wnNodes
    response.wordNetworkEdges = wnEdges
    response.summary = `${wnNodes.length}개 키워드 · ${wnEdges.length}개 연관 관계`
  }

  if (analysisType === 'cooccurrence') {
    // 노드 쌍이 같은 관계 유형으로 연결된 횟수
    const srcMap = new Map<string, Map<string, Set<string>>>()
    for (const e of edges) {
      if (!srcMap.has(e.src)) srcMap.set(e.src, new Map())
      const dstMap = srcMap.get(e.src)!
      if (!dstMap.has(e.dst)) dstMap.set(e.dst, new Set())
      dstMap.get(e.dst)!.add(e.rel)
    }

    const nodeLabel = new Map(nodes.map(n => [n.obj_id, n.label]))
    const coLinks: CooccurrenceLink[] = []
    for (const [src, dstMap] of srcMap) {
      for (const [dst, rels] of dstMap) {
        if (rels.size > 0) {
          coLinks.push({ src: nodeLabel.get(src) ?? src, dst: nodeLabel.get(dst) ?? dst, count: rels.size, rels: Array.from(rels) })
        }
      }
    }
    response.cooccurrence = coLinks.sort((a, b) => b.count - a.count).slice(0, 50)
    response.summary = `${coLinks.length}개 노드 쌍 분석 완료`
  }

  return NextResponse.json(response)
}
