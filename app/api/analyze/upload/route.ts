import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { randomUUID } from 'crypto'
import { writeFileSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join, extname } from 'path'
import { runAnalyzePy } from '@/lib/analyzeRunner'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'file 필드가 없습니다' }, { status: 400 })

  const ext = extname(file.name).toLowerCase() || '.csv'
  const tmpPath = join(tmpdir(), `eum_upload_${randomUUID()}${ext}`)
  const sessionId = randomUUID().replace(/-/g, '')

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    writeFileSync(tmpPath, buffer)

    const result = await runAnalyzePy({
      action: 'parse',
      session_id: sessionId,
      file_path: tmpPath,
    }) as Record<string, unknown>

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 422 })
    }

    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  } finally {
    try { unlinkSync(tmpPath) } catch { /* temp file may not exist */ }
  }
}
