import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Header from '@/components/layout/Header'
import AdminClient from '@/components/admin/AdminClient'

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  if (user.user_metadata?.role !== 'center') redirect('/')

  const { data: tenants } = await supabase
    .from('tenants')
    .select('tenant_id, name, gov_type, sgg_cd, onboarded')
    .order('gov_type', { ascending: false })
    .order('name')

  return (
    <div className="min-h-screen bg-gray-50">
      <Header userEmail={user.email} role={user.user_metadata?.role} />
      <main className="max-w-7xl mx-auto px-4 py-6">
        <AdminClient initialTenants={tenants ?? []} />
      </main>
    </div>
  )
}
