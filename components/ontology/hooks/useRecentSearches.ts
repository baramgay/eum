'use client'

import { useState, useEffect, useCallback } from 'react'

export function useRecentSearches() {
  const [recentSearches, setRecentSearches] = useState<string[]>([])

  useEffect(() => {
    try {
      const raw = localStorage.getItem('eum-ontology-searches')
      if (raw) setRecentSearches(JSON.parse(raw))
    } catch {}
  }, [])

  const saveSearch = useCallback((q: string) => {
    if (!q.trim()) return
    setRecentSearches(prev => {
      const next = [q.trim(), ...prev.filter(s => s !== q.trim())].slice(0, 8)
      try {
        localStorage.setItem('eum-ontology-searches', JSON.stringify(next))
      } catch {}
      return next
    })
  }, [])

  const clearRecent = useCallback(() => {
    setRecentSearches([])
    try {
      localStorage.removeItem('eum-ontology-searches')
    } catch {}
  }, [])

  return { recentSearches, saveSearch, clearRecent }
}
