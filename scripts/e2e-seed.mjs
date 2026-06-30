import { createClient } from '@supabase/supabase-js'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const CENTER_EMAIL = process.env.TEST_CENTER_EMAIL || 'center@eum.test'
const CENTER_PASSWORD = process.env.TEST_CENTER_PASSWORD || 'TestCenter123!'
const AGENCY_EMAIL = process.env.TEST_AGENCY_EMAIL || 'changwon@eum.test'
const AGENCY_PASSWORD = process.env.TEST_AGENCY_PASSWORD || 'TestAgency123!'

const IS_CLEANUP = process.argv.includes('--cleanup')

if (!URL || !SERVICE_KEY) {
  console.error('필수 환경변수가 누락되었습니다: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const TEST_USERS = [
  {
    email: CENTER_EMAIL,
    password: CENTER_PASSWORD,
    user_metadata: { role: 'center', tenant_id: '48000', name: 'E2E 센터 관리자' },
  },
  {
    email: AGENCY_EMAIL,
    password: AGENCY_PASSWORD,
    user_metadata: { role: 'agency', tenant_id: '48121', name: 'E2E 창원시 담당자' },
  },
]

async function listAllUsers() {
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, per_page: 1000 })
  if (error) {
    console.error('사용자 목록 조회 오류:', error.message)
    return []
  }
  return data?.users ?? []
}

async function seed() {
  console.log('▶ E2E 테스트 픽스처 초기화')

  // 최소한의 테스트 기관이 존재하도록 한다.
  const { error: tenantError } = await supabase.from('tenants').upsert(
    [
      { tenant_id: '48000', name: '경남데이터센터', gov_type: '도청', sgg_cd: '48000', onboarded: true },
      { tenant_id: '48121', name: '창원시', gov_type: '시청', sgg_cd: '48121', onboarded: true },
    ],
    { onConflict: 'tenant_id', ignoreDuplicates: true }
  )
  if (tenantError) console.warn('tenants upsert 경고:', tenantError.message)

  // 포털/품질 테스트용 샘플 카탈로그가 존재하도록 한다.
  const now = new Date().toISOString()
  const { error: catalogError } = await supabase.from('catalog').upsert(
    [
      {
        dataset_id: 'ds-e2e-youth',
        tenant_id: '48000',
        title: 'E2E 청년인구 현황',
        description: 'E2E 테스트용 청년인구 데이터셋입니다.',
        theme: '인구·가구',
        keywords: '청년,인구,E2E',
        layer: 'gold',
        table_name: 'gold_youth_population',
        rows: 100,
        is_open: true,
        ai_ready: true,
        high_value: true,
        updated_at: now,
        license: '공공누리 제1유형',
        format: 'CSV/API',
      },
      {
        dataset_id: 'ds-e2e-business',
        tenant_id: '48000',
        title: 'E2E 사업체 현황',
        description: 'E2E 테스트용 사업체 데이터셋입니다.',
        theme: '산업·고용',
        keywords: '사업체,고용,E2E',
        layer: 'gold',
        table_name: 'gold_business',
        rows: 50,
        is_open: true,
        ai_ready: true,
        high_value: true,
        updated_at: now,
        license: '공공누리 제1유형',
        format: 'CSV/API',
      },
      {
        dataset_id: 'ds-e2e-changwon',
        tenant_id: '48121',
        title: 'E2E 창원시 데이터셋',
        description: 'E2E 테스트용 창원시 데이터셋입니다.',
        theme: '지역·행정',
        keywords: '창원,지역,E2E',
        layer: 'gold',
        table_name: 'gold_changwon',
        rows: 30,
        is_open: true,
        ai_ready: true,
        high_value: false,
        updated_at: now,
        license: '공공누리 제1유형',
        format: 'CSV/API',
      },
    ],
    { onConflict: 'dataset_id', ignoreDuplicates: true }
  )
  if (catalogError) console.warn('catalog upsert 경고:', catalogError.message)

  const existing = await listAllUsers()

  for (const u of TEST_USERS) {
    const found = existing.find(x => x.email === u.email)
    if (found) {
      const { error: updateError } = await supabase.auth.admin.updateUserById(found.id, {
        password: u.password,
        user_metadata: u.user_metadata,
      })
      if (updateError) {
        console.warn(`  ⚠ ${u.email} 비밀번호 갱신 실패:`, updateError.message)
      } else {
        console.log(`  ℹ ${u.email} 이미 존재 (비밀번호 갱신)`)
      }
      continue
    }
    const { data, error } = await supabase.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
      user_metadata: u.user_metadata,
    })
    if (error) {
      console.error(`  ✗ ${u.email} 생성 실패:`, error.message)
    } else {
      console.log(`  ✓ ${u.email} 생성됨 (id: ${data.user.id})`)
    }
  }

  // 온톨로지 그래프 E2E 테스트용 최소 데이터를 직접 시드한다.
  // (buildOntology는 gold 테이블/RPC에 의존하므로, E2E 환경에 안정적인
  // onto_objects/onto_links 직접 삽입이 더 신뢰할 수 있다.)
  await seedOntology()

  console.log('✅ E2E 시드 완료')
}

