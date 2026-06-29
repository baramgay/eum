import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { recordDecision } from '@/lib/submission'
import { logSubmissionDecided } from '@/lib/audit'
import { sendEmail, emailDecisionNotify, getTenantContactEmail, CENTER_EMAIL } from '@/lib/email'
import { createNotification } from '@/lib/notifications'

const VALID_STATUSES = new Set(['approved', 'rejected', 'review'])

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })

  const role = user.user_metadata?.role as string
  if (role !== 'center') return NextResponse.json({ error: '센터 권한이 필요합니다' }, { status: 403 })

  const body: { status?: string; decision_note?: string } = await req.json()
  if (!body.status || !VALID_STATUSES.has(body.status)) {
    return NextResponse.json(
      { error: `status는 ${Array.from(VALID_STATUSES).join(', ')} 중 하나여야 합니다` },
      { status: 400 }
    )
  }

  await recordDecision(supabase, id, body.status as 'approved' | 'rejected', body.decision_note ?? '')

  // 제출 정보 조회 (감사 로그 + 이메일에 필요)
  const { data: sub } = await supabase
    .from('submissions').select('*').eq('submission_id', id).maybeSingle()

  if (body.status === 'approved' && sub) {
    await supabase.from('catalog').upsert({
      dataset_id:       `ds-${id}`,
      tenant_id:        sub.tenant_id,
      title:            sub.title,
      description:      sub.description,
      theme:            sub.theme,
      keywords:         sub.keywords,
      license:          sub.license,
      format:           sub.format,
      table_name:       sub.table_name,
      rows:             sub.rows,
      is_open:          true,
      ai_ready:         false,
      high_value:       false,
      layer:            'silver',
      is_pseudonymized: sub.is_pseudonymized ?? false,
      is_synthetic:     sub.is_synthetic     ?? false,
      updated_at:       new Date().toISOString(),
    }, { onConflict: 'dataset_id' })
  }

  // 감사 로그 (재시도 + 동기 경고)
  void logSubmissionDecided(
    supabase,
    user,
    id,
    body.status as 'approved' | 'rejected' | 'review',
    { status: 'submitted' },
    { status: body.status, decision_note: body.decision_note },
    req,
  )

  // 이메일 알림 — 기관 담당자에게 결과 통지 (fire-and-forget)
  if (sub && body.status !== 'review') {
    void (async () => {
      const tenantEmail = await getTenantContactEmail(sub.tenant_id)
      const to = tenantEmail ?? CENTER_EMAIL
      const { subject, html } = emailDecisionNotify(
        sub.title,
        body.status as 'approved' | 'rejected',
        body.decision_note ?? '',
      )
      await sendEmail(to, subject, html)

      // 인앱 알림
      const statusLabel = body.status === 'approved' ? '승인' : '반려'
      await createNotification({
        tenant_id: sub.tenant_id,
        type: 'submission_decision',
        title: `데이터 제출 ${statusLabel} — ${sub.title}`,
        message: body.decision_note ?? undefined,
        link: `/submission/${id}`,
      })
    })()
  }

  return NextResponse.json({ ok: true, submission_id: id, status: body.status })
}
