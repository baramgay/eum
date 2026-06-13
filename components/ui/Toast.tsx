'use client'

import { useEffect } from 'react'

interface ToastProps {
  message: string
  type?: 'success' | 'error' | 'info'
  onClose: () => void
}

const ICONS = { success: '✓', error: '✕', info: 'ℹ' }
const COLORS = {
  success: 'bg-green-600',
  error:   'bg-red-600',
  info:    'bg-blue-600',
}

export function Toast({ message, type = 'success', onClose }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500)
    return () => clearTimeout(t)
  }, [onClose])

  return (
    <div
      className={`
        fixed bottom-6 right-6 z-50 flex items-center gap-3
        ${COLORS[type]} text-white px-4 py-3 rounded-xl shadow-xl
        animate-in slide-in-from-bottom-4 duration-300
      `}
    >
      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold">
        {ICONS[type]}
      </span>
      <span className="text-sm font-medium">{message}</span>
      <button
        onClick={onClose}
        className="ml-1 opacity-60 hover:opacity-100 transition-opacity text-sm"
      >
        ✕
      </button>
    </div>
  )
}
