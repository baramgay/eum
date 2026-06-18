/**
 * @jest-environment node
 */
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'

import { GET, POST } from '@/app/api/admin/users/route'
import { isPasswordCompliant, createUserSchema } from '@/lib/admin/users'

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}))

import { createClient } from '@/lib/supabase/server'

function mockCenterUser() {
  return {
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: 'center-1', email: 'center@eum.kr', user_metadata: { role: 'center' } } },
      }),
    },
  }
}

function mockAgencyUser() {
  return {
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: 'agency-1', email: 'agency@eum.kr', user_metadata: { role: 'agency' } } },
      }),
    },
  }
}

const fetchMock = jest.fn()
global.fetch = fetchMock as unknown as typeof fetch

describe('/api/admin/users', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    fetchMock.mockReset()
  })

  describe('isPasswordCompliant', () => {
    it('8자 이상, 대소문자+숫자 조합은 통과한다', () => {
      expect(isPasswordCompliant('Password1')).toBe(true)
    })
    it('7자는 거부한다', () => {
      expect(isPasswordCompliant('Pass1')).toBe(false)
    })
    it('소문자만은 거부한다', () => {
      expect(isPasswordCompliant('passwordpassword')).toBe(false)
    })
    it('대문자만은 거부한다', () => {
      expect(isPasswordCompliant('PASSWORDPASSWORD')).toBe(false)
    })
  })

  describe('createUserSchema', () => {
    it('이메일과 비밀번호가 필수다', () => {
      expect(() => createUserSchema.parse({})).toThrow()
    })
    it('기본 역할은 viewer다', () => {
      const parsed = createUserSchema.parse({ email: 'a@b.com', password: 'Password1' })
      expect(parsed.role).toBe('viewer')
    })
  })

  describe('GET', () => {
    it('센터는 사용자 목록과 페이지 정보를 받는다', async () => {
      ;(createClient as jest.Mock).mockResolvedValue(mockCenterUser())
      fetchMock.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ users: [{ id: 'u1', email: 'a@b.com', user_metadata: { role: 'agency' } }], total: 1 }),
      } as unknown as Response)

      const res = await GET(new Request('http://localhost:3001/api/admin/users?page=1&per_page=10'))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.users).toHaveLength(1)
      expect(body.pagination).toMatchObject({ page: 1, per_page: 10, total: 1 })
    })

    it('비센터는 403이다', async () => {
      ;(createClient as jest.Mock).mockResolvedValue(mockAgencyUser())
      const res = await GET(new Request('http://localhost:3001/api/admin/users'))
      expect(res.status).toBe(403)
    })
  })

  describe('POST', () => {
    it('약한 비밀번호는 400이다', async () => {
      ;(createClient as jest.Mock).mockResolvedValue(mockCenterUser())
      const res = await POST(new Request('http://localhost:3001/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({ email: 'a@b.com', password: 'weak' }),
      }))
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toContain('비밀번호')
    })

    it('강한 비밀번호와 올바른 역할로 사용자를 생성한다', async () => {
      ;(createClient as jest.Mock).mockResolvedValue(mockCenterUser())
      fetchMock.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ id: 'new-u', email: 'new@b.com' }),
      } as unknown as Response)

      const res = await POST(new Request('http://localhost:3001/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({ email: 'new@b.com', password: 'StrongPass1', role: 'agency', tenant_id: 't1' }),
      }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.ok).toBe(true)
      expect(fetchMock).toHaveBeenCalled()
      const call = fetchMock.mock.calls[0] as [string, { method: string; body: string }]
      const sent = JSON.parse(call[1].body)
      expect(sent.user_metadata).toEqual({ role: 'agency', tenant_id: 't1' })
    })
  })
})
