process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'

// NextResponse 모킹 — next/server 의존성 없이 테스트
jest.mock('next/server', () => {
  class MockNextResponse {
    readonly body: unknown
    readonly status: number
    constructor(body: unknown, init?: { status?: number }) {
      this.body = body
      this.status = init?.status ?? 200
    }
    async json() {
      return this.body
    }
    static json(data: unknown, init?: { status?: number }) {
      return new MockNextResponse(data, init)
    }
  }
  return { NextResponse: MockNextResponse }
})

import { ok, err, noContent } from '@/lib/api-response'

describe('ok()', () => {
  it('status 200, ok:true, data 포함', async () => {
    const res = ok({ id: 1, name: '경남' })
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(true)
    expect(body.data).toEqual({ id: 1, name: '경남' })
  })

  it('커스텀 status 전달 가능', async () => {
    const res = ok({ created: true }, 201)
    expect(res.status).toBe(201)
  })

  it('배열 data도 정상 처리', async () => {
    const res = ok([1, 2, 3])
    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(true)
    expect(body.data).toEqual([1, 2, 3])
  })

  it('null data도 정상 처리', async () => {
    const res = ok(null)
    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(true)
    expect(body.data).toBeNull()
  })
})

describe('err()', () => {
  it('status 400(기본값), ok:false, error 메시지 포함', async () => {
    const res = err('잘못된 요청')
    expect(res.status).toBe(400)
    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(false)
    expect(body.error).toBe('잘못된 요청')
  })

  it('status 401 전달 가능', async () => {
    const res = err('인증 필요', 401)
    expect(res.status).toBe(401)
    const body = await res.json() as Record<string, unknown>
    expect(body.error).toBe('인증 필요')
  })

  it('status 404 전달 가능', async () => {
    const res = err('리소스 없음', 404)
    expect(res.status).toBe(404)
  })

  it('status 500 서버 오류', async () => {
    const res = err('서버 오류', 500)
    expect(res.status).toBe(500)
  })

  it('detail 파라미터가 있으면 body에 포함', async () => {
    const res = err('유효성 오류', 422, { field: 'email' })
    const body = await res.json() as Record<string, unknown>
    expect(body.detail).toEqual({ field: 'email' })
  })

  it('detail 없으면 body에 detail 키 없음', async () => {
    const res = err('오류', 400)
    const body = await res.json() as Record<string, unknown>
    expect(Object.prototype.hasOwnProperty.call(body, 'detail')).toBe(false)
  })
})

describe('noContent()', () => {
  it('status 204 반환', () => {
    const res = noContent()
    expect(res.status).toBe(204)
  })

  it('body가 null', () => {
    const res = noContent()
    // MockNextResponse 에서는 body 프로퍼티로 직접 확인
    expect((res as unknown as { body: unknown }).body).toBeNull()
  })
})
