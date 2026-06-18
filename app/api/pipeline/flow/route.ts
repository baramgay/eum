import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type StepStatus = 'success' | 'running' | 'failed' | 'idle'

interface FlowItem {
  id: string
  title: string
  status: string
  detail?: string
  tenant_id?: string
}

interface PipelineStep {
  key: string
  label: string
  desc: string
  status: StepStatus
  count: number
  lastAt: string | null
  nextAt?: string | null
  href: string
  items: FlowItem[]
}

interface TimelineRun {
  id: string
  started_at: string
  source: 'collect' | 'process' | 'analyze' | 'quality' | 'open'
  source_label: string
  status: StepStatus
  message: string
  tenant_id?: string
}

interface FlowResponse {
  steps: PipelineStep[]
  runs: TimelineRun[]
  stats: {
    collectCount: number
    processCount: number
    analyzeCount: number
    qualityPass: number
    qualityTotal: number
    openCount: number
  }
}

function toIso(d: string | null | undefined): string | null {
  if (!d) return null
  const t = new Date(d)
  return isNaN(t.getTime()) ? null : t.toISOString()
}

function stepStatusFromRun(status?: string | null): StepStatus {
  if (status === 'running') return 'running'
  if (status === 'done' || status === 'success' || status === 'approved') return 'success'
  if (status === 'failed' || status === 'error' || status === 'rejected') return 'failed'
  return 'idle'
}

