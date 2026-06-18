import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { detectCommunities } from '@/lib/ontology/graph-algorithms'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const top = Math.min(parseInt(searchParams.get('top') ?? '20', 10), 100)

  const [{ data: nodes }, { data: edges }] = await Promise.all([
    supabase.from('onto_objects').select('*'),
    supabase.from('onto_links').select('*'),
  ])

  if (!nodes?.length) {
    return NextResponse.json({ error: '그래프 데이터가 없습니다' }, { status: 404 })
  }

  const communities = detectCommunities(nodes, edges ?? [])
    .sort((a, b) => b.size - a.size)
    .slice(0, top)

  return NextResponse.json({
    communityCount: communities.length,
    totalNodes: nodes.length,
    totalEdges: edges?.length ?? 0,
    communities,
  })
}
