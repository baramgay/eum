import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import Header from '@/components/layout/Header'
import ReportClient from '@/components/report/ReportClient'

export default async function ReportPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <Header userEmail={user.email} role={user.user_metadata?.role} />
      <main className="max-w-5xl mx-auto px-4 py-6">
        <Suspense>
          <ReportClient role={user.user_metadata?.role} />
        </Suspense>
      </main>
    </div>
  )
}
