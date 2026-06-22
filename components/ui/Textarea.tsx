'use client'

import { forwardRef, TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string | boolean
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, ...props }, ref) => {
    const hasError = Boolean(error)
    return (
      <textarea
        ref={ref}
        className={cn(
          'w-full bg-gray-50 dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500',
          'border border-gray-200 dark:border-gray-700 rounded-xl',
          'px-3.5 py-2.5',
          'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
          'transition-all resize-y',
          'disabled:opacity-60 disabled:cursor-not-allowed',
          hasError && 'border-red-300 dark:border-red-700 focus:ring-red-500 bg-red-50/30 dark:bg-red-900/20',
          className
        )}
        aria-invalid={hasError || undefined}
        {...props}
      />
    )
  }
)
Textarea.displayName = 'Textarea'

export default Textarea
