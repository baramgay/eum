import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { answer } from '@/lib/nlquery'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') ?? ''
  if (!q.trim()) {
    return NextResponse.json({ error: 'q 파라미터가 필요합니다' }, { status: 400 })
  }
  const supabase = await createClient()
  return NextResponse.json(await answer(supabase, q))
}
