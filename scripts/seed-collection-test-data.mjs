#!/usr/bin/env node
/**
 * 수집탭 UI/UX 검증용 테스트 데이터 시더
 * collection_sources, collection_jobs, collection_logs에 다양한 상태의 샘플 데이터를 생성한다.
 *
 * 사용법:
 *   source .env.local && node scripts/seed-collection-test-data.mjs
 */
import { createClient } from '@supabase/supabase-js'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!URL || !SERVICE_KEY) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.')
  process.exit(1)
}

const supabase = createClient(URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const TEST_TENANT = 'test_agency_01'

const SOURCE_TEMPLATES = [
  {
    title: '공공데이터포털 대기질 API',
    url: 'https://api.data.go.kr/sample/air',
    format: 'json',
    schedule: 'daily',
    status: 'success',
    enabled: true,
  },
  {
    title: '경남 교통사고 CSV',
    url: 'https://example.com/traffic.csv',
    format: 'csv',
    schedule: 'weekly',
    status: 'failed',
    enabled: true,
  },
  {
    title: '상권 분석 OpenAPI',
    url: 'https://api.example.com/commercial',
    format: 'json',
    schedule: 'monthly',
    status: 'idle',
    enabled: false,
  },
  {
    title: '공공병원 현황 XML',
    url: 'https://example.com/hospital.xml',
    format: 'xml',
    schedule: 'manual',
    status: 'success',
    enabled: true,
  },
  {
    title: '학교 및 교육 인구 API',
    url: 'https://api.example.com/school',
    format: 'json',
    schedule: 'daily',
    status: 'running',
    enabled: true,
  },
]

async function ensureTenant() {
  const { data } = await supabase.from('tenants').select('tenant_id').eq('tenant_id', TEST_TENANT).maybeSingle()
  if (!data) {
    const { error } = await supabase.from('tenants').insert({
      tenant_id: TEST_TENANT,
      name: '수집탭 테스트 기관',
      gov_type: '시군',
      sgg_cd: '99999',
      onboarded: true,
    })
    if (error) {
      console.error('❌ 테스트 기관 생성 오류:', error.message)
      throw error
    }
    console.log(`  ✓ 테스트 기관 생성: ${TEST_TENANT}`)
  }
}

function makeId(prefix) {
  return prefix + Math.random().toString(36).slice(2, 10)
}

function calcNextRunAt(scheduleType) {
  if (scheduleType === 'manual') return null
  const now = new Date()
  if (scheduleType === 'daily') {
    const next = new Date(now)
    next.setDate(next.getDate() + 1)
    next.setHours(0, 0, 0, 0)
    return next.toISOString()
  }
  if (scheduleType === 'weekly') {
    const next = new Date(now)
    const daysUntilMonday = (8 - next.getDay()) % 7 || 7
    next.setDate(next.getDate() + daysUntilMonday)
    next.setHours(0, 0, 0, 0)
    return next.toISOString()
  }
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0)
  return next.toISOString()
}

async function seed() {
  console.log('▶ 수집탭 테스트 데이터를 시딩합니다...')
  await ensureTenant()

  for (const tpl of SOURCE_TEMPLATES) {
    const sourceId = makeId('csrc_')
    const jobId = makeId('cjob_')
    const now = new Date().toISOString()
    const yesterday = new Date(Date.now() - 86400000).toISOString()

    const { error: srcErr } = await supabase.from('collection_sources').insert({
      source_id:    sourceId,
      tenant_id:    TEST_TENANT,
      title:        tpl.title,
      description:  `${tpl.title} - 수집탭 UI 검증용 테스트 소스입니다.`,
      url:          tpl.url,
      method:       'GET',
      auth_type:    'none',
      resp_format:  tpl.format,
      json_path:    tpl.format === 'json' ? '$.response.body.items.item' : null,
      theme:        '테스트',
      keywords:     '경남,테스트,수집',
      license:      '공공누리 1유형',
      pagination_type:       tpl.format === 'json' ? 'page' : 'none',
      pagination_page_param: 'pageNo',
      pagination_size_param: 'numOfRows',
      pagination_size:       1000,
      pagination_total_path: '$.response.body.totalCount',
      created_at:   now,
      updated_at:   now,
    })
    if (srcErr) {
      console.error(`  ❌ ${tpl.title} 소스 생성 오류:`, srcErr.message)
      continue
    }

    const lastRunAt = tpl.status === 'success' || tpl.status === 'failed' ? yesterday : null
    const { error: jobErr } = await supabase.from('collection_jobs').insert({
      job_id:        jobId,
      source_id:     sourceId,
      tenant_id:     TEST_TENANT,
      schedule_type: tpl.schedule,
      status:        tpl.status,
      enabled:       tpl.enabled,
      last_run_at:   lastRunAt,
      next_run_at:   tpl.enabled && tpl.schedule !== 'manual' ? calcNextRunAt(tpl.schedule) : null,
      created_at:    now,
    })
    if (jobErr) {
      console.error(`  ❌ ${tpl.title} 잡 생성 오류:`, jobErr.message)
      continue
    }

    // 각 소스별 2~3개의 수집 로그 생성
    const logCount = 2 + Math.floor(Math.random() * 2)
    for (let i = 0; i < logCount; i++) {
      const isFailed = i === 0 && tpl.status === 'failed'
      const isRunning = i === 0 && tpl.status === 'running'
      const status = isRunning ? 'running' : isFailed ? 'failed' : 'success'
      const started = new Date(Date.now() - (logCount - i) * 3600000).toISOString()
      const rowsFetched = status === 'success' ? 100 + Math.floor(Math.random() * 900) : 0
      const duration = status === 'running' ? null : 2000 + Math.floor(Math.random() * 8000)

      const { error: logErr } = await supabase.from('collection_logs').insert({
        log_id:       makeId('clog_'),
        job_id:       jobId,
        source_id:    sourceId,
        tenant_id:    TEST_TENANT,
        started_at:   started,
        finished_at:  status === 'running' ? null : new Date(new Date(started).getTime() + (duration ?? 0)).toISOString(),
        duration_ms:  duration,
        status,
        rows_fetched: rowsFetched,
        rows_new:     status === 'success' ? Math.floor(rowsFetched * 0.1) : 0,
        rows_changed: 0,
        rows_deleted: status === 'success' ? Math.floor(rowsFetched * 0.05) : 0,
        error_msg:    isFailed ? '테스트용 실패 메시지: 요청 시간 초과' : null,
        table_name:   status === 'success' ? `col_${TEST_TENANT.slice(0, 8)}_${makeId('').slice(5)}` : null,
      })
      if (logErr) {
        console.error(`  ❌ ${tpl.title} 로그 생성 오류:`, logErr.message)
      }
    }

    console.log(`  ✓ ${tpl.title} 소스·잡·로그 생성`)
  }

  console.log('\n✅ 완료! /collect 탭에서 탭 전환 및 필터를 확인하세요.')
}

seed().catch(e => {
  console.error('오류:', e)
  process.exit(1)
})
