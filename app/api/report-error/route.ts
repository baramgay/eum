export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendEmail, CENTER_EMAIL } from '@/lib/email'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })
    }

    const body = (await req.json()) as {
      message?: string
      digest?: string
      url?: string
    }

    await sendEmail(
      CENTER_EMAIL,
      `[EUM] 오류 신고${body.digest ? ` — ${body.digest}` : ''}`,
      `<p>EUM 플랫폼에서 오류가 신고되었습니다.</p>
       <p><strong>메시지:</strong> ${body.message || '없음'}</p>
       <p><strong>Digest:</strong> ${body.digest || '없음'}</p>
       <p><strong>URL:</strong> ${body.url || '없음'}</p>
       <p><strong>신고 시각:</strong> ${new Date().toISOString()}</p>`
    )

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json(
      { error: '오류 신고 처리 중 문제가 발생했습니다' },
      { status: 500 }
    )
  }
}
