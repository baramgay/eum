/**
 * @jest-environment node
 */
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'

import { middleware } from '@/middleware'

jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn(),
}))

jest.mock('next/server', () => {
  const redirectMock = jest.fn((url: unknown) => ({ type: 'redirect', url }))
  const jsonMock = jest.fn((body: unknown, init?: { status?: number }) => ({ type: 'json', body, status: init?.status }))
  const nextMock = jest.fn(() => ({ type: 'next', cookies: { set: jest.fn() } }))
  return {
    NextResponse: {
      next: nextMock,
      redirect: redirectMock,
      json: jsonMock,
    },
    NextRequest: class {
      nextUrl: URL & { clone: () => URL }
      cookies = { getAll: jest.fn(() => []), set: jest.fn() }
      headers = new Headers()
      constructor(input: string) {
        const base = new URL(input)
        this.nextUrl = Object.assign(base, {
          clone: () => new URL(base.toString()),
        })
      }
      get url() {
        return this.nextUrl.toString()
      }
    },
  }
})

import { createServerClient } from '@supabase/ssr'

interface MockedNextServer {
  NextResponse: { next: jest.Mock; redirect: jest.Mock; json: jest.Mock }
  NextRequest: new (input: string) => {
    nextUrl: URL & { clone: () => URL }
    cookies: { getAll: () => [] }
    headers: Headers
  }
}

const mockedNext = jest.requireMock('next/server') as MockedNextServer

const fetchMock = jest.fn(() => Promise.resolve({ ok: true } as unknown as Response))
global.fetch = fetchMock as unknown as typeof fetch

function mockUser(role: string | null) {
  ;(createServerClient as jest.Mock).mockImplementation(() => ({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: role ? { id: 'u1', email: 'a@b.com', user_metadata: { role } } : null },
      }),
    },
  }))
}

describe('middleware admin guard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    fetchMock.mockClear()
  })

  it('센터 역할이면 /admin에 통과한다', async () => {
    mockUser('center')
    const req = new mockedNext.NextRequest('http://localhost:3001/admin')
    const res = await middleware(req as never)
    expect(res.type).toBe('next')
  })

  it('비센터 역할은 /admin 접근 시 홈으로 리다이렉트한다', async () => {
    mockUser('agency')
    const req = new mockedNext.NextRequest('http://localhost:3001/admin')
    const res = await middleware(req as never)
    expect(res.type).toBe('redirect')
    expect((res as unknown as { url: URL }).url.pathname).toBe('/')
  })

  it('비센터 역할은 /api/admin/users에 403을 반환한다', async () => {
    mockUser('viewer')
    const req = new mockedNext.NextRequest('http://localhost:3001/api/admin/users')
    const res = await middleware(req as never)
    expect(res.type).toBe('json')
    expect((res as unknown as { status: number }).status).toBe(403)
  })

  it('비센터 역할은 /api/evaluation/compare에 403을 반환한다', async () => {
    mockUser('agency')
    const req = new mockedNext.NextRequest('http://localhost:3001/api/evaluation/compare')
    const res = await middleware(req as never)
    expect(res.type).toBe('json')
    expect((res as unknown as { status: number }).status).toBe(403)
  })

  it('미인증 사용자는 /admin 접근 시 로그인으로 리다이렉트한다', async () => {
    mockUser(null)
    const req = new mockedNext.NextRequest('http://localhost:3001/admin')
    const res = await middleware(req as never)
    expect(res.type).toBe('redirect')
    expect((res as unknown as { url: URL }).url.pathname).toBe('/login')
  })
})
