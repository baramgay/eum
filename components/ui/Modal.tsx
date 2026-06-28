'use client'

import { ReactNode, useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { createFocusTrap } from '@/lib/focus-trap'

interface ModalProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  title?: string
  description?: string
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
  showCloseButton?: boolean
  className?: string
}

const sizeClass: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-xl',
  lg: 'max-w-3xl',
  xl: 'max-w-5xl',
  full: 'max-w-[95vw]',
}

export default function Modal({
  open,
  onClose,
  children,
  title,
  description,
  size = 'md',
  showCloseButton = true,
  className = '',
}: ModalProps) {
  const contentRef = useRef<HTMLDivElement>(null)
  const titleId = 'modal-title'
  const descId = 'modal-description'

  useEffect(() => {
    if (!open || !contentRef.current) return

    const trap = createFocusTrap(contentRef.current, {
      onClose,
      escapeCloses: true,
      returnFocus: true,
    })
    document.body.style.overflow = 'hidden'

    return () => {
      trap.destroy()
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      aria-describedby={description ? descId : undefined}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div
        className="fixed inset-0 bg-black/40 dark:bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={contentRef}
        tabIndex={-1}
        className={`relative bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-h-[90vh] flex flex-col outline-none ${sizeClass[size]} ${className}`}
      >
        {title && (
          <h2 id={titleId} className="sr-only">
            {title}
          </h2>
        )}
        {description && (
          <p id={descId} className="sr-only">
            {description}
          </p>
        )}

        {showCloseButton && (
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-colors duration-150"
            aria-label="닫기"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {children}
      </div>
    </div>
  )
}
