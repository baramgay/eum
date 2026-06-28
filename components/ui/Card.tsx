'use client'
import { useState } from 'react'

interface CardProps {
  children: React.ReactNode
  className?: string
  padding?: 'sm' | 'md' | 'lg'
  hover?: boolean
  onClick?: () => void
  style?: React.CSSProperties
  draggable?: boolean
}
export default function Card({ children, className = '', padding = 'md', hover, onClick, style, draggable }: CardProps) {
  const padMap = { sm: 'p-4', md: 'p-5', lg: 'p-6' }
  const [isDragging, setIsDragging] = useState(false)
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick() } : undefined}
      className={`bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm ${padMap[padding]} ${(hover || onClick) ? 'hover:shadow-lg hover:-translate-y-0.5 hover:border-gray-300 dark:hover:border-gray-600' : ''} ${onClick ? 'cursor-pointer' : ''} ${draggable ? (isDragging ? 'cursor-grabbing ring-2 ring-blue-400 shadow-xl scale-[1.02] opacity-90' : 'cursor-grab') : ''} transition-all duration-200 ${className}`}
      onClick={onClick}
      style={style}
      draggable={draggable}
      onDragStart={draggable ? e => { e.dataTransfer.effectAllowed = 'move'; setIsDragging(true) } : undefined}
      onDragEnd={draggable ? () => setIsDragging(false) : undefined}
    >
      {children}
    </div>
  )
}
