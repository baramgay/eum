interface PageHeaderProps {
  title: string
  subtitle?: string
  action?: React.ReactNode
  badge?: string
}
export default function PageHeader({ title, subtitle, action, badge }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          {badge && (
            <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full font-medium">{badge}</span>
          )}
        </div>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  )
}
