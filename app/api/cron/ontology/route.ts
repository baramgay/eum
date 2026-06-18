import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { buildOntology } from '@/lib/ontology/core'

export const runtime = 'nodejs'
export const maxDuration = 300

const GOLD_TABLES = [
  'gold_youth_population',
  'gold_business',
  'gold_public_facility',
] as const

interface RebuildState {
  id: number
  last_max_updated_at: string
}

async function queryMaxUpdatedAt(supabase: Awaited<ReturnType<typeof createServiceClient>>): Promise<Date | null> {
  const results: (string | null)[] = []
  for (const table of GOLD_TABLES) {
    const { data } = await supabase
      .from(table)
      .select('updated_at')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single()
    results.push((data as { updated_at: string } | null)?.updated_at ?? null)
  }
  const valid = results.filter((d): d is string => !!d)
  if (!valid.length) return null
  return new Date(valid.sort((a, b) => b.localeCompare(a))[0])
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceClient()

  const { data: stateRow, error: stateErr } = await supabase
    .from('ontology_rebuild_state')
    .select('*')
    .eq('id', 1)
    .single()

  if (stateErr) {
    return NextResponse.json({ error: stateErr.message }, { status: 500 })
  }

  const state = stateRow as RebuildState | null
  const lastMax = state ? new Date(state.last_max_updated_at) : new Date(0)
  const currentMax = await queryMaxUpdatedAt(supabase)

  if (!currentMax) {
    return NextResponse.json({ status: 'skipped', reason: 'gold 테이블에 updated_at 데이터가 없습니다' })
  }

  const changed = currentMax.getTime() > lastMax.getTime()
  let rebuild: { objects: number; links: number; year: number | null } | null = null

  if (changed) {
    rebuild = await buildOntology(supabase)
    const { error: upsertErr } = await supabase
      .from('ontology_rebuild_state')
      .upsert({
        id: 1,
        last_max_updated_at: currentMax.toISOString(),
        last_rebuilt_at: new Date().toISOString(),
        objects_count: rebuild.objects,
        links_count: rebuild.links,
        updated_at: new Date().toISOString(),
      })

    if (upsertErr) {
      return NextResponse.json({ error: upsertErr.message }, { status: 500 })
    }
  }

  return NextResponse.json({
    status: changed ? 'rebuilt' : 'unchanged',
    currentMax: currentMax.toISOString(),
    lastMax: lastMax.toISOString(),
    rebuild,
  })
}
