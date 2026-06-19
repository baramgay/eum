import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const revalidate = 300

export type Grade = 'A' | 'B' | 'C' | 'D' | 'E'

export interface DatasetGrade {
  dataset_id: string
  title: string
  avg_score: number
  grade: Grade
}

export interface TopIssue {
  rule: string
  violations: number
}

export interface QualitySignalData {
  top5_datasets: DatasetGrade[]
  top5_issues: TopIssue[]
}

function scoreToGrade(score: number): Grade {
  if (score >= 90) return 'A'
  if (score >= 75) return 'B'
  if (score >= 60) return 'C'
  if (score >= 40) return 'D'
  return 'E'
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })

  const [
    { data: qualityRows },
    { data: catalogRows },
  ] = await Promise.all([
    supabase
      .from('quality_results')
      .select('dataset_id, error_rate, passed, detail, checked'),
    supabase
      .from('catalog')
      .select('dataset_id, title'),
  ])

  const titleMap = new Map<string, string>(
    (catalogRows ?? []).map(c => [c.dataset_id, c.title])
  )

  const datasetMap = new Map<string, { totalScore: number; count: number }>()
  const issueMap   = new Map<string, number>()

  for (const row of qualityRows ?? []) {
    const passScore = row.passed ? 100 * (1 - row.error_rate) : 100 * (1 - row.error_rate)
    const score     = Math.max(0, Math.min(100, passScore))

    const prev = datasetMap.get(row.dataset_id) ?? { totalScore: 0, count: 0 }
    datasetMap.set(row.dataset_id, {
      totalScore: prev.totalScore + score,
      count:      prev.count + 1,
    })

    for (const d of row.detail ?? []) {
      issueMap.set(d.rule, (issueMap.get(d.rule) ?? 0) + d.violations)
    }
  }

  const top5Datasets: DatasetGrade[] = Array.from(datasetMap.entries())
    .map(([dataset_id, { totalScore, count }]) => {
      const avg_score = count > 0 ? totalScore / count : 0
      return {
        dataset_id,
        title: titleMap.get(dataset_id) ?? dataset_id,
        avg_score: Math.round(avg_score * 10) / 10,
        grade: scoreToGrade(avg_score),
      }
    })
    .sort((a, b) => b.avg_score - a.avg_score)
    .slice(0, 5)

  const top5Issues: TopIssue[] = Array.from(issueMap.entries())
    .map(([rule, violations]) => ({ rule, violations }))
    .sort((a, b) => b.violations - a.violations)
    .slice(0, 5)

  return NextResponse.json({
    top5_datasets: top5Datasets,
    top5_issues:   top5Issues,
  } satisfies QualitySignalData)
}
