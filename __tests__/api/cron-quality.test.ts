import type { SupabaseClient } from '@supabase/supabase-js'

describe('/api/cron/quality', () => {
  process.env.CRON_SECRET = 'test-cron-secret'

  function makeSupabase(opts: {
    schedules?: Array<Record<string, unknown>>
    qualityResult?: object | null
    updateErrors?: Record<string, unknown>
    insertErrors?: Record<string, unknown>
  } = {}) {
    const { schedules = [], qualityResult = null } = opts
    return {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            or: () => ({
              data: table === 'quality_schedules' ? schedules : [],
              error: null,
            }),
          }),
        }),
        update: () => ({
          eq: async () => ({ error: opts.updateErrors?.[table] ?? null }),
        }),
        insert: () => ({
          data: null,
          error: opts.insertErrors?.[table] ?? null,
        }),
      }),
      rpc: () => Promise.resolve({ data: 0 }),
    } as unknown as SupabaseClient
  }

  it('CRON_SECRET 이 없으면 401 을 반환한다', async () => {
    jest.resetModules()
    jest.doMock('@/lib/supabase/server', () => ({
      createServiceClient: jest.fn().mockResolvedValue(makeSupabase()),
    }))
    jest.doMock('@/lib/quality', () => ({
      runQuality: jest.fn().mockResolvedValue(null),
    }))

    const { GET } = await import('@/app/api/cron/quality/route')
    const req = new Request('http://localhost:3001/api/cron/quality', {
      headers: { authorization: 'Bearer wrong-secret' },
    })
    const res = await GET(req as never)
    expect(res.status).toBe(401)
  })

  it('마감된 스케줄을 실행하고 다음 실행 시각을 갱신한다', async () => {
    jest.resetModules()
    const runQuality = jest.fn().mockResolvedValue({ errors: 0, passed: true })
    const schedules = [
      { id: 's1', dataset_id: 'ds1', cron: '0 * * * *', active: true, next_run_at: null },
    ]
    const updates: Array<Record<string, unknown>> = []

    jest.doMock('@/lib/supabase/server', () => ({
      createServiceClient: jest.fn().mockResolvedValue({
        from: (table: string) => ({
          select: () => ({
            eq: () => ({
              or: () => ({ data: table === 'quality_schedules' ? schedules : [], error: null }),
            }),
          }),
          update: (payload: Record<string, unknown>) => ({
            eq: async () => {
              updates.push({ table, payload })
              return { error: null }
            },
          }),
        }),
      }),
    }))
    jest.doMock('@/lib/quality', () => ({ runQuality }))

    const { GET } = await import('@/app/api/cron/quality/route')
    const req = new Request('http://localhost:3001/api/cron/quality', {
      headers: { authorization: 'Bearer test-cron-secret' },
    })
    const res = await GET(req as never)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.processed).toBe(1)
    expect(runQuality).toHaveBeenCalledWith(expect.anything(), 'ds1')
    expect(updates).toHaveLength(1)
    expect(updates[0].table).toBe('quality_schedules')
    expect(updates[0].payload).toHaveProperty('last_run_at')
    expect(updates[0].payload).toHaveProperty('next_run_at')
  })
})
