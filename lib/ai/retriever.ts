import type { SupabaseClient } from '@supabase/supabase-js'
import { getEmbedding } from './embeddings'

export interface RetrievedSource {
  source: 'catalog' | 'ontology'
  title: string
  snippet: string
  url?: string
  details?: string
}

interface MatchCatalogRow {
  dataset_id: string
  title: string | null
  theme: string | null
  keywords: string | null
  description: string | null
  format: string | null
  similarity: number
}

interface SearchResult {
  key: string
  source: 'catalog' | 'ontology'
  title: string
  snippet: string
  url?: string
}

const RRF_K = 60

function makeCatalogSource(r: MatchCatalogRow | Record<string, unknown>): SearchResult {
  const id = String(r.dataset_id ?? '')
  return {
    key: `catalog:${id}`,
    source: 'catalog',
    title: (r.title as string | null) ?? id,
    snippet: [r.theme, r.keywords, r.description].filter(Boolean).join(' | '),
    url: id ? `/catalog/${id}` : undefined,
  }
}

function makeOntologySource(r: Record<string, unknown>): SearchResult {
  const id = String(r.obj_id ?? '')
  return {
    key: `ontology:${id}`,
    source: 'ontology',
    title: (r.label as string | null) ?? id,
    snippet: `유형=${r.obj_type}${r.props ? ` | ${r.props}` : ''}`,
    url: id ? `/ontology?node=${encodeURIComponent(id)}` : undefined,
  }
}

/**
 * Reciprocal Rank Fusion: 여러 순위 리스트를 하나의 점수로 결합한다.
 * score = Σ 1 / (k + rank), k = 60
 */
export function fuseRrf(lists: SearchResult[][], k = RRF_K): SearchResult[] {
  const scored = new Map<string, { score: number; result: SearchResult }>()

  for (const list of lists) {
    list.forEach((item, idx) => {
      const rank = idx + 1
      const existing = scored.get(item.key)
      const add = 1 / (k + rank)
      if (existing) {
        existing.score += add
      } else {
        scored.set(item.key, { score: add, result: item })
      }
    })
  }

  return Array.from(scored.values())
    .sort((a, b) => b.score - a.score)
    .map((x) => x.result)
}

/**
 * 사용자 질문과 관련된 카탈로그/온톨로지 컨텍스트를 검색한다.
 *
 * - catalog:
 *   1) pgvector 유사도 검색 (임베딩 API 사용 가능 시)
 *   2) 키워드 ILIKE 폭로 (항상 수행)
 *   - 두 결과는 RRF(Reciprocal Rank Fusion)로 융합된다.
 * - onto_objects: label, obj_type, props
 *
 * 반환 항목은 source, title, snippet, url(선택), details(선택) 을 포함한다.
 */
export async function retrieveContext(
  supabase: SupabaseClient,
  query: string,
  limit = 6,
): Promise<RetrievedSource[]> {
  const q = query.trim()
  if (!q) return []

  const terms = q.split(/\s+/).filter((t) => t.length > 1)
  if (terms.length === 0) return []

  // 1) pgvector 시맨틱 검색 (임베딩 API가 설정되어 있을 때만)
  let vectorSources: SearchResult[] = []
  try {
    const embedding = await getEmbedding(q)
    if (embedding) {
      const { data: vectorRows, error: vectorError } = await supabase.rpc('match_catalog', {
        query_embedding: embedding,
        match_threshold: 0.5,
        match_count: limit,
      })
      if (!vectorError && Array.isArray(vectorRows)) {
        vectorSources = (vectorRows as MatchCatalogRow[]).map(makeCatalogSource)
      }
    }
  } catch {
    // vector 확장이나 RPC가 없어도 키워드 검색으로 폭로
  }

  // 2) 키워드 ILIKE 폭로 (와일드카드 문자 제거로 인젝션 방지)
  function sanitizeLikeTerm(term: string): string {
    return term.replace(/[%_\\]/g, '')
  }

  const catalogFilters = terms
    .map((t) => {
      const s = sanitizeLikeTerm(t)
      return `title.ilike.%${s}%,theme.ilike.%${s}%,keywords.ilike.%${s}%,description.ilike.%${s}%`
    })
    .join(',')

  const catalogPromise = supabase
    .from('catalog')
    .select('dataset_id,title,theme,keywords,description,format')
    .eq('ai_ready', true)
    .or(catalogFilters)
    .limit(limit)

  const ontoFilters = terms
    .map((t) => {
      const s = sanitizeLikeTerm(t)
      return `label.ilike.%${s}%,obj_type.ilike.%${s}%,props.ilike.%${s}%`
    })
    .join(',')

  const ontoPromise = supabase
    .from('onto_objects')
    .select('obj_id,obj_type,label,props')
    .or(ontoFilters)
    .limit(limit)

  const [{ data: catalogRows }, { data: ontoRows }] = await Promise.all([catalogPromise, ontoPromise])

  const catalogSources = (catalogRows ?? []).map(makeCatalogSource)
  const ontoSources = (ontoRows ?? []).map(makeOntologySource)

  const fused = fuseRrf([vectorSources, catalogSources, ontoSources])
  return fused.slice(0, limit).map(({ key, ...rest }) => rest)
}
