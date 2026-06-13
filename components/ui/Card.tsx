interface CardProps {
  children: React.ReactNode
  className?: string
  padding?: 'sm' | 'md' | 'lg'
  hover?: boolean
  onClick?: () => void
}
export default function Card({ children, className = '', padding = 'md', hover, onClick }: CardProps) {
  const padMap = { sm: 'p-4', md: 'p-5', lg: 'p-6' }
  return (
    <div
      className={`bg-white rounded-2xl border border-gray-200 shadow-sm ${padMap[padding]} ${hover ? 'hover:shadow-md transition-shadow' : ''} ${onClick ? 'cursor-pointer' : ''} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  )
}
