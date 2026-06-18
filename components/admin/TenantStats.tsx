'use client'

import { useMemo } from 'react'
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as ReTooltip,
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import { Building2, Users, Clock, ClipboardList } from 'lucide-react'
import Card from '@/components/ui/Card'
import StatCard from '@/components/ui/StatCard'

interface Tenant {
  tenant_id: string
  name: string
  gov_type: string | null
  sgg_cd: string | null
  onboarded: boolean
  status?: 'pending' | 'approved' | 'rejected'
  created_at?: string
}

interface Props {
  tenants: Tenant[]
}

const STATUS_COLORS = {
  pending: '#f59e0b',
  approved: '#22c55e',
  rejected: '#ef4444',
}

export default function TenantStats({ tenants }: Props) {
  const statusData = useMemo(() => [
    { name: '승인 대기', key: 'pending', value: tenants.filter(t => (t.status ?? 'pending') === 'pending').length },
    { name: '승인 완료', key: 'approved', value: tenants.filter(t => (t.status ?? 'pending') === 'approved').length },
    { name: '반려', key: 'rejected', value: tenants.filter(t => (t.status ?? 'pending') === 'rejected').length },
  ], [tenants])

  const trendData = useMemo(() => {
    const days = 7
    const buckets: { date: string; count: number }[] = []
    const today = new Date()
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      buckets.push({ date: d.toISOString().slice(0, 10), count: 0 })
    }
    tenants.forEach(t => {
      if (!t.created_at) return
      const created = t.created_at.slice(0, 10)
      const b = buckets.find(x => x.date === created)
      if (b) b.count += 1
    })
    return buckets.map(b => ({ ...b, label: b.date.slice(5) }))
  }, [tenants])

  const total = tenants.length
  const approved = statusData.find(d => d.key === 'approved')?.value ?? 0
  const onboarded = tenants.filter(t => t.onboarded).length
  const pending = statusData.find(d => d.key === 'pending')?.value ?? 0

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="전체 기관" value={total} color="blue" icon={<Building2 className="w-5 h-5" />} />
        <StatCard label="승인 완료" value={approved} color="green" icon={<Users className="w-5 h-5" />} />
        <StatCard label="입주 중" value={onboarded} color="purple" icon={<Clock className="w-5 h-5" />} />
        <StatCard label="승인 대기" value={pending} color="amber" icon={<ClipboardList className="w-5 h-5" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card className="overflow-hidden">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">기관 승인 상태 분포</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={4}
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.key as keyof typeof STATUS_COLORS] ?? '#9ca3af'} />
                  ))}
                </Pie>
                <ReTooltip
                  formatter={(value, name) => [`${value}개`, name]}
                  contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap justify-center gap-3 mt-2">
            {statusData.map(d => (
              <div key={d.key} className="flex items-center gap-1.5 text-xs">
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: STATUS_COLORS[d.key as keyof typeof STATUS_COLORS] }}
                />
                <span className="text-gray-600 dark:text-gray-400">{d.name} ({d.value})</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">최근 7일 기관 등록 추이</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="#9ca3af" />
                <ReTooltip
                  formatter={(value) => [`${value}개`, '등록 수']}
                  labelFormatter={(label) => `${label}`}
                  contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb' }}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="#2563eb"
                  fillOpacity={1}
                  fill="url(#colorCount)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  )
}
