import { createClient } from '@supabase/supabase-js'

const URL         = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const CENTER_PASSWORD = process.env.TEST_CENTER_PASSWORD
const AGENCY_PASSWORD = process.env.TEST_AGENCY_PASSWORD

if (!URL || !SERVICE_KEY) {
  console.error('환경변수 NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요')
  process.exit(1)
}

if (!CENTER_PASSWORD || !AGENCY_PASSWORD) {
  console.error('환경변수 TEST_CENTER_PASSWORD, TEST_AGENCY_PASSWORD 필요')
  process.exit(1)
}

const supabase = createClient(URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

// 1. seed 데이터
console.log('▶ tenants 삽입...')
const { error: e1 } = await supabase.from('tenants').upsert([
  { tenant_id:'48121', name:'창원시', gov_type:'시', sgg_cd:'48121', onboarded:true },
  { tenant_id:'48170', name:'진주시', gov_type:'시', sgg_cd:'48170', onboarded:true },
  { tenant_id:'48220', name:'통영시', gov_type:'시', sgg_cd:'48220', onboarded:true },
  { tenant_id:'48240', name:'사천시', gov_type:'시', sgg_cd:'48240', onboarded:true },
  { tenant_id:'48250', name:'김해시', gov_type:'시', sgg_cd:'48250', onboarded:true },
  { tenant_id:'48270', name:'밀양시', gov_type:'시', sgg_cd:'48270', onboarded:true },
  { tenant_id:'48310', name:'거제시', gov_type:'시', sgg_cd:'48310', onboarded:true },
  { tenant_id:'48330', name:'양산시', gov_type:'시', sgg_cd:'48330', onboarded:true },
  { tenant_id:'48720', name:'의령군', gov_type:'군', sgg_cd:'48720', onboarded:false },
  { tenant_id:'48730', name:'함안군', gov_type:'군', sgg_cd:'48730', onboarded:true },
  { tenant_id:'48740', name:'창녕군', gov_type:'군', sgg_cd:'48740', onboarded:false },
  { tenant_id:'48820', name:'고성군', gov_type:'군', sgg_cd:'48820', onboarded:false },
  { tenant_id:'48840', name:'남해군', gov_type:'군', sgg_cd:'48840', onboarded:true },
  { tenant_id:'48850', name:'하동군', gov_type:'군', sgg_cd:'48850', onboarded:false },
  { tenant_id:'48860', name:'산청군', gov_type:'군', sgg_cd:'48860', onboarded:false },
  { tenant_id:'48870', name:'함양군', gov_type:'군', sgg_cd:'48870', onboarded:false },
  { tenant_id:'48880', name:'거창군', gov_type:'군', sgg_cd:'48880', onboarded:true },
  { tenant_id:'48890', name:'합천군', gov_type:'군', sgg_cd:'48890', onboarded:false },
], { onConflict: 'tenant_id', ignoreDuplicates: true })
if (e1) console.error('tenants 오류:', e1.message)
else console.log('  ✓ tenants 완료')

console.log('▶ catalog 삽입...')
const now = new Date().toISOString()
const { error: e2 } = await supabase.from('catalog').upsert([
  { dataset_id:'ds-youth-pop', tenant_id:'48000', title:'경남 청년인구 유출입 현황',
    description:'경남 18개 시군 청년인구 유출입 현황 데이터셋. 경남 18개 시군 단위.',
    theme:'인구·가구', keywords:'청년,인구,유입,유출,정착', layer:'gold',
    table_name:'gold_youth_population', rows:2304,
    is_open:true, ai_ready:true, high_value:true, updated_at:now,
    license:'공공누리 제1유형', format:'CSV/API' },
  { dataset_id:'ds-business', tenant_id:'48000', title:'경남 사업체 산업별 현황',
    description:'경남 18개 시군 사업체 산업별 현황 데이터셋. 경남 18개 시군 단위.',
    theme:'산업·고용', keywords:'사업체,산업,고용,일자리', layer:'gold',
    table_name:'gold_business', rows:504,
    is_open:true, ai_ready:true, high_value:true, updated_at:now,
    license:'공공누리 제1유형', format:'CSV/API' },
  { dataset_id:'ds-facility', tenant_id:'48000', title:'경남 공공시설 위치 현황',
    description:'경남 18개 시군 공공시설 위치 현황 데이터셋. 경남 18개 시군 단위.',
    theme:'공공행정', keywords:'공공시설,청년센터,위치,공간', layer:'gold',
    table_name:'gold_public_facility', rows:186,
    is_open:true, ai_ready:false, high_value:true, updated_at:now,
    license:'공공누리 제1유형', format:'CSV/GeoJSON' },
], { onConflict: 'dataset_id', ignoreDuplicates: true })
if (e2) console.error('catalog 오류:', e2.message)
else console.log('  ✓ catalog 완료')

// 2. 테스트 사용자 생성 (center role)
console.log('▶ 테스트 사용자 생성...')
const { data: user, error: e3 } = await supabase.auth.admin.createUser({
  email: 'center@eum.test',
  password: CENTER_PASSWORD,
  email_confirm: true,
  user_metadata: { role: 'center', tenant_id: '48000', name: '경남센터 관리자' }
})
if (e3) {
  if (e3.message?.includes('already')) console.log('  ℹ center@eum.test 이미 존재')
  else console.error('center 사용자 오류:', e3.message)
} else {
  console.log('  ✓ center@eum.test 생성됨 (id:', user.user?.id, ')')
}

// agency 테스트 사용자
const { data: user2, error: e4 } = await supabase.auth.admin.createUser({
  email: 'changwon@eum.test',
  password: AGENCY_PASSWORD,
  email_confirm: true,
  user_metadata: { role: 'agency', tenant_id: '48121', name: '창원시 담당자' }
})
if (e4) {
  if (e4.message?.includes('already')) console.log('  ℹ changwon@eum.test 이미 존재')
  else console.error('agency 사용자 오류:', e4.message)
} else {
  console.log('  ✓ changwon@eum.test 생성됨 (id:', user2.user?.id, ')')
}

console.log('\n✅ 완료!')
console.log('  center 계정: center@eum.test (TEST_CENTER_PASSWORD 환경변수 참조)')
console.log('  agency 계정: changwon@eum.test (TEST_AGENCY_PASSWORD 환경변수 참조)')
