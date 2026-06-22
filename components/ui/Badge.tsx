import { tintBadge } from './tints'

type Variant = 'blue' | 'green' | 'amber' | 'red' | 'gray' | 'purple'
interface BadgeProps {
  children: React.ReactNode
  variant?: Variant
  size?: 'sm' | 'md'
}
const variantMap: Record<Variant, string> = {
  blue: tintBadge('blue'),
  green: tintBadge('green'),
  amber: tintBadge('amber'),
  red: tintBadge('red'),
  gray: tintBadge('gray'),
  purple: tintBadge('purple'),
}
export default function Badge({ children, variant = 'gray', size = 'sm' }: BadgeProps) {
  const sizeClass = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-2.5 py-1'
  return (
    <span className={`inline-block rounded-full font-medium ${sizeClass} ${variantMap[variant]}`}>
      {children}
    </span>
  )
}
