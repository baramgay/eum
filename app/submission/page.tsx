import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Header from '@/components/layout/Header'
import SubmissionClient from '@/components/submission/SubmissionClient'

export default async function SubmissionPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const role     = user.user_metadata?.role as string
  const tenantId = user.user_metadata?.tenant_id as string
  return (
    <div className="min-h-screen bg-gray-50">
      <Header userEmail={user.email} role={role} />
      <main className="max-w-7xl mx-auto px-4 py-6">
        <SubmissionClient role={role} tenantId={tenantId} />
      </main>
    </div>
  )
}
