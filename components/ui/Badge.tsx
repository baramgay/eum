type Variant = 'blue' | 'green' | 'amber' | 'red' | 'gray' | 'purple'
interface BadgeProps {
  children: React.ReactNode
  variant?: Variant
  size?: 'sm' | 'md'
}
const variantMap: Record<Variant, string> = {
  blue: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
  green: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
  amber: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
  red: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
  gray: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300',
  purple: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300',
}
export default function Badge({ children, variant = 'gray', size = 'sm' }: BadgeProps) {
  const sizeClass = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-2.5 py-1'
  return (
    <span className={`inline-block rounded-full font-medium ${sizeClass} ${variantMap[variant]}`}>
      {children}
    </span>
  )
}
