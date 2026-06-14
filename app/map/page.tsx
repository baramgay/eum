import { Suspense } from 'react'
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
      <main className="max-w-7xl mx-auto px-4 py-3">
        <Suspense fallback={
          <div className="flex items-center justify-center rounded-2xl bg-gray-100"
               style={{ height: 'calc(100vh - 120px)', minHeight: 560 }}>
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-gray-400">지도 로딩 중...</p>
            </div>
          </div>
        }>
          <FacilityMap facilities={facilities ?? []} />
        </Suspense>
      </main>
    </div>
  )
}
