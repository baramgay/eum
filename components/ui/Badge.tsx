type Variant = 'blue' | 'green' | 'amber' | 'red' | 'gray' | 'purple'
interface BadgeProps {
  children: React.ReactNode
  variant?: Variant
  size?: 'sm' | 'md'
}
const variantMap: Record<Variant, string> = {
  blue: 'bg-blue-100 text-blue-700',
  green: 'bg-green-100 text-green-700',
  amber: 'bg-amber-100 text-amber-700',
  red: 'bg-red-100 text-red-700',
  gray: 'bg-gray-100 text-gray-600',
  purple: 'bg-purple-100 text-purple-700',
}
export default function Badge({ children, variant = 'gray', size = 'sm' }: BadgeProps) {
  const sizeClass = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-2.5 py-1'
  return (
    <span className={`inline-block rounded-full font-medium ${sizeClass} ${variantMap[variant]}`}>
      {children}
    </span>
  )
}
