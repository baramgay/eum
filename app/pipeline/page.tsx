import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Header from '@/components/layout/Header'
import PipelineClient from '@/components/pipeline/PipelineClient'

export default async function PipelinePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="min-h-screen bg-gray-50">
      <Header userEmail={user.email} role={user.user_metadata?.role} />
      <main className="max-w-4xl mx-auto px-4 py-6">
        <PipelineClient />
      </main>
    </div>
  )
}
