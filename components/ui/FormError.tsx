'use client'

interface FormErrorProps {
  message?: string | null
  id?: string
}

export default function FormError({ message, id }: FormErrorProps) {
  if (!message) return null
  return (
    <p
      id={id}
      className="mt-1 text-xs text-red-600 dark:text-red-400"
      role="alert"
      aria-live="polite"
    >
      {message}
    </p>
  )
}
