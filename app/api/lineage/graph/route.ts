import { createServiceClient } from '@/lib/supabase/server'
import { jsonOk, jsonError } from '@/lib/api'

export interface LineageNode {
  id: string
  label: string
  type: 'source' | 'pipeline' | 'catalog'
}

export interface LineageEdge {
  from: string
  to: string
}

export interface LineageGraph {
  nodes: LineageNode[]
  edges: LineageEdge[]
}

export async function GET() {
  const supabase = await createServiceClient()

  const [
    { data: sources, error: srcErr },
    { data: pipelines, error: pipeErr },
    { data: catalogItems, error: catErr },
  ] = await Promise.all([
    supabase
      .from('collection_sources')
      .select('source_id, title')
      .limit(50),
    supabase
      .from('processing_pipelines')
      .select('id, name, source_dataset_id')
      .limit(50),
    supabase
      .from('catalog')
      .select('dataset_id, title, lineage_ids')
      .not('lineage_ids', 'is', null)
      .limit(50),
  ])

  if (srcErr || pipeErr || catErr) {
    const msg = srcErr?.message ?? pipeErr?.message ?? catErr?.message ?? '조회 실패'
    return jsonError(msg, 500)
  }

  const nodes: LineageNode[] = []
  const edges: LineageEdge[] = []
  const nodeSet = new Set<string>()

  const addNode = (node: LineageNode) => {
    if (!nodeSet.has(node.id)) {
      nodeSet.add(node.id)
      nodes.push(node)
    }
  }

  for (const src of sources ?? []) {
    addNode({ id: `src-${src.source_id}`, label: src.title ?? src.source_id, type: 'source' })
  }

  for (const pipe of pipelines ?? []) {
    addNode({ id: `pipe-${pipe.id}`, label: pipe.name ?? pipe.id, type: 'pipeline' })

    const srcNodeId = `src-${pipe.source_dataset_id}`
    if (!nodeSet.has(srcNodeId)) {
      addNode({ id: srcNodeId, label: pipe.source_dataset_id, type: 'source' })
    }
    edges.push({ from: srcNodeId, to: `pipe-${pipe.id}` })
  }

  for (const cat of catalogItems ?? []) {
    const catNodeId = `cat-${cat.dataset_id}`
    addNode({ id: catNodeId, label: cat.title ?? cat.dataset_id, type: 'catalog' })

    const lineageIds: string[] = Array.isArray(cat.lineage_ids)
      ? (cat.lineage_ids as string[])
      : []

    for (const lid of lineageIds) {
      const pipeNodeId = `pipe-${lid}`
      if (nodeSet.has(pipeNodeId)) {
        edges.push({ from: pipeNodeId, to: catNodeId })
      }
    }
  }

  const graph: LineageGraph = { nodes, edges }
  return jsonOk(graph)
}
