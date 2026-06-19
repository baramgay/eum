import { NextResponse } from 'next/server'
import { buildDemoGraph } from '@/lib/ontology/demo-graph'
import type { ScenarioKey } from '@/lib/ontology/demo-graph'

const VALID: Set<ScenarioKey> = new Set(['youth-exodus', 'service-gap', 'industry-cluster', 'env-risk'])

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ scenario: string }> }
) {
  const { scenario } = await params
  if (!VALID.has(scenario as ScenarioKey)) {
    return NextResponse.json({ error: '알 수 없는 시나리오입니다.' }, { status: 400 })
  }
  try {
    const graph = buildDemoGraph(scenario as ScenarioKey)
    return NextResponse.json(graph)
  } catch (e) {
    console.error('[demo-graph] 그래프 빌드 실패', e)
    return NextResponse.json({ error: '그래프 빌드 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
