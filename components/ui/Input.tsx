'use client'

import { forwardRef, InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string | boolean
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, ...props }, ref) => {
    const hasError = Boolean(error)
    return (
      <input
        ref={ref}
        className={cn(
          'w-full bg-gray-50 dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500',
          'border border-gray-200 dark:border-gray-700 rounded-xl',
          'px-3.5 py-2.5',
          'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
          'transition-all',
          'disabled:opacity-60 disabled:cursor-not-allowed',
          hasError && 'border-red-300 focus:ring-red-500 bg-red-50/30',
          className
        )}
        aria-invalid={hasError || undefined}
        {...props}
      />
    )
  }
)
Input.displayName = 'Input'

export default Input
