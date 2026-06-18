import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { extractNeighborSubgraph } from '@/lib/ontology/neighbors'

const MAX_HOPS = 2

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const nodeId = searchParams.get('node')?.trim() ?? ''
  const hops = Math.min(Math.max(parseInt(searchParams.get('hops') ?? '1', 10), 1), MAX_HOPS)

  if (!nodeId) {
    return NextResponse.json({ error: 'node 파라미터는 필수입니다' }, { status: 400 })
  }

  const [{ data: nodes }, { data: edges }] = await Promise.all([
    supabase.from('onto_objects').select('*'),
    supabase.from('onto_links').select('*'),
  ])

  const result = extractNeighborSubgraph(nodes ?? [], edges ?? [], nodeId, hops)
  return NextResponse.json(result)
}
