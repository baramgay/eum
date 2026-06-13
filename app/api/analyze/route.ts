import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { spawn } from 'child_process'
import { join } from 'path'

export const runtime = 'nodejs'

function runAnalyzePy(input: object): Promise<object> {
  return new Promise((resolve, reject) => {
    const py = spawn('python', [join(process.cwd(), 'scripts', 'analyze.py')], {
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    })
    let out = ''
    let err = ''
    py.stdout.on('data', (d: Buffer) => { out += d.toString() })
    py.stderr.on('data', (d: Buffer) => { err += d.toString() })
    py.on('close', (code: number) => {
      if (code !== 0) { reject(new Error(err || `exit ${code}`)); return }
      try { resolve(JSON.parse(out)) }
      catch { reject(new Error(`JSON parse 실패: ${out}`)) }
    })
    py.stdin.write(JSON.stringify(input))
    py.stdin.end()
  })
}

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
      result = await runAnalyzePy({
        action: 'update_types',
        session_id: body.session_id,
        column_types: body.column_types ?? {},
      }) as Record<string, unknown>
    } else if (body.action === 'parse_json') {
      // 카탈로그 JSON 데이터를 세션으로 로드
      result = await runAnalyzePy({
        action: 'parse',
        session_id: body.session_id,
        raw_json: body.raw_json ?? [],
      }) as Record<string, unknown>
    } else {
      if (!body.analysis_type) {
        return NextResponse.json({ error: 'analysis_type 필요' }, { status: 400 })
      }
      result = await runAnalyzePy({
        action: 'analyze',
        session_id: body.session_id,
        analysis_type: body.analysis_type,
        variables: body.variables ?? {},
        options: body.options ?? {},
      }) as Record<string, unknown>
    }

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 422 })
    }
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
