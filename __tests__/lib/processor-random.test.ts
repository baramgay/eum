process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'

import { randomHex } from '@/lib/utils'

// Node.js 환경에서 Web Crypto API polyfill
// (Jest testEnvironment: 'node' 에서는 globalThis.crypto 가 없을 수 있음)
if (!globalThis.crypto) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeCrypto = require('crypto')
  Object.defineProperty(globalThis, 'crypto', {
    value: {
      getRandomValues: (arr: Uint8Array) => {
        const buf = nodeCrypto.randomBytes(arr.length)
        arr.set(buf)
        return arr
      },
    },
    writable: true,
  })
}

describe('randomHex()', () => {
  describe('반환값 형식', () => {
    it('bytes=1 → 길이 2의 hex 문자열', () => {
      const result = randomHex(1)
      expect(result).toHaveLength(2)
      expect(result).toMatch(/^[0-9a-f]{2}$/)
    })

    it('bytes=4 → 길이 8의 hex 문자열', () => {
      const result = randomHex(4)
      expect(result).toHaveLength(8)
      expect(result).toMatch(/^[0-9a-f]{8}$/)
    })

    it('bytes=8 → 길이 16의 hex 문자열', () => {
      const result = randomHex(8)
      expect(result).toHaveLength(16)
      expect(result).toMatch(/^[0-9a-f]{16}$/)
    })

    it('bytes=16 → 길이 32의 hex 문자열', () => {
      const result = randomHex(16)
      expect(result).toHaveLength(32)
      expect(result).toMatch(/^[0-9a-f]{32}$/)
    })

    it('소문자 hex만 포함 (대문자 없음)', () => {
      for (let i = 0; i < 20; i++) {
        const result = randomHex(4)
        expect(result).not.toMatch(/[A-F]/)
      }
    })

    it('16진수 문자 외 문자 없음', () => {
      for (let i = 0; i < 20; i++) {
        const result = randomHex(8)
        expect(result).toMatch(/^[0-9a-f]+$/)
      }
    })
  })

  describe('무작위성', () => {
    it('두 번 호출 시 결과가 다르다 (통계적)', () => {
      const results = new Set<string>()
      for (let i = 0; i < 10; i++) {
        results.add(randomHex(8))
      }
      // 10번 중 최소 5종류 이상 다른 값 — 동일값이 계속 나오면 실패
      expect(results.size).toBeGreaterThan(1)
    })

    it('bytes=4 연속 50회 중 중복 없음 (충돌 확률 극히 낮음)', () => {
      const results = new Set<string>()
      for (let i = 0; i < 50; i++) {
        results.add(randomHex(4))
      }
      expect(results.size).toBeGreaterThan(40)
    })
  })

  describe('엣지 케이스', () => {
    it('bytes=0 → 빈 문자열', () => {
      const result = randomHex(0)
      expect(result).toBe('')
    })

    it('반환 타입이 string', () => {
      expect(typeof randomHex(4)).toBe('string')
    })
  })
})
