'use client'

import dynamic from 'next/dynamic'
import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import {
  Search, SlidersHorizontal, List, LocateFixed, X, ChevronDown,
  MapPin, CircleDot, Flame, Phone, Clock, MapPinned, Building2,
  ImageOff, Check, Plus, Minus, ArrowRightLeft, Navigation,
  Info, Layers, Users, BookOpen, Dumbbell, Music, RotateCcw,
} from 'lucide-react'
import { Input, Select } from '@/components/ui'
import type { Facility, MapInnerRef, ClusterOptions } from './MapInner'
import { FTYPE_META, DEFAULT_META } from './MapPin'
import type { Cluster } from '@/lib/geo-cluster'
import type {
  HeatmapMode,
  HeatmapValueMode,
  HeatmapPalette,
  HeatmapCell,
} from '@/lib/heatmap'
import { getHeatmapColor } from '@/lib/heatmap'

const MapInner = dynamic(() => import('./MapInner'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-gray-100 dark:bg-gray-800">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-400 dark:text-gray-500">지도 로딩 중...</p>
      </div>
    </div>
  ),
})

export const FTYPE_COLOR: Record<string, string> = Object.fromEntries(
  Object.entries(FTYPE_META).map(([k, v]) => [k, v.color])
)

const FTYPE_ICON: Record<string, (className?: string) => React.ReactNode> = {
  '청년센터': (cn) => <Users className={cn ?? 'w-4 h-4'} />,
  '도서관':   (cn) => <BookOpen className={cn ?? 'w-4 h-4'} />,
  '체육관':   (cn) => <Dumbbell className={cn ?? 'w-4 h-4'} />,
  '문화센터': (cn) => <Music className={cn ?? 'w-4 h-4'} />,
}

const FTYPES = ['청년센터', '도서관', '체육관', '문화센터']

type LayerMode = 'marker' | 'cluster' | 'heatmap'

const LAYERS: { key: LayerMode; label: string; icon: React.ReactNode }[] = [
  { key: 'marker',  label: '마커',   icon: <MapPin className="w-3.5 h-3.5" /> },
  { key: 'cluster', label: '클러스터', icon: <CircleDot className="w-3.5 h-3.5" /> },
  { key: 'heatmap', label: '히트맵',  icon: <Flame className="w-3.5 h-3.5" /> },
]

const RADIUS_OPTIONS = [
  { value: 0, label: '반경 전체' },
  { value: 1, label: '1km' },
  { value: 3, label: '3km' },
  { value: 5, label: '5km' },
  { value: 10, label: '10km' },
]

interface FacilityDetail {
  image?: string
  address: string
  phone: string
  hours: string
  homepage?: string
  description: string
  services: string[]
}

const MOCK_DETAILS: Record<string, FacilityDetail> = {
  default: {
    address: '경상남도 내 위치',
    phone: '055-123-4567',
    hours: '평일 09:00 ~ 18:00 / 주말 10:00 ~ 17:00',
    homepage: 'https://www.gyeongnam.go.kr',
    description: '경남빅데이터센터 연계 공공시설로, 지역 주민을 위한 다양한 서비스를 제공합니다.',
    services: ['방문 접수', '시설 대관', '프로그램 안내', '주차'],
  },
}

function getFacilityDetail(f: Facility): FacilityDetail {
  const base = MOCK_DETAILS[f.facility_id] ?? MOCK_DETAILS.default
  return {
    ...base,
    address: base.address.replace('내 위치', f.sigun),
  }
}

