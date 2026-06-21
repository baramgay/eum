'use client'

import { GRADE_COLOR, formatK, type SettlementRow } from '../DashboardClient'
import SortableTable from '@/components/common/SortableTable'

interface SettlementRankWidgetProps {
  settlement: SettlementRow[]
}

export default function SettlementRankWidget({ settlement }: SettlementRankWidgetProps) {
  const maxPop = settlement[0]?.youth_pop_2025 ?? 1

  const rankColumns: import('@/components/common/SortableTable').TableColumn<SettlementRow>[] = [
    {
      key: 'rank',
      label: '순위',
      align: 'center',
      sortable: true,
      sortValue: r => r.rank,
      width: 60,
      render: (r, i) => (
        <span
          className="inline-block w-6 h-6 rounded-full text-xs font-bold text-white flex items-center justify-center"
          style={{ backgroundColor: GRADE_COLOR[Math.min(i, GRADE_COLOR.length - 1)] }}
        >
          {r.rank}
        </span>
      ),
    },
    {
      key: 'sigun',
      label: '시군',
      sortable: true,
      sortValue: r => r.sigun,
      render: r => <span className="font-medium text-gray-800 dark:text-gray-200">{r.sigun}</span>,
    },
    {
      key: 'youth_pop_2025',
      label: '청년인구(2025)',
      align: 'right',
      sortable: true,
      sortValue: r => r.youth_pop_2025,
      render: r => (
        <div className="flex items-center justify-end gap-1">
          <div className="bg-gray-100 dark:bg-gray-800 rounded-full h-1.5 w-20">
            <div
              className="bg-indigo-400 h-1.5 rounded-full"
              style={{ width: `${(r.youth_pop_2025 / maxPop) * 100}%` }}
            />
          </div>
          <span className="text-xs">{formatK(r.youth_pop_2025)}</span>
        </div>
      ),
    },
    {
      key: 'youth_pop_change_rate',
      label: '인구증감(%)',
      align: 'right',
      sortable: true,
      sortValue: r => r.youth_pop_change_rate,
      render: r => (
        <span className={`text-sm font-medium ${r.youth_pop_change_rate >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
          {r.youth_pop_change_rate >= 0 ? '+' : ''}{r.youth_pop_change_rate.toFixed(1)}%
        </span>
      ),
    },
    {
      key: 'living_index',
      label: '생활인구지수',
      align: 'right',
      sortable: true,
      sortValue: r => r.living_index,
      render: r => <span className="text-xs text-gray-600 dark:text-gray-400">{r.living_index.toFixed(1)}</span>,
    },
    {
      key: 'income_monthly',
      label: '월평균소득',
      align: 'right',
      sortable: true,
      sortValue: r => r.income_monthly,
      render: r => <span className="text-xs text-gray-600 dark:text-gray-400">{r.income_monthly}만원</span>,
    },
    {
      key: 'settlement_score',
      label: '정착잠재지수',
      sortable: true,
      sortValue: r => r.settlement_score,
      render: (r, i) => (
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-full h-2">
            <div
              className="h-2 rounded-full"
              style={{
                width: `${Math.max(5, ((r.settlement_score + 4) / 8) * 100)}%`,
                backgroundColor: GRADE_COLOR[Math.min(i, GRADE_COLOR.length - 1)],
              }}
            />
          </div>
          <span className={`text-xs font-semibold w-10 text-right ${r.settlement_score >= 0 ? 'text-blue-700' : 'text-red-600'}`}>
            {r.settlement_score >= 0 ? '+' : ''}{r.settlement_score.toFixed(2)}
          </span>
        </div>
      ),
    },
  ]

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b bg-indigo-50 dark:bg-indigo-900/20">
        <h3 className="text-base font-semibold text-indigo-800 dark:text-indigo-200">
          경남 시군별 청년 정착잠재지수 종합순위
        </h3>
        <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-0.5">
          KT/KB/KCB/주민등록 4대 데이터소스 통합 — 2018~2025 경남빅데이터센터 분석
        </p>
      </div>
      <SortableTable
        caption="경남 시군별 청년 정착잠재지수 순위"
        data={settlement}
        keyExtractor={r => r.sigun}
        minWidth="56rem"
        columns={rankColumns}
      />
      <div className="px-5 py-2 bg-gray-50 dark:bg-gray-950 border-t">
        <p className="text-xs text-gray-400 dark:text-gray-300">
          정착잠재지수: 인구변화·이동·생활인구·소득·신용 5개 지표 표준화 합산 | 양수=정착 잠재력 높음 | 음수=유출 압력 높음
        </p>
      </div>
    </div>
  )
}
