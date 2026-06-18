/**
 * @jest-environment jsdom
 */

import { renderHook, act, waitFor } from '@testing-library/react'
import { useApi } from '@/lib/hooks/useApi'

describe('useApi', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  it('초기 상태는 data=null, loading=false, error=null 이다', () => {
    const fetcher = jest.fn(async () => 'ok')
    const { result } = renderHook(() => useApi(fetcher))

    expect(result.current.data).toBeNull()
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('execute 호출 시 fetcher를 실행하고 data를 설정한다', async () => {
    const fetcher = jest.fn(async (id: number) => ({ id, name: 'test' }))
    const { result } = renderHook(() => useApi(fetcher))

    await act(async () => {
      await result.current.execute(1)
    })

    expect(fetcher).toHaveBeenCalledWith(1)
    expect(result.current.data).toEqual({ id: 1, name: 'test' })
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('fetcher가 실패하면 error를 설정한다', async () => {
    const fetcher = jest.fn(async () => {
      throw new Error('network error')
    })
    const { result } = renderHook(() => useApi(fetcher))

    await act(async () => {
      await result.current.execute()
    })

    expect(result.current.data).toBeNull()
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBe('network error')
  })

  it('loading 상태는 요청 중 true, 완료 후 false 이다', async () => {
    let resolvePromise: (value: string) => void = () => {}
    const fetcher = jest.fn(async () => new Promise<string>(resolve => { resolvePromise = resolve }))
    const { result } = renderHook(() => useApi(fetcher))

    act(() => {
      result.current.execute()
    })

    expect(result.current.loading).toBe(true)

    act(() => {
      resolvePromise('done')
    })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toBe('done')
  })

  it('setData로 data를 직접 설정할 수 있다', () => {
    const fetcher = jest.fn()
    const { result } = renderHook(() => useApi(fetcher))

    act(() => {
      result.current.setData({ value: 42 })
    })

    expect(result.current.data).toEqual({ value: 42 })
  })

  it('reset으로 상태를 초기화할 수 있다', async () => {
    const fetcher = jest.fn(async () => 'data')
    const { result } = renderHook(() => useApi(fetcher))

    await act(async () => {
      await result.current.execute()
    })
    expect(result.current.data).toBe('data')

    act(() => {
      result.current.reset()
    })

    expect(result.current.data).toBeNull()
    expect(result.current.error).toBeNull()
    expect(result.current.loading).toBe(false)
  })
})
