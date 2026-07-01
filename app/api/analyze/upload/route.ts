import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { randomUUID } from 'crypto'
import { extname } from 'path'
import { actionParse, actionParseCsv } from '@/lib/analyzeEngine'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'file 필드가 없습니다' }, { status: 400 })

  const ext = extname(file.name).toLowerCase() || '.csv'
  const sessionId = randomUUID().replace(/-/g, '')

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    let result: Record<string, unknown>

    if (ext === '.json') {
      const text = buffer.toString('utf-8')
      let raw: unknown[]
      try {
        const parsed = JSON.parse(text)
        raw = Array.isArray(parsed) ? parsed : [parsed]
      } catch {
        // NDJSON
        raw = text.split(/\r?\n/).filter(l => l.trim()).map(l => {
          try { return JSON.parse(l) } catch { return null }
        }).filter(Boolean) as unknown[]
      }
      result = await actionParse({ session_id: sessionId, user_id: user.id, raw_json: raw })
    } else {
      // CSV / TSV / Excel (텍스트 처리)
      const text = buffer.toString('utf-8')
      result = await actionParseCsv({ session_id: sessionId, user_id: user.id, text })
    }

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 422 })
    }
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
