'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Upload, Database, ChevronDown, ChevronRight, PlayCircle,
  X, AlertCircle, Loader2, BarChart2, Info, Download, Search,
  RotateCcw, CheckSquare, Square, Copy, Image as ImageIcon,
  Check, Filter, Layers, SortAsc, SortDesc, Clock,
} from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, ScatterChart, Scatter,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import Modal from '@/components/ui/Modal'
import PageHeader from '@/components/ui/PageHeader'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Btn from '@/components/ui/Btn'
import EmptyState from '@/components/ui/EmptyState'
import Skeleton from '@/components/ui/Skeleton'
import StatCard from '@/components/ui/StatCard'

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
  placeholder?: string
  unit?: string
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
        desc: '비지도 클러스터링·클스터 산점도',
        variableSlots: [{ key: 'variables', label: '분석 변수', multi: true, filter: ['scale'] }],
        options: [
          {
            key: 'k', label: '클로스터 수(k)', type: 'select',
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
            unit: '개',
          },
        ],
      },
    ],
  },
]

// ────────────────────────────────────────────
// 헬퍼
// ────────────────────────────────────────────

const CHART_COLORS = ['#3B82F6', '#F59E0B', '#10B981', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16']

const typeLabel: Record<ColType, string> = {
  scale: '연속', nominal: '명목', ordinal: '순서',
}
const typeBadge: Record<ColType, string> = {
  scale: 'bg-blue-50 text-blue-700',
  nominal: 'bg-purple-50 text-purple-700',
  ordinal: 'bg-amber-50 text-amber-700',
}

function formatTick(value: unknown): string {
  if (typeof value === 'number') {
    if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
    if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}k`
    if (Math.abs(value) >= 1) return value.toFixed(value % 1 === 0 ? 0 : 1)
    return value.toFixed(3)
  }
  return String(value ?? '')
}

function getSignificanceBadge(p: number | null | undefined): { label: string; variant: Parameters<typeof Badge>[0]['variant'] } {
  if (p === null || p === undefined || Number.isNaN(p)) return { label: '', variant: 'gray' }
  if (p < 0.001) return { label: '***', variant: 'red' }
  if (p < 0.01) return { label: '**', variant: 'red' }
  if (p < 0.05) return { label: '*', variant: 'amber' }
  return { label: 'n.s.', variant: 'gray' }
}

function parseP(value: unknown): number | null {
  if (value === null || value === undefined || value === '' || value === '-') return null
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[^0-9.eE+-]/g, ''))
  return Number.isFinite(n) ? n : null
}

function getAnalysisLabel(id: string) {
  return ANALYSIS_MENU.flatMap(g => g.items).find(i => i.id === id)?.label ?? id
}

// ────────────────────────────────────────────
// 서브컴포넌트: 레벨 선택
// ────────────────────────────────────────────

interface LevelSelectorProps {
  variableName: string
  levels: string[]
  selected: string[]
  onChange: (variableName: string, selected: string[]) => void
  min?: number
  max?: number
}

function LevelSelector({ variableName, levels, selected, onChange, min, max }: LevelSelectorProps) {
  if (!levels || levels.length === 0) return null

  const allSelected = selected.length === levels.length && levels.every(v => selected.includes(v))
  const noneSelected = selected.length === 0

  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(variableName, selected.filter(v => v !== value))
      return
    }
    if (max !== undefined && selected.length >= max) {
      // 최대 개수 초과 시 가장 오래된 선택을 교체
      onChange(variableName, [...selected.slice(1), value])
      return
    }
    onChange(variableName, [...selected, value])
  }

  const selectAll = () => onChange(variableName, [...levels])
  const clearAll = () => onChange(variableName, [])

  return (
    <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-950 rounded-lg border border-gray-100">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 flex items-center gap-1">
          <Filter className="w-3.5 h-3.5" /> {variableName} 레벨 선택
          <span className="font-normal text-gray-400 dark:text-gray-300">({selected.length}/{levels.length})</span>
        </p>
        <div className="flex items-center gap-1.5">
          <button
            onClick={selectAll}
            disabled={allSelected}
            className="text-[10px] px-2 py-1 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-950 disabled:opacity-40"
          >
            전체 선택
          </button>
          <button
            onClick={clearAll}
            disabled={noneSelected}
            className="text-[10px] px-2 py-1 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-950 disabled:opacity-40"
          >
            전체 해제
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {levels.map(value => {
          const checked = selected.includes(value)
          return (
            <button
              key={value}
              onClick={() => toggle(value)}
              className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-colors
                ${checked
                  ? 'bg-blue-50 border-blue-200 text-blue-700'
                  : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-950'}`}
              title={value}
            >
              {checked ? <CheckSquare className="w-3 h-3" /> : <Square className="w-3 h-3" />}
              <span className="max-w-[160px] truncate">{value}</span>
            </button>
          )
        })}
      </div>
      {min !== undefined && selected.length < min && (
        <p className="text-[11px] text-red-500 mt-2">최소 {min}개 레벨을 선택해야 합니다.</p>
      )}
      {max !== undefined && selected.length > max && (
        <p className="text-[11px] text-red-500 mt-2">최대 {max}개 레벨까지 선택할 수 있습니다.</p>
      )}
    </div>
  )
}

