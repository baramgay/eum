import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Header from '@/components/layout/Header'
import ManualClient from '@/components/manual/ManualClient'

export default async function ManualPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="min-h-screen bg-gray-50">
      <Header userEmail={user.email} role={user.user_metadata?.role} />
      <ManualClient role={user.user_metadata?.role ?? 'viewer'} />
    </div>
  )
}
