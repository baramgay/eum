import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { actionParse, actionUpdateTypes, runAnalyze } from '@/lib/analyzeEngine'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })

  const body = await req.json() as {
    action?: string
    session_id: string
    analysis_type?: string
    variables?: Record<string, unknown>
    options?: Record<string, unknown>
    column_types?: Record<string, string>
    raw_json?: unknown[]
  }

  if (!body.session_id) return NextResponse.json({ error: 'session_id 필요' }, { status: 400 })

  try {
    let result: Record<string, unknown>

    if (body.action === 'update_types') {
      result = await actionUpdateTypes({
        session_id: body.session_id,
        user_id: user.id,
        column_types: body.column_types ?? {},
      })
    } else if (body.action === 'parse_json') {
      result = await actionParse({
        session_id: body.session_id,
        user_id: user.id,
        raw_json: body.raw_json ?? [],
      })
    } else {
      if (!body.analysis_type) {
        return NextResponse.json({ error: 'analysis_type 필요' }, { status: 400 })
      }
      result = await runAnalyze({
        session_id: body.session_id,
        user_id: user.id,
        analysis_type: body.analysis_type,
        variables: body.variables ?? {},
        options: body.options ?? {},
      })
    }

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 422 })
    }
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