// ────────────────────────────────────────────
// 서브컴포넌트: 결과 테이블
// ────────────────────────────────────────────

function ResultTableView({ table }: { table: ResultTable }) {
  // 유의성 뱃지가 들어갈 수 있는 컬럼 이름 힌트
  const pHint = ['p값', 'p-value', 'p', 'p값(유의확률)']
  const sigHint = ['유의성', '판정', '판정(α=0.05)']

  return (
    <div className="mb-5">
      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">{table.title}</p>
      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="min-w-[640px] w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-950 border-b border-gray-200 dark:border-gray-700">
              {table.headers.map((h, i) => (
                <th key={i} className="px-3 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, ri) => (
              <tr key={ri} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-950">
                {row.map((cell, ci) => {
                  const header = table.headers[ci] ?? ''
                  const isPHint = pHint.some(h => header.toLowerCase().includes(h.toLowerCase()))
                  const isSigHint = sigHint.some(h => header.toLowerCase().includes(h.toLowerCase()))
                  const p = isPHint ? parseP(cell) : null
                  const sig = p !== null ? getSignificanceBadge(p) : null

                  return (
                    <td key={ci} className={`px-3 py-2 text-gray-700 dark:text-gray-300 whitespace-nowrap font-mono text-xs ${ci === 0 ? 'font-medium text-gray-800 dark:text-gray-200 font-sans' : ''}`}>
                      {cell === null || cell === '' ? (
                        <span className="text-gray-300 dark:text-gray-200">—</span>
                      ) : sig ? (
                        <span className="inline-flex items-center gap-1.5">
                          {String(cell)}
                          <Badge variant={sig.variant} size="sm">{sig.label}</Badge>
                        </span>
                      ) : isSigHint && typeof cell === 'string' ? (
                        <Badge variant={cell.includes('유의') ? 'red' : 'gray'} size="sm">{cell}</Badge>
                      ) : (
                        String(cell)
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {table.footnotes?.map((fn, i) => (
        <p key={i} className="text-xs text-gray-400 dark:text-gray-300 mt-1.5 flex items-start gap-1">
          <Info className="w-3 h-3 mt-0.5 flex-shrink-0" /> {fn}
        </p>
      ))}
    </div>
  )
}

// ────────────────────────────────────────────
// 서브컴포넌트: 차트 툴팁/다운로드
// ────────────────────────────────────────────

function ChartToolbar({ chart, chartRef }: { chart: ChartSpec; chartRef?: React.RefObject<HTMLDivElement> }) {
  const [copied, setCopied] = useState(false)

  const copyData = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(chart.data, null, 2))
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch { /* ignore */ }
  }

  const downloadImage = async () => {
    if (!chartRef?.current) return
    try {
      const html2canvas = (await import('html2canvas')).default
      const canvas = await html2canvas(chartRef.current, { backgroundColor: '#ffffff', scale: 2 })
      const url = canvas.toDataURL('image/png')
      const a = document.createElement('a')
      a.href = url
      a.download = `${chart.title.replace(/\s+/g, '_')}.png`
      a.click()
    } catch { /* ignore */ }
  }

  return (
    <div className="flex items-center justify-end gap-1.5 mb-2">
      <Btn variant="secondary" size="sm" onClick={copyData}>
        {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
        데이터 복사
      </Btn>
      <Btn variant="secondary" size="sm" onClick={downloadImage}>
        <ImageIcon className="w-3 h-3" /> 차트 저장
      </Btn>
    </div>
  )
}

// ────────────────────────────────────────────
// 서브컴포넌트: 결과 차트
// ────────────────────────────────────────────

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
      <div className="flex items-center gap-2 mt-2 text-xs text-gray-500 dark:text-gray-400">
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
        const chartRef = { current: null as HTMLDivElement | null }

        return (
          <div key={idx} className="bg-gray-50 dark:bg-gray-950 rounded-xl border border-gray-100 p-4">
            <ChartToolbar chart={chart} chartRef={chartRef as unknown as React.RefObject<HTMLDivElement>} />
            <div ref={el => { chartRef.current = el }}>
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">{chart.title}</p>
              {chart.type === 'heatmap' && <HeatmapChart chart={chart} />}

              {chart.type === 'bar' && (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey={chart.xKey ?? 'name'}
                      tick={{ fontSize: 11 }}
                      interval={0}
                      angle={data.length > 8 ? 30 : 0}
                      height={data.length > 8 ? 50 : 30}
                      label={{ value: chart.xKey ?? '범주', position: 'insideBottom', offset: -8, fontSize: 11, fill: '#6B7280' }}
                    />
                    <YAxis tickFormatter={formatTick} tick={{ fontSize: 11 }} label={{ value: chart.yKey ?? '값', angle: -90, position: 'insideLeft', fontSize: 11, fill: '#6B7280' }} />
                    <Tooltip formatter={(v: unknown) => [formatTick(v), chart.yKey ?? '값']} />
                    {chart.stackKeys && chart.stackKeys.length > 0 ? (
                      <>
                        <Legend />
                        {chart.stackKeys.map((k, i) => <Bar key={k} dataKey={k} stackId="a" fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </>
                    ) : (
                      <Bar dataKey={chart.yKey ?? 'value'} fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
                    )}
                  </BarChart>
                </ResponsiveContainer>
              )}

              {chart.type === 'line' && (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey={chart.xKey ?? 'name'}
                      tick={{ fontSize: 11 }}
                      label={{ value: chart.xKey ?? '시점', position: 'insideBottom', offset: -8, fontSize: 11, fill: '#6B7280' }}
                    />
                    <YAxis tickFormatter={formatTick} tick={{ fontSize: 11 }} label={{ value: '값', angle: -90, position: 'insideLeft', fontSize: 11, fill: '#6B7280' }} />
                    <Tooltip />
                    <Legend />
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
                <ResponsiveContainer width="100%" height={340}>
                  <ScatterChart margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      type="number"
                      dataKey={chart.xKey ?? 'x'}
                      name={chart.xKey ?? 'x'}
                      tickFormatter={formatTick}
                      tick={{ fontSize: 11 }}
                      label={{ value: chart.xKey ?? 'x', position: 'insideBottom', offset: -4, fontSize: 11, fill: '#6B7280' }}
                    />
                    <YAxis
                      type="number"
                      dataKey={chart.yKey ?? 'y'}
                      name={chart.yKey ?? 'y'}
                      tickFormatter={formatTick}
                      tick={{ fontSize: 11 }}
                      label={{ value: chart.yKey ?? 'y', angle: -90, position: 'insideLeft', fontSize: 11, fill: '#6B7280' }}
                    />
                    <Tooltip cursor={{ strokeDasharray: '3 3' }} formatter={(v: unknown) => formatTick(v)} />
                    <Legend />
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
                  </ScatterChart>
                </ResponsiveContainer>
              )}

              {chart.type === 'pie' && (
                <ResponsiveContainer width="100%" height={300}>
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
                    <Tooltip formatter={((v: unknown, n: string) => [formatTick(v), n]) as any} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
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
  const [levelValues, setLevelValues] = useState<Record<string, string[]>>({})
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
  const [runsError, setRunsError] = useState('')
  const [showRegisterModal, setShowRegisterModal]   = useState(false)
  const [registerSaving, setRegisterSaving]         = useState(false)
  const [registerForm, setRegisterForm] = useState({
    title: '', performed_at: '', purpose: '', result_summary: '', policy_applied: false,
  })

  const [varSearch, setVarSearch] = useState('')
  const [varTypeFilter, setVarTypeFilter] = useState<Record<ColType, boolean>>({ scale: true, nominal: true, ordinal: true })
  const [varSortAsc, setVarSortAsc] = useState(true)

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
      setLevelValues({})
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
      setLevelValues({})
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
    setRunsError('')
    try {
      const res = await fetch('/api/analytics/runs?limit=5')
      if (!res.ok) throw new Error(`이력 조회 실패: ${res.status}`)
      const json = await res.json()
      const items: RunItem[] = Array.isArray(json) ? json : (json.items ?? [])
      setRuns(items)
    } catch (e) {
      setRuns([])
      setRunsError(String(e))
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

  // t-검정/Mann-Whitney: group_values를 레벨 선택과 동기화
  useEffect(() => {
    if (!selectedAnalysis || !session) return
    if (selectedAnalysis.id !== 'independent_ttest' && selectedAnalysis.id !== 'mann_whitney_u') return
    const groupVar = assigned.group?.[0]
    if (!groupVar) {
      setGroupValues([])
      return
    }
    const levels = session.column_values[groupVar] ?? []
    const selected = levelValues[groupVar] ?? levels
    setGroupValues(selected.length === 2 ? selected : [])
  }, [selectedAnalysis, assigned.group, levelValues, session])

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
    setLevelValues({})
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
      const prevVar = cur[0]
      const next = { ...prev, [slotKey]: cur[0] === colName ? [] : [colName] }
      if (prevVar && prevVar !== colName) {
        // 단일 선택 변경 시 이전 변수의 레벨 선택 해제
        setLevelValues(lv => {
          const nextLevels = { ...lv }
          delete nextLevels[prevVar]
          return nextLevels
        })
      }
      return next
    })
  }

  // ── 레벨 선택 ────────────────────────────────

  function updateLevelValues(variableName: string, selected: string[]) {
    setLevelValues(prev => ({ ...prev, [variableName]: selected }))
  }

  function clearLevelValues(variableName: string) {
    setLevelValues(prev => {
      const next = { ...prev }
      delete next[variableName]
      return next
    })
  }

  // ── 분석 실행 ────────────────────────────────

  function buildValidation(): { ok: boolean; messages: string[] } {
    if (!session || !selectedAnalysis) return { ok: false, messages: ['분석을 선택하세요.'] }
    const messages: string[] = []

    for (const slot of selectedAnalysis.variableSlots) {
      const sel = assigned[slot.key] ?? []
      if (sel.length === 0) {
        messages.push(`${slot.label}를 선택하세요.`)
        continue
      }
      for (const varName of sel) {
        const levels = session.column_values[varName] ?? []
        const selectedLevels = levelValues[varName]
        if (selectedLevels !== undefined && selectedLevels.length === 0) {
          messages.push(`「${varName}」의 최소 1개 레벨을 선택하세요.`)
        }
        if (selectedAnalysis.id === 'one_way_anova' && slot.key === 'factor' && selectedLevels && selectedLevels.length < 2) {
          messages.push(`ANOVA는 「${varName}」에서 2개 이상의 레벨이 필요합니다.`)
        }
      }
    }

    // t-검정/Mann-Whitney: 3개 이상 범주일 때 2개 선택
    if ((selectedAnalysis.id === 'independent_ttest' || selectedAnalysis.id === 'mann_whitney_u') && session) {
      const groupVar = assigned.group?.[0]
      if (groupVar) {
        const values = session.column_values[groupVar] ?? []
        if (values.length > 2 && groupValues.length !== 2) {
          messages.push('비교할 범주 2개를 선택하세요.')
        }
      }
    }

    return { ok: messages.length === 0, messages }
  }

  async function runAnalysis() {
    if (!session || !selectedAnalysis) return
    setRunning(true); setResult(null)
    try {
      const payload: Record<string, unknown> = {
        session_id: session.session_id,
        analysis_type: selectedAnalysis.id,
        variables: { ...assigned, group_values: groupValues, level_values: levelValues },
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

  // ── CSV 난볶내기 ─────────────────────────────

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
    const BOM = '\ufeff'
    const blob = new Blob([BOM + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `eum-analysis-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── 변수 목록 필터 ───────────────────────────

  function filteredCols(filter?: ColType[]) {
    if (!session || !filter) return session?.columns ?? []
    return session.columns.filter(c => filter.includes(c.type))
  }

  const typeToBadgeVariant: Record<ColType, Parameters<typeof Badge>[0]['variant']> = {
    scale: 'blue', nominal: 'purple', ordinal: 'amber',
  }

  const filteredVariables = useMemo(() => {
    if (!session) return []
    const q = varSearch.trim().toLowerCase()
    let cols = session.columns.filter(c => {
      if (!varTypeFilter[c.type]) return false
      if (!q) return true
      return c.name.toLowerCase().includes(q)
    })
    cols = [...cols].sort((a, b) => {
      const cmp = a.name.localeCompare(b.name, 'ko')
      return varSortAsc ? cmp : -cmp
    })
    return cols
  }, [session, varSearch, varTypeFilter, varSortAsc])

  const activeVarTypeCount = useMemo(() => {
    return (Object.values(varTypeFilter) as boolean[]).filter(Boolean).length
  }, [varTypeFilter])

  // ── 렌더 헬퍼 ────────────────────────────────

  const validation = buildValidation()

  function renderResultSummary() {
    if (!result?.ok || !result.tables) return null
    const tableCount = result.tables.length
    const chartCount = result.charts?.length ?? 0
    return (
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 flex items-center gap-1.5">
        <Layers className="w-3.5 h-3.5" />
        테이블 {tableCount}개{chartCount > 0 ? ` · 차트 ${chartCount}개` : ''}
      </p>
    )
  }

  // ────────────────────────────────────────────
  // 렌더
  // ────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <PageHeader
        title="분석"
        subtitle="업로드한 파일 또는 카탈로그 데이터를 즉시 통계 분석합니다"
        badge="Analytics"
      />

      {/* 데이터 소스 선택 */}
      {!session && (
        <Card padding="lg" className="max-w-2xl mx-auto">
          <EmptyState
            icon={<BarChart2 className="w-8 h-8 text-blue-500" />}
            title="분석할 데이터를 로드하세요"
            description="CSV·Excel 파일을 업로드하거나 등록된 카탈로그 데이터셋을 선택해 분석을 시작합니다."
          />
          <div className="flex flex-col sm:flex-row gap-4 justify-center mt-6">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              className="flex-1 flex flex-col items-center gap-3 p-6 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-all cursor-pointer group"
            >
              <Upload className="w-8 h-8 text-gray-400 dark:text-gray-300 group-hover:text-blue-500" />
              <div>
                <p className="font-semibold text-gray-700 dark:text-gray-300 text-sm">파일 업로드</p>
                <p className="text-xs text-gray-400 dark:text-gray-300 mt-0.5">CSV · Excel (.xlsx)</p>
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
              className="flex-1 flex flex-col items-center gap-3 p-6 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-all cursor-pointer group"
            >
              <Database className="w-8 h-8 text-gray-400 dark:text-gray-300 group-hover:text-blue-500" />
              <div>
                <p className="font-semibold text-gray-700 dark:text-gray-300 text-sm">카탈로그 로드</p>
                <p className="text-xs text-gray-400 dark:text-gray-300 mt-0.5">등록된 데이터셋 목록에서 선택</p>
              </div>
            </button>
          </div>
          {loading && (
            <div className="flex items-center justify-center gap-2 mt-6 text-sm text-gray-500 dark:text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" /> 데이터를 불러오는 중...
            </div>
          )}
          {loadError && (
            <div className="mt-4 flex items-start gap-2 p-3 bg-red-50 rounded-lg text-sm text-red-700 max-w-lg mx-auto">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-medium">데이터 로드 실패</p>
                <p>{loadError}</p>
              </div>
              <Btn variant="ghost" size="sm" onClick={() => setLoadError('')}>닫기</Btn>
            </div>
          )}
        </Card>
      )}

      {/* 카탈로그 picker 모달 */}
      {showCatalogPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-lg mx-4 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b">
              <p className="font-semibold text-gray-800 dark:text-gray-200">카탈로그 선택</p>
              <button onClick={() => setShowCatalogPicker(false)} className="p-1 text-gray-400 dark:text-gray-300 hover:text-gray-600 dark:hover:text-gray-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3 border-b">
              <div className="flex items-center gap-2 px-3 py-2 border rounded-lg bg-gray-50 dark:bg-gray-950">
                <Search className="w-4 h-4 text-gray-400 dark:text-gray-300 flex-shrink-0" />
                <input
                  type="text"
                  value={catalogSearch}
                  onChange={e => setCatalogSearch(e.target.value)}
                  placeholder="데이터셋 이름 검색..."
                  className="flex-1 text-sm bg-transparent outline-none"
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                />
              </div>
            </div>
            <div className="max-h-72 overflow-y-auto">
              {catalogLoading ? (
                <div className="p-4 space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="space-y-2">
                      <Skeleton className="h-4 w-1/2" />
                      <Skeleton className="h-3 w-1/3" />
                    </div>
                  ))}
                </div>
              ) : (() => {
                if (catalogItems.length === 0) {
                  return (
                    <div className="text-center py-8 px-4">
                      <EmptyState
                        icon={<Database className="w-6 h-6 text-gray-400 dark:text-gray-300" />}
                        title="등록된 카탈로그가 없습니다"
                        description={catalogError || '데이터 관리자가 샘플 또는 업로드 데이터를 먼저 등록해야 합니다.'}
                        action={catalogError ? { label: '다시 시도', onClick: openCatalogPicker } : undefined}
                      />
                    </div>
                  )
                }
                const filtered = catalogItems.filter(it => {
                  if (!catalogSearch) return true
                  const q = catalogSearch.toLowerCase()
                  return it.title.toLowerCase().includes(q) || it.id.toLowerCase().includes(q) || (it.theme?.toLowerCase().includes(q) ?? false)
                })
                if (filtered.length === 0) {
                  return (
                    <div className="text-center py-8 px-4">
                      <EmptyState
                        icon={<Search className="w-6 h-6 text-gray-400 dark:text-gray-300" />}
                        title="검색 결과가 없습니다"
                        description="다른 키워드로 검색하거나 필터를 초기화해 보세요."
                        action={{ label: '검색어 초기화', onClick: () => setCatalogSearch('') }}
                      />
                    </div>
                  )
                }
                return filtered.map(it => (
                  <button
                    key={it.id}
                    onClick={() => { setShowCatalogPicker(false); loadCatalogById(it.id, it.title) }}
                    className="w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-blue-50 transition-colors"
                  >
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{it.title}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-300 mt-0.5">{it.id}{it.theme ? ` · ${it.theme}` : ''}</p>
                  </button>
                ))
              })()}
            </div>
            <div className="p-3 border-t bg-gray-50 dark:bg-gray-950">
              <p className="text-xs text-gray-400 dark:text-gray-300">
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
            <Card padding="md">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">로드된 데이터</p>
                  <p className="font-semibold text-gray-800 dark:text-gray-200 text-sm truncate">{session.source_label}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-300">{session.total_rows.toLocaleString()}행 × {session.columns.length}열</p>
                </div>
                <button
                  onClick={() => { setSession(null); setResult(null); setSelectedAnalysis(null) }}
                  className="p-1.5 rounded-lg text-gray-400 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-400"
                  title="세션 닫기"
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
                      <tr className="bg-gray-50 dark:bg-gray-950">
                        {Object.keys(session.preview[0]).slice(0, 6).map(k => (
                          <th key={k} className="px-2 py-1 text-left font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap border-b border-gray-100">{k}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {session.preview.slice(0, 5).map((row, i) => (
                        <tr key={i} className="border-b border-gray-50">
                          {Object.values(row).slice(0, 6).map((v, j) => (
                            <td key={j} className="px-2 py-1 text-gray-600 dark:text-gray-400 whitespace-nowrap">{String(v ?? '')}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            {/* 변수 목록 */}
            <Card padding="md" className="flex flex-col">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1">
                <Info className="w-3.5 h-3.5" /> 변수 목록 (타입 클릭 변경)
              </p>

              <div className="mb-3 space-y-2">
                <div className="flex items-center gap-2 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-950">
                  <Search className="w-4 h-4 text-gray-400 dark:text-gray-300 flex-shrink-0" />
                  <input
                    type="text"
                    value={varSearch}
                    onChange={e => setVarSearch(e.target.value)}
                    placeholder="변수명 검색..."
                    className="flex-1 text-sm bg-transparent outline-none"
                  />
                  {varSearch && (
                    <button onClick={() => setVarSearch('')} className="text-gray-400 dark:text-gray-300 hover:text-gray-600 dark:hover:text-gray-400">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    {(['scale', 'nominal', 'ordinal'] as ColType[]).map(t => (
                      <button
                        key={t}
                        onClick={() => setVarTypeFilter(prev => ({ ...prev, [t]: !prev[t] }))}
                        className={`text-xs px-2 py-0.5 rounded-full border transition-colors
                          ${varTypeFilter[t]
                            ? typeBadge[t]
                            : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-950'}`}
                      >
                        {typeLabel[t]}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setVarSortAsc(v => !v)}
                    title={varSortAsc ? '오름차순' : '내림차순'}
                    className="p-1 rounded text-gray-400 dark:text-gray-300 hover:text-gray-600 dark:hover:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    {varSortAsc ? <SortAsc className="w-3.5 h-3.5" /> : <SortDesc className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1 max-h-64 min-h-[120px] overflow-y-auto pr-1">
                {filteredVariables.map(col => (
                  <div key={col.name} className="flex items-center justify-between gap-2 py-1">
                    <span className="text-sm text-gray-700 dark:text-gray-300 truncate flex-1">{col.name}</span>
                    <div className="flex gap-1">
                      {(['scale', 'nominal', 'ordinal'] as ColType[]).map(t => (
                        <button
                          key={t}
                          onClick={() => changeColType(col.name, t)}
                          className={`text-xs px-1.5 py-0.5 rounded-full transition-colors
                            ${col.type === t ? typeBadge[t] : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                        >
                          {typeLabel[t]}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {filteredVariables.length === 0 && (
                  <EmptyState
                    icon={<Search className="w-5 h-5 text-gray-400 dark:text-gray-300" />}
                    title="일치하는 변수가 없습니다"
                    description={activeVarTypeCount === 0 ? '최소 한 개 이상의 타입 필터를 선택하세요.' : '검색어나 필터를 조정해 보세요.'}
                    action={{
                      label: '필터 초기화',
                      onClick: () => {
                        setVarSearch('')
                        setVarTypeFilter({ scale: true, nominal: true, ordinal: true })
                        setVarSortAsc(true)
                      },
                    }}
                  />
                )}
              </div>
            </Card>

            {/* 분석 메뉴 */}
            <Card padding="md" className="flex flex-col">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">분석 선택</p>
              <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                {ANALYSIS_MENU.map(group => (
                  <div key={group.group}>
                    <p className="text-xs font-semibold text-gray-400 dark:text-gray-300 mb-1.5">{group.group}</p>
                    <div className="space-y-0.5">
                      {group.items.map(item => (
                        <button
                          key={item.id}
                          onClick={() => selectAnalysis(item)}
                          className={`w-full text-left px-3 py-2 rounded-lg transition-colors
                            ${selectedAnalysis?.id === item.id
                              ? 'bg-blue-50 text-blue-700'
                              : 'hover:bg-gray-50 dark:hover:bg-gray-950 text-gray-700 dark:text-gray-300'}`}
                        >
                          <p className="text-sm font-medium">{item.label}</p>
                          <p className="text-xs text-gray-400 dark:text-gray-300 mt-0.5">{item.desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* 최근 분석 이력 */}
            <Card padding="md">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">최근 분석</p>
                <Btn
                  variant="ghost"
                  size="sm"
                  onClick={loadRuns}
                  loading={runsLoading}
                >
                  새로고침
                </Btn>
              </div>
              {runsError ? (
                <EmptyState
                  icon={<AlertCircle className="w-5 h-5 text-red-500" />}
                  title="이력을 불러오지 못했습니다"
                  description={runsError}
                  action={{ label: '다시 시도', onClick: loadRuns }}
                />
              ) : runsLoading ? (
                <div className="space-y-2 py-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="space-y-1.5">
                      <Skeleton className="h-3.5 w-2/3" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  ))}
                </div>
              ) : runs.length === 0 ? (
                <EmptyState
                  icon={<Clock className="w-5 h-5 text-gray-400 dark:text-gray-300" />}
                  title="아직 분석 이력이 없습니다"
                  description="분석을 실행하면 최근 이력이 여기에 표시됩니다."
                />
              ) : (
                <div className="space-y-1 max-h-[200px] overflow-y-auto pr-1">
                  {runs.map(run => (
                    <div
                      key={run.id}
                      className="group text-xs rounded-lg border border-transparent hover:border-gray-100 hover:bg-gray-50 dark:hover:bg-gray-950 p-2 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <Badge variant="blue" size="sm">{getAnalysisLabel(run.analysis_type)}</Badge>
                        <span className="text-[10px] text-gray-300 dark:text-gray-200 flex-shrink-0">
                          {new Date(run.created_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-gray-400 dark:text-gray-300 truncate">{run.dataset_label}</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* ── 오른쪽 패널 ── */}
          <div className="space-y-4">
            {/* 요약 KPI */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard
                label="데이터 행"
                value={session.total_rows.toLocaleString()}
                icon={<Database className="w-5 h-5" />}
                color="blue"
              />
              <StatCard
                label="변수"
                value={session.columns.length}
                icon={<Info className="w-5 h-5" />}
                color="purple"
              />
              <StatCard
                label="선택 분석"
                value={selectedAnalysis?.label ?? '미선택'}
                icon={<BarChart2 className="w-5 h-5" />}
                color="amber"
              />
              <StatCard
                label="최근 분석 이력"
                value={runs.length}
                icon={<Clock className="w-5 h-5" />}
                color="green"
              />
            </div>

            {!selectedAnalysis && (
              <Card className="min-h-[320px] flex flex-col items-center justify-center">
                <EmptyState
                  icon={<BarChart2 className="w-8 h-8 text-blue-400" />}
                  title="분석 방법을 선택하세요"
                  description="왼쪽 메뉴에서 원하는 통계 분석을 선택하면 변수를 배정하고 실행할 수 있습니다."
                />
              </Card>
            )}

            {selectedAnalysis && (
              <>
                {/* 변수 배정 */}
                <Card padding="md">
                  <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-1">{selectedAnalysis.label}</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{selectedAnalysis.desc}</p>

                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {selectedAnalysis.variableSlots.map(slot => {
                      const cols = filteredCols(slot.filter)
                      const sel  = assigned[slot.key] ?? []
                      return (
                        <div key={slot.key}>
                          <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">
                            {slot.label}
                            <span className="font-normal text-gray-400 dark:text-gray-300 ml-1">
                              {slot.multi ? '(다중 선택)' : '(1개 선택)'}
                            </span>
                          </p>
                          {slot.filter && (
                            <p className="text-xs text-gray-400 dark:text-gray-300 mb-1.5">
                              {slot.filter.map(f => typeLabel[f]).join('·')} 변수만 표시
                            </p>
                          )}
                          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden max-h-48 min-h-[96px] overflow-y-auto">
                            {cols.length === 0 && (
                              <p className="p-3 text-xs text-gray-400 dark:text-gray-300">해당 타입 변수 없음</p>
                            )}
                            {cols.map(col => (
                              <button
                                key={col.name}
                                onClick={() => assignVariable(slot.key, col.name, slot.multi)}
                                className={`w-full text-left px-3 py-2 text-sm border-b border-gray-100 last:border-0 flex items-center gap-2 transition-colors
                                  ${sel.includes(col.name)
                                    ? 'bg-blue-50 text-blue-700 font-medium'
                                    : 'hover:bg-gray-50 dark:hover:bg-gray-950 text-gray-700 dark:text-gray-300'}`}
                              >
                                <Badge variant={typeToBadgeVariant[col.type]} size="sm">
                                  {typeLabel[col.type]}
                                </Badge>
                                {col.name}
                              </button>
                            ))}
                          </div>
                          {sel.length > 0 && (
                            <p className="text-xs text-blue-600 mt-1">선택됨: {sel.join(', ')}</p>
                          )}

                          {/* 레벨 선택: 범주형 변수가 선택된 경우 */}
                          {sel.map(varName => {
                            const levels = session.column_values[varName] ?? []
                            if (levels.length === 0) return null
                            const isCategorical = session.columns.find(c => c.name === varName)?.type !== 'scale'
                            if (!isCategorical) return null
                            const selectedLevels = levelValues[varName] ?? levels
                            const isTwoGroupTest = (selectedAnalysis.id === 'independent_ttest' || selectedAnalysis.id === 'mann_whitney_u') && slot.key === 'group'
                            return (
                              <LevelSelector
                                key={varName}
                                variableName={varName}
                                levels={levels}
                                selected={selectedLevels}
                                onChange={updateLevelValues}
                                min={isTwoGroupTest ? 2 : (selectedAnalysis.id === 'one_way_anova' && slot.key === 'factor' ? 2 : 1)}
                                max={isTwoGroupTest ? 2 : undefined}
                              />
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>

                  {/* 옵션 */}
                  {selectedAnalysis.options && selectedAnalysis.options.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-4">
                      {selectedAnalysis.options.map(opt => (
                        <div key={opt.key}>
                          <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">{opt.label}</p>
                          <select
                            value={optValues[opt.key] ?? opt.default}
                            onChange={e => setOptValues(prev => ({ ...prev, [opt.key]: e.target.value }))}
                            className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-900"
                          >
                            {opt.choices.map(c => (
                              <option key={c.value} value={c.value}>{c.label}</option>
                            ))}
                          </select>
                          {opt.unit && <span className="text-xs text-gray-400 dark:text-gray-300 ml-1.5">{opt.unit}</span>}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 검증 메시지 */}
                  {!validation.ok && validation.messages.length > 0 && (
                    <div className="mt-4 p-3 bg-red-50 rounded-lg">
                      <p className="text-xs font-semibold text-red-700 mb-1">분석을 실행하기 위해 필요한 항목</p>
                      <ul className="text-xs text-red-600 list-disc list-inside space-y-0.5">
                        {validation.messages.map((msg, i) => <li key={i}>{msg}</li>)}
                      </ul>
                    </div>
                  )}

                  <div className="mt-5 flex items-center gap-3">
                    <Btn
                      onClick={runAnalysis}
                      loading={running}
                      disabled={!validation.ok}
                      size="md"
                    >
                      <PlayCircle className="w-4 h-4" /> 분석 실행
                    </Btn>
                    <Btn
                      variant="ghost"
                      size="sm"
                      onClick={() => { setAssigned({}); setGroupValues([]); setLevelValues({}); setResult(null) }}
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> 초기화
                    </Btn>
                  </div>
                </Card>

                {/* 결과 */}
                {result && (
                  <Card padding="md" className="min-h-[200px]">
                    {result.ok ? (
                      <>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                          <div>
                            <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">{result.title}</h3>
                            {renderResultSummary()}
                          </div>
                          <div className="flex gap-2">
                            {result.tables && result.tables.length > 0 && (
                              <Btn variant="secondary" size="sm" onClick={exportCSV}>
                                <Download className="w-3.5 h-3.5" /> CSV
                              </Btn>
                            )}
                            <Btn
                              size="sm"
                              className="bg-purple-600 hover:bg-purple-700 border-purple-600"
                              onClick={() => {
                                const today = new Date().toISOString().slice(0, 10)
                                setRegisterForm({
                                  title: result.title ?? '',
                                  performed_at: today,
                                  purpose: '',
                                  result_summary: result.tables
                                    ? `${result.tables.length}개 테이블, ${session?.total_rows ?? 0}행 분석`
                                    : '',
                                  policy_applied: false,
                                })
                                setShowRegisterModal(true)
                              }}
                            >
                              <Check className="w-3.5 h-3.5" /> 실적 등록
                            </Btn>
                          </div>
                        </div>
                        {result.tables?.map((t, i) => (
                          <ResultTableView key={i} table={t} />
                        ))}
                        {result.charts && result.charts.length > 0 && (
                          <div className="mt-2 pt-4 border-t border-gray-100">
                            <ResultCharts charts={result.charts} />
                          </div>
                        )}
                        {!result.tables?.length && !result.charts?.length && (
                          <EmptyState
                            icon={<BarChart2 className="w-6 h-6 text-gray-400 dark:text-gray-300" />}
                            title="결과가 비어 있습니다"
                            description="분석은 성공했으나 출력할 테이블이나 차트가 없습니다."
                          />
                        )}
                      </>
                    ) : (
                      <div className="flex items-start gap-3 text-red-700 bg-red-50 rounded-lg p-4">
                        <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          <p className="text-sm font-semibold">분석 실행 중 오류가 발생했습니다</p>
                          <p className="text-sm mt-1">{result.error}</p>
                        </div>
                        <Btn
                          variant="ghost"
                          size="sm"
                          onClick={() => setResult(null)}
                          className="text-red-600 hover:text-red-800 hover:bg-red-100"
                        >
                          닫기
                        </Btn>
                      </div>
                    )}
                  </Card>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* 분석 실적 등록 모달 */}
      <Modal
        open={showRegisterModal}
        onClose={() => setShowRegisterModal(false)}
        title="분석 실적 등록"
        size="md"
      >
        <div className="p-6 space-y-4">
          <h3 className="text-sm font-semibold text-gray-800">분석 실적 등록</h3>
          <p className="text-xs text-gray-500">평가편람 분석·활용 ①-1 지표에 반영됩니다.</p>
          <div className="space-y-3">
            <div>
              <label htmlFor="ar-title" className="block text-xs font-medium text-gray-600 mb-1">분석명 *</label>
              <input
                id="ar-title"
                className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-purple-300 focus:outline-none"
                value={registerForm.title}
                onChange={e => setRegisterForm(p => ({ ...p, title: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="ar-performed-at" className="block text-xs font-medium text-gray-600 mb-1">수행일 *</label>
              <input
                id="ar-performed-at"
                type="date"
                className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-purple-300 focus:outline-none"
                value={registerForm.performed_at}
                onChange={e => setRegisterForm(p => ({ ...p, performed_at: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="ar-purpose" className="block text-xs font-medium text-gray-600 mb-1">분석 목적</label>
              <input
                id="ar-purpose"
                className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-purple-300 focus:outline-none"
                placeholder="예: 정책 수립을 위한 데이터 분석"
                value={registerForm.purpose}
                onChange={e => setRegisterForm(p => ({ ...p, purpose: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="ar-summary" className="block text-xs font-medium text-gray-600 mb-1">결과 요약</label>
              <textarea
                id="ar-summary"
                rows={2}
                className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-purple-300 focus:outline-none resize-none"
                value={registerForm.result_summary}
                onChange={e => setRegisterForm(p => ({ ...p, result_summary: e.target.value }))}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={registerForm.policy_applied}
                onChange={e => setRegisterForm(p => ({ ...p, policy_applied: e.target.checked }))}
                className="rounded"
              />
              정책 반영 완료
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Btn variant="ghost" size="sm" onClick={() => setShowRegisterModal(false)}>취소</Btn>
            <Btn
              size="sm"
              className="bg-purple-600 hover:bg-purple-700 border-purple-600"
              disabled={!registerForm.title.trim() || !registerForm.performed_at || registerSaving}
              onClick={async () => {
                setRegisterSaving(true)
                try {
                  await fetch('/api/pipeline/analysis', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      title:          registerForm.title,
                      performed_at:   registerForm.performed_at,
                      purpose:        registerForm.purpose || undefined,
                      datasets_used:  session ? [session.source_label] : [],
                      result_summary: registerForm.result_summary || undefined,
                      policy_applied: registerForm.policy_applied,
                    }),
                  })
                  setShowRegisterModal(false)
                } finally {
                  setRegisterSaving(false)
                }
              }}
            >
              {registerSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              등록
            </Btn>
          </div>
        </div>
      </Modal>
    </div>
  )
}
