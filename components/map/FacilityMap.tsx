'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'

interface Facility {
  facility_id: string; sgg_cd: string; sigun: string
  ftype: string; name: string; lon: number; lat: number; capacity: number
}

const MapInner = dynamic(() => import('./MapInner'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-gray-400 text-sm">
      지도 로딩 중...
    </div>
  ),
})

// MapInner의 FTYPE_COLOR와 동일하게 유지
export const FTYPE_COLOR: Record<string, string> = {
  '청년센터': '#EC4899',
  '도서관':   '#2563EB',
  '체육관':   '#F59E0B',
  '문화센터': '#8B5CF6',
}

const FTYPE_EMOJI: Record<string, string> = {
  '청년센터': '👤',
  '도서관':   '📖',
  '체육관':   '🏋️',
  '문화센터': '🎵',
}

const FTYPES = ['청년센터', '도서관', '체육관', '문화센터']

interface Props { facilities: Facility[] }

export default function FacilityMap({ facilities }: Props) {
  const [activeTypes, setActiveTypes] = useState<Set<string>>(new Set(FTYPES))

  function toggle(ftype: string) {
    setActiveTypes(prev => {
      const next = new Set(prev)
      if (next.has(ftype)) next.delete(ftype); else next.add(ftype)
      return next
    })
  }

  const filtered = facilities.filter(f => activeTypes.has(f.ftype))

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-gray-800">공공시설 지도</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          경남 18 시군 공공시설 {facilities.length}개소 — 마커 클릭으로 상세 정보 확인
        </p>
      </div>

      {/* 시설 유형 필터 */}
      <div className="flex flex-wrap items-center gap-2 bg-white rounded-xl border p-3 shadow-sm">
        <span className="text-xs font-medium text-gray-400 mr-1">시설 유형:</span>
        {FTYPES.map(ft => (
          <button
            key={ft}
            onClick={() => toggle(ft)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
              activeTypes.has(ft)
                ? 'text-white border-transparent shadow-sm'
                : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'
            }`}
            style={activeTypes.has(ft) ? { backgroundColor: FTYPE_COLOR[ft] } : {}}
          >
            <span>{FTYPE_EMOJI[ft]}</span>
            <span>{ft}</span>
            <span className="text-xs opacity-70">
              {facilities.filter(f => f.ftype === ft).length}
            </span>
          </button>
        ))}
        <span className="ml-auto text-xs text-gray-400">표시 중 {filtered.length}개소</span>
      </div>

      {/* 지도 */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden" style={{ height: '560px' }}>
        <MapInner facilities={filtered} />
      </div>

      {/* 범례 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {FTYPES.map(ft => {
          const count = facilities.filter(f => f.ftype === ft).length
          const color = FTYPE_COLOR[ft]
          return (
            <div key={ft} className="bg-white rounded-xl border p-3 flex items-center gap-3 shadow-sm">
              {/* 미니 핀 인디케이터 */}
              <div className="shrink-0 flex flex-col items-center" style={{ width: 20 }}>
                <div className="w-4 h-4 rounded-full border-2 border-white shadow"
                     style={{ backgroundColor: color }} />
                <div className="w-0 h-0"
                     style={{
                       borderLeft: '4px solid transparent',
                       borderRight: '4px solid transparent',
                       borderTop: `6px solid ${color}`,
                     }} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{ft}</p>
                <p className="text-xs text-gray-400">{count}개소</p>
              </div>
              <span className="ml-auto text-lg shrink-0">{FTYPE_EMOJI[ft]}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
