'use client'

import { useEffect } from 'react'
import { useApi } from '@/lib/hooks/useApi'
import { apiClient } from '@/lib/api/client'
import type { OntologyNode } from '@/lib/ontology-utils'
import type { RelatedDataset } from './useOntologyData'

async function fetchRelatedDatasets(node: OntologyNode): Promise<RelatedDataset[]> {
  const params = new URLSearchParams()
  params.set('label', node.label)
  params.set('type', node.obj_type)
  const data = await apiClient<RelatedDataset[]>(`/api/ontology/datasets?${params}`)
  return Array.isArray(data) ? data : []
}

export function useRelatedDatasets(selectedNode: OntologyNode | null) {
  const { data: relatedDatasets, loading: relatedLoading, execute, setData } = useApi(fetchRelatedDatasets)

  useEffect(() => {
    if (!selectedNode) {
      setData([])
      return
    }
    execute(selectedNode).catch(() => setData([]))
  }, [selectedNode, execute, setData])

  return { relatedDatasets: relatedDatasets ?? [], relatedLoading }
}
