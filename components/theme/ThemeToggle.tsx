'use client'

import { Sun, Moon, Monitor } from 'lucide-react'
import { useTheme } from './ThemeProvider'
import { useState, useRef, useEffect } from 'react'
import { createFocusTrap } from '@/lib/focus-trap'

export default function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!open || !menuRef.current) return
    const trap = createFocusTrap(menuRef.current, {
      onClose: () => setOpen(false),
      escapeCloses: true,
      returnFocus: true,
    })
    return () => trap.destroy()
  }, [open])

  const Icon = resolvedTheme === 'dark' ? Moon : Sun

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        aria-label="테마 변경"
        title="테마 변경"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls="theme-select-menu"
      >
        <Icon className="w-5 h-5" />
      </button>

      {open && (
        <div
          id="theme-select-menu"
          ref={menuRef}
          role="listbox"
          aria-label="테마 선택"
          className="absolute right-0 mt-1 w-36 bg-white dark:bg-gray-900 rounded-xl shadow-lg ring-1 ring-gray-200 dark:ring-gray-700 overflow-hidden z-20 py-1"
        >
            {[
              { key: 'light', label: '라이트', icon: Sun },
              { key: 'dark', label: '다크', icon: Moon },
              { key: 'system', label: '시스템', icon: Monitor },
            ].map(({ key, label, icon: ItemIcon }) => (
              <button
                key={key}
                type="button"
                role="option"
                aria-selected={theme === key}
                onClick={() => {
                  setTheme(key as 'light' | 'dark' | 'system')
                  setOpen(false)
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                  theme === key
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                <ItemIcon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>
      )}
    </div>
  )
}
