import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Header from '@/components/layout/Header'
import AnalyticsClient from '@/components/analytics/AnalyticsClient'

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
        <AnalyticsClient role={role} tenantId={tenantId} />
      </main>
    </div>
  )
}
