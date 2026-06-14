#!/usr/bin/env node
/**
 * 데이터 파이프라인 탭 UI/UX 검증용 테스트 데이터 시더
 * catalog/submission_uploads에 이미 적재된 샘플 데이터를 기반으로
 * submissions, processing_pipelines, collection_sources, analysis_records 등을 생성한다.
 *
 * 사용법:
 *   source .env.local && node scripts/seed-pipeline-test-data.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

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
const SAMPLES = [
  { datasetId: 'ds-air-quality', title: '경남 대기질 측정 데이터', theme: '환경', rows: 184 },
  { datasetId: 'ds-commercial-area', title: '경남 상권 현황', theme: '상권', rows: 216 },
  { datasetId: 'ds-public-hospital', title: '경남 공공병원 현황', theme: '보건', rows: 27 },
  { datasetId: 'ds-school-population', title: '경남 학교 및 교육 인구', theme: '교육', rows: 144 },
  { datasetId: 'ds-traffic-accident', title: '경남 교통사고 현황', theme: '교통', rows: 452 },
]

async function ensureTenant() {
  const { data } = await supabase.from('tenants').select('tenant_id').eq('tenant_id', TEST_TENANT).maybeSingle()
  if (!data) {
    await supabase.from('tenants').insert({
      tenant_id: TEST_TENANT,
      name: '파이프라인 테스트 기관',
      description: 'UI/UX 검증용 테스트 기관',
      is_active: true,
      created_at: new Date().toISOString(),
    })
    console.log(`  ✓ 테스트 기관 생성: ${TEST_TENANT}`)
  }
}

async function seedSubmissions() {
  for (const s of SAMPLES) {
    const { data: existing } = await supabase
      .from('submissions')
      .select('submission_id')
      .eq('table_name', s.datasetId)
      .maybeSingle()
    if (existing) {
      console.log(`  ℹ skip: ${s.title} (이미 등록됨)`)
      continue
    }
    const submissionId = randomUUID().replace(/-/g, '')
    const { error } = await supabase.from('submissions').insert({
      submission_id: submissionId,
      tenant_id: TEST_TENANT,
      title: s.title,
      description: `${s.title} - 테스트 데이터셋입니다.`,
      theme: s.theme,
      keywords: '경남,테스트,샘플',
      license: '공공누리 1유형',
      format: 'CSV',
      table_name: s.datasetId,
      rows: s.rows,
      status: Math.random() > 0.3 ? 'approved' : 'submitted',
      quality_summary: '규칙 3종 / 오류 0건 / 오류율 0% / 통과',
      submitted_at: new Date().toISOString(),
    })
    if (error) {
      console.error(`  ❌ ${s.title} 제출 생성 오류:`, error.message)
    } else {
      console.log(`  ✓ 제출 생성: ${s.title} (${s.rows}행)`)
    }
  }
}

async function seedPipelines() {
  const pipelines = [
    { name: '학교 인구 정제', source_dataset_id: 'ds-school-population', source_kind: 'catalog', rulesCount: 3 },
    { name: '대기질 컬럼 표준화', source_dataset_id: 'ds-air-quality', source_kind: 'catalog', rulesCount: 2 },
  ]
  for (const p of pipelines) {
    const { data: existing } = await supabase
      .from('processing_pipelines')
      .select('id')
      .eq('name', p.name)
      .eq('tenant_id', TEST_TENANT)
      .maybeSingle()
    if (existing) {
      console.log(`  ℹ skip: ${p.name} (이미 등록됨)`)
      continue
    }
    const id = 'proc_' + Math.random().toString(36).slice(2, 10)
    const { error } = await supabase.from('processing_pipelines').insert({
      id,
      tenant_id: TEST_TENANT,
      name: p.name,
      description: '파이프라인 UI 검증용',
      source_kind: p.source_kind,
      source_dataset_id: p.source_dataset_id,
      rules: Array.from({ length: p.rulesCount }, (_, i) => ({ type: 'select', mode: 'include', columns: ['col' + i] })),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    if (error) {
      console.error(`  ❌ ${p.name} 파이프라인 생성 오류:`, error.message)
    } else {
      console.log(`  ✓ 파이프라인 생성: ${p.name}`)
    }
  }
}

async function seedCollectionSources() {
  const sources = [
    { title: '공공데이터포털 대기질 API', url: 'https://api.data.go.kr/sample/air', format: 'json' },
    { title: '경남 교통사고 CSV', url: 'https://example.com/traffic.csv', format: 'csv' },
  ]
  for (const s of sources) {
    const { data: existing } = await supabase
      .from('collection_sources')
      .select('source_id')
      .eq('title', s.title)
      .eq('tenant_id', TEST_TENANT)
      .maybeSingle()
    if (existing) {
      console.log(`  ℹ skip: ${s.title} (이미 등록됨)`)
      continue
    }
    const sourceId = 'csrc_' + Math.random().toString(36).slice(2, 10)
    const jobId = 'cjob_' + Math.random().toString(36).slice(2, 10)
    const now = new Date().toISOString()
    const { error: srcErr } = await supabase.from('collection_sources').insert({
      source_id: sourceId,
      tenant_id: TEST_TENANT,
      title: s.title,
      url: s.url,
      method: 'GET',
      auth_type: 'none',
      resp_format: s.format,
      created_at: now,
      updated_at: now,
    })
    if (srcErr) {
      console.error(`  ❌ ${s.title} 소스 생성 오류:`, srcErr.message)
      continue
    }
    await supabase.from('collection_jobs').insert({
      job_id: jobId,
      source_id: sourceId,
      tenant_id: TEST_TENANT,
      schedule_type: 'manual',
      status: 'success',
      enabled: true,
      last_run_at: now,
    })
    console.log(`  ✓ 수집 소스 생성: ${s.title}`)
  }
}

async function seedAnalysisRecords() {
  const records = [
    { title: '경남 청년 인구 이동패턴 분석', purpose: '정책활용', datasets_used: ['ds-school-population'] },
    { title: '대기질과 교통사고 상관관계 분석', purpose: '서비스개선', datasets_used: ['ds-air-quality', 'ds-traffic-accident'] },
  ]
  for (const r of records) {
    const { data: existing } = await supabase
      .from('analysis_records')
      .select('record_id')
      .eq('title', r.title)
      .eq('tenant_id', TEST_TENANT)
      .maybeSingle()
    if (existing) {
      console.log(`  ℹ skip: ${r.title} (이미 등록됨)`)
      continue
    }
    const { error } = await supabase.from('analysis_records').insert({
      record_id: randomUUID(),
      tenant_id: TEST_TENANT,
      title: r.title,
      purpose: r.purpose,
      datasets_used: r.datasets_used,
      result_summary: '테스트 분석 실적입니다.',
      policy_applied: true,
      performed_at: new Date().toISOString().slice(0, 10),
    })
    if (error) {
      console.error(`  ❌ ${r.title} 분석 실적 생성 오류:`, error.message)
    } else {
      console.log(`  ✓ 분석 실적 생성: ${r.title}`)
    }
  }
}

async function main() {
  console.log('▶ 파이프라인 테스트 데이터를 시딩합니다...')
  await ensureTenant()
  await seedSubmissions()
  await seedPipelines()
  await seedCollectionSources()
  await seedAnalysisRecords()
  console.log('\n✅ 완료! /pipeline 데이터 처리 흐름 탭에서 통계를 확인하세요.')
}

main().catch(e => {
  console.error('오류:', e)
  process.exit(1)
})
