'use client'

import { useState, useCallback } from 'react'
import { Plus, Trash2, Save, ChevronDown, ChevronRight, Info } from 'lucide-react'
import { NIA_CHARACTERISTICS, type NIACharacteristic } from '@/lib/quality-nia'
import type { ContractCheck, ContractRule, QualityContract } from '@/lib/quality-contract'

// ─── 품질 계약 템플릿 ────────────────────────────────────────────────────────

const TEMPLATES: Array<{
  id: string
  label: string
  desc: string
  rules: ContractRule[]
}> = [
  {
    id: 'population',
    label: '인구통계 데이터',
    desc: '연도, 성별, 지역코드 등 인구통계 기본 검증',
    rules: [
      { name: 'NULL 금지 — 기준연도', niaTrait: 'completeness', check: { type: 'not_null', column: 'year' } },
      { name: '연도 범위 검증', niaTrait: 'validity', check: { type: 'year_range', column: 'year', min: 2000, max: 2030 } },
      { name: '인구수 양수 검증', niaTrait: 'syntacticAccuracy', check: { type: 'range', column: 'population', min: 0 } },
      { name: '행정구역코드 형식', niaTrait: 'standardConformance', check: { type: 'not_null', column: 'region_code' } },
    ],
  },
  {
    id: 'facility',
    label: '시설 데이터',
    desc: '공공시설 좌표·분류코드 필수값 검증',
    rules: [
      { name: 'NULL 금지 — 시설명', niaTrait: 'completeness', check: { type: 'not_null', column: 'fac_name' } },
      { name: 'NULL 금지 — 위도', niaTrait: 'completeness', check: { type: 'not_null', column: 'lat' } },
      { name: 'NULL 금지 — 경도', niaTrait: 'completeness', check: { type: 'not_null', column: 'lng' } },
      { name: '위도 범위 (경남)', niaTrait: 'syntacticAccuracy', check: { type: 'range', column: 'lat', min: 34.5, max: 35.8 } },
      { name: '경도 범위 (경남)', niaTrait: 'syntacticAccuracy', check: { type: 'range', column: 'lng', min: 127.5, max: 129.5 } },
    ],
  },
  {
    id: 'business',
    label: '사업체 데이터',
    desc: '사업체 기본 필드 및 코드값 검증',
    rules: [
      { name: 'NULL 금지 — 사업체명', niaTrait: 'completeness', check: { type: 'not_null', column: 'biz_name' } },
      { name: '기준연도 범위', niaTrait: 'validity', check: { type: 'year_range', column: 'base_year', min: 2010, max: 2030 } },
      { name: '종사자수 음수 금지', niaTrait: 'syntacticAccuracy', check: { type: 'range', column: 'employee_count', min: 0 } },
    ],
  },
  {
    id: 'spatial',
    label: '공간(GIS) 데이터',
    desc: 'GeoJSON/좌표 데이터 기본 검증',
    rules: [
      { name: 'NULL 금지 — geometry', niaTrait: 'completeness', check: { type: 'not_null', column: 'geom' } },
      { name: 'NULL 금지 — 지역코드', niaTrait: 'standardConformance', check: { type: 'not_null', column: 'region_code' } },
    ],
  },
]

// ─── 체크 타입별 NIA 특성 추천 ───────────────────────────────────────────────

const CHECK_TYPE_NIA: Record<ContractCheck['type'], NIACharacteristic[]> = {
  not_null:   ['completeness'],
  range:      ['syntacticAccuracy', 'validity'],
  in:         ['standardConformance', 'syntacticAccuracy'],
  year_range: ['validity', 'syntacticAccuracy'],
  or_null:    ['completeness'],
  rpc:        ['validity', 'algorithmicAdequacy'],
}

// ─── 체크 타입 메타 ──────────────────────────────────────────────────────────

const CHECK_TYPE_META: Record<ContractCheck['type'], { label: string; desc: string }> = {
  not_null:   { label: 'NULL 금지', desc: '해당 컬럼에 NULL/빈값이 없어야 함' },
  range:      { label: '범위 검사', desc: '숫자 값이 min~max 범위 내에 있어야 함' },
  in:         { label: '코드값 검사', desc: '허용된 코드값 목록에 속해야 함' },
  year_range: { label: '연도 범위', desc: '연도값이 지정 범위 내에 있어야 함' },
  or_null:    { label: 'OR NULL', desc: '나열된 컬럼 중 최소 1개는 값이 있어야 함' },
  rpc:        { label: 'RPC 함수', desc: 'Supabase RPC 함수를 호출해 위반건수 반환' },
}

