'use client'

import { ScoreGauge } from '../DashboardClient'
import type { AreaScore } from '../DashboardClient'

interface ScoreGaugeWidgetProps {
  overall: number
  areas: AreaScore[]
}

export default function ScoreGaugeWidget({ overall, areas }: ScoreGaugeWidgetProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      <ScoreGauge value={overall} label="종합 점수" color="#2563eb" />
      {areas.map(a => (
        <ScoreGauge key={a.name} value={a.score} label={a.name} color={a.color} />
      ))}
    </div>
  )
}
