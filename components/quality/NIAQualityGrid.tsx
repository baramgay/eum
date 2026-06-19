'use client'

import { NIA_CHARACTERISTICS, type NIACharacteristic } from '@/lib/quality-nia'

interface NIAScore {
  characteristic: NIACharacteristic
  score: number        // 0–100
  violations: number
  checked: number
}

interface NIAQualityGridProps {
  scores?: NIAScore[]
}

const CHARS = Object.keys(NIA_CHARACTERISTICS) as NIACharacteristic[]

function getStatusColor(score: number): string {
  if (score >= 99) return 'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-700'
  if (score >= 90) return 'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-700'
  if (score >= 0)  return 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-700'
  return 'bg-gray-50 border-gray-200 dark:bg-gray-800 dark:border-gray-700'
}

function getScoreText(score: number): string {
  if (score >= 99) return 'text-emerald-700 dark:text-emerald-400'
  if (score >= 90) return 'text-amber-700 dark:text-amber-400'
  return 'text-red-700 dark:text-red-400'
}

function getDotColor(score: number): string {
  if (score >= 99) return 'bg-emerald-500'
  if (score >= 90) return 'bg-amber-500'
  return 'bg-red-500'
}

export default function NIAQualityGrid({ scores }: NIAQualityGridProps) {
  const scoreMap = new Map(scores?.map(s => [s.characteristic, s]) ?? [])

  return (
    <div className="space-y-3">
      <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-4">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />≥99% 통과</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />≥90% 경고</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />&lt;90% 위반</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300 inline-block" />미측정</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {CHARS.map((key, idx) => {
          const meta = NIA_CHARACTERISTICS[key]
          const data = scoreMap.get(key)
          const score = data?.score ?? -1
          const hasData = score >= 0

          return (
            <div
              key={key}
              className={`border rounded-lg p-3 transition-colors ${hasData ? getStatusColor(score) : 'bg-gray-50 border-gray-200 dark:bg-gray-800 dark:border-gray-700'}`}
            >
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${hasData ? getDotColor(score) : 'bg-gray-300 dark:bg-gray-600'}`} />
                  <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                    {idx + 1}. {meta.label}
                  </span>
                </div>
                {hasData && (
                  <span className={`text-sm font-bold tabular-nums ${getScoreText(score)}`}>
                    {score.toFixed(2)}%
                  </span>
                )}
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed mb-2">
                {meta.description}
              </p>
              {hasData && data && data.violations > 0 && (
                <div className="text-[11px] text-red-600 dark:text-red-400">
                  위반 {data.violations.toLocaleString()}건 / {data.checked.toLocaleString()}건
                </div>
              )}
              {!hasData && (
                <div className="text-[11px] text-gray-400 dark:text-gray-500">
                  {key === 'algorithmicAdequacy'
                    ? 'ML 학습 데이터 검증 단계에서 측정 — 현재 미적용'
                    : key === 'readiness'
                    ? '수집 계획·메타데이터 연동 시 자동 측정'
                    : '품질 계약 편집에서 규칙 추가 가능'}
                </div>
              )}
              <div className="flex flex-wrap gap-1 mt-1.5">
                {meta.stage.map(s => (
                  <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-white/60 dark:bg-gray-900/40 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600">
                    {s === 'acquisition' ? '수집' : s === 'cleansing' ? '정제' : s === 'annotation' ? '가공' : '검증'}
                  </span>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
