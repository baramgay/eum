'use client'

import { useState, useEffect, useCallback } from 'react'
import { apiClient } from '@/lib/api/client'
import type { OntologyGraphData } from '@/lib/ontology/types'

export interface Action {
  key: string
  name: string
  description: string
}

export interface RelatedDataset {
  dataset_id: string
  title: string
  theme: string
  rows: number | null
  updated_at: string | null
  is_open: boolean
  ai_ready: boolean
}

export interface ScoredRegion {
  rank: number
  sgg_cd: string
  sigun: string
  youth_pop: number
  net_migration: number
  employees: number
  youth_centers: number
  priority_score: number
}

export interface ActionResult {
  action: string
  description: string
  method: string
  results: ScoredRegion[]
}

export function useOntologyData() {
  const [graph, setGraph] = useState<OntologyGraphData | null>(null)
  const [actions, setActions] = useState<Action[]>([])
  const [building, setBuilding] = useState(false)
  const [sgg, setSgg] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [scoringKey, setScoringKey] = useState<string | null>(null)
  const [actionResult, setActionResult] = useState<ActionResult | null>(null)
  const [scoring, setScoring] = useState(false)

  const loadGraph = useCallback(async (sggFilter?: string) => {
    setLoading(true)
    setError(null)
    try {
      const params = sggFilter ? `?sgg=${encodeURIComponent(sggFilter)}` : ''
      const data = await apiClient<OntologyGraphData>(`/api/ontology${params}`, {
        fallbackMessage: status => `온톨로지 데이터를 불러오지 못했습니다. (${status})`,
      })
      setGraph(data)
    } catch (e) {
      setGraph(null)
      setError(e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }, [])

  const buildOntology = useCallback(async () => {
    setBuilding(true)
    setError(null)
    try {
      await apiClient('/api/ontology', {
        method: 'POST',
        fallbackMessage: status => `온톨로지 재구축에 실패했습니다. (${status})`,
      })
      await loadGraph(sgg || undefined)
    } catch (e) {
      setError(e instanceof Error ? e.message : '온톨로지 재구축 중 오류가 발생했습니다.')
    } finally {
      setBuilding(false)
    }
  }, [sgg, loadGraph])

  const runScoring = useCallback(
    async (key: string) => {
      if (scoringKey === key) {
        setScoringKey(null)
        setActionResult(null)
        return
      }
      setScoringKey(key)
      setScoring(true)
      try {
        const data = await apiClient<ActionResult>(`/api/ontology/action/${key}`, {
          fallbackMessage: status => `분석 결과를 불러오지 못했습니다. (${status})`,
        })
        setActionResult(data)
      } catch (e) {
        setActionResult(null)
        setError(e instanceof Error ? e.message : '우선순위 분석 중 오류가 발생했습니다.')
      } finally {
        setScoring(false)
      }
    },
    [scoringKey]
  )

  const fetchActions = useCallback(async () => {
    try {
      const data = await apiClient<Action[]>('/api/ontology?type=actions', {
        fallbackMessage: () => '액션 목록을 불러오지 못했습니다.',
      })
      setActions(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : '액션 목록을 불러오지 못했습니다.')
    }
  }, [])

  useEffect(() => {
    Promise.all([loadGraph(), fetchActions()])
  }, [loadGraph, fetchActions])

  return {
    graph,
    actions,
    building,
    sgg,
    setSgg,
    loading,
    error,
    setError,
    scoringKey,
    scoring,
    actionResult,
    loadGraph,
    buildOntology,
    runScoring,
  }
}