// ─── 빈 규칙 생성 ────────────────────────────────────────────────────────────

function emptyRule(): ContractRule {
  return { name: '', area: 'completeness', check: { type: 'not_null', column: '' } }
}

// ─── 체크 에디터 (인라인) ────────────────────────────────────────────────────

interface CheckEditorProps {
  check: ContractCheck
  onChange: (c: ContractCheck) => void
}

function CheckEditor({ check, onChange }: CheckEditorProps) {
  const input = (
    label: string,
    value: string,
    key: string,
    placeholder?: string,
  ) => (
    <div className="flex flex-col gap-0.5">
      <label className="text-[10px] text-gray-500 dark:text-gray-400">{label}</label>
      <input
        className="border border-gray-200 dark:border-gray-700 rounded px-2 py-1 text-xs bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-400"
        value={value}
        placeholder={placeholder}
        onChange={e => onChange({ ...check, [key]: e.target.value } as ContractCheck)}
      />
    </div>
  )

  const numInput = (label: string, value: number | undefined, key: string) => (
    <div className="flex flex-col gap-0.5">
      <label className="text-[10px] text-gray-500 dark:text-gray-400">{label}</label>
      <input
        type="number"
        className="border border-gray-200 dark:border-gray-700 rounded px-2 py-1 text-xs bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 w-24 focus:outline-none focus:ring-1 focus:ring-blue-400"
        value={value ?? ''}
        onChange={e => onChange({ ...check, [key]: e.target.value === '' ? undefined : Number(e.target.value) } as ContractCheck)}
      />
    </div>
  )

  switch (check.type) {
    case 'not_null':
      return input('컬럼', check.column, 'column', 'column_name')

    case 'range':
      return (
        <div className="flex flex-wrap gap-2">
          {input('컬럼', check.column, 'column', 'column_name')}
          {numInput('최솟값', check.min, 'min')}
          {numInput('최댓값', check.max, 'max')}
        </div>
      )

    case 'in':
      return (
        <div className="flex flex-col gap-1.5">
          {input('컬럼', check.column, 'column', 'column_name')}
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] text-gray-500 dark:text-gray-400">허용 값 (쉼표 구분)</label>
            <input
              className="border border-gray-200 dark:border-gray-700 rounded px-2 py-1 text-xs bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-400"
              value={check.values.join(', ')}
              placeholder="A, B, C"
              onChange={e => onChange({ ...check, values: e.target.value.split(',').map(v => v.trim()).filter(Boolean) })}
            />
          </div>
        </div>
      )

    case 'year_range':
      return (
        <div className="flex flex-wrap gap-2">
          {input('컬럼', check.column, 'column', 'column_name')}
          {numInput('시작 연도', check.min, 'min')}
          {numInput('종료 연도', check.max, 'max')}
        </div>
      )

    case 'or_null':
      return (
        <div className="flex flex-col gap-0.5">
          <label className="text-[10px] text-gray-500 dark:text-gray-400">컬럼 목록 (쉼표 구분)</label>
          <input
            className="border border-gray-200 dark:border-gray-700 rounded px-2 py-1 text-xs bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-400"
            value={check.columns.join(', ')}
            placeholder="col_a, col_b"
            onChange={e => onChange({ ...check, columns: e.target.value.split(',').map(v => v.trim()).filter(Boolean) })}
          />
        </div>
      )

    case 'rpc':
      return input('RPC 함수명', check.name, 'name', 'fn_quality_check')

    default:
      return null
  }
}

// ─── 단일 규칙 행 ────────────────────────────────────────────────────────────

interface RuleRowProps {
  rule: ContractRule
  index: number
  onChange: (r: ContractRule) => void
  onDelete: () => void
}

