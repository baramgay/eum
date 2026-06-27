'use client'

import { useEffect } from 'react'
import { useApi } from '@/lib/hooks/useApi'
import { apiClient } from '@/lib/api/client'
import type { OntologyNode } from '@/lib/ontology-utils'
import type { RelatedDataset } from './useOntologyData'

async function fetchRelatedDatasets(node: OntologyNode): Promise<RelatedDataset[]> {
  const data = await apiClient<{ datasets: RelatedDataset[] }>(`/api/ontology/nodes/${encodeURIComponent(node.obj_id)}/datasets`)
  return Array.isArray(data?.datasets) ? data.datasets : []
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
