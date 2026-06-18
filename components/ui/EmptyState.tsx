import type React from 'react'

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
}
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      {icon && (
        <div className="w-16 h-16 bg-gray-50 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
          {typeof icon === 'string' ? <span className="text-3xl">{icon}</span> : icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-gray-700 dark:text-gray-200 mb-1">{title}</h3>
      {description && <p className="text-sm text-gray-400 dark:text-gray-500 mb-5 max-w-xs leading-relaxed">{description}</p>}
      {action && (
        <button
          onClick={action.onClick}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors font-medium"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}

export default EmptyState