interface Props { facilities: Facility[] }

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export default function FacilityMap({ facilities }: Props) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const mapRef = useRef<MapInnerRef>(null)

  const initialLayer: LayerMode = useMemo(() => {
    const param = searchParams?.get('layer')
    return LAYERS.some(l => l.key === param) ? (param as LayerMode) : 'marker'
  }, [searchParams])

  const [activeTypes, setActiveTypes] = useState<Set<string>>(new Set(FTYPES))
  const [search, setSearch] = useState('')
  const [showList, setShowList] = useState(false)
  const [showLegend, setShowLegend] = useState(false)
  const [layerMode, setLayerMode] = useState<LayerMode>(initialLayer)
  const [heatmapMode, setHeatmapMode] = useState<HeatmapMode>('grid')
  const [heatmapValueMode, setHeatmapValueMode] = useState<HeatmapValueMode>('count')
  const [heatmapPalette, setHeatmapPalette] = useState<HeatmapPalette>('default')
  const [selectedFacility, setSelectedFacility] = useState<Facility | null>(null)
  const [compareSet, setCompareSet] = useState<Set<string>>(new Set())
  const [showCompare, setShowCompare] = useState(false)
  const [radiusKm, setRadiusKm] = useState(0)
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(null)
  type Drilldown =
    | { type: 'heatmap'; cell: HeatmapCell; list: Facility[] }
    | { type: 'cluster'; cluster: Cluster<Facility & { id: string }>; list: Facility[] }
  const [drilldown, setDrilldown] = useState<Drilldown | null>(null)
  const [clusterOptions, setClusterOptions] = useState<ClusterOptions>({
    algorithm: 'dbscan',
    eps: 500,
    minPts: 3,
    k: 4,
  })
  const [locating, setLocating] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const listItemRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // 목록에서 선택된 시설로 스크롤
  useEffect(() => {
    if (!showList || !selectedFacility) return
    const el = listItemRefs.current[selectedFacility.facility_id]
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [showList, selectedFacility])

  const updateLayer = useCallback((mode: LayerMode) => {
    setLayerMode(mode)
    const params = new URLSearchParams(searchParams?.toString() ?? '')
    params.set('layer', mode)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }, [pathname, router, searchParams])

  function toggle(ftype: string) {
    setActiveTypes(prev => {
      const next = new Set(prev)
      if (next.has(ftype)) next.delete(ftype); else next.add(ftype)
      return next
    })
  }

  const filtered = useMemo(() => {
    let list = facilities.filter(f =>
      activeTypes.has(f.ftype) &&
      (!search || f.name.includes(search) || f.sigun.includes(search))
    )
    if (radiusKm > 0 && mapCenter) {
      list = list.filter(f =>
        haversineKm(mapCenter.lat, mapCenter.lng, f.lat, f.lon) <= radiusKm
      )
    }
    return list
  }, [facilities, activeTypes, search, radiusKm, mapCenter])

  const allActive = activeTypes.size === FTYPES.length

  const handleLocate = useCallback(() => {
    if (!navigator.geolocation) {
      window.alert('이 브라우저에서는 위치 서비스를 지원하지 않습니다.')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords
        mapRef.current?.setCenter(latitude, longitude)
        mapRef.current?.setCurrentLocation(latitude, longitude)
        setMapCenter({ lat: latitude, lng: longitude })
        setLocating(false)
      },
      (err) => {
        console.error(err)
        window.alert('현재 위치를 가져올 수 없습니다. 위치 권한을 허용해 주세요.')
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 8000 }
    )
  }, [])

  const handleResetView = useCallback(() => {
    mapRef.current?.resetView()
    setMapCenter(null)
  }, [])

  const toggleCompare = useCallback((f: Facility) => {
    setCompareSet(prev => {
      const next = new Set(prev)
      if (next.has(f.facility_id)) next.delete(f.facility_id)
      else if (next.size < 4) next.add(f.facility_id)
      return next
    })
    setShowCompare(true)
  }, [])

  const handleSelectFacility = useCallback((f: Facility, center = false) => {
    setSelectedFacility(f)
    if (center) {
      mapRef.current?.setCenter(f.lat, f.lon)
    }
  }, [])

  const comparedFacilities = useMemo(() =>
    facilities.filter(f => compareSet.has(f.facility_id)),
    [facilities, compareSet]
  )

  const detail = selectedFacility ? getFacilityDetail(selectedFacility) : null

  return (
    <div
      className="relative overflow-hidden rounded-2xl shadow-lg"
      style={{ height: 'calc(100vh - 120px)', minHeight: 560 }}
    >
      {/* 지도 레이어 */}
      <MapInner
        ref={mapRef}
        facilities={filtered}
        layerMode={layerMode}
        heatmapMode={heatmapMode}
        heatmapValueMode={heatmapValueMode}
        heatmapPalette={heatmapPalette}
        clusterOptions={clusterOptions}
        selectedFacilityId={selectedFacility?.facility_id}
        onSelectFacility={(f) => handleSelectFacility(f, false)}
        onCenterChange={setMapCenter}
        onHeatmapClick={(list, cell) => setDrilldown({ type: 'heatmap', list, cell })}
        onClusterClick={(list, cluster) => setDrilldown({ type: 'cluster', list, cluster })}
      />

      {/* ── 상단 오버레이: 검색바 + 필터 + 카테고리 칩 ── */}
      <div className="absolute top-3 left-3 right-3 z-10 flex flex-col gap-2 pointer-events-none">

        {/* 검색바 */}
        <div className="pointer-events-auto flex items-center gap-2 bg-white/96 dark:bg-gray-900/90 backdrop-blur-md rounded-2xl shadow-md px-4 py-2.5 border border-white/60 dark:border-gray-700/70">
          <Search className="w-4 h-4 text-gray-400 shrink-0" />
          <Input
            ref={searchRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="시설명, 시군으로 검색"
            className="flex-1 text-sm bg-transparent outline-none text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500"
          />
          {search && (
            <button
              onClick={() => { setSearch(''); searchRef.current?.focus() }}
              className="text-gray-300 hover:text-gray-500 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1" />
          <button
            onClick={() => setShowFilters(v => !v)}
            className={`transition-colors ${showFilters ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 hover:text-gray-600'}`}
            aria-pressed={showFilters}
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
        </div>

        {/* 레이어 모드 + 반경 필터 */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-white/96 dark:bg-gray-900/90 backdrop-blur-md rounded-xl shadow-md px-2 py-1.5 border border-white/60 dark:border-gray-700/70">
            {LAYERS.map(({ key, label, icon }) => {
              const active = layerMode === key
              return (
                <button
                  key={key}
                  onClick={() => updateLayer(key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    active
                      ? 'bg-gray-800 text-white shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                  aria-pressed={active}
                >
                  {icon}
                  <span>{label}</span>
                </button>
              )
            })}
          </div>

          {layerMode === 'heatmap' && (
            <div className="pointer-events-auto flex flex-wrap items-center gap-1.5">
              <div className="flex items-center gap-1 bg-white/96 dark:bg-gray-900/90 backdrop-blur-md rounded-xl shadow-md px-2 py-1.5 border border-white/60 dark:border-gray-700/70">
                {[
                  { key: 'grid', label: '격자' },
                  { key: 'kernel', label: '커널밀도' },
                ].map(({ key, label }) => {
                  const active = heatmapMode === key
                  return (
                    <button
                      key={key}
                      onClick={() => setHeatmapMode(key as HeatmapMode)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        active ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                      }`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>

              <div className="flex items-center gap-1 bg-white/96 dark:bg-gray-900/90 backdrop-blur-md rounded-xl shadow-md px-2 py-1.5 border border-white/60 dark:border-gray-700/70">
                <Select
                  value={heatmapValueMode}
                  onChange={(e) => setHeatmapValueMode(e.target.value as HeatmapValueMode)}
                  className="text-xs font-medium text-gray-700 dark:text-gray-300 bg-transparent outline-none"
                  aria-label="히트맵 값 기준"
                >
                  <option value="count">시설 개수</option>
                  <option value="capacity">수용인원</option>
                </Select>
              </div>

              <div className="flex items-center gap-1 bg-white/96 dark:bg-gray-900/90 backdrop-blur-md rounded-xl shadow-md px-2 py-1.5 border border-white/60 dark:border-gray-700/70">
                <Select
                  value={heatmapPalette}
                  onChange={(e) => setHeatmapPalette(e.target.value as HeatmapPalette)}
                  className="text-xs font-medium text-gray-700 dark:text-gray-300 bg-transparent outline-none"
                  aria-label="히트맵 색상 팔레트"
                >
                  <option value="default">기본</option>
                  <option value="flame">불꽃</option>
                  <option value="ocean">바다</option>
                </Select>
              </div>
            </div>
          )}

          {layerMode === 'cluster' && (
            <div className="pointer-events-auto flex items-center gap-1.5 bg-white/96 dark:bg-gray-900/90 backdrop-blur-md rounded-xl shadow-md px-2 py-1.5 border border-white/60 dark:border-gray-700/70">
              <Select
                value={clusterOptions.algorithm}
                onChange={(e) => setClusterOptions((o) => ({ ...o, algorithm: e.target.value as ClusterOptions['algorithm'] }))}
                className="text-xs font-medium text-gray-700 dark:text-gray-300 bg-transparent outline-none"
                aria-label="클러스터 알고리즘"
              >
                <option value="dbscan">DBSCAN</option>
                <option value="kmeans">K-Means</option>
              </Select>
              {clusterOptions.algorithm === 'dbscan' ? (
                <>
                  <Select
                    value={clusterOptions.eps}
                    onChange={(e) => setClusterOptions((o) => ({ ...o, eps: Number(e.target.value) }))}
                    className="text-xs font-medium text-gray-700 dark:text-gray-300 bg-transparent outline-none"
                    aria-label="클러스터 반경"
                  >
                    <option value={300}>300m</option>
                    <option value={500}>500m</option>
                    <option value={1000}>1km</option>
                  </Select>
                  <Select
                    value={clusterOptions.minPts}
                    onChange={(e) => setClusterOptions((o) => ({ ...o, minPts: Number(e.target.value) }))}
                    className="text-xs font-medium text-gray-700 dark:text-gray-300 bg-transparent outline-none"
                    aria-label="최소 점 수"
                  >
                    {[2, 3, 5, 10].map((v) => (
                      <option key={v} value={v}>최소 {v}개</option>
                    ))}
                  </Select>
                </>
              ) : (
                <Select
                  value={clusterOptions.k}
                  onChange={(e) => setClusterOptions((o) => ({ ...o, k: Number(e.target.value) }))}
                  className="text-xs font-medium text-gray-700 dark:text-gray-300 bg-transparent outline-none"
                  aria-label="클러스터 수"
                >
                  {[2, 3, 4, 5, 6, 7, 8].map((v) => (
                    <option key={v} value={v}>k={v}</option>
                  ))}
                </Select>
              )}
            </div>
          )}

          {showFilters && (
            <div className="flex items-center gap-1.5 bg-white/96 dark:bg-gray-900/90 backdrop-blur-md rounded-xl shadow-md px-2 py-1.5 border border-white/60 dark:border-gray-700/70">
              <Navigation className="w-3.5 h-3.5 text-blue-500" />
              <Select
                value={radiusKm}
                onChange={e => setRadiusKm(Number(e.target.value))}
                className="text-xs font-medium text-gray-700 dark:text-gray-300 bg-transparent outline-none"
                aria-label="반경 검색"
              >
                {RADIUS_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </Select>
            </div>
          )}
        </div>

        {/* 카테고리 필터 칩 */}
        <div
          className="pointer-events-auto flex items-center gap-1.5 overflow-x-auto"
          style={{ scrollbarWidth: 'none' }}
        >
          {/* 전체 칩 */}
          <button
            onClick={() => setActiveTypes(allActive ? new Set() : new Set(FTYPES))}
            className={`flex-shrink-0 flex items-center gap-1 px-3.5 py-1.5 rounded-full text-xs font-semibold shadow-sm border transition-all whitespace-nowrap ${
              allActive
                ? 'bg-gray-800 text-white border-transparent shadow-gray-800/20'
                : 'bg-white/90 dark:bg-gray-800/90 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 backdrop-blur-sm'
            }`}
          >
            전체
          </button>

          {FTYPES.map(ft => {
            const active = activeTypes.has(ft)
            const color = FTYPE_COLOR[ft]
            return (
              <button
                key={ft}
                onClick={() => toggle(ft)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold shadow-sm border transition-all whitespace-nowrap ${
                  active
                    ? 'text-white border-transparent'
                    : 'bg-white/90 dark:bg-gray-800/90 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 backdrop-blur-sm hover:border-gray-300 dark:hover:border-gray-600'
                }`}
                style={active ? { backgroundColor: color, boxShadow: `0 2px 8px ${color}40` } : {}}
              >
                <span>{FTYPE_ICON[ft]()}</span>
                <span>{ft}</span>
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] leading-none ${
                  active ? 'bg-white/20' : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
                }`}>
                  {facilities.filter(f => f.ftype === ft).length}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── 우하단 오버레이: 범례 ── */}
      <div className="absolute bottom-16 right-3 z-10">
        <button
          onClick={() => setShowLegend(v => !v)}
          className="flex items-center gap-1.5 bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm rounded-full px-3 py-1.5 text-xs text-gray-600 dark:text-gray-300 shadow border border-gray-200/80 dark:border-gray-700 hover:bg-white dark:hover:bg-gray-900 transition-all"
        >
          <span className="font-medium">범례</span>
          <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${showLegend ? 'rotate-180' : ''}`} />
        </button>
        {showLegend && (
          <div className="absolute bottom-full right-0 mb-2 bg-white/96 dark:bg-gray-900/96 backdrop-blur-md rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 p-3 min-w-[170px]">
            {layerMode === 'heatmap' ? (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                  {heatmapMode === 'grid' ? '격자 집계' : 'Gaussian 커널 밀도'} · {heatmapValueMode === 'count' ? '시설 개수' : '수용인원'}
                </p>
                <div
                  className="h-2 rounded-full w-full"
                  style={{
                    background: `linear-gradient(90deg, ${getHeatmapColor(0, heatmapPalette)}, ${getHeatmapColor(0.5, heatmapPalette)}, ${getHeatmapColor(1, heatmapPalette)})`,
                  }}
                />
                <div className="flex justify-between text-[10px] text-gray-400 dark:text-gray-500">
                  <span>낮음</span>
                  <span>높음</span>
                </div>
                <div className="border-t dark:border-gray-700 pt-2 space-y-1 text-[11px] text-gray-600 dark:text-gray-400">
                  <div className="flex justify-between">
                    <span>총 시설</span>
                    <span className="font-medium">{filtered.length}개소</span>
                  </div>
                  <div className="flex justify-between">
                    <span>총 수용인원</span>
                    <span className="font-medium">{filtered.reduce((s, f) => s + f.capacity, 0).toLocaleString()}명</span>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {FTYPES.map(ft => (
                  <div key={ft} className="flex items-center gap-2.5 py-1">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: FTYPE_COLOR[ft] }} />
                    <span className="text-xs text-gray-700 dark:text-gray-300 flex-1">{ft}</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">{facilities.filter(f => f.ftype === ft).length}</span>
                  </div>
                ))}
                <div className="border-t dark:border-gray-700 mt-2 pt-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0 bg-gray-400 dark:bg-gray-600" />
                    <span className="text-xs text-gray-500 dark:text-gray-400 flex-1">전체</span>
                    <span className="text-xs text-gray-600 dark:text-gray-400 font-medium">{facilities.length}</span>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── 하단 FAB ── */}
      <div className="absolute bottom-3 left-3 right-3 z-10 flex items-center gap-2">
        {/* 목록보기 */}
        <button
          onClick={() => setShowList(v => !v)}
          className="flex items-center gap-2 bg-gray-900/90 backdrop-blur-sm text-white px-5 py-2.5 rounded-full shadow-lg text-sm font-medium hover:bg-gray-900 active:scale-95 transition-all"
        >
          <List className="w-4 h-4" />
          {showList ? '지도 보기' : `목록 보기`}
        </button>

        <div className="flex-1" />

        {/* 카운트 배지 */}
        <div className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm text-gray-700 dark:text-gray-300 text-xs px-3 py-2 rounded-full shadow border border-gray-100 dark:border-gray-700 font-semibold">
          {filtered.length}
          <span className="font-normal text-gray-400 dark:text-gray-500 ml-0.5">개소</span>
        </div>

        {/* 지도 초기화 버튼 */}
        <button
          onClick={handleResetView}
          className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm p-2.5 rounded-full shadow border border-gray-100 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600 active:scale-95 transition-all"
          title="지도 초기화"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        {/* 현재위치 버튼 */}
        <button
          onClick={handleLocate}
          disabled={locating}
          className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm p-2.5 rounded-full shadow border border-gray-100 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-200 active:scale-95 transition-all disabled:opacity-60"
          title="현재 위치로 이동"
        >
          <LocateFixed className={`w-4 h-4 ${locating ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* ── 목록 슬라이드업 패널 ── */}
      {showList && (
        <div
          role="dialog"
          aria-label="시설 목록 패널"
          className="absolute inset-x-0 bottom-0 z-20 bg-white/97 dark:bg-gray-900/97 backdrop-blur-lg rounded-t-2xl shadow-2xl border-t border-gray-100 dark:border-gray-700 md:top-0 md:right-0 md:left-auto md:w-80 md:rounded-none md:rounded-l-2xl md:border-t-0 md:border-l"
          style={{ maxHeight: '52%', overflowY: 'auto' }}
        >
          {/* 패널 헤더 */}
          <div className="sticky top-0 bg-white/97 dark:bg-gray-900/97 backdrop-blur-lg border-b border-gray-100 dark:border-gray-700 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-800 dark:text-gray-100 text-sm">시설 목록</span>
              <span className="bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs px-2 py-0.5 rounded-full font-medium">
                {filtered.length}개소
              </span>
            </div>
            <button
              onClick={() => setShowList(false)}
              className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 드래그 핸들 (상단) */}
          <div className="absolute top-1.5 left-1/2 -translate-x-1/2 w-8 h-1 bg-gray-300 dark:bg-gray-600 rounded-full md:hidden" />

          {/* 목록 아이템 */}
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {filtered.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-sm text-gray-400 dark:text-gray-500">검색 결과가 없습니다</p>
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="mt-2 text-xs text-blue-500 hover:underline transition-colors duration-150"
                  >
                    검색 초기화
                  </button>
                )}
              </div>
            ) : filtered.map(f => (
              <div
                key={f.facility_id}
                ref={(el) => { listItemRefs.current[f.facility_id] = el }}
                className="px-4 py-3 flex items-center gap-3 hover:bg-gray-50/80 dark:hover:bg-gray-800/80 transition-colors"
              >
                <button
                  onClick={() => handleSelectFacility(f, true)}
                  className="flex items-center gap-3 flex-1 min-w-0 text-left"
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${FTYPE_COLOR[f.ftype]}15`, color: FTYPE_COLOR[f.ftype] }}
                  >
                    {FTYPE_ICON[f.ftype]('w-4.5 h-4.5')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{f.name}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      <span className="font-medium" style={{ color: FTYPE_COLOR[f.ftype] }}>{f.ftype}</span>
                      <span className="mx-1">·</span>
                      <span>{f.sigun}</span>
                      <span className="mx-1">·</span>
                      <span>수용 {f.capacity.toLocaleString()}명</span>
                    </p>
                  </div>
                </button>
                <button
                  onClick={() => toggleCompare(f)}
                  className={`shrink-0 p-1.5 rounded-full border transition-all ${
                    compareSet.has(f.facility_id)
                      ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400'
                      : 'border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                  title={compareSet.has(f.facility_id) ? '비교 목록에서 제거' : '비교에 추가'}
                >
                  {compareSet.has(f.facility_id) ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                </button>
              </div>
            ))}
          </div>
          <div className="h-3" />
        </div>
      )}

      {/* ── 시설 상세 패널 ── */}
      {selectedFacility && detail && (
        <>
          <div
            className="absolute inset-0 z-30 bg-black/20 md:bg-transparent"
            role="button"
            tabIndex={-1}
            aria-label="패널 닫기"
            onClick={() => setSelectedFacility(null)}
            onKeyDown={(e) => { if (e.key === 'Escape' || e.key === 'Enter') setSelectedFacility(null) }}
          />
          <div
            role="dialog"
            aria-label="시설 상세 정보"
            className="absolute inset-x-0 bottom-0 z-30 md:top-0 md:right-0 md:left-auto md:w-96 md:h-full md:rounded-none md:rounded-l-2xl bg-white/98 dark:bg-gray-900/98 backdrop-blur-xl shadow-2xl border-t md:border-t-0 md:border-l border-gray-100 dark:border-gray-700 rounded-t-2xl flex flex-col max-h-[75vh] md:max-h-none"
          >
            <div className="sticky top-0 bg-white/98 dark:bg-gray-900/98 backdrop-blur-xl border-b border-gray-100 dark:border-gray-700 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${FTYPE_COLOR[selectedFacility.ftype]}15`, color: FTYPE_COLOR[selectedFacility.ftype] }}
                >
                  {FTYPE_ICON[selectedFacility.ftype]('w-5 h-5')}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{selectedFacility.name}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{selectedFacility.sigun} · {selectedFacility.ftype}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => toggleCompare(selectedFacility)}
                  className={`p-2 rounded-full transition-colors ${
                    compareSet.has(selectedFacility.facility_id)
                      ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400'
                  }`}
                  title="비교에 추가"
                >
                  <ArrowRightLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setSelectedFacility(null)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 p-4 space-y-4">
              {/* 이미지 */}
              <div className="w-full aspect-video rounded-xl bg-gray-100 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 flex items-center justify-center overflow-hidden">
                {detail.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={detail.image} alt={selectedFacility.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-gray-300 dark:text-gray-600">
                    <ImageOff className="w-10 h-10" />
                    <span className="text-xs">대표 이미지 준비 중</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 font-semibold uppercase tracking-wide">수용인원</p>
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 mt-0.5">{selectedFacility.capacity.toLocaleString()}명</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 font-semibold uppercase tracking-wide">시군</p>
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 mt-0.5">{selectedFacility.sigun}</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <MapPinned className="w-4 h-4 text-gray-400 dark:text-gray-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300">주소</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{detail.address}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Phone className="w-4 h-4 text-gray-400 dark:text-gray-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300">연락처</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{detail.phone}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Clock className="w-4 h-4 text-gray-400 dark:text-gray-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300">운영시간</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{detail.hours}</p>
                  </div>
                </div>
                {detail.homepage && (
                  <div className="flex items-start gap-3">
                    <Building2 className="w-4 h-4 text-gray-400 dark:text-gray-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-gray-700 dark:text-gray-300">홈페이지</p>
                      <a href={detail.homepage} target="_blank" rel="noreferrer" className="text-sm text-blue-600 dark:text-blue-400 hover:underline break-all transition-colors duration-150">
                        {detail.homepage.replace(/^https?:\/\//, '')}
                      </a>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">시설 소개</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{detail.description}</p>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">제공 서비스</p>
                <div className="flex flex-wrap gap-1.5">
                  {detail.services.map(s => (
                    <span key={s} className="px-2.5 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-xs font-medium rounded-full">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── 비교 패널 ── */}
      {showCompare && comparedFacilities.length > 0 && (
        <div className="absolute bottom-3 left-3 right-3 z-30 md:left-auto md:w-[480px] bg-white/98 dark:bg-gray-900/98 backdrop-blur-xl rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-700 p-4 max-h-[40vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4 text-gray-600 dark:text-gray-400" />
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">시설 비교</span>
              <span className="bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs px-2 py-0.5 rounded-full font-medium">{comparedFacilities.length}개</span>
            </div>
            <button
              onClick={() => { setCompareSet(new Set()); setShowCompare(false) }}
              className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors duration-150"
            >
              초기화
            </button>
          </div>
          <div className="space-y-2">
            {comparedFacilities.map(f => {
              const d = getFacilityDetail(f)
              return (
                <div key={f.facility_id} className="flex items-center gap-3 p-2 rounded-xl bg-gray-50 dark:bg-gray-800">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${FTYPE_COLOR[f.ftype]}15`, color: FTYPE_COLOR[f.ftype] }}
                  >
                    {FTYPE_ICON[f.ftype]('w-4.5 h-4.5')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{f.name}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
                      {f.ftype} · 수용 {f.capacity.toLocaleString()}명 · {d.phone}
                    </p>
                  </div>
                  <button
                    onClick={() => toggleCompare(f)}
                    className="p-1.5 hover:bg-white dark:hover:bg-gray-700 rounded-full text-gray-400 dark:text-gray-500 hover:text-red-500 transition-colors"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                </div>
              )
            })}
          </div>
          {comparedFacilities.length >= 4 && (
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-2">최대 4개까지 비교할 수 있습니다.</p>
          )}
        </div>
      )}

      {/* ── 히트맵 드릴다운 모달 ── */}
      {drilldown && (
        <div className="absolute inset-0 z-40 flex items-end md:items-center justify-center pointer-events-none">
          <div
            className="absolute inset-0 bg-black/20 pointer-events-auto"
            role="button"
            tabIndex={-1}
            aria-label="모달 닫기"
            onClick={() => setDrilldown(null)}
            onKeyDown={(e) => { if (e.key === 'Escape' || e.key === 'Enter') setDrilldown(null) }}
          />
          <div className="relative bg-white/98 dark:bg-gray-900/98 backdrop-blur-xl rounded-t-2xl md:rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-700 w-full md:w-[420px] max-h-[60vh] md:max-h-[70vh] overflow-hidden pointer-events-auto m-0 md:m-4">
            <div className="sticky top-0 bg-white/98 dark:bg-gray-900/98 backdrop-blur-xl border-b border-gray-100 dark:border-gray-700 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-orange-500" />
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                  {drilldown.type === 'heatmap' ? '히트맵 영역 상세' : `클러스터 ${drilldown.cluster.id} 상세`}
                </span>
                <span className="bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 text-xs px-2 py-0.5 rounded-full font-medium">
                  {drilldown.list.length}개소
                </span>
              </div>
              <button
                onClick={() => setDrilldown(null)}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto p-2" style={{ maxHeight: 'calc(60vh - 56px)' }}>
              {drilldown.list.length === 0 ? (
                <div className="py-10 text-center text-sm text-gray-400 dark:text-gray-500">해당 영역에 시설이 없습니다</div>
              ) : (
                <div className="divide-y divide-gray-50 dark:divide-gray-800">
                  {drilldown.list.map(f => (
                    <div key={f.facility_id} className="px-2 py-2.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors">
                      <button
                        onClick={() => { setSelectedFacility(f); setDrilldown(null) }}
                        className="flex items-center gap-3 flex-1 min-w-0 text-left"
                      >
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                          style={{ backgroundColor: `${FTYPE_COLOR[f.ftype]}15`, color: FTYPE_COLOR[f.ftype] }}
                        >
                          {FTYPE_ICON[f.ftype]('w-4.5 h-4.5')}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{f.name}</p>
                          <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
                            {f.ftype} · {f.sigun} · 수용 {f.capacity.toLocaleString()}명
                          </p>
                        </div>
                      </button>
                      <button
                        onClick={() => toggleCompare(f)}
                        className={`shrink-0 p-1.5 rounded-full border transition-all ${
                          compareSet.has(f.facility_id)
                            ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400'
                            : 'border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
                        }`}
                      >
                        {compareSet.has(f.facility_id) ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── 안내 토스트 ── */}
      {layerMode === 'heatmap' && (
        <div className="absolute top-28 left-3 z-10 pointer-events-none hidden md:flex items-center gap-2 bg-gray-900/80 backdrop-blur-sm text-white text-xs px-3 py-1.5 rounded-full shadow">
          <Info className="w-3.5 h-3.5" />
          <span>히트맵 셀을 클릭하면 해당 영역 시설을 볼 수 있습니다</span>
        </div>
      )}
      {layerMode === 'cluster' && (
        <div className="absolute top-28 left-3 z-10 pointer-events-none hidden md:flex items-center gap-2 bg-gray-900/80 backdrop-blur-sm text-white text-xs px-3 py-1.5 rounded-full shadow">
          <Info className="w-3.5 h-3.5" />
          <span>클러스터 영역 또는 중심을 클릭하면 상세 시설을 볼 수 있습니다</span>
        </div>
      )}

      {/* ── 히트맵 범례 ── */}
      {layerMode === 'heatmap' && (
        <div className="absolute top-28 right-3 z-10 pointer-events-none hidden md:flex flex-col gap-1.5 bg-white/92 dark:bg-gray-900/92 backdrop-blur-md text-gray-700 dark:text-gray-300 text-[11px] px-3 py-2 rounded-xl shadow border border-gray-100 dark:border-gray-700">
          <span className="font-semibold">
            {heatmapValueMode === 'count' ? '시설 밀도' : '수용인원 밀도'} · {heatmapPalette === 'default' ? '기본' : heatmapPalette === 'flame' ? '불꽃' : '바다'}
          </span>
          <div className="flex items-center gap-2">
            <span>낮음</span>
            <div
              className="w-24 h-2 rounded-full"
              style={{
                background: `linear-gradient(90deg, ${getHeatmapColor(0, heatmapPalette)}, ${getHeatmapColor(0.5, heatmapPalette)}, ${getHeatmapColor(1, heatmapPalette)})`,
              }}
            />
            <span>높음</span>
          </div>
          <span className="text-gray-400 dark:text-gray-500">
            {heatmapMode === 'grid'
              ? '셀 크기는 확대·축소 및 화면 크기에 따라 50m~10km 자동 조정'
              : '셀 크기에 따른 Gaussian 커널 밀도'}
          </span>
        </div>
      )}
    </div>
  )
}
