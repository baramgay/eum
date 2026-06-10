import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { scoreAction, listActions } from '@/lib/ontology'

const ALLOWED_KEYS = new Set(['settlement', 'housing', 'employment'])

export async function GET(
  req: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params
  if (!ALLOWED_KEYS.has(key)) {
    return NextResponse.json(
      { error: `알 수 없는 액션: ${key}. 허용: ${[...ALLOWED_KEYS].join(', ')}` },
      { status: 400 }
    )
  }

  const { searchParams } = new URL(req.url)
  const top = Math.min(parseInt(searchParams.get('top') ?? '10', 10), 50)

  const supabase = await createClient()
  const actions  = listActions()
  const meta     = actions.find(a => a.key === key) ?? { name: key, description: '' }

  return NextResponse.json({
    action:      meta.name,
    description: meta.description,
    method:      '온톨로지 객체 속성 스코어링 (config/ontology-schema.yaml 가중치)',
    results:     await scoreAction(supabase, key, top),
  })
}
