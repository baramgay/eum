/**
 * 온톨로지 Supabase 쿼리 타입 안전 헬퍼
 *
 * onto_objects / onto_links 조회·삽입 시 컬럼 문자열과 반환 타입을
 * 한 곳에서 관리해 타입 안전성과 재사용성을 높인다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { OntologyNode, OntologyEdge } from '@/lib/ontology-utils'
import type { OntologyDbNode, OntologyDbEdge } from '@/lib/ontology/types'

export const ONTOLOGY_NODE_COLUMNS = 'obj_id,obj_type,label,props' as const
export const ONTOLOGY_EDGE_COLUMNS = 'src,rel,dst,weight' as const

export type OntologyNodeColumns = typeof ONTOLOGY_NODE_COLUMNS
export type OntologyEdgeColumns = typeof ONTOLOGY_EDGE_COLUMNS

function assertNoError(error: Error | null, context: string) {
  if (error) throw new Error(`${context} 실패: ${error.message}`)
}

/** onto_objects 전체 조회 */
export async function fetchOntologyNodes(supabase: SupabaseClient): Promise<OntologyNode[]> {
  const { data, error } = await supabase
    .from('onto_objects')
    .select(ONTOLOGY_NODE_COLUMNS)
  assertNoError(error, 'onto_objects 조회')
  return ((data ?? []) as OntologyDbNode[]) as OntologyNode[]
}

/** onto_links 전체 조회 */
export async function fetchOntologyEdges(supabase: SupabaseClient): Promise<OntologyEdge[]> {
  const { data, error } = await supabase
    .from('onto_links')
    .select(ONTOLOGY_EDGE_COLUMNS)
  assertNoError(error, 'onto_links 조회')
  return ((data ?? []) as OntologyDbEdge[]) as OntologyEdge[]
}

/** onto_objects 벌크 삽입 */
export async function insertOntologyNodes(supabase: SupabaseClient, nodes: OntologyNode[]): Promise<void> {
  if (!nodes.length) return
  // 마이그레이션 적용 전환 props_jsonb 컬럼이 없을 수 있으므로 삽입 시에는 제외한다.
  const rows = nodes.map(({ props_jsonb: _, ...rest }) => rest)
  const { error } = await supabase.from('onto_objects').insert(rows)
  assertNoError(error, 'onto_objects 삽입')
}

/** onto_links 벌크 삽입 */
export async function insertOntologyEdges(supabase: SupabaseClient, edges: OntologyEdge[]): Promise<void> {
  if (!edges.length) return
  const { error } = await supabase.from('onto_links').insert(edges)
  assertNoError(error, 'onto_links 삽입')
}

/** onto_objects 벌크 삭제 (신중히 사용) */
export async function deleteOntologyNodes(supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase.from('onto_objects').delete().neq('obj_id', 'NEVER_MATCH')
  assertNoError(error, 'onto_objects 삭제')
}

/** onto_links 벌크 삭제 (신중히 사용) */
export async function deleteOntologyEdges(supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase.from('onto_links').delete().neq('src', 'NEVER_MATCH')
  assertNoError(error, 'onto_links 삭제')
}
