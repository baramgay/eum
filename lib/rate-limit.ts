export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
}

/**
 * 메모리 기반 슬라이딩 윈도우 속도 제한기.
 * - 단일 프로세스/인스턴스 내에서만 정확하게 동작한다.
 * - 분산 환경에서는 Redis 등 외부 저장소 기반 제한기로 교체해야 한다.
 */
export class SlidingWindowRateLimiter {
  private windows = new Map<string, number[]>()

  constructor(
    private windowMs: number,
    private limit: number
  ) {}

  /**
   * 주어진 키의 현재 요청이 허용되는지 확인하고, 허용되면 타임스탬프를 기록한다.
   */
  isAllowed(key: string): RateLimitResult {
    const now = Date.now()
    const windowStart = now - this.windowMs

    const history = this.windows.get(key) ?? []
    const active = history.filter(ts => ts > windowStart)

    const allowed = active.length < this.limit
    if (allowed) {
      active.push(now)
    }

    this.windows.set(key, active)

    const oldest = active[0] ?? now
    const resetAt = oldest + this.windowMs
    const remaining = Math.max(0, this.limit - active.length)

    return { allowed, remaining, resetAt }
  }

  /**
   * 특정 키의 기록을 제거한다. 주로 테스트에서 사용한다.
   */
  reset(key: string): void {
    this.windows.delete(key)
  }

  /**
   * 모든 기록을 제거한다. 주로 테스트에서 사용한다.
   */
  resetAll(): void {
    this.windows.clear()
  }
}
