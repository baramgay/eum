process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
process.env.CRON_SECRET = 'test-cron-secret-32chars-long-value!!'
process.env.COLLECTION_SECRET = 'test-collection-secret-32chars!!!'

describe('lib/env', () => {
  beforeEach(() => {
    jest.resetModules()
  })

  it('기본값과 환경변수를 파싱한다', () => {
    const { env } = require('@/lib/env')
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe('https://test.supabase.co')
    expect(env.NEXT_PUBLIC_APP_URL).toBe('http://localhost:3001')
    expect(env.QWEN_MODEL).toBe('qwen-turbo')
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBe('test-service-role-key')
  })

  it('공통 환경변수가 유효하지 않으면 파싱에 실패한다', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'not-a-url'
    expect(() => require('@/lib/env')).toThrow()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
  })

  it('클이언트 환경에서는 서버 전용 변수를 검증하지 않는다', () => {
    // @ts-expect-error 브라우저 환경 시뮬레이션
    global.window = {}
    delete (process.env as Record<string, string | undefined>).SUPABASE_SERVICE_ROLE_KEY
    const { env } = require('@/lib/env')
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined()
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
    // @ts-expect-error 글로벌 모의 객체 제거
    delete global.window
  })
})
