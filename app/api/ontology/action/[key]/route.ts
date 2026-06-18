import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { scoreAction, listActions } from '@/lib/ontology/core'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params
  const actions = listActions()
  const meta = actions.find(a => a.key === key)

  if (!meta) {
    return NextResponse.json(
      { error: `알 수 없는 액션: ${key}. 사용 가능: ${actions.map(a => a.key).join(', ')}` },
      { status: 400 }
    )
  }

  const { searchParams } = new URL(req.url)
  const top = Math.min(parseInt(searchParams.get('top') ?? '10', 10), 50)

  const supabase = await createClient()

  return NextResponse.json({
    action: meta.name,
    description: meta.description,
    method: '온톨로지 객체 속성 스코어링 (config/ontology-schema.yaml 가중치)',
    results: await scoreAction(supabase, key, top),
  })
}
