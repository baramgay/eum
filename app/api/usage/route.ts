import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const period = req.nextUrl.searchParams.get('period') ?? 'month'
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const now = new Date()
  const cutoff = new Date(now)
  if (period === 'month') cutoff.setMonth(cutoff.getMonth() - 1)
  else if (period === 'q') cutoff.setMonth(cutoff.getMonth() - 3)
  else cutoff.setFullYear(cutoff.getFullYear() - 1)
  const cutoffStr = cutoff.toISOString()

  // usage_log에서 다운로드 집계 (ts는 TEXT, 렉시코그라피 비교 가능)
  const { data: logs } = await supabase
    .from('usage_log')
    .select('dataset_id, action')
    .gte('ts', cutoffStr)
    .eq('action', 'download')

  const countMap: Record<string, number> = {}
  for (const l of logs ?? []) {
    countMap[l.dataset_id] = (countMap[l.dataset_id] ?? 0) + 1
  }

  const topIds = Object.entries(countMap)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([id]) => id)

  const { data: topDs } = topIds.length > 0
    ? await supabase.from('catalog').select('dataset_id, title').in('dataset_id', topIds)
    : { data: [] }

  const topDownloads = topIds.map(id => ({
    datasetId: id,
    title: topDs?.find(d => d.dataset_id === id)?.title ?? id,
    count: countMap[id],
  }))

  const { data: recent } = await supabase
    .from('catalog')
    .select('dataset_id, title, updated_at')
    .order('updated_at', { ascending: false })
    .limit(8)

  return NextResponse.json({
    topDownloads,
    recentDatasets: (recent ?? []).map(r => ({
      datasetId: r.dataset_id,
      title: r.title,
      updatedAt: r.updated_at ?? '',
    })),
    period,
  })
}
