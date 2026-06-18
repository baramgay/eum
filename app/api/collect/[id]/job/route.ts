import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { calcNextRunAt, type ScheduleType } from '@/lib/collector'

type Params = { params: Promise<{ id: string }> }

const SCHEDULE_TYPES: ScheduleType[] = ['manual', 'daily', 'weekly', 'monthly']

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })

  const role       = user.user_metadata?.role as string
  const userTenant = user.user_metadata?.tenant_id as string

  const { data: job } = await supabase
    .from('collection_jobs')
    .select('job_id,tenant_id,schedule_type,enabled,next_run_at,status')
    .eq('source_id', id)
    .maybeSingle()

  if (!job) return NextResponse.json({ error: '수집 잡을 찾을 수 없습니다' }, { status: 404 })

  if (role === 'agency' && job.tenant_id !== userTenant) {
    return NextResponse.json({ error: '접근 권한이 없습니다' }, { status: 403 })
  }

  const body = await req.json() as Record<string, unknown>
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (typeof body.enabled === 'boolean') {
    updates.enabled = body.enabled
  }

  let scheduleType = job.schedule_type as ScheduleType
  if (body.schedule_type && SCHEDULE_TYPES.includes(body.schedule_type as ScheduleType)) {
    scheduleType = body.schedule_type as ScheduleType
    updates.schedule_type = scheduleType
  }

  // 다음 실행 시각 재계산: 스케줄 변경, 활성화 시, 또는 수동 지정
  if (body.next_run_at === null) {
    updates.next_run_at = null
  } else if (typeof body.next_run_at === 'string') {
    updates.next_run_at = body.next_run_at
  } else if (updates.schedule_type || (updates.enabled === true && !job.next_run_at && scheduleType !== 'manual')) {
    updates.next_run_at = calcNextRunAt(scheduleType)
  }

  // 상태가 running이 아닐 때는 idle로 리셋하여 스케줄 변경 후 즉시 반영
  if (job.status !== 'running') {
    updates.status = 'idle'
  }

  const { error } = await supabase
    .from('collection_jobs')
    .update(updates)
    .eq('source_id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