function aggregateStatus(items: { status?: string | null }[]): StepStatus {
  if (items.length === 0) return 'idle'
  const statuses = items.map(i => stepStatusFromRun(i.status))
  if (statuses.includes('running')) return 'running'
  if (statuses.includes('failed')) return 'failed'
  if (statuses.some(s => s === 'success')) return 'success'
  return 'idle'
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    return NextResponse.json({ error: '인증되지 않았습니다' }, { status: 401 })
  }

  const role = user.user_metadata?.role as string | undefined
  const userTenant = user.user_metadata?.tenant_id as string | undefined
  const isCenter = role === 'center'

  // ── 병렬 조회 ──
  const [
    { data: sources },
    { data: jobs },
    { data: logs },
    { data: pipelines },
    { data: processRuns },
    { data: analysisRuns },
    { data: qualityResults },
    { data: openCatalog },
    { data: tenantCatalog },
  ] = await Promise.all([
    supabase.from('collection_sources').select('source_id,tenant_id,title,url'),
    supabase.from('collection_jobs').select('job_id,source_id,tenant_id,status,schedule_type,last_run_at,next_run_at'),
    supabase
      .from('collection_logs')
      .select('log_id,source_id,tenant_id,started_at,finished_at,status,rows_fetched,error_msg')
      .order('started_at', { ascending: false })
      .limit(20),
    supabase.from('processing_pipelines').select('id,tenant_id,name,source_kind,source_dataset_id'),
    supabase
      .from('processing_runs')
      .select('id,pipeline_id,tenant_id,status,input_rows,output_rows,error_rows,result_dataset_id,started_at,finished_at')
      .order('started_at', { ascending: false })
      .limit(20),
    supabase
      .from('analysis_runs')
      .select('id,tenant_id,analysis_type,dataset_label,result_title,created_at')
      .order('created_at', { ascending: false })
      .limit(20),
    supabase.from('quality_results').select('dataset_id,passed,error_rate,detail,ran_at').order('ran_at', { ascending: false }),
    supabase.from('catalog').select('dataset_id,tenant_id,title,is_open,updated_at').eq('is_open', true).order('updated_at', { ascending: false }).limit(20),
    isCenter ? Promise.resolve({ data: null }) : supabase.from('catalog').select('dataset_id').eq('tenant_id', userTenant ?? ''),
  ])

  // tenant 필터링 (RLS가 있지만 이중화)
  const filterByTenant = <T extends { tenant_id?: string | null }>(arr: T[] | null): T[] => {
    if (!arr) return []
    if (isCenter || !userTenant) return arr
    return arr.filter(x => x.tenant_id === userTenant)
  }

  const srcList = filterByTenant(sources)
  const jobList = filterByTenant(jobs)
  const logList = filterByTenant(logs)
  const pipeList = filterByTenant(pipelines)
  const procRuns = filterByTenant(processRuns)
  const anaRuns = filterByTenant(analysisRuns)
  const openList = filterByTenant(openCatalog)

  // quality_results에는 tenant_id가 없어 catalog.dataset_id로 매핑해 필터링
  const tenantDatasetIds = new Set((tenantCatalog ?? []).map((c: { dataset_id: string }) => c.dataset_id))
  const qualList = isCenter
    ? (qualityResults ?? [])
    : (qualityResults ?? []).filter(q => tenantDatasetIds.has(q.dataset_id))

  // 수집 단계
  const lastCollectRun = logList[0] ?? null
  const nextCollectRun = jobList
    .filter(j => j.next_run_at)
    .sort((a, b) => new Date(a.next_run_at!).getTime() - new Date(b.next_run_at!).getTime())[0]
  const collectItems: FlowItem[] = srcList.map(s => {
    const job = jobList.find(j => j.source_id === s.source_id)
    return {
      id: s.source_id,
      title: s.title,
      status: job?.status ?? 'idle',
      detail: job?.last_run_at ? `마지막 실행: ${new Date(job.last_run_at).toLocaleString('ko-KR')}` : '아직 실행되지 않음',
      tenant_id: s.tenant_id ?? undefined,
    }
  })

  // 가공 단계
  const lastProcessRun = procRuns[0] ?? null
  const processItems: FlowItem[] = pipeList.map(p => {
    const last = procRuns.find(r => r.pipeline_id === p.id)
    return {
      id: p.id,
      title: p.name,
      status: last?.status ?? 'idle',
      detail: `${SOURCE_KIND_LABEL[p.source_kind] ?? p.source_kind}: ${p.source_dataset_id}`,
      tenant_id: p.tenant_id ?? undefined,
    }
  })

  // 분석 단계
  const analyzeItems: FlowItem[] = anaRuns.slice(0, 10).map(a => ({
    id: a.id,
    title: a.result_title || `${ANALYSIS_LABEL[a.analysis_type] ?? a.analysis_type}: ${a.dataset_label}`,
    status: 'success',
    detail: `분석 유형: ${ANALYSIS_LABEL[a.analysis_type] ?? a.analysis_type}`,
    tenant_id: a.tenant_id ?? undefined,
  }))

  // 품질 단계
  const qualityPass = qualList.filter(q => q.passed).length
  const qualityItems: FlowItem[] = qualList.slice(0, 10).map(q => ({
    id: q.dataset_id,
    title: q.dataset_id,
    status: q.passed ? 'success' : 'failed',
    detail: `오류율 ${(q.error_rate * 100).toFixed(3)}%`,
  }))

  // 개방 단계
  const openItems: FlowItem[] = openList.slice(0, 10).map(c => ({
    id: c.dataset_id,
    title: c.title || c.dataset_id,
    status: 'success',
    detail: c.updated_at ? `개방일: ${new Date(c.updated_at).toLocaleDateString('ko-KR')}` : undefined,
    tenant_id: c.tenant_id ?? undefined,
  }))

  const steps: PipelineStep[] = [
    {
      key: 'collect',
      label: '수집',
      desc: '시군 공공DB · API · 파일',
      status: aggregateStatus(jobList.map(j => ({ status: j.status }))),
      count: srcList.length,
      lastAt: toIso(lastCollectRun?.started_at),
      nextAt: toIso(nextCollectRun?.next_run_at),
      href: '/collect',
      items: collectItems,
    },
    {
      key: 'process',
      label: '가공',
      desc: '정제·표준화·파생변수',
      status: aggregateStatus(procRuns.map(r => ({ status: r.status }))),
      count: pipeList.length,
      lastAt: toIso(lastProcessRun?.started_at),
      href: '/process',
      items: processItems,
    },
    {
      key: 'analyze',
      label: '분석',
      desc: '통계·머신러닝·시계열',
      status: analyzeItems.length > 0 ? 'success' : 'idle',
      count: analyzeItems.length,
      lastAt: toIso(anaRuns[0]?.created_at),
      href: '/analytics',
      items: analyzeItems,
    },
    {
      key: 'quality',
      label: '품질',
      desc: '규칙기반 진단·오류율',
      status: qualList.length > 0 ? (qualityPass === qualList.length ? 'success' : 'failed') : 'idle',
      count: qualList.length,
      lastAt: toIso(qualList[0]?.ran_at),
      href: '/quality',
      items: qualityItems,
    },
    {
      key: 'open',
      label: '개방',
      desc: '포털 등록·API·카탈로그',
      status: openList.length > 0 ? 'success' : 'idle',
      count: openList.length,
      lastAt: toIso(openList[0]?.updated_at),
      href: '/portal',
      items: openItems,
    },
  ]

  // 통합 실행 이력: 수집·가공·분석·품질·개방 이벤트를 시간순으로 병합
  const runs: TimelineRun[] = [
    ...logList.map(l => ({
      id: l.log_id,
      started_at: toIso(l.started_at) ?? new Date().toISOString(),
      source: 'collect' as const,
      source_label: '수집',
      status: stepStatusFromRun(l.status),
      message: l.status === 'done'
        ? `${(l.rows_fetched ?? 0).toLocaleString()}행 수집 완료`
        : (l.error_msg ?? `상태: ${l.status}`),
      tenant_id: l.tenant_id ?? undefined,
    })),
    ...procRuns.map(r => ({
      id: r.id,
      started_at: toIso(r.started_at) ?? new Date().toISOString(),
      source: 'process' as const,
      source_label: '가공',
      status: stepStatusFromRun(r.status),
      message: r.status === 'done'
        ? `입력 ${(r.input_rows ?? 0).toLocaleString()}행 → 출력 ${(r.output_rows ?? 0).toLocaleString()}행`
        : (r.error_rows && r.error_rows > 0 ? `오류 ${r.error_rows}건` : `상태: ${r.status}`),
      tenant_id: r.tenant_id ?? undefined,
    })),
    ...anaRuns.map(a => ({
      id: a.id,
      started_at: toIso(a.created_at) ?? new Date().toISOString(),
      source: 'analyze' as const,
      source_label: '분석',
      status: 'success' as const,
      message: a.result_title || `${ANALYSIS_LABEL[a.analysis_type] ?? a.analysis_type} 분석 실행`,
      tenant_id: a.tenant_id ?? undefined,
    })),
    ...qualList.slice(0, 10).map(q => ({
      id: `${q.dataset_id}-${q.ran_at ?? 'latest'}`,
      started_at: toIso(q.ran_at) ?? new Date().toISOString(),
      source: 'quality' as const,
      source_label: '품질',
      status: (q.passed ? 'success' : 'failed') as StepStatus,
      message: q.passed ? '품질진단 통과' : `오류율 ${(q.error_rate * 100).toFixed(3)}%`,
    })),
    ...openList.slice(0, 10).map(c => ({
      id: c.dataset_id,
      started_at: toIso(c.updated_at) ?? new Date().toISOString(),
      source: 'open' as const,
      source_label: '개방',
      status: 'success' as const,
      message: c.title || c.dataset_id,
      tenant_id: c.tenant_id ?? undefined,
    })),
  ]
    .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
    .slice(0, 20)

  const response: FlowResponse = {
    steps,
    runs,
    stats: {
      collectCount: srcList.length,
      processCount: pipeList.length,
      analyzeCount: anaRuns.length,
      qualityPass,
      qualityTotal: qualList.length,
      openCount: openList.length,
    },
  }

  return NextResponse.json(response)
}

const SOURCE_KIND_LABEL: Record<string, string> = {
  upload: '업로드',
  catalog: '카탈로그',
  gold: 'Gold 테이블',
}

const ANALYSIS_LABEL: Record<string, string> = {
  descriptive: '기술통계',
  correlation: '상관분석',
  regression: '회귀분석',
  ttest: 't-검정',
  anova: '분산분석',
  chi2: '카이제곱',
  pca: '주성분분석',
  clustering: '군집분석',
  survival: '생존분석',
  timeseries_decompose: '시계엘리분해',
}
