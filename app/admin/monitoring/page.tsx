import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Header from '@/components/layout/Header'
import MonitoringClient from '@/components/admin/MonitoringClient'

export default async function MonitoringPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  if (user.user_metadata?.role !== 'center') redirect('/')

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <Header userEmail={user.email} role={user.user_metadata?.role} />
      <main className="max-w-7xl mx-auto px-4 py-6">
        <MonitoringClient />
      </main>
    </div>
  )
}