function RuleRow({ rule, index, onChange, onDelete }: RuleRowProps) {
  const [open, setOpen] = useState(true)
  const recommendedNia = CHECK_TYPE_NIA[rule.check.type] ?? []

  function changeCheckType(type: ContractCheck['type']) {
    const defaults: Record<ContractCheck['type'], ContractCheck> = {
      not_null:   { type: 'not_null', column: '' },
      range:      { type: 'range', column: '', min: undefined, max: undefined },
      in:         { type: 'in', column: '', values: [] },
      year_range: { type: 'year_range', column: '', min: 2000, max: 2030 },
      or_null:    { type: 'or_null', columns: [] },
      rpc:        { type: 'rpc', name: '' },
    }
    onChange({ ...rule, check: defaults[type] })
  }

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800">
        <button
          onClick={() => setOpen(o => !o)}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 flex-shrink-0"
        >
          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>
        <span className="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0 w-5 text-right">#{index + 1}</span>
        <input
          className="flex-1 text-xs font-medium bg-transparent text-gray-800 dark:text-gray-200 border-none outline-none placeholder:text-gray-400"
          value={rule.name}
          placeholder="규칙 이름"
          onChange={e => onChange({ ...rule, name: e.target.value })}
        />
        <select
          className="text-[10px] border border-gray-200 dark:border-gray-600 rounded px-1.5 py-1 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300"
          value={rule.check.type}
          onChange={e => changeCheckType(e.target.value as ContractCheck['type'])}
        >
          {(Object.keys(CHECK_TYPE_META) as ContractCheck['type'][]).map(t => (
            <option key={t} value={t}>{CHECK_TYPE_META[t].label}</option>
          ))}
        </select>
        <button
          onClick={onDelete}
          className="text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 flex-shrink-0"
          title="규칙 삭제"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 상세 */}
      {open && (
        <div className="px-3 py-2.5 space-y-2.5 bg-white dark:bg-gray-900">
          {/* 체크 에디터 */}
          <CheckEditor
            check={rule.check}
            onChange={check => onChange({ ...rule, check })}
          />
          {/* NIA 특성 선택 */}
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-[10px] text-gray-500 dark:text-gray-400 flex-shrink-0">NIA 특성:</label>
            <select
              className="text-[10px] border border-gray-200 dark:border-gray-600 rounded px-1.5 py-1 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-400"
              value={rule.niaTrait ?? ''}
              onChange={e => onChange({ ...rule, niaTrait: (e.target.value || undefined) as NIACharacteristic | undefined })}
            >
              <option value="">-- 자동 (체크 타입 기본값) --</option>
              {(Object.keys(NIA_CHARACTERISTICS) as NIACharacteristic[]).map(c => {
                const meta = NIA_CHARACTERISTICS[c]
                const isRecommended = recommendedNia.includes(c)
                return (
                  <option key={c} value={c}>
                    {meta.shortLabel} ({meta.label}){isRecommended ? ' ★' : ''}
                  </option>
                )
              })}
            </select>
            {rule.niaTrait && (() => {
              const meta = NIA_CHARACTERISTICS[rule.niaTrait]
              return (
                <span className="text-[10px] px-1.5 py-0.5 rounded text-white flex-shrink-0"
                  style={{ backgroundColor: meta.color + 'cc' }}>
                  {meta.shortLabel}
                </span>
              )
            })()}
            {!rule.niaTrait && recommendedNia.length > 0 && (
              <span className="text-[10px] text-gray-400 dark:text-gray-500 flex items-center gap-1">
                <Info className="w-3 h-3 flex-shrink-0" />
                추천: {recommendedNia.map(c => NIA_CHARACTERISTICS[c].shortLabel).join(', ')}
              </span>
            )}
          </div>
          {/* 체크 타입 설명 */}
          <p className="text-[10px] text-gray-400 dark:text-gray-500">
            {CHECK_TYPE_META[rule.check.type].desc}
          </p>
        </div>
      )}
    </div>
  )
}

// ─── 메인 에디터 ─────────────────────────────────────────────────────────────

interface QualityContractEditorProps {
  datasetId: string
  initialContract: QualityContract | null
  onSaved?: (contract: QualityContract | null) => void
}

