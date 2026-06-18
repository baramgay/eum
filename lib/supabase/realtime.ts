import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { createClient } from './client'

type Client = ReturnType<typeof createClient>

export type RealtimeChangeEvent<T> = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE'
  new: T
  old: T
}

export interface SubscribeTableOptions {
  event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*'
  filter?: string
}

/**
 * Supabase Realtime 채널을 이용한 테이블 구독 래퍼.
 * 컴포넌트 언마운트 시 반환된 unsubscribe()를 호출해야 한다.
 */
export function subscribeTable<T extends Record<string, unknown> = Record<string, unknown>>(
  client: Client,
  table: string,
  callback: (payload: RealtimeChangeEvent<T>) => void,
  options: SubscribeTableOptions = {},
) {
  const { event = '*', filter } = options
  const channel = client
    .channel(`${table}-changes-${Math.random().toString(36).slice(2, 8)}`)
    .on(
      'postgres_changes' as const,
      { event: event as never, schema: 'public', table, filter } as never,
      (payload: RealtimePostgresChangesPayload<T>) => {
        callback({
          eventType: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
          new: payload.new as T,
          old: payload.old as T,
        })
      }
    )
    .subscribe()

  return {
    unsubscribe() {
      channel.unsubscribe()
    },
  }
}
