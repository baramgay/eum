'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'

type Theme = 'light' | 'dark' | 'system'

interface ThemeContextValue {
  theme: Theme
  resolvedTheme: 'light' | 'dark'
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

const STORAGE_KEY = 'eum-theme'

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(theme: Theme) {
  const resolved = theme === 'system' ? getSystemTheme() : theme
  const root = document.documentElement
  if (resolved === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
  return resolved
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('system')
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null
    const initial = stored ?? 'system'
    setThemeState(initial)
    setResolvedTheme(applyTheme(initial))

    const listener = (e: MediaQueryListEvent) => {
      const current = localStorage.getItem(STORAGE_KEY) as Theme | null
      if (!current || current === 'system') {
        setResolvedTheme(applyTheme('system'))
      }
    }
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    mql.addEventListener('change', listener)
    return () => mql.removeEventListener('change', listener)
  }, [])

  useEffect(() => {
    if (!mounted) return
    setResolvedTheme(applyTheme(theme))
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme, mounted])

  const setTheme = (next: Theme) => setThemeState(next)

  const toggleTheme = () => {
    if (resolvedTheme === 'dark') {
      setThemeState('light')
    } else {
      setThemeState('dark')
    }
  }

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
