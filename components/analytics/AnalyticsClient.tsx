'use client'

import { useState, useCallback, useRef } from 'react'
import {
  Upload, Database, ChevronDown, ChevronRight, PlayCircle,
  X, AlertCircle, Loader2, BarChart2, Info,
} from 'lucide-react'

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
}

interface AnalysisResult {
  ok: boolean
  title?: string
  tables?: ResultTable[]
  error?: string
}

interface ResultTable {
  title: string
  headers: string[]
  rows: (string | number | null)[][]
  footnotes?: string[]
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
    ],
  },
  {
    group: '회귀',
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
        <table className="w-full text-sm">
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
// 메인 컴포넌트
// ────────────────────────────────────────────

interface Props { role: string; tenantId: string }

export default function AnalyticsClient({ role, tenantId }: Props) {
  const [session, setSession]   = useState<SessionState | null>(null)
  const [loading, setLoading]   = useState(false)
  const [loadError, setLoadError] = useState('')

  const [selectedAnalysis, setSelectedAnalysis] = useState<AnalysisMenuItem | null>(null)
  const [assigned, setAssigned] = useState<Record<string, string[]>>({})
  const [optValues, setOptValues] = useState<Record<string, string>>({})

  const [running, setRunning]   = useState(false)
  const [result, setResult]     = useState<AnalysisResult | null>(null)
  const [showPreview, setShowPreview] = useState(false)

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

  async function handleLoadCatalog() {
    // 카탈로그 목록에서 선택하는 간단한 prompt
    const catalogId = window.prompt('카탈로그 ID를 입력하세요 (예: CAT-0001)')
    if (!catalogId) return
    setLoading(true); setLoadError('')
    try {
      // 카탈로그 데이터 JSON 다운로드
      const res = await fetch(`/api/catalog/${catalogId.trim()}/download?format=json`)
      if (!res.ok) throw new Error(`카탈로그 조회 실패: ${res.status}`)
      const json = await res.json()
      const rows: unknown[] = Array.isArray(json) ? json : json.rows ?? []

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
        source_label: catalogId,
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
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: session.session_id,
          analysis_type: selectedAnalysis.id,
          variables: assigned,
          options: optValues,
        }),
      })
      const json = await res.json()
      setResult(json)
    } catch (e) {
      setResult({ ok: false, error: String(e) })
    } finally {
      setRunning(false)
    }
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
              onClick={handleLoadCatalog}
              disabled={loading}
              className="flex-1 flex flex-col items-center gap-3 p-6 border-2 border-dashed border-gray-300 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-all cursor-pointer group"
            >
              <Database className="w-8 h-8 text-gray-400 group-hover:text-blue-500" />
              <div>
                <p className="font-semibold text-gray-700 text-sm">카탈로그 로드</p>
                <p className="text-xs text-gray-400 mt-0.5">등록된 데이터셋 ID 입력</p>
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

      {/* 메인 분석 화면 */}
      {session && (
        <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-4">
          {/* ── 왼쪽 패널 ── */}
          <div className="space-y-4">
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
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1">
                <Info className="w-3.5 h-3.5" /> 변수 목록 (타입 클릭 변경)
              </p>
              <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
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
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">분석 선택</p>
              <div className="space-y-3">
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
          </div>

          {/* ── 오른쪽 패널 ── */}
          <div className="space-y-4">
            {!selectedAnalysis && (
              <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
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

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                          <div className="border border-gray-200 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
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
                    disabled={running}
                    className="mt-5 flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {running
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> 분석 중...</>
                      : <><PlayCircle className="w-4 h-4" /> 분석 실행</>}
                  </button>
                </div>

                {/* 결과 */}
                {result && (
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    {result.ok ? (
                      <>
                        <h3 className="text-base font-bold text-gray-900 mb-4">{result.title}</h3>
                        {result.tables?.map((t, i) => (
                          <ResultTableView key={i} table={t} />
                        ))}
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
