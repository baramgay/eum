'use client'

import { useMemo, useState } from 'react'
import type { AggFunc, Rule, Row, ProcessError, WhenCondition } from '@/lib/processor'
import { validateRules } from '@/lib/processor'
import Modal from '@/components/ui/Modal'
import PreviewPanel from './PreviewPanel'
import { Btn, Badge } from '@/components/ui'
import {
  Settings2, Type, Calendar, Filter, Eraser, Trash2,
  ArrowUp, ArrowDown, Plus, Eye, Save, X, AlertCircle,
} from 'lucide-react'

interface RuleEditorProps {
  pipelineId: string
  initialRules: Rule[]
  onSave: (rules: Rule[]) => Promise<void>
  onClose: () => void
}

type RuleType = Rule['type']

interface RuleTypeMeta {
  value: RuleType
  label: string
  icon: React.ReactNode
}

const RULE_TYPES: RuleTypeMeta[] = [
  { value: 'select',    label: '컬럼 선택',    icon: <Settings2 className="w-3 h-3" /> },
  { value: 'rename',    label: '이름 변경',    icon: <Type className="w-3 h-3" /> },
  { value: 'cast',      label: '타입 변환',    icon: <Type className="w-3 h-3" /> },
  { value: 'nullfill',  label: 'NULL 채우기',  icon: <Eraser className="w-3 h-3" /> },
  { value: 'nulldrop',  label: 'NULL 행 제거', icon: <Trash2 className="w-3 h-3" /> },
  { value: 'filter',    label: '행 필터',      icon: <Filter className="w-3 h-3" /> },
  { value: 'normalize', label: '문자 정규화',  icon: <Type className="w-3 h-3" /> },
  { value: 'derive',    label: '파생 컬럼',    icon: <Calendar className="w-3 h-3" /> },
  { value: 'dedup',     label: '중복 제거',    icon: <Trash2 className="w-3 h-3" /> },
  { value: 'codemap',   label: '코드 치환',    icon: <Settings2 className="w-3 h-3" /> },
  { value: 'concat',    label: '컬럼 합치기',  icon: <Plus className="w-3 h-3" /> },
  { value: 'split',     label: '컬럼 분리',    icon: <Settings2 className="w-3 h-3" /> },
  { value: 'aggregate', label: '그룹 집계',    icon: <Settings2 className="w-3 h-3" /> },
  { value: 'join',      label: '테이블 조인',  icon: <Plus className="w-3 h-3" /> },
  { value: 'pivot',     label: '피벗',         icon: <Settings2 className="w-3 h-3" /> },
]

const AGG_OPTIONS: { value: AggFunc; label: string }[] = [
  { value: 'sum',   label: '합계' },
  { value: 'count', label: '건수' },
  { value: 'mean',  label: '평균' },
  { value: 'max',   label: '최대' },
  { value: 'min',   label: '최소' },
]

function defaultRule(type: RuleType): Rule {
  switch (type) {
    case 'select':    return { type: 'select',    mode: 'include', columns: [] }
    case 'rename':    return { type: 'rename',    from: '', to: '' }
    case 'cast':      return { type: 'cast',      column: '', to: 'string' }
    case 'nullfill':  return { type: 'nullfill',  column: '', value: '' }
    case 'nulldrop':  return { type: 'nulldrop',  columns: [] }
    case 'filter':    return { type: 'filter',    column: '', op: '==', value: '' }
    case 'normalize': return { type: 'normalize', column: '', fn: 'trim' }
    case 'derive':    return { type: 'derive',    target: '', expr: 'year', source: '' }
    case 'dedup':     return { type: 'dedup',     keys: [] }
    case 'codemap':   return { type: 'codemap',   column: '', map: {}, fallback: 'keep' }
    case 'concat':    return { type: 'concat',    target: '', sources: [], separator: ' ' }
    case 'split':     return { type: 'split',     column: '', separator: ',', targets: [] }
    case 'aggregate': return { type: 'aggregate', groupBy: [], column: '', agg: 'sum', target: '' }
    case 'join':      return { type: 'join',      datasetId: '', on: '', how: 'left' }
    case 'pivot':     return { type: 'pivot',     index: '', columns: '', values: '', agg: 'sum' }
  }
}

