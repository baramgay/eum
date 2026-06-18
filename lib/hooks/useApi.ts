'use client'

import { useState, useCallback } from 'react'

export interface UseApiState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

export type ApiFetcher<T, Args extends unknown[]> = (...args: Args) => Promise<T>

/**
 * 비동기 API 호출을 위한 공통 React 훅.
 * 호출 시 loading / error 상태를 자동으로 관리한다.
 *
 * 주의: fetcher 인자는 안정적인 참조를 권장한다.
 *       컴포넌트 낸에서 인라인 함수를 전달하면 execute 참조가 매 렌더링마다
 *       변경될 수 있으므로, useCallback 사용 또는 모듈 레벨 함수 정의를 권장한다.
 */
export function useApi<T, Args extends unknown[] = []>(
  fetcher: ApiFetcher<T, Args>
): UseApiState<T> & {
  execute: (...args: Args) => Promise<T | null>
  reset: () => void
  setData: (value: T | null) => void
  setError: (value: string | null) => void
} {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const execute = useCallback(
    async (...args: Args): Promise<T | null> => {
      setLoading(true)
      setError(null)
      try {
        const result = await fetcher(...args)
        setData(result)
        return result
      } catch (e) {
        const message = e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.'
        setError(message)
        return null
      } finally {
        setLoading(false)
      }
    },
    [fetcher]
  )

  const reset = useCallback(() => {
    setData(null)
    setLoading(false)
    setError(null)
  }, [])

  return { data, loading, error, execute, reset, setData, setError }
}
