'use client'

import { createContext, useContext, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'

type RealtimeClient = ReturnType<typeof createClient>

const RealtimeContext = createContext<RealtimeClient | null>(null)

export function useRealtime() {
  const client = useContext(RealtimeContext)
  if (!client) {
    throw new Error('useRealtime must be used within RealtimeProvider')
  }
  return client
}

export default function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const client = useMemo(() => createClient(), [])
  return <RealtimeContext.Provider value={client}>{children}</RealtimeContext.Provider>
}
