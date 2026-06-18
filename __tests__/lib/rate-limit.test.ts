import { SlidingWindowRateLimiter } from '@/lib/rate-limit'

describe('SlidingWindowRateLimiter', () => {
  let limiter: SlidingWindowRateLimiter

  beforeEach(() => {
    limiter = new SlidingWindowRateLimiter(60_000, 3)
  })

  it('윈도우 내에서 허용 횟수만큼 요청을 허용한다', () => {
    const key = 'key-1'
    expect(limiter.isAllowed(key).allowed).toBe(true)
    expect(limiter.isAllowed(key).allowed).toBe(true)
    expect(limiter.isAllowed(key).allowed).toBe(true)
  })

  it('윈도우 내에서 허용 횟수를 초과하면 거부한다', () => {
    const key = 'key-2'
    limiter.isAllowed(key)
    limiter.isAllowed(key)
    limiter.isAllowed(key)

    const result = limiter.isAllowed(key)
    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
  })

  it('키별로 윈도우가 분리된다', () => {
    limiter.isAllowed('key-a')
    limiter.isAllowed('key-a')
    limiter.isAllowed('key-a')

    expect(limiter.isAllowed('key-b').allowed).toBe(true)
  })

  it('reset으로 특정 키의 기록을 초기화한다', () => {
    const key = 'key-3'
    limiter.isAllowed(key)
    limiter.isAllowed(key)
    limiter.isAllowed(key)

    limiter.reset(key)
    expect(limiter.isAllowed(key).allowed).toBe(true)
  })

  it('resetAll로 모든 키의 기록을 초기화한다', () => {
    limiter.isAllowed('key-x')
    limiter.isAllowed('key-y')
    limiter.resetAll()

    expect(limiter.isAllowed('key-x').allowed).toBe(true)
    expect(limiter.isAllowed('key-y').allowed).toBe(true)
  })
})
