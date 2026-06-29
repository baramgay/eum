import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const authClient = await createClient()
  const { data: { user }, error } = await authClient.auth.getUser()
  if (error || !user) {
    return NextResponse.json({ error: '인증되지 않았습니다' }, { status: 401 })
  }

  const id = new URL(req.url).searchParams.get('id')

  if (id) {
    const { data: conv } = await authClient
      .from('conversations')
      .select('id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (!conv) {
      return NextResponse.json({ error: '대화를 찾을 수 없습니다' }, { status: 404 })
    }

    const { data: messages } = await authClient
      .from('conversation_messages')
      .select('id,role,content,tool_calls,created_at')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true })

    return NextResponse.json({ messages: messages ?? [] })
  }

  const { data: conversations } = await authClient
    .from('conversations')
    .select('id,title,updated_at,created_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(20)

  return NextResponse.json({ conversations: conversations ?? [] })
}
