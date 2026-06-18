'use client'

import { useCallback } from 'react'
import type { OntologyNode } from '@/lib/ontology-utils'
import type { GraphLayoutType, WorkspaceSnapshot } from '@/lib/ontology/types'
import { SGG_OPTIONS } from '@/lib/regions'

type Tab = '개요' | '그래프' | '노드 목록' | '분석' | '워크스페이스'

interface UseOntologyWorkspaceArgs {
  graph: { nodes: OntologyNode[]; edges: unknown[] } | null
  sgg: string
  layout: GraphLayoutType
  selectedNode: OntologyNode | null
  activeRels: string[]
  typeFilter: string[]
  nodeSearch: string
  setSgg: (value: string) => void
  setLayout: (value: GraphLayoutType) => void
  setSelectedNode: (node: OntologyNode | null) => void
  setTypeFilter: (value: string[]) => void
  setActiveRels: (value: string[]) => void
  setNodeSearch: (value: string) => void
  setActiveTab: (tab: Tab) => void
  loadGraph: (sgg?: string) => Promise<void>
}

export function useOntologyWorkspace({
  graph,
  sgg,
  layout,
  selectedNode,
  activeRels,
  typeFilter,
  nodeSearch,
  setSgg,
  setLayout,
  setSelectedNode,
  setTypeFilter,
  setActiveRels,
  setNodeSearch,
  setActiveTab,
  loadGraph,
}: UseOntologyWorkspaceArgs) {
  const buildSnapshot = useCallback((): WorkspaceSnapshot => {
    const sggName = sgg ? SGG_OPTIONS.find(o => o.code === sgg)?.name ?? '' : ''
    return {
      name: sgg ? `${sggName} 온톨로지` : '온톨로지 워크스페이스',
      sgg: sgg || null,
      layout,
      selectedNodeId: selectedNode?.obj_id ?? null,
      activeRels,
      activeTypes: typeFilter,
      nodeSearch,
      createdAt: new Date().toISOString(),
    }
  }, [sgg, layout, selectedNode, activeRels, typeFilter, nodeSearch])

  const loadSnapshot = useCallback(
    (snapshot: WorkspaceSnapshot) => {
      if (snapshot.sgg !== undefined) setSgg(snapshot.sgg ?? '')
      if (snapshot.layout) setLayout(snapshot.layout)
      if (snapshot.activeTypes) setTypeFilter(snapshot.activeTypes)
      if (snapshot.activeRels) setActiveRels(snapshot.activeRels)
      if (snapshot.nodeSearch !== undefined) setNodeSearch(snapshot.nodeSearch)
      if (snapshot.selectedNodeId && graph) {
        const found = graph.nodes.find(n => n.obj_id === snapshot.selectedNodeId) ?? null
        setSelectedNode(found)
      }
      if (snapshot.sgg) loadGraph(snapshot.sgg)
      setActiveTab('그래프')
    },
    [graph, setSgg, setLayout, setSelectedNode, setTypeFilter, setActiveRels, setNodeSearch, setActiveTab, loadGraph]
  )

  return { buildSnapshot, loadSnapshot }
}
