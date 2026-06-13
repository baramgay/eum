'use client'
import { useState, useEffect } from 'react'

export function useFavorites() {
  const [ids, setIds] = useState<string[]>([])

  useEffect(() => {
    try {
      setIds(JSON.parse(localStorage.getItem('eum:favs') || '[]'))
    } catch {
      // localStorage 접근 오류 무시
    }
  }, [])

  const toggle = (id: string) => {
    setIds(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      try { localStorage.setItem('eum:favs', JSON.stringify(next)) } catch {}
      return next
    })
  }

  return { ids, toggle, has: (id: string) => ids.includes(id) }
}
