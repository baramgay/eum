'use client'

import { useState, useEffect, useCallback } from 'react'
import { ONE_CYCLE_CHECKPOINTS, NIA_CHARACTERISTICS, getStakeholderRole, type CyclePhase } from '@/lib/quality-nia'

const PHASE_COLORS: Record<CyclePhase, string> = {
  sample:     '#64748b',
  initial:    '#3b82f6',
  midterm:    '#f59e0b',
  supplement: '#ec4899',
  final:      '#8b5cf6',
}

interface OneCycleChecklistProps {
  datasetId?: string
}

export default function OneCycleChecklist({ datasetId }: OneCycleChecklistProps) {
  const [activePhase, setActivePhase] = useState<CyclePhase>('sample')
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [persisting, setPersisting] = useState(false)

  // 마운트/datasetId 변경 시 DB에서 복원
  useEffect(() => {
    if (!datasetId) return
    fetch(`/api/quality/checklist?dataset_id=${encodeURIComponent(datasetId)}`)
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d.checked_ids)) setChecked(new Set(d.checked_ids))
      })
      .catch(() => {})
  }, [datasetId])

  const persistChecked = useCallback(async (next: Set<string>) => {
    if (!datasetId) return
    setPersisting(true)
    try {
      await fetch('/api/quality/checklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataset_id: datasetId, checked_ids: Array.from(next) }),
      })
    } catch (e) {
      console.warn('[OneCycleChecklist] 저장 실패:', e)
    } finally {
      setPersisting(false)
    }
  }, [datasetId])

  const checkpoint = ONE_CYCLE_CHECKPOINTS.find(c => c.phase === activePhase)!
  const requiredItems = checkpoint.items.filter(i => i.required)
  const requiredChecked = requiredItems.filter(i => checked.has(i.id)).length
  const allRequiredDone = requiredItems.length > 0 && requiredChecked === requiredItems.length
  const totalChecked = checkpoint.items.filter(i => checked.has(i.id)).length

  function toggleItem(id: string) {
    setChecked(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      persistChecked(next)
      return next
    })
  }

  function clearPhase() {
    setChecked(prev => {
      const next = new Set(prev)
      checkpoint.items.forEach(i => next.delete(i.id))
      persistChecked(next)
      return next
    })
  }

  return (
    <div className="space-y-4">
      {/* 단계 탭 */}
      <div className="flex flex-wrap gap-1.5">
        {ONE_CYCLE_CHECKPOINTS.map((cp, idx) => {
          const phaseChecked = cp.items.filter(i => checked.has(i.id)).length
          const phaseRequired = cp.items.filter(i => i.required).length
          const phaseDone = phaseRequired > 0 && cp.items.filter(i => i.required && checked.has(i.id)).length === phaseRequired

          return (
            <button
              key={cp.phase}
              onClick={() => setActivePhase(cp.phase)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border
                ${activePhase === cp.phase
                  ? 'text-white border-transparent'
                  : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-gray-300'}`}
              style={activePhase === cp.phase ? { backgroundColor: PHASE_COLORS[cp.phase] } : {}}
            >
              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold
                ${phaseDone ? 'bg-emerald-500 text-white' :
                  activePhase === cp.phase ? 'bg-white/30 text-white' :
                                            'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
                {phaseDone ? '✓' : idx + 1}
              </span>
              {cp.label}
              <span className={`text-[10px] px-1.5 rounded-full
                ${activePhase === cp.phase ? 'bg-white/20 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500'}`}>
                {cp.progress}
              </span>
              {phaseChecked > 0 && (
                <span className="text-[10px]">
                  {phaseChecked}/{cp.items.length}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* 현재 단계 상세 */}
      <div className="border dark:border-gray-700 rounded-xl overflow-hidden">
        <div className="px-4 py-3 text-white"
          style={{ backgroundColor: PHASE_COLORS[activePhase] }}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">{checkpoint.label} ({checkpoint.progress})</div>
              <div className="text-xs opacity-80 mt-0.5">{checkpoint.description}</div>
            </div>
            <div className="text-right">
              <div className="text-xs opacity-80">담당</div>
              <div className="text-xs font-medium flex items-center gap-1.5 justify-end">
                {getStakeholderRole(activePhase)}
                {persisting && <span className="text-[10px] text-white/60">저장 중…</span>}
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 space-y-2 bg-white dark:bg-gray-900">
          {checkpoint.items.map(item => {
            const charMeta = NIA_CHARACTERISTICS[item.characteristic]
            const isChecked = checked.has(item.id)

            return (
              <label
                key={item.id}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors
                  ${isChecked
                    ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-700'
                    : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleItem(item.id)}
                  className="mt-0.5 flex-shrink-0 accent-emerald-500"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-gray-800 dark:text-gray-200">{item.text}</div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-[10px] px-1.5 py-0.5 rounded text-white"
                      style={{ backgroundColor: charMeta.color + 'cc' }}>
                      {charMeta.shortLabel}
                    </span>
                    {item.required && (
                      <span className="text-[10px] text-red-500 dark:text-red-400">필수</span>
                    )}
                  </div>
                </div>
                {isChecked && <span className="text-emerald-500 flex-shrink-0 text-sm">✓</span>}
              </label>
            )
          })}
        </div>

        {/* 진행 현황 */}
        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-gray-600 dark:text-gray-400">
              점검 현황 ({totalChecked}/{checkpoint.items.length}항목)
            </span>
            <div className="flex items-center gap-2">
              {allRequiredDone ? (
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                  ✓ 필수 항목 완료 — 다음 단계 진행 가능
                </span>
              ) : (
                <span className="text-xs text-amber-600 dark:text-amber-400">
                  필수 {requiredChecked}/{requiredItems.length} 완료
                </span>
              )}
              <button
                onClick={clearPhase}
                className="text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                초기화
              </button>
            </div>
          </div>
          <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${checkpoint.items.length > 0 ? (totalChecked / checkpoint.items.length) * 100 : 0}%`,
                backgroundColor: allRequiredDone ? '#10b981' : PHASE_COLORS[activePhase],
              }}
            />
          </div>
        </div>
      </div>

      {/* 전체 진행 요약 */}
      <div className="grid grid-cols-5 gap-1.5">
        {ONE_CYCLE_CHECKPOINTS.map(cp => {
          const phaseRequired = cp.items.filter(i => i.required)
          const phaseDone = phaseRequired.length > 0 && phaseRequired.filter(i => checked.has(i.id)).length === phaseRequired.length
          const phaseAny = cp.items.some(i => checked.has(i.id))

          return (
            <div key={cp.phase} className="text-center">
              <div className={`h-2 rounded-full mb-1
                ${phaseDone ? 'bg-emerald-500' : phaseAny ? 'bg-amber-400' : 'bg-gray-200 dark:bg-gray-700'}`} />
              <div className="text-[10px] text-gray-500 dark:text-gray-400">{cp.label}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
