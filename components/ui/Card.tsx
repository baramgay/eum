interface CardProps {
  children: React.ReactNode
  className?: string
  padding?: 'sm' | 'md' | 'lg'
  hover?: boolean
  onClick?: () => void
  style?: React.CSSProperties
}
export default function Card({ children, className = '', padding = 'md', hover, onClick, style }: CardProps) {
  const padMap = { sm: 'p-4', md: 'p-5', lg: 'p-6' }
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick() } : undefined}
      className={`bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm ${padMap[padding]} ${hover ? 'hover:shadow-md transition-shadow' : ''} ${onClick ? 'cursor-pointer' : ''} ${className}`}
      onClick={onClick}
      style={style}
    >
      {children}
    </div>
  )
}
