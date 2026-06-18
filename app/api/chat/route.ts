import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { chatCompletion } from '@/lib/ai/provider'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })
  }

  const { messages, system } = await req.json()

  try {
    const result = await chatCompletion({
      messages: system
        ? [{ role: 'system', content: system }, ...messages]
        : messages,
    })
    return NextResponse.json({ content: result.content, model: result.model })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
