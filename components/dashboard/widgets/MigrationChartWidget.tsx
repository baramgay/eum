'use client'

import { useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ReferenceLine, ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import Card from '@/components/ui/Card'
import { formatK, MIGRATION_FILTERS, type MigrationRow, type MigrationFilter } from '../DashboardClient'

interface MigrationChartWidgetProps {
  migration: MigrationRow[]
  migYear: number
}

export default function MigrationChartWidget({ migration, migYear }: MigrationChartWidgetProps) {
  const [migrationFilter, setMigrationFilter] = useState<MigrationFilter>('all')

  const filteredMigration = useMemo(() => {
    const rows = [...migration]
    switch (migrationFilter) {
      case 'top-in':
        return rows.sort((a, b) => b.net - a.net).slice(0, 10)
      case 'top-out':
        return rows.sort((a, b) => a.net - b.net).slice(0, 10)
      case 'city':
        return rows.filter(r => r.sigun.endsWith('시'))
      case 'county':
        return rows.filter(r => r.sigun.endsWith('군'))
      default:
        return rows
    }
  }, [migration, migrationFilter])

  return (
    <Card>
      <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
        <div>
          <h3 className="text-base font-semibold text-gray-700 dark:text-gray-300 mb-0.5">
            시군별 청년 순이동 ({migYear}년)
          </h3>
          <p className="text-xs text-gray-400 dark:text-gray-300">
            파란색: 순유입 / 빨간색: 순유출 — 실제 주민등록 기반 산출
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {MIGRATION_FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setMigrationFilter(f.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                migrationFilter === f.key
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                  : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-950'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <figure className="w-full h-[420px]" role="img" aria-label={`시군별 청년 순이동 막대 차트, ${migYear}년, ${filteredMigration.length}개 시군`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={filteredMigration}
            layout="vertical"
            margin={{ top: 4, right: 40, left: 56, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tickFormatter={formatK} tick={{ fontSize: 11 }} domain={['auto','auto']} />
            <YAxis type="category" dataKey="sigun" width={52} tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(v, name, props) => {
                const row = props.payload as MigrationRow
                return [
                  `${(v as number).toLocaleString()}명`,
                  name === 'net' ? '순이동' : (name as string),
                ]
              }}
              labelFormatter={l => `${l}`}
            />
            <ReferenceLine x={0} stroke="#9CA3AF" strokeWidth={1.5} />
            <Bar dataKey="net" name="순이동" radius={[0, 3, 3, 0]}>
              {filteredMigration.map(d => (
                <Cell key={d.sigun} fill={d.net >= 0 ? '#2563EB' : '#DC2626'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </figure>
    </Card>
  )
}
