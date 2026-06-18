import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Header from '@/components/layout/Header'
import DashboardClient from '@/components/dashboard/DashboardClient'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <Header userEmail={user.email} role={user.user_metadata?.role} />
      <main className="max-w-7xl mx-auto px-4 py-6">
        <DashboardClient />
      </main>
    </div>
  )
}
