'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Upload, Database, ChevronDown, ChevronRight, PlayCircle,
  X, AlertCircle, Loader2, BarChart2, Info, Download, Search,
} from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, ScatterChart, Scatter,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'

// ────────────────────────────────────────────
// 타입
// ────────────────────────────────────────────

type ColType = 'scale' | 'nominal' | 'ordinal'

interface Column {
  name: string
  type: ColType
}

interface SessionState {
  session_id: string
  columns: Column[]
  total_rows: number
  preview: Record<string, unknown>[]
  source_label: string
  column_values: Record<string, string[]>
}

interface AnalysisResult {
  ok: boolean
  title?: string
  tables?: ResultTable[]
  charts?: ChartSpec[]
  error?: string
}

interface ResultTable {
  title: string
  headers: string[]
  rows: (string | number | null)[][]
  footnotes?: string[]
}

interface ChartSpec {
  type: 'bar' | 'line' | 'scatter' | 'pie' | 'heatmap'
  title: string
  data: Record<string, unknown>[]
  xKey?: string
  yKey?: string
  valueKey?: string
  stackKeys?: string[]
  groupKey?: string
}

// ────────────────────────────────────────────
// 분석 메뉴
// ────────────────────────────────────────────

interface AnalysisMenuItem {
  id: string
  label: string
  desc: string
  variableSlots: VariableSlot[]
  options?: OptionField[]
}

interface VariableSlot {
  key: string
  label: string
  multi: boolean
  filter?: ColType[]
}

interface OptionField {
  key: string
  label: string
  type: 'select'
  choices: { value: string; label: string }[]
  default: string
}

