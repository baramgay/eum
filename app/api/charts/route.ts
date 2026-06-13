import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const revalidate = 300  // 5분 캐시

export async function GET() {
  const supabase = await createClient()

  // 3개 쿼리 병렬 실행
  const [yrRes, allPopRes, subRes] = await Promise.all([
    supabase.from('gold_youth_population').select('year').order('year', { ascending: false }).limit(1),
    supabase.from('gold_youth_population').select('sigun,year,population,inflow,outflow'),
    supabase.from('submissions').select('status'),
  ])

  const latestYear = yrRes.data?.[0]?.year ?? 2025
  const migYear = latestYear - 1  // 최신연도는 terminal year라 순이동=0, 직전 연도 사용
  const rows = allPopRes.data ?? []

  // 시군별 순이동 (직전 완전 연도)
  const migMap: Record<string, { inflow: number; outflow: number }> = {}
  for (const r of rows) {
    if (r.year !== migYear) continue
    if (!migMap[r.sigun]) migMap[r.sigun] = { inflow: 0, outflow: 0 }
    migMap[r.sigun].inflow  += r.inflow
    migMap[r.sigun].outflow += r.outflow
  }
  const migration = Object.entries(migMap)
    .map(([sigun, v]) => ({ sigun, net: v.inflow - v.outflow, inflow: v.inflow, outflow: v.outflow }))
    .sort((a, b) => b.net - a.net)

  // 연도별 추이 (전체 행 재사용)
  const trendMap: Record<number, { total: number; net: number }> = {}
  for (const r of rows) {
    if (!trendMap[r.year]) trendMap[r.year] = { total: 0, net: 0 }
    trendMap[r.year].total += r.population
    trendMap[r.year].net   += r.inflow - r.outflow
  }
  const trend = Object.entries(trendMap)
    .map(([year, v]) => ({ year: Number(year), total: v.total, net: v.net }))
    .sort((a, b) => a.year - b.year)

  // 제출 현황
  const subCounts: Record<string, number> = { submitted: 0, review: 0, approved: 0, rejected: 0 }
  for (const r of subRes.data ?? []) {
    if (r.status in subCounts) subCounts[r.status]++
  }

  return NextResponse.json(
    { migration, trend, submissions: subCounts, year: latestYear, migYear },
    { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60' } }
  )
}
