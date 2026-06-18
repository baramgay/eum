import { createServiceClient } from '@/lib/supabase/server'

export type NotificationType =
  | 'submission_decision'
  | 'collection_complete'
  | 'collection_fail'
  | 'quality_fail'
  | 'system_alert'

export interface CreateNotificationOptions {
  /** 특정 수신자를 지정하면 해당 사용자에게만 발송 */
  user_id?: string
  /** 기관을 지정하면 해당 기관 사용자들에게 발송 */
  tenant_id?: string
  /** 역할을 지정하면 해당 역할 사용자들에게 발송 (예: center) */
  role?: string
  type: NotificationType
  title: string
  message?: string
  link?: string
}

const MAX_PER_PAGE = 1000

async function resolveUserIds(opts: CreateNotificationOptions): Promise<string[]> {
  if (opts.user_id) return [opts.user_id]

  const supabase = await createServiceClient()
  const ids: string[] = []
  let page = 1

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: MAX_PER_PAGE,
    })
    if (error || !data) break

    for (const user of data.users) {
      const meta = user.user_metadata ?? {}
      if (opts.tenant_id && meta.tenant_id === opts.tenant_id) {
        ids.push(user.id)
      } else if (opts.role && meta.role === opts.role) {
        ids.push(user.id)
      }
    }

    if (data.users.length < MAX_PER_PAGE) break
    page++
  }

  // 기본적으로 센터 사용자에게 발송
  if (!opts.tenant_id && !opts.role && ids.length === 0) {
    const supabase = await createServiceClient()
    let page = 1
    while (true) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: MAX_PER_PAGE })
      if (error || !data) break
      for (const user of data.users) {
        if (user.user_metadata?.role === 'center') ids.push(user.id)
      }
      if (data.users.length < MAX_PER_PAGE) break
      page++
    }
  }

  return [...new Set(ids)]
}

/**
 * 알림을 생성한다.
 * 수신자를 명시하지 않으면 관련 기관/센터 사용자를 조회해 발송한다.
 * 메인 로직을 차단하지 않도록 fire-and-forget 형태로 호출하는 것을 권장한다.
 */
export async function createNotification(opts: CreateNotificationOptions): Promise<void> {
  const supabase = await createServiceClient()
  const userIds = await resolveUserIds(opts)
  if (userIds.length === 0) return

  const rows = userIds.map(user_id => ({
    user_id,
    type: opts.type,
    title: opts.title,
    message: opts.message ?? null,
    link: opts.link ?? null,
    read: false,
  }))

  const { error } = await supabase.from('notifications').insert(rows)
  if (error) {
    console.error('[notification] 알림 생성 실패:', error.message)
  }
}