const ANALYSIS_MENU: { group: string; items: AnalysisMenuItem[] }[] = [
  {
    group: '기술통계',
    items: [
      {
        id: 'descriptives',
        label: '기술통계량',
        desc: '평균·표준편차·사분위수·왜도·첨도',
        variableSlots: [{ key: 'variables', label: '분석 변수', multi: true, filter: ['scale'] }],
      },
      {
        id: 'frequencies',
        label: '빈도 분석',
        desc: '범주별 빈도·백분율·누적',
        variableSlots: [{ key: 'variables', label: '분석 변수', multi: true }],
      },
      {
        id: 'normality',
        label: '정규성 검정',
        desc: 'Shapiro-Wilk / KS 검정',
        variableSlots: [{ key: 'variables', label: '검정 변수', multi: true, filter: ['scale'] }],
      },
    ],
  },
  {
    group: '교차·상관',
    items: [
      {
        id: 'crosstab',
        label: '교차 분석',
        desc: '교차표 + 카이제곱 검정 + Cramér\'s V',
        variableSlots: [
          { key: 'row',    label: '행 변수', multi: false, filter: ['nominal', 'ordinal'] },
          { key: 'column', label: '열 변수', multi: false, filter: ['nominal', 'ordinal'] },
        ],
      },
      {
        id: 'chi_square_test',
        label: '카이제곱 독립성 검정',
        desc: '두 범주 변수 간 독립성 검정 + 히트맵',
        variableSlots: [
          { key: 'variable1', label: '변수 1', multi: false, filter: ['nominal', 'ordinal'] },
          { key: 'variable2', label: '변수 2', multi: false, filter: ['nominal', 'ordinal'] },
        ],
      },
      {
        id: 'correlation',
        label: '상관 분석',
        desc: '피어슨 / 스피어만 상관계수 행렬',
        variableSlots: [{ key: 'variables', label: '분석 변수', multi: true, filter: ['scale'] }],
        options: [
          {
            key: 'method', label: '방법', type: 'select',
            choices: [{ value: 'pearson', label: '피어슨(Pearson)' }, { value: 'spearman', label: '스피어만(Spearman)' }],
            default: 'pearson',
          },
        ],
      },
    ],
  },
  {
    group: '평균 비교',
    items: [
      {
        id: 'independent_ttest',
        label: '독립표본 t-검정',
        desc: '두 집단 평균 비교 (Levene 분산 동질성)',
        variableSlots: [
          { key: 'dependent', label: '종속 변수', multi: false, filter: ['scale'] },
          { key: 'group',     label: '집단 변수', multi: false, filter: ['nominal', 'ordinal'] },
        ],
      },
      {
        id: 'one_way_anova',
        label: '일원분산분석(ANOVA)',
        desc: '3개 이상 집단 평균 비교 + Tukey HSD',
        variableSlots: [
          { key: 'dependent', label: '종속 변수', multi: false, filter: ['scale'] },
          { key: 'factor',    label: '요인 변수', multi: false, filter: ['nominal', 'ordinal'] },
        ],
      },
      {
        id: 'paired_ttest',
        label: '대응표본 t-검정',
        desc: '동일 대상의 두 측정값 평균 비교',
        variableSlots: [
          { key: 'variable1', label: '첫 번째 변수', multi: false, filter: ['scale'] },
          { key: 'variable2', label: '두 번째 변수', multi: false, filter: ['scale'] },
        ],
      },
      {
        id: 'mann_whitney_u',
        label: 'Mann-Whitney U 검정',
        desc: '비모수 독립표본 검정 (중앙값 비교)',
        variableSlots: [
          { key: 'dependent', label: '종속 변수', multi: false, filter: ['scale'] },
          { key: 'group',     label: '집단 변수', multi: false, filter: ['nominal', 'ordinal'] },
        ],
      },
      {
        id: 'wilcoxon_signed_rank',
        label: 'Wilcoxon Signed-Rank 검정',
        desc: '비모수 대응표본 검정',
        variableSlots: [
          { key: 'variable1', label: '첫 번째 변수', multi: false, filter: ['scale'] },
          { key: 'variable2', label: '두 번째 변수', multi: false, filter: ['scale'] },
        ],
      },
    ],
  },
  {
    group: '회귀·분류',
    items: [
      {
        id: 'linear_regression',
        label: '선형 회귀분석',
        desc: 'OLS 회귀계수·R²·VIF 다중공선성',
        variableSlots: [
          { key: 'dependent',  label: '종속 변수', multi: false, filter: ['scale'] },
          { key: 'predictors', label: '예측 변수', multi: true,  filter: ['scale'] },
        ],
      },
      {
        id: 'logistic_regression',
        label: '이항 로지스틱 회귀',
        desc: 'Odds Ratio·AIC/BIC·예측확률',
        variableSlots: [
          { key: 'dependent',  label: '종속 변수(0/1)', multi: false, filter: ['scale', 'nominal'] },
          { key: 'predictors', label: '예측 변수',       multi: true,  filter: ['scale'] },
        ],
      },
    ],
  },
  {
    group: '고급 분석',
    items: [
      {
        id: 'pca',
        label: '주성분분석(PCA)',
        desc: '차원 축소·Scree plot·PC 산점도',
        variableSlots: [{ key: 'variables', label: '분석 변수', multi: true, filter: ['scale'] }],
        options: [
          {
            key: 'n_components', label: '추출 성분 수', type: 'select',
            choices: [
              { value: '2', label: '2개' },
              { value: '3', label: '3개' },
              { value: '4', label: '4개' },
            ],
            default: '2',
          },
        ],
      },
      {
        id: 'kmeans_clustering',
        label: 'K-Means 클러스터링',
        desc: '비지도 클러스터링·클러스터 산점도',
        variableSlots: [{ key: 'variables', label: '분석 변수', multi: true, filter: ['scale'] }],
        options: [
          {
            key: 'k', label: '클러스터 수(k)', type: 'select',
            choices: [
              { value: '2', label: '2' },
              { value: '3', label: '3' },
              { value: '4', label: '4' },
              { value: '5', label: '5' },
            ],
            default: '3',
          },
        ],
      },
      {
        id: 'survival',
        label: '생존 분석 (Kaplan-Meier)',
        desc: 'KM 생존 함수 + 중앙생존시간 + Log-rank 검정',
        variableSlots: [
          { key: 'duration', label: '기간(시간) 변수', multi: false, filter: ['scale'] },
          { key: 'event',    label: '이벤트 변수 (0/1)', multi: false, filter: ['scale', 'nominal'] },
          { key: 'group',    label: '집단 변수 (선택)', multi: false, filter: ['nominal', 'ordinal'] },
        ],
        options: [
          {
            key: 'ci_show', label: '신뢰구간 표시', type: 'select',
            choices: [{ value: 'yes', label: '표시' }, { value: 'no', label: '숨김' }],
            default: 'yes',
          },
        ],
      },
      {
        id: 'timeseries_decompose',
        label: '시계열 분해 (STL)',
        desc: '추세·계절성·잔차 분해 — STL(Seasonal-Trend using Loess)',
        variableSlots: [
          { key: 'variable', label: '시계열 값 변수', multi: false, filter: ['scale'] },
          { key: 'date_col', label: '날짜 컬럼 (선택)', multi: false, filter: ['nominal'] },
        ],
        options: [
          {
            key: 'period', label: '주기(Period)', type: 'select',
            choices: [
              { value: '4',  label: '4 (분기)' },
              { value: '7',  label: '7 (주간)' },
              { value: '12', label: '12 (월별)' },
              { value: '52', label: '52 (주별/연간)' },
            ],
            default: '12',
          },
        ],
      },
    ],
  },
]

// ────────────────────────────────────────────
// 서브컴포넌트: 결과 테이블
// ────────────────────────────────────────────

