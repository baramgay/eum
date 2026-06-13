'use client'

import { useEffect, useRef } from 'react'

interface Facility {
  facility_id: string; sgg_cd: string; sigun: string
  ftype: string; name: string; lon: number; lat: number; capacity: number
}

interface Props { facilities: Facility[] }

// ── 시설 유형별 색상 ──────────────────────────────────────────
const FTYPE_COLOR: Record<string, string> = {
  '청년센터': '#EC4899',
  '도서관':   '#2563EB',
  '체육관':   '#F59E0B',
  '문화센터': '#8B5CF6',
}

// ── 시설 유형별 아이콘 SVG 경로 (36×44 핀 기준, 아이콘 영역 cx=18 cy=16.5 r=11) ──
function iconPath(ftype: string, color: string): string {
  switch (ftype) {
    case '도서관':
      // 펼친 책
      return `
        <path d="M9 9 L17 9 L17 24 Q13 23 9 24 Z"
              fill="${color}" opacity="0.18" stroke="${color}" stroke-width="1.4" stroke-linejoin="round"/>
        <path d="M27 9 L19 9 L19 24 Q23 23 27 24 Z"
              fill="${color}" opacity="0.18" stroke="${color}" stroke-width="1.4" stroke-linejoin="round"/>
        <line x1="18" y1="9.5" x2="18" y2="24" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>
      `
    case '체육관':
      // 아령 (dumbbell)
      return `
        <rect x="12" y="15.5" width="12" height="2.5" rx="1.25" fill="${color}"/>
        <rect x="7"  y="11.5" width="6"  height="10"  rx="3"    fill="${color}"/>
        <rect x="23" y="11.5" width="6"  height="10"  rx="3"    fill="${color}"/>
      `
    case '문화센터':
      // 음표 두 개 (이중 음표)
      return `
        <ellipse cx="13.5" cy="22.5" rx="3.5" ry="2.5" fill="${color}"/>
        <rect    x="16.8"  y="11"    width="1.9" height="12.5" rx="0.95" fill="${color}"/>
        <ellipse cx="23"   cy="20"   rx="3.5"   ry="2.5"       fill="${color}"/>
        <rect    x="26.3"  y="11"    width="1.9" height="10"   rx="0.95" fill="${color}"/>
        <rect    x="16.8"  y="11"    width="11.4" height="2"   rx="1"    fill="${color}"/>
      `
    case '청년센터':
    default:
      // 사람 아이콘 (사용자)
      return `
        <circle cx="18" cy="11.5" r="4" fill="${color}"/>
        <path d="M10 25 C10.5 19.5 14 18 18 18 C22 18 25.5 19.5 26 25"
              fill="${color}" stroke="none"/>
      `
  }
}

// ── 핀 SVG 생성 ─────────────────────────────────────────────
function makePinSvgUri(ftype: string): string {
  const color = FTYPE_COLOR[ftype] ?? '#6B7280'

  // 물방울(핀) 외형 + 흰 원 + 아이콘
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44">
    <!-- 핀 그림자 (offset 1px) -->
    <path d="M19 3 C10.7 3 4 9.7 4 18 C4 27.5 19 42 19 42 C19 42 34 27.5 34 18 C34 9.7 27.3 3 19 3Z"
          fill="black" opacity="0.15"/>
    <!-- 핀 본체 -->
    <path d="M18 2 C9.7 2 3 8.7 3 17 C3 26.5 18 41 18 41 C18 41 33 26.5 33 17 C33 8.7 26.3 2 18 2Z"
          fill="${color}"/>
    <!-- 하이라이트 (상단 광택) -->
    <ellipse cx="14" cy="10" rx="5" ry="4" fill="white" opacity="0.2"/>
    <!-- 내부 흰 원 -->
    <circle cx="18" cy="16.5" r="11.5" fill="white"/>
    <!-- 아이콘 -->
    ${iconPath(ftype, color)}
  </svg>`

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

// ── 범례 색상 (FacilityMap에서도 참조 가능하도록 export) ────
export { FTYPE_COLOR }

// ── Kakao 타입 선언 ──────────────────────────────────────────
declare global {
  interface Window {
    kakao: {
      maps: {
        load: (cb: () => void) => void
        Map: new (el: HTMLElement, opts: object) => KakaoMap
        LatLng: new (lat: number, lng: number) => object
        Marker: new (opts: object) => KakaoMarker
        MarkerImage: new (src: string, size: object, opts?: object) => object
        Size: new (w: number, h: number) => object
        Point: new (x: number, y: number) => object
        InfoWindow: new (opts: object) => KakaoInfoWindow
        MarkerClusterer: new (opts: object) => KakaoClusterer
        event: { addListener: (target: object, type: string, handler: () => void) => void }
      }
    }
  }
}

interface KakaoMap      { setCenter: (latlng: object) => void }
interface KakaoMarker   { setMap: (map: KakaoMap | null) => void }
interface KakaoInfoWindow {
  open: (map: KakaoMap, marker: KakaoMarker) => void
  close: () => void
}
interface KakaoClusterer {
  addMarkers: (markers: KakaoMarker[]) => void
  clear: () => void
}

function loadKakaoSdk(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.kakao?.maps?.load) { window.kakao.maps.load(resolve); return }
    const key = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY
    if (!key) { reject(new Error('NEXT_PUBLIC_KAKAO_MAP_KEY 없음')); return }
    const s = document.createElement('script')
    s.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${key}&libraries=clusterer&autoload=false`
    s.onload = () => window.kakao.maps.load(resolve)
    s.onerror = reject
    document.head.appendChild(s)
  })
}