async function seedOntology() {
  console.log('▶ 온톨로지 E2E 데이터 시드')

  // 기존 E2E 데이터 정리
  const { error: delLinksError } = await supabase
    .from('onto_links')
    .delete()
    .ilike('src', 'e2e:%')
  if (delLinksError) console.warn('onto_links 정리 경고:', delLinksError.message)

  const { error: delNodesError } = await supabase
    .from('onto_objects')
    .delete()
    .ilike('obj_id', 'e2e:%')
  if (delNodesError) console.warn('onto_objects 정리 경고:', delNodesError.message)

  const nodes = [
    {
      obj_id: 'e2e:sigun:48000',
      obj_type: '시군',
      label: '경남데이터센터',
      props: '유형=도청',
    },
    {
      obj_id: 'e2e:sigun:48121',
      obj_type: '시군',
      label: '창원시',
      props: '유형=시청;lat=35.2279;lng=128.6811',
    },
    {
      obj_id: 'e2e:youth:48121',
      obj_type: '청년인구',
      label: '창원시 청년',
      props: '인구=100000;순이동=500;year=2024',
    },
    {
      obj_id: 'e2e:biz:48121',
      obj_type: '사업체',
      label: '창원시 사업체',
      props: '사업체=50000;종사자=200000;year=2024',
    },
    {
      obj_id: 'e2e:policy:48121',
      obj_type: '정책',
      label: '창원시 청년 정책',
      props: '분류=일자리;year=2024',
    },
  ]

  const edges = [
    { src: 'e2e:sigun:48121', rel: '청년규모', dst: 'e2e:youth:48121', weight: 100000 },
    { src: 'e2e:sigun:48121', rel: '산업기반', dst: 'e2e:biz:48121', weight: 200000 },
    { src: 'e2e:biz:48121', rel: '지원정책', dst: 'e2e:policy:48121', weight: 1 },
  ]

  const { error: nodeError } = await supabase.from('onto_objects').insert(nodes)
  if (nodeError) {
    console.warn('  ⚠ onto_objects 삽입 경고:', nodeError.message)
  } else {
    console.log(`  ✓ onto_objects ${nodes.length}개 삽입`)
  }

  const { error: edgeError } = await supabase.from('onto_links').insert(edges)
  if (edgeError) {
    console.warn('  ⚠ onto_links 삽입 경고:', edgeError.message)
  } else {
    console.log(`  ✓ onto_links ${edges.length}개 삽입`)
  }
}

async function cleanup() {
  console.log('▶ E2E 테스트 사용자 정리')
  const existing = await listAllUsers()

  for (const u of TEST_USERS) {
    const found = existing.find(x => x.email === u.email)
    if (!found) {
      console.log(`  ℹ ${u.email} 없음`)
      continue
    }
    const { error } = await supabase.auth.admin.deleteUser(found.id)
    if (error) {
      console.error(`  ✗ ${u.email} 삭제 실패:`, error.message)
    } else {
      console.log(`  ✓ ${u.email} 삭제됨`)
    }
  }

  // E2E 온톨로지 데이터 정리
  console.log('▶ 온톨로지 E2E 데이터 정리')
  const { error: delLinksError } = await supabase
    .from('onto_links')
    .delete()
    .ilike('src', 'e2e:%')
  if (delLinksError) console.warn('  ⚠ onto_links 정리 경고:', delLinksError.message)

  const { error: delNodesError } = await supabase
    .from('onto_objects')
    .delete()
    .ilike('obj_id', 'e2e:%')
  if (delNodesError) console.warn('  ⚠ onto_objects 정리 경고:', delNodesError.message)

  console.log('✅ E2E 정리 완료')
}

if (IS_CLEANUP) {
  await cleanup()
} else {
  await seed()
}
