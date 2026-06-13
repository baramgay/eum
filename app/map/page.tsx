import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Header from '@/components/layout/Header'
import FacilityMap from '@/components/map/FacilityMap'

export default async function MapPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: facilities } = await supabase
    .from('gold_public_facility')
    .select('facility_id,sgg_cd,sigun,ftype,name,lon,lat,capacity')
    .order('ftype').order('sigun')

  return (
    <div className="min-h-screen bg-gray-50">
      <Header userEmail={user.email} role={user.user_metadata?.role} />
      <main className="max-w-7xl mx-auto px-4 py-6">
        <FacilityMap facilities={facilities ?? []} />
      </main>
    </div>
  )
}
