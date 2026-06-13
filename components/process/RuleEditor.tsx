'use client'

import { useState } from 'react'
import type { Rule, Row, ProcessError } from '@/lib/processor'
import PreviewPanel from './PreviewPanel'

interface RuleEditorProps {
  pipelineId: string
  initialRules: Rule[]
  onSave: (rules: Rule[]) => Promise<void>
  onClose: () => void
}

type RuleType = Rule['type']

const RULE_TYPES: { value: RuleType; label: string }[] = [
  { value: 'select',    label: '컬럼 선택' },
  { value: 'rename',    label: '컬럼 이름 변경' },
  { value: 'cast',      label: '타입 변환' },
  { value: 'nullfill',  label: 'NULL 채우기' },
  { value: 'nulldrop',  label: 'NULL 행 제거' },
  { value: 'filter',    label: '행 필터' },
  { value: 'normalize', label: '문자 정규화' },
  { value: 'derive',    label: '파생 컬럼' },
  { value: 'dedup',     label: '중복 제거' },
  { value: 'codemap',   label: '코드 치환' },
  { value: 'concat',    label: '컬럼 합치기' },
  { value: 'split',     label: '컬럼 분리' },
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
          <p className="text-gray-400">빈 칸이면 모든 컬럼 기준으로 완전 중복 제거</p>
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
    setPreviewing(true)
    try {
      const res = await fetch(`/api/process/${pipelineId}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules }),
      })
      const data = await res.json()
      setPreviewData(data)
    } finally {
      setPreviewing(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    try { await onSave(rules) } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold text-gray-800">규칙 편집</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <div className="p-4 space-y-3">
          {rules.length === 0 && (
            <p className="text-sm text-gray-400 italic text-center py-4">규칙이 없습니다. 아래에서 추가하세요.</p>
          )}
          {rules.map((rule, i) => (
            <div key={i} className="border rounded p-3 bg-gray-50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                  {i + 1}. {RULE_TYPES.find(t => t.value === rule.type)?.label ?? rule.type}
                </span>
                <div className="flex gap-1">
                  <button onClick={() => moveUp(i)}
                    className="text-xs px-1.5 py-0.5 border rounded text-gray-500 hover:bg-gray-100"
                    disabled={i === 0}>▲</button>
                  <button onClick={() => moveDown(i)}
                    className="text-xs px-1.5 py-0.5 border rounded text-gray-500 hover:bg-gray-100"
                    disabled={i === rules.length - 1}>▼</button>
                  <button onClick={() => deleteRule(i)}
                    className="text-xs px-1.5 py-0.5 border rounded text-red-500 hover:bg-red-50">삭제</button>
                </div>
              </div>
              <RuleForm rule={rule} onChange={r => updateRule(i, r)} />
            </div>
          ))}

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
            <button
              onClick={addRule}
              className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
            >
              + 규칙 추가
            </button>
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

        <div className="flex justify-end gap-2 p-4 border-t bg-gray-50">
          <button
            onClick={runPreview}
            disabled={previewing}
            className="px-4 py-1.5 border rounded text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
          >
            {previewing ? '미리보기 중...' : '미리보기'}
          </button>
          <button onClick={onClose} className="px-4 py-1.5 border rounded text-sm text-gray-600 hover:bg-gray-100">
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