export default function MapInner({ facilities }: Props) {
  const containerRef  = useRef<HTMLDivElement>(null)
  const mapRef        = useRef<KakaoMap | null>(null)
  const clusterRef    = useRef<KakaoClusterer | null>(null)
  const openInfoRef   = useRef<KakaoInfoWindow | null>(null)
  const facilitiesRef = useRef(facilities)
  facilitiesRef.current = facilities

  useEffect(() => {
    let destroyed = false

    loadKakaoSdk().then(() => {
      if (destroyed || !containerRef.current || mapRef.current) return
      const { Map, LatLng, MarkerClusterer } = window.kakao.maps

      const map = new Map(containerRef.current, {
        center: new LatLng(35.22, 128.44),
        level: 9,
      })
      mapRef.current = map

      const clusterer = new MarkerClusterer({
        map,
        averageCenter: true,
        minLevel: 10,
        disableClickZoom: false,
      })
      clusterRef.current = clusterer
      buildMarkers(facilitiesRef.current)
    }).catch(err => console.error('[카카오지도]', err))

    return () => { destroyed = true; mapRef.current = null; clusterRef.current = null }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!mapRef.current || !clusterRef.current) return
    buildMarkers(facilities)
  }, [facilities]) // eslint-disable-line react-hooks/exhaustive-deps

  function buildMarkers(facs: Facility[]) {
    const map     = mapRef.current
    const cluster = clusterRef.current
    if (!map || !cluster) return

    const { Marker, MarkerImage, Size, Point, LatLng, InfoWindow, event } = window.kakao.maps

    cluster.clear()
    openInfoRef.current?.close()
    openInfoRef.current = null

    const markers = facs.map(f => {
      const imageSrc  = makePinSvgUri(f.ftype)
      // 핀 크기 36×44, 앵커는 하단 중앙(핀 끝점)
      const imageSize = new Size(36, 44)
      const imageOpt  = { offset: new Point(18, 44) }
      const image     = new MarkerImage(imageSrc, imageSize, imageOpt)

      const marker = new Marker({ position: new LatLng(f.lat, f.lon), image })

      const infoContent =
        `<div style="padding:10px 14px;min-width:160px;font-size:13px;line-height:1.7;border-radius:8px">` +
        `<b style="font-size:14px;display:block;margin-bottom:2px;color:#111">${f.name}</b>` +
        `<span style="color:#6B7280;font-size:12px">${f.ftype} · ${f.sigun}</span><br/>` +
        `수용인원: <b style="color:#111">${f.capacity.toLocaleString()}명</b>` +
        `</div>`
      const infoWindow = new InfoWindow({ content: infoContent, removable: true })

      event.addListener(marker, 'click', () => {
        openInfoRef.current?.close()
        infoWindow.open(map, marker)
        openInfoRef.current = infoWindow
      })

      return marker
    })

    cluster.addMarkers(markers)
  }

  return <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
}
