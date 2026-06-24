import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import Header from '@/components/layout/Header'
import FacilityMap from '@/components/map/FacilityMap'
import ErrorBoundary from '@/components/common/ErrorBoundary'

function loadSampleFacilities() {
  try {
    const raw = readFileSync(resolve(process.cwd(), 'data/samples/public_facility.json'), 'utf8')
    return JSON.parse(raw)
  } catch {
    return []
  }
}

export default async function MapPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const dbFacilities = (await supabase
    .from('gold_public_facility')
    .select('facility_id,sgg_cd,sigun,ftype,name,lon,lat,capacity')
    .order('ftype').order('sigun')).data ?? []

  // DB 데이터와 샘플 데이터를 합쳐 지도 테스트용 데이터를 풍부하게 구성
  const sampleFacilities = loadSampleFacilities()
  const merged = [...dbFacilities, ...sampleFacilities]

  const validFacilities = merged.filter(
    (f: any) => typeof f.lat === 'number' && typeof f.lon === 'number'
  )

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <Header userEmail={user.email} role={user.user_metadata?.role} />
      <main className="max-w-7xl mx-auto px-4 py-3">
        <ErrorBoundary>
          <Suspense fallback={
            <div className="flex items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800"
                 style={{ height: 'calc(100vh - 120px)', minHeight: 560 }}>
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-gray-400 dark:text-gray-300">지도 로딩 중...</p>
              </div>
            </div>
          }>
            <FacilityMap facilities={validFacilities} />
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  )
}
