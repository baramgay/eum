import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Header from '@/components/layout/Header'
import AnalyticsClient from '@/components/analytics/AnalyticsClient'
import ErrorBoundary from '@/components/common/ErrorBoundary'
import Skeleton from '@/components/ui/Skeleton'

function AnalyticsLoadingSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-12 w-48" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
      <Skeleton className="h-96 w-full" />
    </div>
  )
}

export default async function AnalyticsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const role     = user.user_metadata?.role as string
  const tenantId = user.user_metadata?.tenant_id as string
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <Header userEmail={user.email} role={role} />
      <main className="max-w-screen-2xl mx-auto px-4 py-6">
        <ErrorBoundary>
          <Suspense fallback={<AnalyticsLoadingSkeleton />}>
            <AnalyticsClient role={role} tenantId={tenantId} />
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  )
}
