import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { runAnalytics } from '@/lib/ontology/analytics'
import type { AnalyticsPayload, AnalyticsResult } from '@/lib/ontology/types'

const VALID_METRICS = ['degree', 'weightedDegree', 'betweenness', 'closeness', 'eigenvector']
const VALID_TYPES = ['centrality', 'community', 'path', 'similarity', 'anomaly']

function parsePayload(input: Record<string, unknown>): AnalyticsPayload {
  const type = String(input.type ?? '')
  if (!VALID_TYPES.includes(type)) {
    throw new Error(`type은 ${VALID_TYPES.join(', ')} 중 하나여야 합니다`)
  }

  const metric = input.metric ? String(input.metric) : undefined
  if (metric && !VALID_METRICS.includes(metric)) {
    throw new Error(`metric은 ${VALID_METRICS.join(', ')} 중 하나여야 합니다`)
  }

  return {
    type: type as AnalyticsPayload['type'],
    metric: metric as AnalyticsPayload['metric'],
    source: input.source ? String(input.source) : undefined,
    target: input.target ? String(input.target) : undefined,
    nodeId: input.nodeId ? String(input.nodeId) : undefined,
    top: input.top ? Number(input.top) : undefined,
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>
    return await handleAnalytics(body)
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? '요청 처리 중 오류가 발생했습니다' },
      { status: 400 },
    )
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const body: Record<string, unknown> = {}
    searchParams.forEach((value, key) => {
      body[key] = value
    })
    return await handleAnalytics(body)
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? '요청 처리 중 오류가 발생했습니다' },
      { status: 400 },
    )
  }
}

async function handleAnalytics(body: Record<string, unknown>) {
  const payload = parsePayload(body)

  const supabase = await createClient()
  const { data: nodes } = await supabase.from('onto_objects').select('*')
  const { data: edges } = await supabase.from('onto_links').select('*')

  if (!nodes?.length) {
    return NextResponse.json(
      { error: '그래프 데이터가 없습니다' },
      { status: 404 },
    )
  }

  if (payload.type === 'path') {
    const nodeIds = new Set(nodes.map(n => n.obj_id))
    if (!payload.source || !nodeIds.has(payload.source)) {
      return NextResponse.json(
        { error: `source 노드를 찾을 수 없습니다: ${payload.source}` },
        { status: 400 },
      )
    }
    if (!payload.target || !nodeIds.has(payload.target)) {
      return NextResponse.json(
        { error: `target 노드를 찾을 수 없습니다: ${payload.target}` },
        { status: 400 },
      )
    }
  }

  if (payload.type === 'similarity') {
    const nodeIds = new Set(nodes.map(n => n.obj_id))
    if (!payload.nodeId || !nodeIds.has(payload.nodeId)) {
      return NextResponse.json(
        { error: `nodeId 노드를 찾을 수 없습니다: ${payload.nodeId}` },
        { status: 400 },
      )
    }
  }

  const result: AnalyticsResult = runAnalytics(nodes, edges ?? [], payload)
  return NextResponse.json(result)
}
