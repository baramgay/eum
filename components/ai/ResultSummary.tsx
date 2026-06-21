import { Lightbulb, Filter, Trophy } from 'lucide-react'
import Badge from '@/components/ui/Badge'

interface ResultSummaryProps {
  summary?: string
  topN?: number
  filterDescription?: string
}

export default function ResultSummary({ summary, topN, filterDescription }: ResultSummaryProps) {
  if (!summary && !topN && !filterDescription) return null

  return (
    <div className="px-4 py-2.5 bg-blue-50/70 dark:bg-blue-900/20 border-b text-sm space-y-1.5">
      {summary && (
        <div className="flex items-start gap-2">
          <Lightbulb className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-gray-700 dark:text-gray-300 leading-relaxed">{summary}</p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {topN && topN > 0 && (
          <span className="inline-flex items-center gap-1">
            <Badge variant="amber" size="sm"><Trophy className="w-3 h-3" /> TOP-{topN}</Badge>
          </span>
        )}
        {filterDescription && (
          <span className="inline-flex items-center gap-1">
            <Badge variant="blue" size="sm"><Filter className="w-3 h-3" /> {filterDescription}</Badge>
          </span>
        )}
      </div>
    </div>
  )
}