function ResultTableView({ table }: { table: ResultTable }) {
  return (
    <div className="mb-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{table.title}</p>
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {table.headers.map((h, i) => (
                <th key={i} className="px-3 py-2 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, ri) => (
              <tr key={ri} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                {row.map((cell, ci) => (
                  <td key={ci} className={`px-3 py-2 text-gray-700 whitespace-nowrap font-mono text-xs
                    ${ci === 0 ? 'font-medium text-gray-800 font-sans' : ''}`}>
                    {cell === null || cell === '' ? <span className="text-gray-300">—</span> : String(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {table.footnotes?.map((fn, i) => (
        <p key={i} className="text-xs text-gray-400 mt-1">{fn}</p>
      ))}
    </div>
  )
}

// ────────────────────────────────────────────
// 서브컴포넌트: 결과 차트
// ────────────────────────────────────────────

const CHART_COLORS = ['#3B82F6', '#F59E0B', '#10B981', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16']

function formatTick(value: unknown): string {
  if (typeof value === 'number') {
    if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
    if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}k`
    if (Math.abs(value) >= 1) return value.toFixed(value % 1 === 0 ? 0 : 1)
    return value.toFixed(3)
  }
  return String(value ?? '')
}

function HeatmapChart({ chart }: { chart: ChartSpec }) {
  const data = chart.data
  const valueKey = chart.valueKey ?? 'value'
  const xValues = useMemo(() => Array.from(new Set(data.map(d => String(d.x)))), [data])
  const yValues = useMemo(() => Array.from(new Set(data.map(d => String(d.y)))), [data])
  const values = data.map(d => Number(d[valueKey] ?? NaN)).filter(v => !Number.isNaN(v))
  const min = values.length ? Math.min(...values) : 0
  const max = values.length ? Math.max(...values) : 0
  const range = max - min || 1

  const cellSize = 36
  const labelWidth = 90
  const labelHeight = 32
  const width = Math.max(280, labelWidth + xValues.length * cellSize + 16)
  const height = labelHeight + yValues.length * cellSize + 24

  const colorFor = (v: number | null) => {
    if (v === null || Number.isNaN(v)) return '#F3F4F6'
    const t = range === 0 ? 0.5 : (v - min) / range
    // 파랑 → 흰색 → 빨강
    if (t < 0.5) {
      const s = t * 2
      return `rgb(${Math.round(59 + (255 - 59) * s)}, ${Math.round(130 + (255 - 130) * s)}, ${Math.round(246 + (255 - 246) * s)})`
    }
    const s = (t - 0.5) * 2
    return `rgb(${Math.round(255 + (239 - 255) * s)}, ${Math.round(255 + (68 - 255) * s)}, ${Math.round(255 + (68 - 255) * s)})`
  }

  return (
    <div className="overflow-x-auto">
      <svg width={width} height={height} className="block">
        <text x={4} y={labelHeight - 8} className="text-xs fill-gray-500">{chart.yKey ?? 'y'}</text>
        {xValues.map((x, i) => (
          <text key={x} x={labelWidth + i * cellSize + cellSize / 2} y={labelHeight - 6} textAnchor="middle" className="text-[10px] fill-gray-500">{x}</text>
        ))}
        {yValues.map((y, j) => (
          <text key={y} x={labelWidth - 8} y={labelHeight + j * cellSize + cellSize / 2 + 4} textAnchor="end" className="text-[10px] fill-gray-500">{y}</text>
        ))}
        {data.map((d, i) => {
          const xi = xValues.indexOf(String(d.x))
          const yj = yValues.indexOf(String(d.y))
          if (xi < 0 || yj < 0) return null
          const v = d[valueKey] as number | null
          return (
            <g key={i}>
              <rect
                x={labelWidth + xi * cellSize}
                y={labelHeight + yj * cellSize}
                width={cellSize - 2}
                height={cellSize - 2}
                fill={colorFor(v)}
                stroke="#E5E7EB"
                strokeWidth={0.5}
              />
              {v !== null && !Number.isNaN(v) && (
                <text
                  x={labelWidth + xi * cellSize + (cellSize - 2) / 2}
                  y={labelHeight + yj * cellSize + (cellSize - 2) / 2 + 4}
                  textAnchor="middle"
                  className="text-[9px] fill-gray-700"
                >
                  {formatTick(v)}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
        <span>{formatTick(min)}</span>
        <div className="w-24 h-2 rounded" style={{ background: 'linear-gradient(to right, #3B82F6, #FFFFFF, #EF4444)' }} />
        <span>{formatTick(max)}</span>
      </div>
    </div>
  )
}

function ResultCharts({ charts }: { charts: ChartSpec[] }) {
  return (
    <div className="space-y-6 mt-6">
      {charts.map((chart, idx) => {
        const data = chart.data ?? []
        if (data.length === 0) return null

        return (
          <div key={idx} className="bg-gray-50 rounded-xl border border-gray-100 p-4">
            <p className="text-xs font-semibold text-gray-600 mb-3">{chart.title}</p>
            {chart.type === 'heatmap' && <HeatmapChart chart={chart} />}

            {chart.type === 'bar' && (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey={chart.xKey ?? 'name'} tick={{ fontSize: 11 }} interval={0} angle={data.length > 8 ? 30 : 0} height={data.length > 8 ? 50 : 30} />
                  <YAxis tickFormatter={formatTick} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: unknown) => [formatTick(v), chart.yKey ?? '값']} />
                  {chart.stackKeys && chart.stackKeys.length > 0 ? (
                    chart.stackKeys.map((k, i) => <Bar key={k} dataKey={k} stackId="a" fill={CHART_COLORS[i % CHART_COLORS.length]} />)
                  ) : (
                    <Bar dataKey={chart.yKey ?? 'value'} fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
                  )}
                </BarChart>
              </ResponsiveContainer>
            )}

            {chart.type === 'line' && (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey={chart.xKey ?? 'name'} tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={formatTick} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  {chart.yKey ? (
                    <Line type="monotone" dataKey={chart.yKey} stroke={CHART_COLORS[0]} strokeWidth={2} dot={{ r: 3 }} />
                  ) : (
                    Object.keys(data[0] ?? {}).filter(k => k !== chart.xKey).map((k, i) => (
                      <Line key={k} type="monotone" dataKey={k} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={{ r: 3 }} />
                    ))
                  )}
                </LineChart>
              </ResponsiveContainer>
            )}

            {chart.type === 'scatter' && (
              <ResponsiveContainer width="100%" height={320}>
                <ScatterChart margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" dataKey={chart.xKey ?? 'x'} name={chart.xKey ?? 'x'} tickFormatter={formatTick} tick={{ fontSize: 11 }} />
                  <YAxis type="number" dataKey={chart.yKey ?? 'y'} name={chart.yKey ?? 'y'} tickFormatter={formatTick} tick={{ fontSize: 11 }} />
                  <Tooltip cursor={{ strokeDasharray: '3 3' }} formatter={(v: unknown) => formatTick(v)} />
                  {chart.groupKey ? (
                    (() => {
                      const groups = Array.from(new Set(data.map(d => String(d[chart.groupKey!]))))
                      return groups.map((g, i) => (
                        <Scatter
                          key={g}
                          name={g}
                          data={data.filter(d => String(d[chart.groupKey!]) === g)}
                          fill={CHART_COLORS[i % CHART_COLORS.length]}
                        />
                      ))
                    })()
                  ) : (
                    <Scatter data={data} fill={CHART_COLORS[0]} />
                  )}
                  <Legend />
                </ScatterChart>
              </ResponsiveContainer>
            )}

            {chart.type === 'pie' && (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={data}
                    dataKey={chart.yKey ?? 'value'}
                    nameKey={chart.xKey ?? 'name'}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    label={({ name, percent }) => `${name ?? ''}: ${((percent ?? 0) * 100).toFixed(0)}%`}
                  >
                    {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        )
      })}
    </div>
  )
}


// ────────────────────────────────────────────
// 메인 컴포넌트
// ────────────────────────────────────────────

interface CatalogItem { id: string; title: string; theme?: string }

interface RunItem {
  id: string
  analysis_type: string
  dataset_label: string
  result_title?: string
  created_at: string
}

interface Props { role: string; tenantId: string }

export default function AnalyticsClient({ role, tenantId }: Props) {
  const searchParams = useSearchParams()

  const [session, setSession]   = useState<SessionState | null>(null)
  const [loading, setLoading]   = useState(false)
  const [loadError, setLoadError] = useState('')

  const [selectedAnalysis, setSelectedAnalysis] = useState<AnalysisMenuItem | null>(null)
  const [assigned, setAssigned] = useState<Record<string, string[]>>({})
  const [groupValues, setGroupValues] = useState<string[]>([])
  const [optValues, setOptValues] = useState<Record<string, string>>({})

  const [running, setRunning]   = useState(false)
  const [result, setResult]     = useState<AnalysisResult | null>(null)
  const [showPreview, setShowPreview] = useState(false)

  const [showCatalogPicker, setShowCatalogPicker] = useState(false)
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([])
  const [catalogSearch, setCatalogSearch] = useState('')
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogError, setCatalogError] = useState('')

  const [runs, setRuns] = useState<RunItem[]>([])
  const [runsLoading, setRunsLoading] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── 데이터 로드 ──────────────────────────────

  async function handleFileUpload(file: File) {
    setLoading(true); setLoadError('')
    const fd = new FormData()
    fd.append('file', file)
    try {
      const res = await fetch('/api/analyze/upload', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? res.statusText)
      setSession({
        session_id: json.session_id,
        columns: (json.columns as string[]).map((n: string) => ({
          name: n,
          type: (json.column_types?.[n] ?? 'nominal') as ColType,
        })),
        total_rows: json.total_rows,
        preview: json.preview ?? [],
        source_label: file.name,
        column_values: (json.column_values as Record<string, string[]>) ?? {},
      })
      setResult(null)
      setSelectedAnalysis(null)
      setAssigned({})
    } catch (e) {
      setLoadError(String(e))
    } finally {
      setLoading(false)
    }
  }

  async function loadCatalogById(catalogId: string, label?: string) {
    setLoading(true); setLoadError('')
    try {
      const res = await fetch(`/api/catalog/${catalogId.trim()}/download?format=json`)
      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        throw new Error(`카탈로그 조회 실패: ${res.status} ${errText.slice(0, 200)}`)
      }
      const text = await res.text()
      let rows: unknown[] = []
      try {
        const parsed = JSON.parse(text)
        rows = Array.isArray(parsed) ? parsed : (parsed.rows ?? [])
      } catch {
        // NDJSON(줄 단위 JSON) 폭포 응답 지원
        rows = text
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0)
          .map(line => JSON.parse(line))
      }
      if (rows.length === 0) {
        throw new Error('카탈로그에 데이터가 없습니다.')
      }

      const sessionId = crypto.randomUUID().replace(/-/g, '')
      const analyzeRes = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'parse_json', session_id: sessionId, raw_json: rows }),
      })
      const analyzeJson = await analyzeRes.json()
      if (!analyzeRes.ok) throw new Error(analyzeJson.error ?? analyzeRes.statusText)

      setSession({
        session_id: analyzeJson.session_id,
        columns: (analyzeJson.columns as string[]).map((n: string) => ({
          name: n,
          type: (analyzeJson.column_types?.[n] ?? 'nominal') as ColType,
        })),
        total_rows: analyzeJson.total_rows,
        preview: analyzeJson.preview ?? [],
        source_label: label ?? catalogId,
        column_values: (analyzeJson.column_values as Record<string, string[]>) ?? {},
      })
      setResult(null)
      setSelectedAnalysis(null)
      setAssigned({})
    } catch (e) {
      setLoadError(String(e))
    } finally {
      setLoading(false)
    }
  }

  async function openCatalogPicker() {
    setShowCatalogPicker(true)
    setCatalogSearch('')
    setCatalogError('')
    if (catalogItems.length > 0) return
    setCatalogLoading(true)
    try {
      const res = await fetch('/api/catalog?page=1')
      if (!res.ok) throw new Error(`목록 조회 실패: ${res.status}`)
      const json = await res.json()
      const rawItems = Array.isArray(json) ? json : json.items ?? json.data ?? []
      const items: CatalogItem[] = rawItems
        .map((d: Record<string, unknown>) => ({
          id: String(d.dataset_id ?? d.id),
          title: String(d.title ?? d.dataset_id ?? d.id),
          theme: String(d.theme ?? ''),
        }))
        .filter((it: CatalogItem) => it.id && it.id !== 'undefined')
      setCatalogItems(items)
      if (items.length === 0) {
        setCatalogError('등록된 카탈로그가 없습니다. 관리자가 샘플 데이터를 적재한 후 다시 확인해 주세요.')
      }
    } catch (e) {
      setCatalogItems([])
      setCatalogError(`카탈로그 목록을 불러오지 못했습니다: ${String(e)}`)
    } finally {
      setCatalogLoading(false)
    }
  }

  async function loadRuns() {
    setRunsLoading(true)
    try {
      const res = await fetch('/api/analytics/runs?limit=5')
      if (!res.ok) throw new Error(`이력 조회 실패: ${res.status}`)
      const json = await res.json()
      const items: RunItem[] = Array.isArray(json) ? json : (json.items ?? [])
      setRuns(items)
    } catch {
      setRuns([])
    } finally {
      setRunsLoading(false)
    }
  }

  // dataset_id URL 파라미터 자동 로드 (ProcessClient "분석으로" 버튼 연동)
  useEffect(() => {
    const datasetId = searchParams?.get('dataset_id')
    if (datasetId && !session) {
      loadCatalogById(datasetId)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // 최근 분석 이력 로드
  useEffect(() => {
    loadRuns()
  }, [])

  // ── 변수 타입 변경 ───────────────────────────

  async function changeColType(colName: string, newType: ColType) {
    if (!session) return
    const updated = session.columns.map(c => c.name === colName ? { ...c, type: newType } : c)
    setSession({ ...session, columns: updated })
    // 서버 세션 업데이트
    await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update_types',
        session_id: session.session_id,
        column_types: { [colName]: newType },
      }),
    })
  }

  // ── 분석 선택 ────────────────────────────────

  function selectAnalysis(item: AnalysisMenuItem) {
    setSelectedAnalysis(item)
    setAssigned({})
    setGroupValues([])
    setResult(null)
    const defaults: Record<string, string> = {}
    item.options?.forEach(o => { defaults[o.key] = o.default })
    setOptValues(defaults)
  }

  // ── 변수 배정 ────────────────────────────────

  function assignVariable(slotKey: string, colName: string, multi: boolean) {
    setAssigned(prev => {
      const cur = prev[slotKey] ?? []
      if (multi) {
        return cur.includes(colName)
          ? { ...prev, [slotKey]: cur.filter(c => c !== colName) }
          : { ...prev, [slotKey]: [...cur, colName] }
      }
      return { ...prev, [slotKey]: cur[0] === colName ? [] : [colName] }
    })
  }

  // ── 분석 실행 ────────────────────────────────

  async function runAnalysis() {
    if (!session || !selectedAnalysis) return
    setRunning(true); setResult(null)
    try {
      const payload: Record<string, unknown> = {
        session_id: session.session_id,
        analysis_type: selectedAnalysis.id,
        variables: { ...assigned, group_values: groupValues },
        options: optValues,
      }
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      setResult(json)
      if (json.ok) {
        fetch('/api/analytics/runs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            analysis_type:  selectedAnalysis.id,
            dataset_label:  session.source_label,
            result_title:   json.title,
            result_summary: { table_count: json.tables?.length ?? 0, total_rows: session.total_rows },
          }),
        }).then(() => loadRuns()).catch(() => {})
      }
    } catch (e) {
      setResult({ ok: false, error: String(e) })
    } finally {
      setRunning(false)
    }
  }

  // ── CSV 내보내기 ─────────────────────────────

  function exportCSV() {
    if (!result?.tables || result.tables.length === 0) return
    const lines: string[] = []
    for (const table of result.tables) {
      lines.push(table.title)
      lines.push(table.headers.join(','))
      for (const row of table.rows) {
        lines.push(row.map(v => {
          const s = v === null || v === '' ? '' : String(v)
          return s.includes(',') || s.includes('"') || s.includes('\n')
            ? `"${s.replace(/"/g, '""')}"`
            : s
        }).join(','))
      }
      if (table.footnotes?.length) {
        table.footnotes.forEach(fn => lines.push(`"${fn}"`))
      }
      lines.push('')
    }
    const BOM = '﻿'
    const blob = new Blob([BOM + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${result.title ?? '분석결과'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── 변수 목록 필터 ───────────────────────────

  function filteredCols(filter?: ColType[]) {
    if (!session || !filter) return session?.columns ?? []
    return session.columns.filter(c => filter.includes(c.type))
  }

  const typeLabel: Record<ColType, string> = {
    scale: '연속', nominal: '명목', ordinal: '순서',
  }
  const typeBadge: Record<ColType, string> = {
    scale: 'bg-blue-50 text-blue-700',
    nominal: 'bg-purple-50 text-purple-700',
    ordinal: 'bg-amber-50 text-amber-700',
  }

  // ────────────────────────────────────────────
  // 렌더
  // ────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-blue-600" /> 분석
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">업로드한 파일 또는 카탈로그 데이터를 즉시 통계 분석합니다</p>
        </div>
      </div>

      {/* 데이터 소스 선택 */}
      {!session && (
        <div className="bg-white rounded-xl border border-gray-200 p-8">
          <p className="text-center text-sm font-medium text-gray-500 mb-6">분석할 데이터를 로드하세요</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center max-w-lg mx-auto">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              className="flex-1 flex flex-col items-center gap-3 p-6 border-2 border-dashed border-gray-300 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-all cursor-pointer group"
            >
              <Upload className="w-8 h-8 text-gray-400 group-hover:text-blue-500" />
              <div>
                <p className="font-semibold text-gray-700 text-sm">파일 업로드</p>
                <p className="text-xs text-gray-400 mt-0.5">CSV · Excel (.xlsx)</p>
              </div>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f) }}
            />
            <button
              onClick={openCatalogPicker}
              disabled={loading}
              className="flex-1 flex flex-col items-center gap-3 p-6 border-2 border-dashed border-gray-300 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-all cursor-pointer group"
            >
              <Database className="w-8 h-8 text-gray-400 group-hover:text-blue-500" />
              <div>
                <p className="font-semibold text-gray-700 text-sm">카탈로그 로드</p>
                <p className="text-xs text-gray-400 mt-0.5">등록된 데이터셋 목록에서 선택</p>
              </div>
            </button>
          </div>
          {loading && (
            <div className="flex items-center justify-center gap-2 mt-6 text-sm text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" /> 데이터를 불러오는 중...
            </div>
          )}
          {loadError && (
            <div className="mt-4 flex items-start gap-2 p-3 bg-red-50 rounded-lg text-sm text-red-700 max-w-lg mx-auto">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> {loadError}
            </div>
          )}
        </div>
      )}

      {/* 카탈로그 picker 모달 */}
      {showCatalogPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b">
              <p className="font-semibold text-gray-800">카탈로그 선택</p>
              <button onClick={() => setShowCatalogPicker(false)} className="p-1 text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3 border-b">
              <div className="flex items-center gap-2 px-3 py-2 border rounded-lg bg-gray-50">
                <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <input
                  type="text"
                  value={catalogSearch}
                  onChange={e => setCatalogSearch(e.target.value)}
                  placeholder="데이터셋 이름 검색..."
                  className="flex-1 text-sm bg-transparent outline-none"
                  autoFocus
                />
              </div>
            </div>
            <div className="max-h-72 overflow-y-auto">
              {catalogLoading ? (
                <div className="flex items-center justify-center py-8 gap-2 text-sm text-gray-400">
                  <Loader2 className="w-4 h-4 animate-spin" /> 목록 로드 중...
                </div>
              ) : catalogItems.length === 0 ? (
                <div className="text-center py-8 px-4">
                  <p className="text-sm text-gray-500 font-medium">등록된 카탈로그가 없습니다</p>
                  {catalogError ? (
                    <p className="text-xs text-red-600 mt-2">{catalogError}</p>
                  ) : (
                    <p className="text-xs text-gray-400 mt-2">
                      데이터 관리자가 샘플 또는 업로드 데이터를 먼저 등록해야 합니다.
                    </p>
                  )}
                </div>
              ) : (
                catalogItems
                  .filter(it => {
                    if (!catalogSearch) return true
                    const q = catalogSearch.toLowerCase()
                    return it.title.toLowerCase().includes(q) || it.id.toLowerCase().includes(q) || (it.theme?.toLowerCase().includes(q) ?? false)
                  })
                  .map(it => (
                    <button
                      key={it.id}
                      onClick={() => { setShowCatalogPicker(false); loadCatalogById(it.id, it.title) }}
                      className="w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-blue-50 transition-colors"
                    >
                      <p className="text-sm font-medium text-gray-800 truncate">{it.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{it.id}{it.theme ? ` · ${it.theme}` : ''}</p>
                    </button>
                  ))
              )}
            </div>
            <div className="p-3 border-t bg-gray-50">
              <p className="text-xs text-gray-400">
                {catalogItems.length > 0 ? `${catalogItems.length}개 데이터셋` : ''}
                {' '} · 선택하면 즉시 분석 세션에 로드됩니다
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 메인 분석 화면 */}
      {session && (
        <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-4 items-start transition-all duration-200">
          {/* ── 왼쪽 패널 ── */}
          <div className="space-y-4 xl:sticky xl:top-4">
            {/* 세션 정보 */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-xs text-gray-500">로드된 데이터</p>
                  <p className="font-semibold text-gray-800 text-sm truncate">{session.source_label}</p>
                  <p className="text-xs text-gray-400">{session.total_rows.toLocaleString()}행 × {session.columns.length}열</p>
                </div>
                <button
                  onClick={() => { setSession(null); setResult(null); setSelectedAnalysis(null) }}
                  className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <button
                onClick={() => setShowPreview(v => !v)}
                className="text-xs text-blue-600 hover:underline flex items-center gap-1"
              >
                {showPreview ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                데이터 미리보기
              </button>
              {showPreview && session.preview.length > 0 && (
                <div className="mt-2 overflow-x-auto rounded border border-gray-100 max-h-40">
                  <table className="text-xs">
                    <thead>
                      <tr className="bg-gray-50">
                        {Object.keys(session.preview[0]).slice(0, 6).map(k => (
                          <th key={k} className="px-2 py-1 text-left font-medium text-gray-500 whitespace-nowrap border-b border-gray-100">{k}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {session.preview.slice(0, 5).map((row, i) => (
                        <tr key={i} className="border-b border-gray-50">
                          {Object.values(row).slice(0, 6).map((v, j) => (
                            <td key={j} className="px-2 py-1 text-gray-600 whitespace-nowrap">{String(v ?? '')}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* 변수 목록 */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1">
                <Info className="w-3.5 h-3.5" /> 변수 목록 (타입 클릭 변경)
              </p>
              <div className="space-y-1 max-h-64 min-h-[120px] overflow-y-auto pr-1">
                {session.columns.map(col => (
                  <div key={col.name} className="flex items-center justify-between gap-2 py-1">
                    <span className="text-sm text-gray-700 truncate flex-1">{col.name}</span>
                    <div className="flex gap-1">
                      {(['scale', 'nominal', 'ordinal'] as ColType[]).map(t => (
                        <button
                          key={t}
                          onClick={() => changeColType(col.name, t)}
                          className={`text-xs px-1.5 py-0.5 rounded-full transition-colors
                            ${col.type === t ? typeBadge[t] : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}
                        >
                          {typeLabel[t]}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 분석 메뉴 */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">분석 선택</p>
              <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                {ANALYSIS_MENU.map(group => (
                  <div key={group.group}>
                    <p className="text-xs font-semibold text-gray-400 mb-1.5">{group.group}</p>
                    <div className="space-y-0.5">
                      {group.items.map(item => (
                        <button
                          key={item.id}
                          onClick={() => selectAnalysis(item)}
                          className={`w-full text-left px-3 py-2 rounded-lg transition-colors
                            ${selectedAnalysis?.id === item.id
                              ? 'bg-blue-50 text-blue-700'
                              : 'hover:bg-gray-50 text-gray-700'}`}
                        >
                          <p className="text-sm font-medium">{item.label}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{item.desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 최근 분석 이력 */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">최근 분석</p>
                <button
                  onClick={loadRuns}
                  disabled={runsLoading}
                  className="text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50"
                >
                  {runsLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : '새로고침'}
                </button>
              </div>
              {runs.length === 0 ? (
                <p className="text-xs text-gray-400">
                  {runsLoading ? '불러오는 중...' : '아직 분석 이력이 없습니다.'}
                </p>
              ) : (
                <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                  {runs.map(run => (
                    <div key={run.id} className="text-xs border-b border-gray-50 last:border-0 pb-2 last:pb-0">
                      <p className="font-medium text-gray-700 truncate">
                        {ANALYSIS_MENU.flatMap(g => g.items).find(i => i.id === run.analysis_type)?.label ?? run.analysis_type}
                      </p>
                      <p className="text-gray-400 truncate">{run.dataset_label}</p>
                      <p className="text-gray-300 mt-0.5">
                        {new Date(run.created_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── 오른쪽 패널 ── */}
          <div className="space-y-4">
            {!selectedAnalysis && (
              <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400 min-h-[320px] flex flex-col items-center justify-center">
                <BarChart2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">왼쪽에서 분석 방법을 선택하세요</p>
              </div>
            )}

            {selectedAnalysis && (
              <>
                {/* 변수 배정 */}
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h2 className="text-base font-bold text-gray-900 mb-1">{selectedAnalysis.label}</h2>
                  <p className="text-sm text-gray-500 mb-4">{selectedAnalysis.desc}</p>

                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {selectedAnalysis.variableSlots.map(slot => {
                      const cols = filteredCols(slot.filter)
                      const sel  = assigned[slot.key] ?? []
                      return (
                        <div key={slot.key}>
                          <p className="text-xs font-semibold text-gray-600 mb-2">
                            {slot.label}
                            <span className="font-normal text-gray-400 ml-1">
                              {slot.multi ? '(다중 선택)' : '(1개 선택)'}
                            </span>
                          </p>
                          {slot.filter && (
                            <p className="text-xs text-gray-400 mb-1.5">
                              {slot.filter.map(f => typeLabel[f]).join('·')} 변수만 표시
                            </p>
                          )}
                          <div className="border border-gray-200 rounded-lg overflow-hidden max-h-48 min-h-[96px] overflow-y-auto">
                            {cols.length === 0 && (
                              <p className="p-3 text-xs text-gray-400">해당 타입 변수 없음</p>
                            )}
                            {cols.map(col => (
                              <button
                                key={col.name}
                                onClick={() => assignVariable(slot.key, col.name, slot.multi)}
                                className={`w-full text-left px-3 py-2 text-sm border-b border-gray-100 last:border-0 flex items-center gap-2 transition-colors
                                  ${sel.includes(col.name)
                                    ? 'bg-blue-50 text-blue-700 font-medium'
                                    : 'hover:bg-gray-50 text-gray-700'}`}
                              >
                                <span className={`text-xs px-1 py-0.5 rounded-full ${typeBadge[col.type]}`}>
                                  {typeLabel[col.type]}
                                </span>
                                {col.name}
                              </button>
                            ))}
                          </div>
                          {sel.length > 0 && (
                            <p className="text-xs text-blue-600 mt-1">선택됨: {sel.join(', ')}</p>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* t-검정/Mann-Whitney: 집단 변수가 3개 이상 범주일 때 2개 선택 */}
                  {(selectedAnalysis?.id === 'independent_ttest' || selectedAnalysis?.id === 'mann_whitney_u') && session && (() => {
                    const groupVar = assigned.group?.[0]
                    if (!groupVar) return null
                    const values = session.column_values[groupVar] ?? []
                    if (values.length <= 2) return null
                    return (
                      <div className="mt-4 p-4 bg-amber-50/50 border border-amber-100 rounded-lg">
                        <p className="text-xs font-semibold text-amber-800 mb-2 flex items-center gap-1">
                          <Info className="w-3.5 h-3.5" /> 비교할 범주 2개 선택 (필수)
                        </p>
                        <p className="text-xs text-amber-600 mb-2">
                          집단 변수 「{groupVar}」에 {values.length}개 범주가 있습니다. 비교할 2개를 선택하세요.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {values.map(v => {
                            const selected = groupValues.includes(v)
                            return (
                              <button
                                key={v}
                                onClick={() => {
                                  setGroupValues(prev => {
                                    if (prev.includes(v)) return prev.filter(x => x !== v)
                                    if (prev.length >= 2) return [...prev.slice(1), v]
                                    return [...prev, v]
                                  })
                                }}
                                className={`text-xs px-3 py-1.5 rounded-full border transition-colors
                                  ${selected
                                    ? 'bg-amber-100 border-amber-300 text-amber-900 font-medium'
                                    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                              >
                                {v}
                              </button>
                            )
                          })}
                        </div>
                        {groupValues.length === 2 && (
                          <p className="text-xs text-amber-700 mt-2">선택됨: {groupValues.join(' vs ')}</p>
                        )}
                      </div>
                    )
                  })()}

                  {/* 옵션 */}
                  {selectedAnalysis.options && selectedAnalysis.options.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-4">
                      {selectedAnalysis.options.map(opt => (
                        <div key={opt.key}>
                          <p className="text-xs font-semibold text-gray-600 mb-1">{opt.label}</p>
                          <select
                            value={optValues[opt.key] ?? opt.default}
                            onChange={e => setOptValues(prev => ({ ...prev, [opt.key]: e.target.value }))}
                            className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white"
                          >
                            {opt.choices.map(c => (
                              <option key={c.value} value={c.value}>{c.label}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    onClick={runAnalysis}
                    disabled={running || ((selectedAnalysis?.id === 'independent_ttest' || selectedAnalysis?.id === 'mann_whitney_u') && (() => {
                      const groupVar = assigned.group?.[0]
                      const values = groupVar ? (session?.column_values[groupVar] ?? []) : []
                      return values.length > 2 && groupValues.length !== 2
                    })())}
                    className="mt-5 flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {running
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> 분석 중...</>
                      : <><PlayCircle className="w-4 h-4" /> 분석 실행</>}
                  </button>
                </div>

                {/* 결과 */}
                {result && (
                  <div className="bg-white rounded-xl border border-gray-200 p-5 min-h-[200px]">
                    {result.ok ? (
                      <>
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-base font-bold text-gray-900">{result.title}</h3>
                          <button
                            onClick={exportCSV}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
                          >
                            <Download className="w-3.5 h-3.5" /> CSV 내보내기
                          </button>
                        </div>
                        {result.tables?.map((t, i) => (
                          <ResultTableView key={i} table={t} />
                        ))}
                        {result.charts && result.charts.length > 0 && (
                          <div className="mt-2 pt-4 border-t border-gray-100">
                            <ResultCharts charts={result.charts} />
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="flex items-start gap-2 text-red-700 bg-red-50 rounded-lg p-4">
                        <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <p className="text-sm">{result.error}</p>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
