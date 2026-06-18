'use client'

import { LabelHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean
}

export default function Label({
  children,
  className,
  required,
  ...props
}: LabelProps) {
  return (
    <label
      className={cn(
        'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5',
        className
      )}
      {...props}
    >
      {children}
      {required && <span className="text-red-500 ml-0.5" aria-hidden>*</span>}
    </label>
  )
}
