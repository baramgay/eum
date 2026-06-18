/**
 * @jest-environment node
 */
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'

import { createNotification } from '@/lib/notifications'

const insertMock = jest.fn()
const listUsersMock = jest.fn()

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: jest.fn(() => ({
    from: jest.fn(() => ({ insert: insertMock })),
    auth: {
      admin: {
        listUsers: listUsersMock,
      },
    },
  })),
}))

describe('notifications', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    insertMock.mockResolvedValue({ error: null })
  })

  it('user_id를 지정하면 해당 사용자에게 알림을 생성한다', async () => {
    await createNotification({ user_id: 'u1', type: 'system_alert', title: '테스트' })

    expect(insertMock).toHaveBeenCalledTimes(1)
    const rows = insertMock.mock.calls[0][0]
    expect(rows).toHaveLength(1)
    expect(rows[0].user_id).toBe('u1')
    expect(rows[0].type).toBe('system_alert')
  })

  it('tenant_id를 지정하면 해당 기관 사용자들에게 알림을 생성한다', async () => {
    listUsersMock.mockResolvedValue({
      data: {
        users: [
          { id: 'u1', user_metadata: { tenant_id: 't1' } },
          { id: 'u2', user_metadata: { tenant_id: 't1' } },
          { id: 'u3', user_metadata: { tenant_id: 't2' } },
        ],
      },
      error: null,
    })

    await createNotification({ tenant_id: 't1', type: 'collection_complete', title: '수집 완료' })

    expect(listUsersMock).toHaveBeenCalled()
    const rows = insertMock.mock.calls[0][0]
    expect(rows).toHaveLength(2)
    expect(rows.map((r: { user_id: string }) => r.user_id).sort()).toEqual(['u1', 'u2'])
  })

  it('수신자가 없으면 insert를 호출하지 않는다', async () => {
    listUsersMock.mockResolvedValue({ data: { users: [] }, error: null })
    await createNotification({ tenant_id: 'none', type: 'quality_fail', title: '실패' })
    expect(insertMock).not.toHaveBeenCalled()
  })
})
