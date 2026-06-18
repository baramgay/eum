import type { ReactNode } from 'react'

type Color = 'blue' | 'green' | 'amber' | 'red' | 'purple' | 'gray'
interface StatCardProps {
  label: string
  value: string | number
  color?: Color
  icon?: ReactNode
  trend?: string
  trendUp?: boolean
}
const colorMap: Record<Color, string> = {
  blue: 'text-blue-600',
  green: 'text-green-600',
  amber: 'text-amber-500',
  red: 'text-red-600',
  purple: 'text-purple-600',
  gray: 'text-gray-700',
}
export default function StatCard({ label, value, color = 'blue', icon, trend, trendUp }: StatCardProps) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-5">
      <div className="flex items-start justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
        {icon && <span className="text-xl">{icon}</span>}
      </div>
      <p className={`text-3xl font-bold mt-2 ${colorMap[color]}`}>{value}</p>
      {trend && (
        <p className={`text-xs mt-1 ${trendUp ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
          {trendUp ? '▲' : '▼'} {trend}
        </p>
      )}
    </div>
  )
}
