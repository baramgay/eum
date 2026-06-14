import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })
  }

  const { messages, system } = await req.json()

  const apiKey  = process.env.QWEN_API_KEY
  const baseUrl = process.env.QWEN_BASE_URL
  const model   = process.env.QWEN_MODEL ?? 'qwen-turbo'

  if (!apiKey || !baseUrl) {
    return NextResponse.json({ error: 'Qwen API not configured' }, { status: 500 })
  }

  const body: Record<string, unknown> = {
    model,
    messages: system
      ? [{ role: 'system', content: system }, ...messages]
      : messages,
    max_tokens: 1024,
    temperature: 0.3,
  }

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = await res.text()
      return NextResponse.json({ error: err }, { status: res.status })
    }

    const data = await res.json()
    const content = data.choices?.[0]?.message?.content ?? ''
    return NextResponse.json({ content, model: data.model })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
