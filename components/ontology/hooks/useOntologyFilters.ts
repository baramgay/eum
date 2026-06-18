'use client'

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import type { OntologyGraphData } from '@/lib/ontology/types'
import type { OntologyNode } from '@/lib/ontology-utils'
import { computeDegrees } from '@/lib/ontology-utils'

export type NodeSort = 'label-asc' | 'label-desc' | 'type' | 'degree-desc'

export function useOntologyFilters(
  graph: OntologyGraphData | null,
  saveSearch: (q: string) => void
) {
  const [nodeSearch, setNodeSearch] = useState('')
  const [selectedNode, setSelectedNode] = useState<OntologyNode | null>(null)
  const [typeFilter, setTypeFilter] = useState<string[]>([])
  const [activeRels, setActiveRels] = useState<string[]>([])
  const [nodeSort, setNodeSort] = useState<NodeSort>('label-asc')
  const [showSearchDropdown, setShowSearchDropdown] = useState(true)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchWrapRef = useRef<HTMLDivElement>(null)

  const degrees = useMemo(
    () => computeDegrees(graph?.nodes ?? [], graph?.edges ?? []),
    [graph]
  )

  const nodeTypes = useMemo(() => {
    const types = Array.from(new Set((graph?.nodes ?? []).map(n => n.obj_type)))
    return types.sort((a, b) => a.localeCompare(b, 'ko'))
  }, [graph])

  const typeCounts = useMemo(() => {
    const map = new Map<string, number>()
    nodeTypes.forEach(t => map.set(t, 0))
    ;(graph?.nodes ?? []).forEach(n => {
      map.set(n.obj_type, (map.get(n.obj_type) ?? 0) + 1)
    })
    return map
  }, [graph, nodeTypes])

  useEffect(() => {
    if (graph) {
      setTypeFilter(nodeTypes)
      const rels = Array.from(new Set(graph.edges?.map(e => e.rel) ?? []))
      setActiveRels(rels)
    }
  }, [graph, nodeTypes])

  const filteredNodes = useMemo(() => {
    const q = nodeSearch.trim().toLowerCase()
    return (graph?.nodes ?? []).filter(n => {
      const matchesType = typeFilter.length === 0 || typeFilter.includes(n.obj_type)
      if (!matchesType) return false
      if (!q) return true
      return (
        n.label.toLowerCase().includes(q) ||
        n.obj_type.toLowerCase().includes(q) ||
        n.obj_id.toLowerCase().includes(q)
      )
    })
  }, [graph, nodeSearch, typeFilter])

  const sortedFilteredNodes = useMemo(() => {
    const list = [...filteredNodes]
    switch (nodeSort) {
      case 'label-asc':
        return list.sort((a, b) => a.label.localeCompare(b.label, 'ko'))
      case 'label-desc':
        return list.sort((a, b) => b.label.localeCompare(a.label, 'ko'))
      case 'type':
        return (
          list.sort((a, b) => a.obj_type.localeCompare(b.obj_type, 'ko') || a.label.localeCompare(b.label, 'ko'))
        )
      case 'degree-desc':
        return list.sort((a, b) => (degrees.get(b.obj_id) ?? 0) - (degrees.get(a.obj_id) ?? 0))
      default:
        return list
    }
  }, [filteredNodes, nodeSort, degrees])

  const searchSuggestions = useMemo(() => {
    const q = nodeSearch.trim().toLowerCase()
    if (!q) return []
    return filteredNodes.slice(0, 8)
  }, [filteredNodes, nodeSearch])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) {
        setShowSearchDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const resetFilters = useCallback(() => {
    setNodeSearch('')
    setTypeFilter(nodeTypes)
    setNodeSort('label-asc')
    setSelectedNode(null)
  }, [nodeTypes])

  const selectAndSearch = useCallback(
    (node: OntologyNode, switchTab?: () => void) => {
      setSelectedNode(node)
      saveSearch(nodeSearch.trim())
      switchTab?.()
    },
    [nodeSearch, saveSearch]
  )

  const toggleType = useCallback((type: string) => {
    setTypeFilter(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    )
  }, [])

  return {
    nodeSearch,
    setNodeSearch,
    selectedNode,
    setSelectedNode,
    typeFilter,
    setTypeFilter,
    activeRels,
    setActiveRels,
    nodeSort,
    setNodeSort,
    showSearchDropdown,
    setShowSearchDropdown,
    searchInputRef,
    searchWrapRef,
    degrees,
    nodeTypes,
    typeCounts,
    filteredNodes,
    sortedFilteredNodes,
    searchSuggestions,
    resetFilters,
    selectAndSearch,
    toggleType,
  }
}
