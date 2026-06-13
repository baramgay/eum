const RESEND_API_KEY   = process.env.RESEND_API_KEY
const FROM_EMAIL       = process.env.RESEND_FROM_EMAIL    ?? 'noreply@eum.gyeongnam.go.kr'
const CENTER_EMAIL     = process.env.CENTER_NOTIFICATION_EMAIL ?? 'center@eum.gyeongnam.go.kr'
const SUPABASE_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY!

function emailTemplate(title: string, bodyHtml: string, actionLabel?: string, actionUrl?: string): string {
  const button = actionLabel && actionUrl
    ? `<div style="margin:24px 0">
        <a href="${actionUrl}" style="background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px">${actionLabel}</a>
       </div>`
    : ''

  return `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:sans-serif">
  <div style="max-width:520px;margin:32px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08)">
    <div style="background:#2563eb;padding:20px 24px">
      <p style="margin:0;color:#fff;font-size:13px;opacity:.8">경남빅데이터센터</p>
      <h1 style="margin:4px 0 0;color:#fff;font-size:18px;font-weight:600">${title}</h1>
    </div>
    <div style="padding:24px;font-size:14px;color:#374151;line-height:1.6">
      ${bodyHtml}
      ${button}
    </div>
    <div style="padding:12px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af">
      이 메일은 EUM 공공데이터 개방 플랫폼에서 자동 발송됩니다.
    </div>
  </div>
</body>
</html>`
}

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!RESEND_API_KEY) {
    console.log(`[EMAIL SKIP] to=${to} subject=${subject} (RESEND_API_KEY 없음)`)
    return
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
    })
    if (!res.ok) {
      const err = await res.text()
      console.error('[EMAIL ERROR]', err)
    }
  } catch {
    // fire-and-forget
  }
}

export function emailSubmissionReceived(
  tenantId: string,
  submissionTitle: string,
  submissionId: string,
): { subject: string; html: string } {
  const subject = `[EUM] 새 데이터 제출 — ${submissionTitle}`
  const html = emailTemplate(
    '새 데이터가 제출되었습니다',
    `<p>기관(<strong>${tenantId}</strong>)이 데이터를 제출했습니다.</p>
     <p><strong>데이터셋명:</strong> ${submissionTitle}</p>
     <p><strong>제출 ID:</strong> ${submissionId}</p>
     <p>검토 후 승인 또는 반려해 주세요.</p>`,
    '대시보드에서 검토',
    `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001'}/submissions`,
  )
  return { subject, html }
}

export function emailDecisionNotify(
  submissionTitle: string,
  status: 'approved' | 'rejected' | 'review',
  decisionNote: string,
): { subject: string; html: string } {
  const label = status === 'approved' ? '승인' : status === 'rejected' ? '반려' : '검토 요청'
  const color = status === 'approved' ? '#16a34a' : status === 'rejected' ? '#dc2626' : '#d97706'
  const subject = `[EUM] 제출 데이터 ${label} — ${submissionTitle}`
  const noteHtml = decisionNote
    ? `<p><strong>검토 의견:</strong><br><span style="color:#4b5563">${decisionNote}</span></p>`
    : ''
  const html = emailTemplate(
    `데이터 제출 결과: ${label}`,
    `<p>제출하신 데이터셋 검토가 완료되었습니다.</p>
     <p><strong>데이터셋명:</strong> ${submissionTitle}</p>
     <p><strong>처리 결과:</strong> <span style="color:${color};font-weight:600">${label}</span></p>
     ${noteHtml}`,
  )
  return { subject, html }
}

export async function getTenantContactEmail(
  tenantId: string,
): Promise<string | null> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=100`,
      {
        headers: {
          Authorization: `Bearer ${SERVICE_KEY}`,
          apikey: SERVICE_KEY,
        },
      },
    )
    if (!res.ok) return null
    const data = await res.json() as { users?: Array<{ email?: string; user_metadata?: { tenant_id?: string } }> }
    const match = (data.users ?? []).find(u => u.user_metadata?.tenant_id === tenantId)
    return match?.email ?? null
  } catch {
    return null
  }
}

export { CENTER_EMAIL }
