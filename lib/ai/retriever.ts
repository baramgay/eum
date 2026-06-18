import type { SupabaseClient } from '@supabase/supabase-js'
import { getEmbedding } from './embeddings'

export interface RetrievedSource {
  source: 'catalog' | 'ontology'
  title: string
  snippet: string
  url?: string
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

/**
 * 사용자 질문과 관련된 카탈로그/온톨로지 컨텍스트를 검색한다.
 *
 * - catalog:
 *   1) pgvector 유사도 검색 (임베딩 API 사용 가능 시)
 *   2) 키워드 ILIKE 폭로 (항상 수행)
 * - onto_objects: label, obj_type, props
 *
 * 반환 항목은 source, title, snippet, url(선택) 을 포함한다.
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

  const sources: RetrievedSource[] = []
  const seenDatasetIds = new Set<string>()

  // 1) pgvector 시맨틱 검색 (임베딩 API가 설정되어 있을 때만)
  try {
    const embedding = await getEmbedding(q)
    if (embedding) {
      const { data: vectorRows, error: vectorError } = await supabase.rpc('match_catalog', {
        query_embedding: embedding,
        match_threshold: 0.5,
        match_count: limit,
      })
      if (!vectorError && Array.isArray(vectorRows)) {
        for (const r of vectorRows as MatchCatalogRow[]) {
          if (seenDatasetIds.has(r.dataset_id)) continue
          seenDatasetIds.add(r.dataset_id)
          sources.push({
            source: 'catalog',
            title: r.title ?? r.dataset_id,
            snippet: [r.theme, r.keywords, r.description].filter(Boolean).join(' | '),
            url: `/catalog/${r.dataset_id}`,
          })
        }
      }
    }
  } catch {
    // vector 확장이나 RPC가 없어도 키워드 검색으로 폭로
  }

  // 2) 키워드 ILIKE 폭로
  const catalogFilters = terms
    .map((t) => `title.ilike.%${t}%,theme.ilike.%${t}%,keywords.ilike.%${t}%,description.ilike.%${t}%`)
    .join(',')

  const catalogPromise = supabase
    .from('catalog')
    .select('dataset_id,title,theme,keywords,description,format')
    .eq('ai_ready', true)
    .or(catalogFilters)
    .limit(limit)

  const ontoFilters = terms
    .map((t) => `label.ilike.%${t}%,obj_type.ilike.%${t}%,props.ilike.%${t}%`)
    .join(',')

  const ontoPromise = supabase
    .from('onto_objects')
    .select('obj_id,obj_type,label,props')
    .or(ontoFilters)
    .limit(limit)

  const [{ data: catalogRows }, { data: ontoRows }] = await Promise.all([catalogPromise, ontoPromise])

  for (const r of catalogRows ?? []) {
    const id = r.dataset_id as string
    if (seenDatasetIds.has(id)) continue
    seenDatasetIds.add(id)
    sources.push({
      source: 'catalog',
      title: (r.title as string | null) ?? id,
      snippet: [r.theme, r.keywords, r.description].filter(Boolean).join(' | '),
      url: id ? `/catalog/${id}` : undefined,
    })
  }

  for (const r of ontoRows ?? []) {
    sources.push({
      source: 'ontology',
      title: (r.label as string | null) ?? (r.obj_id as string),
      snippet: `유형=${r.obj_type}${r.props ? ` | ${r.props}` : ''}`,
      url: r.obj_id ? `/ontology?node=${encodeURIComponent(String(r.obj_id))}` : undefined,
    })
  }

  return sources.slice(0, limit)
}
