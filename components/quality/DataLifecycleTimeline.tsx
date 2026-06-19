'use client'

import { DATA_LIFECYCLE_STAGES, getNIACharacteristicsForStage, NIA_CHARACTERISTICS, type DataLifecycleStage } from '@/lib/quality-nia'

const STAGES: DataLifecycleStage[] = ['acquisition', 'cleansing', 'annotation', 'validation']

interface DataLifecycleTimelineProps {
  activeStage?: DataLifecycleStage
  stageStatus?: Partial<Record<DataLifecycleStage, 'done' | 'active' | 'pending'>>
}

export default function DataLifecycleTimeline({ activeStage, stageStatus }: DataLifecycleTimelineProps) {
  return (
    <div className="space-y-4">
      {/* 타임라인 헤더 */}
      <div className="relative">
        <div className="flex items-center justify-between">
          {STAGES.map((stage, idx) => {
            const meta = DATA_LIFECYCLE_STAGES[stage]
            const status = stageStatus?.[stage] ?? (stage === activeStage ? 'active' : 'pending')
            const isLast = idx === STAGES.length - 1

            return (
              <div key={stage} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-1">
                  {/* 단계 원형 */}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-base font-bold border-2 transition-all
                    ${status === 'done'    ? 'bg-emerald-500 border-emerald-600 text-white' :
                      status === 'active'  ? 'border-2 text-white' :
                                            'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-400'}`}
                    style={status === 'active' ? { backgroundColor: meta.color, borderColor: meta.color } : {}}
                  >
                    {status === 'done' ? '✓' : idx + 1}
                  </div>
                  {/* 단계 레이블 */}
                  <div className={`text-[11px] font-medium mt-1.5 text-center leading-tight
                    ${status === 'done' ? 'text-emerald-600 dark:text-emerald-400' :
                      status === 'active' ? 'text-gray-800 dark:text-gray-200' :
                                           'text-gray-400 dark:text-gray-500'}`}>
                    {meta.label}
                  </div>
                </div>
                {/* 연결선 */}
                {!isLast && (
                  <div className="flex-shrink-0 w-8 h-0.5 mt-[-1.5rem] bg-gray-200 dark:bg-gray-700" />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* 단계별 상세 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {STAGES.map((stage) => {
          const meta = DATA_LIFECYCLE_STAGES[stage]
          const relatedChars = getNIACharacteristicsForStage(stage)
          const status = stageStatus?.[stage] ?? (stage === activeStage ? 'active' : 'pending')

          return (
            <div
              key={stage}
              className={`border rounded-xl p-3 transition-colors
                ${status === 'done'   ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-900/20' :
                  status === 'active' ? 'border-2 bg-white dark:bg-gray-900' :
                                       'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 opacity-70'}`}
              style={status === 'active' ? { borderColor: meta.color } : {}}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">{meta.icon}</span>
                <span className={`text-xs font-semibold
                  ${status === 'active' ? 'text-gray-800 dark:text-gray-200' : 'text-gray-600 dark:text-gray-400'}`}>
                  {meta.label}
                </span>
                {status === 'done' && (
                  <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400">
                    완료
                  </span>
                )}
                {status === 'active' && (
                  <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full text-white"
                    style={{ backgroundColor: meta.color }}>
                    진행중
                  </span>
                )}
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-2">{meta.description}</p>
              <div className="space-y-1">
                {meta.activities.map(act => (
                  <div key={act} className="flex items-center gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-gray-400 dark:bg-gray-500 flex-shrink-0" />
                    <span className="text-[11px] text-gray-600 dark:text-gray-400">{act}</span>
                  </div>
                ))}
              </div>
              {relatedChars.length > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 flex flex-wrap gap-1">
                  {relatedChars.map(c => (
                    <span key={c} className="text-[10px] px-1.5 py-0.5 rounded text-white"
                      style={{ backgroundColor: NIA_CHARACTERISTICS[c].color + 'cc' }}>
                      {NIA_CHARACTERISTICS[c].shortLabel}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