function RuleForm({ rule, onChange }: { rule: Rule; onChange: (r: Rule) => void }) {
  switch (rule.type) {
    case 'select':
      return (
        <div className="flex flex-col gap-1 text-xs">
          <select
            className="border rounded px-2 py-1"
            value={rule.mode}
            onChange={e => onChange({ ...rule, mode: e.target.value as 'include' | 'exclude' })}
          >
            <option value="include">포함</option>
            <option value="exclude">제외</option>
          </select>
          <input
            className="border rounded px-2 py-1"
            placeholder="컬럼명 (쉼표 구분)"
            value={rule.columns.join(',')}
            onChange={e => onChange({ ...rule, columns: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
          />
        </div>
      )
    case 'rename':
      return (
        <div className="flex gap-1 text-xs">
          <input className="border rounded px-2 py-1 flex-1" placeholder="기존 컬럼명" value={rule.from}
            onChange={e => onChange({ ...rule, from: e.target.value })} />
          <span className="self-center">→</span>
          <input className="border rounded px-2 py-1 flex-1" placeholder="새 컬럼명" value={rule.to}
            onChange={e => onChange({ ...rule, to: e.target.value })} />
        </div>
      )
    case 'cast':
      return (
        <div className="flex gap-1 text-xs">
          <input className="border rounded px-2 py-1 flex-1" placeholder="컬럼명" value={rule.column}
            onChange={e => onChange({ ...rule, column: e.target.value })} />
          <select className="border rounded px-2 py-1" value={rule.to}
            onChange={e => onChange({ ...rule, to: e.target.value as 'number' | 'string' | 'date' })}>
            <option value="number">숫자</option>
            <option value="string">문자</option>
            <option value="date">날짜</option>
          </select>
        </div>
      )
    case 'nullfill':
      return (
        <div className="flex gap-1 text-xs">
          <input className="border rounded px-2 py-1 flex-1" placeholder="컬럼명" value={rule.column}
            onChange={e => onChange({ ...rule, column: e.target.value })} />
          <input className="border rounded px-2 py-1 flex-1" placeholder="채울 값" value={String(rule.value ?? '')}
            onChange={e => onChange({ ...rule, value: e.target.value })} />
        </div>
      )
    case 'nulldrop':
      return (
        <input className="border rounded px-2 py-1 text-xs w-full" placeholder="컬럼명 (쉼표 구분)"
          value={rule.columns.join(',')}
          onChange={e => onChange({ ...rule, columns: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} />
      )
    case 'filter':
      return (
        <div className="flex gap-1 text-xs">
          <input className="border rounded px-2 py-1 flex-1" placeholder="컬럼명" value={rule.column}
            onChange={e => onChange({ ...rule, column: e.target.value })} />
          <select className="border rounded px-2 py-1" value={rule.op}
            onChange={e => onChange({ ...rule, op: e.target.value as Rule extends { type: 'filter' } ? Rule['op'] : never })}>
            {(['>', '<', '>=', '<=', '==', '!=', 'contains', 'startsWith', 'endsWith'] as const).map(op => (
              <option key={op} value={op}>{op}</option>
            ))}
          </select>
          <input className="border rounded px-2 py-1 flex-1" placeholder="비교값" value={String(rule.value ?? '')}
            onChange={e => onChange({ ...rule, value: e.target.value })} />
        </div>
      )
    case 'normalize':
      return (
        <div className="flex gap-1 text-xs">
          <input className="border rounded px-2 py-1 flex-1" placeholder="컬럼명" value={rule.column}
            onChange={e => onChange({ ...rule, column: e.target.value })} />
          <select className="border rounded px-2 py-1" value={rule.fn}
            onChange={e => onChange({ ...rule, fn: e.target.value as 'trim' | 'upper' | 'lower' })}>
            <option value="trim">trim</option>
            <option value="upper">대문자</option>
            <option value="lower">소문자</option>
          </select>
        </div>
      )
    case 'derive': {
      const needsFormat = rule.expr === 'dateformat'
      return (
        <div className="flex flex-col gap-1 text-xs">
          <div className="flex gap-1">
            <input className="border rounded px-2 py-1 flex-1" placeholder="소스 컬럼" value={rule.source}
              onChange={e => onChange({ ...rule, source: e.target.value })} />
            <select className="border rounded px-2 py-1"
              value={rule.expr}
              onChange={e => onChange({ ...rule, expr: e.target.value as typeof rule.expr, format: undefined })}>
              <optgroup label="날짜">
                <option value="year">연도</option>
                <option value="month">월</option>
                <option value="day">일</option>
                <option value="quarter">분기</option>
                <option value="weekday">요일(0=일)</option>
                <option value="hour">시간</option>
                <option value="dateformat">날짜 형식 변환</option>
              </optgroup>
            </select>
            <input className="border rounded px-2 py-1 flex-1" placeholder="대상 컬럼명" value={rule.target}
              onChange={e => onChange({ ...rule, target: e.target.value })} />
          </div>
          {needsFormat && (
            <input className="border rounded px-2 py-1 w-full" placeholder="형식 예: YYYY-MM-DD"
              value={(rule as { format?: string }).format ?? ''}
              onChange={e => onChange({ ...rule, format: e.target.value } as Rule)} />
          )}
        </div>
      )
    }
    case 'dedup':
      return (
        <div className="flex flex-col gap-1 text-xs">
          <input className="border rounded px-2 py-1 w-full"
            placeholder="기준 키 컬럼 (쉼표 구분, 비우면 전체 행 기준)"
            value={rule.keys.join(',')}
            onChange={e => onChange({ ...rule, keys: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} />
          <p className="text-gray-400 dark:text-gray-300">빈 칸이면 모든 컬럼 기준으로 완전 중복 제거</p>
        </div>
      )
    case 'codemap': {
      const mapStr = Object.entries(rule.map).map(([k, v]) => `${k}:${v}`).join('\n')
      return (
        <div className="flex flex-col gap-1 text-xs">
          <div className="flex gap-1">
            <input className="border rounded px-2 py-1 flex-1" placeholder="대상 컬럼"
              value={rule.column}
              onChange={e => onChange({ ...rule, column: e.target.value })} />
            <select className="border rounded px-2 py-1"
              value={rule.fallback ?? 'keep'}
              onChange={e => onChange({ ...rule, fallback: e.target.value as 'keep' | 'null' })}>
              <option value="keep">미일치 → 원본 유지</option>
              <option value="null">미일치 → NULL</option>
            </select>
          </div>
          <textarea className="border rounded px-2 py-1 w-full font-mono" rows={4}
            placeholder={"코드:치환값 (줄바꿈으로 구분)\n예)\n36110:창원시\n36120:진주시"}
            value={mapStr}
            onChange={e => {
              const map: Record<string, string> = {}
              e.target.value.split('\n').forEach(line => {
                const idx = line.indexOf(':')
                if (idx > 0) map[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
              })
              onChange({ ...rule, map })
            }} />
        </div>
      )
    }
    case 'concat':
      return (
        <div className="flex flex-col gap-1 text-xs">
          <div className="flex gap-1">
            <input className="border rounded px-2 py-1 flex-1" placeholder="결과 컬럼명"
              value={rule.target}
              onChange={e => onChange({ ...rule, target: e.target.value })} />
            <input className="border rounded px-2 py-1 w-20" placeholder="구분자"
              value={rule.separator}
              onChange={e => onChange({ ...rule, separator: e.target.value })} />
          </div>
          <input className="border rounded px-2 py-1 w-full"
            placeholder="합칠 컬럼들 (쉼표 구분)"
            value={rule.sources.join(',')}
            onChange={e => onChange({ ...rule, sources: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} />
        </div>
      )
    case 'split':
      return (
        <div className="flex flex-col gap-1 text-xs">
          <div className="flex gap-1">
            <input className="border rounded px-2 py-1 flex-1" placeholder="분리할 컬럼"
              value={rule.column}
              onChange={e => onChange({ ...rule, column: e.target.value })} />
            <input className="border rounded px-2 py-1 w-20" placeholder="구분자"
              value={rule.separator}
              onChange={e => onChange({ ...rule, separator: e.target.value })} />
          </div>
          <input className="border rounded px-2 py-1 w-full"
            placeholder="결과 컬럼명들 (쉼표 구분)"
            value={rule.targets.join(',')}
            onChange={e => onChange({ ...rule, targets: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} />
        </div>
      )
    case 'aggregate':
      return (
        <div className="flex flex-col gap-1 text-xs">
          <input className="border rounded px-2 py-1 w-full"
            placeholder="그룹 기준 컬럼 (쉼표 구분)"
            value={rule.groupBy.join(',')}
            onChange={e => onChange({ ...rule, groupBy: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} />
          <div className="flex gap-1">
            <select className="border rounded px-2 py-1"
              value={rule.agg}
              onChange={e => onChange({ ...rule, agg: e.target.value as AggFunc })}>
              {AGG_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <input className="border rounded px-2 py-1 flex-1" placeholder="집계할 컬럼"
              value={rule.column}
              onChange={e => onChange({ ...rule, column: e.target.value })} />
            <input className="border rounded px-2 py-1 flex-1" placeholder="결과 컬럼명 (비우면 자동)"
              value={rule.target ?? ''}
              onChange={e => onChange({ ...rule, target: e.target.value })} />
          </div>
        </div>
      )
    case 'join':
      return (
        <div className="flex flex-col gap-1 text-xs">
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded px-2 py-1 text-amber-700 dark:text-amber-300 text-[10px]">
            서버 실행 시 처리됩니다 (미리보기에서는 걸러집니다)
          </div>
          <div className="flex gap-1">
            <input className="border rounded px-2 py-1 flex-1" placeholder="조인할 데이터셋 ID"
              value={rule.datasetId}
              onChange={e => onChange({ ...rule, datasetId: e.target.value })} />
            <select className="border rounded px-2 py-1"
              value={rule.how}
              onChange={e => onChange({ ...rule, how: e.target.value as 'left' | 'inner' | 'right' })}>
              <option value="left">LEFT JOIN</option>
              <option value="inner">INNER JOIN</option>
              <option value="right">RIGHT JOIN</option>
            </select>
          </div>
          <input className="border rounded px-2 py-1 w-full" placeholder="조인 키 컬럼"
            value={rule.on}
            onChange={e => onChange({ ...rule, on: e.target.value })} />
        </div>
      )
    case 'pivot':
      return (
        <div className="flex flex-col gap-1 text-xs">
          <div className="flex gap-1">
            <input className="border rounded px-2 py-1 flex-1" placeholder="인덱스 컬럼"
              value={rule.index}
              onChange={e => onChange({ ...rule, index: e.target.value })} />
            <input className="border rounded px-2 py-1 flex-1" placeholder="피벗 컬럼 (새 헤더)"
              value={rule.columns}
              onChange={e => onChange({ ...rule, columns: e.target.value })} />
          </div>
          <div className="flex gap-1">
            <input className="border rounded px-2 py-1 flex-1" placeholder="값 컬럼"
              value={rule.values}
              onChange={e => onChange({ ...rule, values: e.target.value })} />
            <select className="border rounded px-2 py-1"
              value={rule.agg}
              onChange={e => onChange({ ...rule, agg: e.target.value as AggFunc })}>
              {AGG_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
      )
  }
}

export default function RuleEditor({ pipelineId, initialRules, onSave, onClose }: RuleEditorProps) {
  const [rules, setRules]         = useState<Rule[]>(initialRules)
  const [addType, setAddType]     = useState<RuleType>('select')
  const [saving, setSaving]       = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [previewData, setPreviewData] = useState<{
    before: Row[]; after: Row[]; errors: ProcessError[]
  } | null>(null)

  const validationErrors = useMemo(() => validateRules(rules as unknown[]), [rules])
  const hasErrors = validationErrors.length > 0

  function updateRule(i: number, r: Rule) {
    setRules(prev => prev.map((x, idx) => idx === i ? r : x))
  }
  function deleteRule(i: number) {
    setRules(prev => prev.filter((_, idx) => idx !== i))
  }
  function moveUp(i: number) {
    if (i === 0) return
    setRules(prev => { const a = [...prev]; [a[i-1], a[i]] = [a[i], a[i-1]]; return a })
  }
  function moveDown(i: number) {
    setRules(prev => {
      if (i >= prev.length - 1) return prev
      const a = [...prev]; [a[i], a[i+1]] = [a[i+1], a[i]]; return a
    })
  }
  function addRule() {
    setRules(prev => [...prev, defaultRule(addType)])
  }

  async function runPreview() {
    if (hasErrors) return
    setPreviewing(true)
    try {
      const res = await fetch(`/api/process/${pipelineId}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules }),
      })
      const data = await res.json()
      if (!res.ok) {
        setPreviewData({ before: [], after: [], errors: [{ rowIndex: 0, ruleIndex: 0, message: data.error ?? '미리보기 실패' }] })
        return
      }
      setPreviewData(data)
    } finally {
      setPreviewing(false)
    }
  }

  async function handleSave() {
    if (hasErrors) return
    setSaving(true)
    try { await onSave(rules) } finally { setSaving(false) }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="규칙 편집"
      description="데이터 처리 규칙을 추가·수정·삭제합니다"
      size="lg"
      className="max-w-3xl"
      showCloseButton={false}
    >
      <div className="flex items-center justify-between p-4 border-b flex-shrink-0">
        <div className="flex items-center gap-2">
          <Settings2 className="w-5 h-5 text-blue-600" />
          <h2 className="font-semibold text-gray-800 dark:text-gray-200">규칙 편집</h2>
          <Badge variant="blue">{rules.length}개</Badge>
        </div>
        <button onClick={onClose} className="text-gray-400 dark:text-gray-300 hover:text-gray-600 dark:hover:text-gray-400 p-1"><X className="w-5 h-5" /></button>
      </div>

      <div className="p-4 space-y-3 overflow-y-auto flex-1">
          {hasErrors && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              <div className="text-xs text-red-700 dark:text-red-300">
                <p className="font-semibold mb-1">저장 전 아래 오류를 해결하세요</p>
                <ul className="space-y-0.5">
                  {validationErrors.map(e => (
                    <li key={e.index}>규칙 {e.index + 1} ({RULE_TYPES.find(t => t.value === e.type)?.label ?? e.type}): {e.message}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {rules.length === 0 && (
            <p className="text-sm text-gray-400 dark:text-gray-300 italic text-center py-4">규칙이 없습니다. 아래에서 추가하세요.</p>
          )}
          {rules.map((rule, i) => {
            const meta = RULE_TYPES.find(t => t.value === rule.type)
            const isInvalid = validationErrors.some(e => e.index === i)
            return (
              <div key={i} className={`border rounded p-3 ${isInvalid ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' : 'bg-gray-50 dark:bg-gray-950'}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded flex items-center gap-1 ${
                    isInvalid ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300' : 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                  }`}>
                    {meta?.icon}
                    {i + 1}. {meta?.label ?? rule.type}
                  </span>
                  <div className="flex gap-1">
                    <button onClick={() => moveUp(i)}
                      className="text-xs px-1.5 py-0.5 border rounded text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40"
                      disabled={i === 0}><ArrowUp className="w-3 h-3" /></button>
                    <button onClick={() => moveDown(i)}
                      className="text-xs px-1.5 py-0.5 border rounded text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40"
                      disabled={i === rules.length - 1}><ArrowDown className="w-3 h-3" /></button>
                    <button onClick={() => deleteRule(i)}
                      className="text-xs px-1.5 py-0.5 border rounded text-red-500 hover:bg-red-50 flex items-center gap-0.5">
                      <Trash2 className="w-3 h-3" /> 삭제
                    </button>
                  </div>
                </div>
                <RuleForm rule={rule} onChange={r => updateRule(i, r)} />
                {/* 조건부 적용 (when) */}
                <details className="mt-2 border-t pt-2">
                  <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600 select-none">
                    조건 (when){(rule as Rule & { when?: WhenCondition }).when && (
                      <span className="ml-1 text-blue-500">●</span>
                    )}
                  </summary>
                  <div className="mt-2 flex flex-wrap gap-1.5 items-center text-xs">
                    <input
                      className="border rounded px-2 py-1 w-28"
                      placeholder="컬럼명"
                      value={(rule as Rule & { when?: WhenCondition }).when?.column ?? ''}
                      onChange={e => {
                        const cur = (rule as Rule & { when?: WhenCondition }).when
                        const next: WhenCondition = { column: e.target.value, op: cur?.op ?? '==', value: cur?.value ?? '' }
                        updateRule(i, e.target.value ? { ...rule, when: next } as Rule : { ...rule, when: undefined } as Rule)
                      }}
                    />
                    <select
                      className="border rounded px-2 py-1"
                      value={(rule as Rule & { when?: WhenCondition }).when?.op ?? '=='}
                      onChange={e => {
                        const cur = (rule as Rule & { when?: WhenCondition }).when
                        if (!cur) return
                        updateRule(i, { ...rule, when: { ...cur, op: e.target.value as WhenCondition['op'] } } as Rule)
                      }}
                    >
                      <option value="==">==</option>
                      <option value="!=">!=</option>
                      <option value=">">{'>'}</option>
                      <option value="<">{'<'}</option>
                      <option value=">=">{'>='}</option>
                      <option value="<=">{'<='}</option>
                    </select>
                    <input
                      className="border rounded px-2 py-1 w-28"
                      placeholder="값"
                      value={String((rule as Rule & { when?: WhenCondition }).when?.value ?? '')}
                      onChange={e => {
                        const cur = (rule as Rule & { when?: WhenCondition }).when
                        if (!cur) return
                        updateRule(i, { ...rule, when: { ...cur, value: e.target.value } } as Rule)
                      }}
                    />
                    {(rule as Rule & { when?: WhenCondition }).when && (
                      <button
                        type="button"
                        className="text-red-400 hover:text-red-600 text-xs"
                        onClick={() => updateRule(i, { ...rule, when: undefined } as Rule)}
                      >
                        제거
                      </button>
                    )}
                  </div>
                </details>
              </div>
            )
          })}

          <div className="flex gap-2 items-center pt-2 border-t">
            <select
              className="border rounded px-2 py-1 text-sm flex-1"
              value={addType}
              onChange={e => setAddType(e.target.value as RuleType)}
            >
              {RULE_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <Btn onClick={addRule} size="sm"><Plus className="w-3.5 h-3.5" /> 규칙 추가</Btn>
          </div>
        </div>

        {previewData && (
          <div className="px-4 pb-4">
            <PreviewPanel
              before={previewData.before}
              after={previewData.after}
              errors={previewData.errors}
            />
          </div>
        )}

      <div className="flex justify-end gap-2 p-4 border-t bg-gray-50 dark:bg-gray-950 flex-shrink-0">
        <Btn
          variant="secondary"
          size="sm"
          onClick={runPreview}
          loading={previewing}
          disabled={hasErrors}
        >
          <Eye className="w-3.5 h-3.5" /> 미리보기
        </Btn>
        <Btn variant="secondary" size="sm" onClick={onClose}>취소</Btn>
        <Btn
          size="sm"
          onClick={handleSave}
          loading={saving}
          disabled={hasErrors}
        >
          <Save className="w-3.5 h-3.5" /> 저장
        </Btn>
      </div>
    </Modal>
  )
}