export default function QualityContractEditor({
  datasetId,
  initialContract,
  onSaved,
}: QualityContractEditorProps) {
  const [rules, setRules] = useState<ContractRule[]>(
    initialContract?.rules ?? []
  )
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const addRule = useCallback(() => {
    setRules(prev => [...prev, emptyRule()])
  }, [])

  const updateRule = useCallback((index: number, rule: ContractRule) => {
    setRules(prev => prev.map((r, i) => i === index ? rule : r))
  }, [])

  const deleteRule = useCallback((index: number) => {
    setRules(prev => prev.filter((_, i) => i !== index))
  }, [])

  async function save() {
    setSaving(true)
    setSaveMsg(null)
    try {
      const contract: QualityContract | null = rules.length > 0 ? { rules } : null
      const res = await fetch(`/api/catalog/${encodeURIComponent(datasetId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quality_contract: contract }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error ?? `HTTP ${res.status}`)
      }
      setSaveMsg({ ok: true, text: '품질 계약이 저장되었습니다.' })
      onSaved?.(contract)
    } catch (e) {
      setSaveMsg({ ok: false, text: `저장 실패: ${e instanceof Error ? e.message : '알 수 없는 오류'}` })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-gray-800 dark:text-gray-200">품질 계약 편집</div>
          <div className="text-[11px] text-gray-500 dark:text-gray-400">
            규칙을 정의하면 품질 검사 시 자동 실행됩니다
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={addRule}
            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-dashed border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
          >
            <Plus className="w-3.5 h-3.5" />
            규칙 추가
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-300 disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>

      {/* 저장 메시지 */}
      {saveMsg && (
        <div className={`text-xs px-3 py-2 rounded-lg border ${
          saveMsg.ok
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-700 dark:text-emerald-400'
            : 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-700 dark:text-red-400'
        }`}>
          {saveMsg.text}
        </div>
      )}

      {/* 템플릿 선택 */}
      <div className="flex flex-wrap items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-700">
        <span className="text-xs text-blue-700 dark:text-blue-400 font-medium flex-shrink-0">템플릿 적용:</span>
        {TEMPLATES.map(t => (
          <button
            key={t.id}
            onClick={() => {
              if (rules.length > 0 && !confirm(`현재 ${rules.length}개 규칙을 "${t.label}" 템플릿으로 교체할까요?`)) return
              setRules(t.rules)
              setSaveMsg(null)
            }}
            title={t.desc}
            className="text-xs px-2.5 py-1 rounded-lg border border-blue-300 dark:border-blue-600 text-blue-700 dark:text-blue-300 bg-white dark:bg-gray-900 hover:bg-blue-100 dark:hover:bg-blue-800/30 transition-colors"
          >
            {t.label}
          </button>
        ))}
        <span className="text-[10px] text-blue-500 dark:text-blue-400">클릭 시 현재 규칙이 교체됩니다</span>
      </div>

      {/* 규칙 목록 */}
      {rules.length === 0 ? (
        <div className="text-center py-8 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
          <p className="text-xs text-gray-400 dark:text-gray-500">품질 계약 규칙이 없습니다</p>
          <p className="text-[11px] text-gray-300 dark:text-gray-600 mt-0.5">
            &quot;규칙 추가&quot; 버튼으로 첫 규칙을 정의하세요
          </p>
          <button
            onClick={addRule}
            className="mt-3 text-xs px-3 py-1.5 rounded-lg border border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
          >
            + 규칙 추가
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {rules.map((rule, idx) => (
            <RuleRow
              key={idx}
              rule={rule}
              index={idx}
              onChange={r => updateRule(idx, r)}
              onDelete={() => deleteRule(idx)}
            />
          ))}
        </div>
      )}

      {/* NIA 체크 타입 안내 */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-3 bg-gray-50 dark:bg-gray-800 space-y-2">
        <div className="text-xs font-medium text-gray-600 dark:text-gray-400">체크 유형별 NIA 특성 연계</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {(Object.keys(CHECK_TYPE_META) as ContractCheck['type'][]).map(t => (
            <div key={t} className="flex items-start gap-1.5">
              <div className="text-[10px]">
                <span className="font-medium text-gray-700 dark:text-gray-300">{CHECK_TYPE_META[t].label}</span>
                <div className="flex flex-wrap gap-0.5 mt-0.5">
                  {(CHECK_TYPE_NIA[t] ?? []).map(c => {
                    const meta = NIA_CHARACTERISTICS[c]
                    return (
                      <span key={c} className="px-1 py-0.5 rounded text-white text-[9px]"
                        style={{ backgroundColor: meta.color + 'bb' }}>
                        {meta.shortLabel}
                      </span>
                    )
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
