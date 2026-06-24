import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Header from '@/components/layout/Header'
import OntologyClient from '@/components/ontology/OntologyClient'
import ErrorBoundary from '@/components/common/ErrorBoundary'
import Skeleton from '@/components/ui/Skeleton'

function OntologyLoadingSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-12 w-64" />
      <Skeleton className="h-[600px] w-full" />
    </div>
  )
}

export default async function OntologyPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <Header userEmail={user.email} role={user.user_metadata?.role} />
      <main className="max-w-7xl mx-auto px-4 py-6">
        <ErrorBoundary>
          <Suspense fallback={<OntologyLoadingSkeleton />}>
            <OntologyClient />
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  )
}
