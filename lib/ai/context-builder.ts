import type { SupabaseClient } from '@supabase/supabase-js'
import type { RetrievedSource } from './retriever'

interface CatalogRow {
  dataset_id: string
  title: string | null
  description: string | null
  theme: string | null
  keywords: string | null
  table_name: string | null
  rows: number | null
  format: string | null
}

interface ColumnRow {
  table_name: string
  column_name: string
}

interface OntoNodeRow {
  obj_id: string
  obj_type: string | null
  label: string | null
  props: string | null
}

interface OntoLinkRow {
  src: string
  rel: string
  dst: string
  weight: number | null
}

const SAFE_TABLE_NAME = /^[a-zA-Z_][a-zA-Z0-9_]*$/

function isSafeTableName(name: string | null | undefined): name is string {
  return typeof name === 'string' && SAFE_TABLE_NAME.test(name)
}

/**
 * 카탈로그 데이터셋의 메타데이터, 컬럼 정보, 샘플 행으로 구성된 상세 컨텍스트를 생성한다.
 */
export async function buildCatalogContext(
  supabase: SupabaseClient,
  datasetId: string,
): Promise<string> {
  const { data: catalog } = await supabase
    .from('catalog')
    .select('dataset_id,title,description,theme,keywords,table_name,rows,format')
    .eq('dataset_id', datasetId)
    .maybeSingle<CatalogRow>()

  if (!catalog) return `(dataset_id=${datasetId} 카탈로그 정보 없음)`

  const lines: string[] = [
    `데이터셋: ${catalog.title ?? datasetId}`,
    catalog.description ? `설명: ${catalog.description}` : '',
    catalog.theme ? `주제: ${catalog.theme}` : '',
    catalog.keywords ? `키워드: ${catalog.keywords}` : '',
    catalog.format ? `형식: ${catalog.format}` : '',
    catalog.rows != null ? `행 수: ${catalog.rows}` : '',
    catalog.table_name ? `테이블: ${catalog.table_name}` : '',
  ].filter(Boolean)

  let columns: ColumnRow[] = []
  let samples: Record<string, unknown>[] = []

  if (isSafeTableName(catalog.table_name)) {
    const table = catalog.table_name
    const [{ data: colRows }, { data: sampleRows }] = await Promise.all([
      supabase
        .from('information_schema.columns')
        .select('table_name,column_name')
        .eq('table_schema', 'public')
        .eq('table_name', table)
        .returns<ColumnRow[]>(),
      supabase.rpc('run_select_sql', { p_sql: `SELECT * FROM "${table}" LIMIT 5` }),
    ])
    columns = colRows ?? []
    samples = Array.isArray(sampleRows) ? sampleRows : []
  }

  if (columns.length > 0) {
    lines.push(`컬럼: ${columns.map((c) => c.column_name).join(', ')}`)
  }

  if (samples.length > 0) {
    lines.push('샘플 행:')
    for (const row of samples) {
      const summary = Object.entries(row)
        .slice(0, 6)
        .map(([k, v]) => `${k}=${String(v).slice(0, 40)}`)
        .join(', ')
      lines.push(`  - ${summary}`)
    }
  }

  return lines.join('\n')
}

/**
 * 온톨로지 노드와 1-hop 이웃, 주요 관계 유형을 요약한 컨텍스트를 생성한다.
 */
export async function buildOntologyContext(
  supabase: SupabaseClient,
  objId: string,
): Promise<string> {
  const { data: node } = await supabase
    .from('onto_objects')
    .select('obj_id,obj_type,label,props')
    .eq('obj_id', objId)
    .maybeSingle<OntoNodeRow>()

  if (!node) return `(obj_id=${objId} 온톨로지 노드 없음)`

  const lines: string[] = [
    `노드: ${node.label ?? objId}`,
    `유형: ${node.obj_type ?? 'unknown'}`,
    node.props ? `속성: ${node.props}` : '',
  ].filter(Boolean)

  const [{ data: outLinks }, { data: inLinks }] = await Promise.all([
    supabase.from('onto_links').select('src,rel,dst,weight').eq('src', objId).returns<OntoLinkRow[]>(),
    supabase.from('onto_links').select('src,rel,dst,weight').eq('dst', objId).returns<OntoLinkRow[]>(),
  ])

  const relCounts = new Map<string, number>()
  const neighbors: string[] = []

  for (const link of [...(outLinks ?? []), ...(inLinks ?? [])]) {
    relCounts.set(link.rel, (relCounts.get(link.rel) ?? 0) + 1)
    const neighborId = link.src === objId ? link.dst : link.src
    if (!neighbors.includes(neighborId)) neighbors.push(neighborId)
  }

  if (relCounts.size > 0) {
    const topRels = Array.from(relCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([rel, count]) => `${rel}(${count})`)
      .join(', ')
    lines.push(`주요 관계: ${topRels}`)
  }

  if (neighbors.length > 0) {
    lines.push(`이웃 노드 수: ${neighbors.length}`)
  }

  return lines.join('\n')
}

function extractCatalogId(url?: string): string | null {
  if (!url) return null
  const m = url.match(/^\/catalog\/(.+)$/)
  return m?.[1] ?? null
}

function extractOntologyId(url?: string): string | null {
  if (!url) return null
  const m = url.match(/[?&]node=([^&]+)/)
  return m ? decodeURIComponent(m[1]) : null
}

/**
 * 검색 결과에 데이터셋/온톨로지 상세 정보를 추가한다.
 */
export async function enrichSources(
  supabase: SupabaseClient,
  sources: RetrievedSource[],
): Promise<RetrievedSource[]> {
  const enriched: RetrievedSource[] = []

  for (const source of sources) {
    let details: string | undefined
    try {
      if (source.source === 'catalog') {
        const datasetId = extractCatalogId(source.url)
        if (datasetId) details = await buildCatalogContext(supabase, datasetId)
      } else if (source.source === 'ontology') {
        const objId = extractOntologyId(source.url)
        if (objId) details = await buildOntologyContext(supabase, objId)
      }
    } catch {
      // 상세 정보 생성 실패 시 원본을 그대로 반환한다.
    }
    enriched.push(details ? { ...source, details } : source)
  }

  return enriched
}
