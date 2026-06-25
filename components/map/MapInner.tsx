'use client'

/// <reference types="kakao.maps.d.ts" />

import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react'
import { pinDataUrl } from './pinDataUrl'
import { FTYPE_META, DEFAULT_META } from './MapPin'
import { dbscan, kmeans, clusterTypeBreakdown, haversineMeters, type Cluster } from '@/lib/geo-cluster'
import {
  computeGridCells,
  computeKernelCells,
  getHeatmapColor,
  getHeatmapStrokeColor,
  capForCells,
  viewportCellSizeMeters,
  type HeatmapCell,
  type HeatmapMode,
  type HeatmapPalette,
  type HeatmapValueMode,
} from '@/lib/heatmap'

export interface Facility {
  facility_id: string; sgg_cd: string; sigun: string
  ftype: string; name: string; lon: number; lat: number; capacity: number
}

export interface MapInnerRef {
  setCenter: (lat: number, lng: number) => void
  setLevel: (level: number) => void
  getCenter: () => { lat: number; lng: number } | null
  getLevel: () => number | null
  setCurrentLocation: (lat: number, lng: number) => void
  resetView: () => void
}

export interface ClusterOptions {
  algorithm: 'dbscan' | 'kmeans'
  eps: number // meters
  minPts: number
  k: number
}

interface Props {
  facilities: Facility[]
  layerMode?: 'marker' | 'cluster' | 'heatmap'
  heatmapMode?: 'grid' | 'kernel'
  heatmapValueMode?: HeatmapValueMode
  heatmapPalette?: HeatmapPalette
  clusterOptions?: ClusterOptions
  selectedFacilityId?: string
  onSelectFacility?: (facility: Facility) => void
  onHeatmapClick?: (facilities: Facility[], cell: HeatmapCell) => void
  onClusterClick?: (facilities: Facility[], cluster: Cluster<Facility & { id: string }>) => void
  onCenterChange?: (center: { lat: number; lng: number }) => void
}

// ── HTML 이스케이프 ───────────────────────────────────────────
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

// ── 카카오맵 SDK 로더 ─────────────────────────────────────────
declare global {
  interface Window {
    kakao?: typeof kakao
  }
}

let kakaoLoadPromise: Promise<void> | null = null

function resetKakaoLoader() {
  kakaoLoadPromise = null
  const existing = document.getElementById('kakao-map-sdk')
  if (existing) existing.remove()
}

function loadKakaoMapScript(appKey: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('window unavailable'))
  if (window.kakao?.maps) return Promise.resolve()
  if (kakaoLoadPromise) return kakaoLoadPromise

  kakaoLoadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById('kakao-map-sdk') as HTMLScriptElement | null
    if (existing) {
      if (window.kakao?.maps) {
        resolve()
        return
      }
      const onLoad = () => {
        if (window.kakao?.maps?.load) {
          window.kakao.maps.load(() => resolve())
        } else {
          reject(new Error('Kakao map SDK not available after script load'))
        }
      }
      const onError = () => reject(new Error('Kakao map script load failed'))
      existing.addEventListener('load', onLoad)
      existing.addEventListener('error', onError)
      return
    }

    const script = document.createElement('script')
    script.id = 'kakao-map-sdk'
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&libraries=clusterer,services&autoload=false`
    script.async = true
    script.setAttribute('data-kakao-map', 'true')
    script.onload = () => {
      if (!window.kakao?.maps?.load) {
        reject(new Error('Kakao map SDK not available after script load'))
        return
      }
      window.kakao.maps.load(() => resolve())
    }
    script.onerror = () => reject(new Error('Kakao map script load failed'))
    document.head.appendChild(script)
  })

  return kakaoLoadPromise
}

// ── 클러스터 스타일 ─────────────────────────────────────────────
const CLUSTER_STYLES = [
  { size: 36, color: '#3B82F6', font: '11px' },
  { size: 44, color: '#10B981', font: '13px' },
  { size: 52, color: '#F59E0B', font: '14px' },
  { size: 60, color: '#EF4444', font: '15px' },
]

function makeClusterStyles(): object[] {
  return CLUSTER_STYLES.map(({ size, color, font }) => ({
    width: `${size}px`,
    height: `${size}px`,
    background: color,
    color: '#fff',
    textAlign: 'center',
    lineHeight: `${size - 4}px`,
    borderRadius: '50%',
    fontSize: font,
    fontWeight: '700',
    border: '3px solid rgba(255,255,255,0.9)',
    boxShadow: '0 4px 14px rgba(0,0,0,0.28)',
  }))
}

function clusterCalculator(size: number): number[] {
  return [10, 30, 70].map((threshold) => (size >= threshold ? 0 : threshold))
}

const CLUSTER_COLORS = [
  '#3B82F6', '#EF4444', '#10B981', '#F59E0B',
  '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16',
  '#F97316', '#6366F1', '#14B8A6', '#EAB308',
]

function smallDotDataUrl(color = '#9CA3AF'): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12"><circle cx="6" cy="6" r="5" fill="${color}" opacity="0.7"/></svg>`
  return `data:image/svg+xml;base64,${typeof window !== 'undefined' ? window.btoa(svg) : ''}`
}


function MapInner(
  {
    facilities,
    layerMode = 'marker',
    heatmapMode = 'grid',
    heatmapValueMode = 'count',
    heatmapPalette = 'default',
    clusterOptions,
    selectedFacilityId,
    onSelectFacility,
    onHeatmapClick,
    onClusterClick,
    onCenterChange,
  }: Props,
  ref: React.ForwardedRef<MapInnerRef>
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<kakao.maps.Map | null>(null)
  const clustererRef = useRef<kakao.maps.MarkerClusterer | null>(null)
  const markersRef = useRef<kakao.maps.Marker[]>([])
  const labelOverlaysRef = useRef<kakao.maps.CustomOverlay[]>([])
  const heatOverlaysRef = useRef<kakao.maps.CustomOverlay[]>([])
  const heatRectanglesRef = useRef<kakao.maps.Rectangle[]>([])
  const heatGridLabelsRef = useRef<kakao.maps.CustomOverlay[]>([])
  const heatClickHandlersRef = useRef<Array<{ marker: kakao.maps.Marker; handler: () => void }>>([])
  const clusterPolygonsRef = useRef<(kakao.maps.Polygon | kakao.maps.Circle)[]>([])
  const clusterOverlaysRef = useRef<kakao.maps.CustomOverlay[]>([])
  const clusterNoiseMarkersRef = useRef<kakao.maps.Marker[]>([])
  const clusterClickHandlersRef = useRef<Array<{ target: kakao.maps.event.EventTarget; handler: () => void }>>([])
  const currentLocationOverlayRef = useRef<kakao.maps.CustomOverlay | null>(null)
  const infoWindowRef = useRef<kakao.maps.InfoWindow | null>(null)
  const facilitiesRef = useRef(facilities)
  const layerModeRef = useRef(layerMode)
  const selectedFacilityIdRef = useRef(selectedFacilityId)
  const clusterOptionsRef = useRef(clusterOptions)
  const heatmapModeRef = useRef(heatmapMode)
  const heatmapValueModeRef = useRef(heatmapValueMode)
  const heatmapPaletteRef = useRef(heatmapPalette)
  const labelModeRef = useRef(false)
  const onSelectRef = useRef(onSelectFacility)
  const onHeatmapRef = useRef(onHeatmapClick)
  const onClusterRef = useRef(onClusterClick)
  const onCenterRef = useRef(onCenterChange)
  const [loadState, setLoadState] = useState<'loading' | 'error' | 'ready'>('loading')
  const [retry, setRetry] = useState(0)
  const [zoomLevel, setZoomLevel] = useState<number | null>(null)

  facilitiesRef.current = facilities
  layerModeRef.current = layerMode
  selectedFacilityIdRef.current = selectedFacilityId
  clusterOptionsRef.current = clusterOptions
  heatmapModeRef.current = heatmapMode
  heatmapValueModeRef.current = heatmapValueMode
  heatmapPaletteRef.current = heatmapPalette
  onSelectRef.current = onSelectFacility
  onHeatmapRef.current = onHeatmapClick
  onClusterRef.current = onClusterClick
  onCenterRef.current = onCenterChange

  useImperativeHandle(ref, () => ({
    setCenter: (lat: number, lng: number) => {
      const map = mapRef.current
      if (!map) return
      map.setCenter(new window.kakao!.maps.LatLng(lat, lng))
    },
    setLevel: (level: number) => {
      const map = mapRef.current
      if (!map) return
      map.setLevel(level)
    },
    getCenter: () => {
      const map = mapRef.current
      if (!map) return null
      const c = map.getCenter()
      return { lat: c.getLat(), lng: c.getLng() }
    },
    getLevel: () => mapRef.current?.getLevel() ?? null,
    resetView: () => {
      const map = mapRef.current
      if (!map) return
      map.setCenter(new window.kakao!.maps.LatLng(35.22, 128.44))
      map.setLevel(9)
    },
    setCurrentLocation: (lat: number, lng: number) => {
      const map = mapRef.current
      if (!map || !window.kakao) return
      currentLocationOverlayRef.current?.setMap(null)
      const content = `
        <div style="position:relative;width:20px;height:20px;">
          <div style="position:absolute;inset:0;border-radius:50%;background:#3B82F6;opacity:0.3;animation:pulse 1.5s infinite;"></div>
          <div style="position:absolute;top:5px;left:5px;width:10px;height:10px;border-radius:50%;background:#2563EB;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.25);"></div>
        </div>
        <style>@keyframes pulse{0%{transform:scale(1);opacity:0.3;}100%{transform:scale(2.5);opacity:0;}}</style>
      `
      const overlay = new window.kakao.maps.CustomOverlay({
        position: new window.kakao.maps.LatLng(lat, lng),
        content,
        yAnchor: 0.5,
        xAnchor: 0.5,
        zIndex: 1000,
      })
      overlay.setMap(map)
      currentLocationOverlayRef.current = overlay
      map.setCenter(new window.kakao.maps.LatLng(lat, lng))
    },
  }))

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const key = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY
    if (!key) {
      setLoadState('error')
      console.error('[MapInner] NEXT_PUBLIC_KAKAO_MAP_KEY is missing')
      return
    }

    let mounted = true
    let removeIdle: (() => void) | null = null

    loadKakaoMapScript(key)
      .then(() => {
        if (!mounted || !containerRef.current || !window.kakao) return
        setLoadState('ready')
        const kakao = window.kakao
        const map = new kakao.maps.Map(containerRef.current, {
          center: new kakao.maps.LatLng(35.22, 128.44),
          level: 9,
        })
        mapRef.current = map

        clustererRef.current = new kakao.maps.MarkerClusterer({
          map,
          averageCenter: true,
          minLevel: 5,
          disableClickZoom: false,
          styles: makeClusterStyles(),
          calculator: clusterCalculator,
        })

        infoWindowRef.current = new kakao.maps.InfoWindow({ zIndex: 10 })

        setZoomLevel(map.getLevel())

        const idleHandler = () => {
          const center = map.getCenter()
          onCenterRef.current?.({ lat: center.getLat(), lng: center.getLng() })

          const level = map.getLevel()
          setZoomLevel(level)

          const nextLabelMode = layerModeRef.current === 'marker' && level <= 7
          if (labelModeRef.current !== nextLabelMode) {
            labelModeRef.current = nextLabelMode
            applyLayer(facilitiesRef.current, layerModeRef.current)
          }

          if (layerModeRef.current === 'heatmap') {
            buildHeatmap(
              facilitiesRef.current,
              heatmapModeRef.current,
              heatmapValueModeRef.current,
              heatmapPaletteRef.current
            )
          }
        }
        kakao.maps.event.addListener(map, 'idle', idleHandler)
        removeIdle = () => kakao.maps.event.removeListener(map, 'idle', idleHandler)

        applyLayer(facilitiesRef.current, layerModeRef.current)
      })
      .catch((err) => {
        if (!mounted) return
        setLoadState('error')
        console.error('[MapInner] Kakao map load error:', err)
      })

    return () => {
      mounted = false
      removeIdle?.()
      infoWindowRef.current?.close()
      currentLocationOverlayRef.current?.setMap(null)
      markersRef.current.forEach((m) => m.setMap(null))
      labelOverlaysRef.current.forEach((o) => o.setMap(null))
      heatOverlaysRef.current.forEach((o) => o.setMap(null))
      heatRectanglesRef.current.forEach((r) => r.setMap(null))
      heatGridLabelsRef.current.forEach((o) => o.setMap(null))
      clusterPolygonsRef.current.forEach((p) => p.setMap(null))
      clusterOverlaysRef.current.forEach((o) => o.setMap(null))
      clusterNoiseMarkersRef.current.forEach((m) => m.setMap(null))
      clustererRef.current?.clear()
      mapRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retry])

  useEffect(() => {
    if (!mapRef.current || !window.kakao) return
    applyLayer(facilities, layerMode)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facilities, layerMode, selectedFacilityId, heatmapMode, heatmapValueMode, heatmapPalette, clusterOptions])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      infoWindowRef.current?.close()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  function clearLayers() {
    const kakao = window.kakao
    infoWindowRef.current?.close()
    markersRef.current.forEach((m) => m.setMap(null))
    markersRef.current = []
    labelOverlaysRef.current.forEach((o) => o.setMap(null))
    labelOverlaysRef.current = []
    heatOverlaysRef.current.forEach((o) => o.setMap(null))
    heatOverlaysRef.current = []
    heatRectanglesRef.current.forEach((r) => r.setMap(null))
    heatRectanglesRef.current = []
    heatGridLabelsRef.current.forEach((o) => o.setMap(null))
    heatGridLabelsRef.current = []
    if (kakao) {
      heatClickHandlersRef.current.forEach(({ marker, handler }) => {
        kakao.maps.event.removeListener(marker, 'click', handler)
        marker.setMap(null)
      })
    }
    heatClickHandlersRef.current = []

    clusterPolygonsRef.current.forEach((p) => p.setMap(null))
    clusterPolygonsRef.current = []
    clusterOverlaysRef.current.forEach((o) => o.setMap(null))
    clusterOverlaysRef.current = []
    clusterNoiseMarkersRef.current.forEach((m) => m.setMap(null))
    clusterNoiseMarkersRef.current = []
    if (kakao) {
      clusterClickHandlersRef.current.forEach(({ target, handler }) => {
        kakao.maps.event.removeListener(target, 'click', handler)
      })
    }
    clusterClickHandlersRef.current = []
    clustererRef.current?.clear()
  }

  function applyLayer(facs: Facility[], mode: string) {
    const map = mapRef.current
    const kakao = window.kakao
    if (!map || !kakao) return

    clearLayers()

    if (mode === 'heatmap') {
      buildHeatmap(
        facs,
        heatmapModeRef.current,
        heatmapValueModeRef.current,
        heatmapPaletteRef.current
      )
      return
    }

    if (mode === 'cluster') {
      buildClusterLayer(facs)
      return
    }

    buildMarkers(facs)
  }

  const LABEL_ZOOM_THRESHOLD = 7

  function buildInfoContent(f: Facility): string {
    const dotColor = escapeHtml(FTYPE_META[f.ftype]?.color ?? DEFAULT_META.color)
    const name = escapeHtml(f.name)
    const ftype = escapeHtml(f.ftype)
    const sigun = escapeHtml(f.sigun)
    const capacity = f.capacity.toLocaleString()
    return (
      `<div style="padding:14px 16px;min-width:180px;max-width:220px;border-radius:14px;background:white;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;box-shadow:0 4px 20px rgba(0,0,0,0.12);">` +
      `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">` +
      `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${dotColor};flex-shrink:0;"></span>` +
      `<b style="font-size:14px;color:#111;font-weight:600;letter-spacing:-0.2px;">${name}</b>` +
      `</div>` +
      `<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">` +
      `<span style="font-size:11px;font-weight:600;color:white;background:${dotColor};padding:2px 7px;border-radius:99px;">${ftype}</span>` +
      `<span style="font-size:12px;color:#6B7280;">${sigun}</span>` +
      `</div>` +
      `<div style="font-size:12px;color:#374151;">수용인원 <b style="color:#111;">${capacity}명</b></div>` +
      `</div>`
    )
  }

  function buildLabelOverlay(f: Facility, selected: boolean, map: kakao.maps.Map): kakao.maps.CustomOverlay {
    const kakao = window.kakao!
    const meta = FTYPE_META[f.ftype] ?? DEFAULT_META
    const color = escapeHtml(meta.color)
    const initial = escapeHtml(meta.label)
    const name = escapeHtml(f.name)

    const el = document.createElement('div')
    el.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
      padding: ${selected ? '6px 12px 6px 6px' : '5px 10px 5px 5px'};
      background: rgba(255, 255, 255, ${selected ? 0.98 : 0.95});
      border: 1.5px solid ${selected ? color : 'rgba(0,0,0,0.06)'};
      border-radius: 999px;
      box-shadow: 0 ${selected ? '4px 16px' : '2px 10px'} rgba(0,0,0,${selected ? 0.16 : 0.1});
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Pretendard', 'Noto Sans KR', sans-serif;
      font-size: 13px;
      font-weight: 600;
      color: #1f2937;
      white-space: nowrap;
      cursor: pointer;
      transform: ${selected ? 'scale(1.06)' : 'scale(1)'};
      transition: transform 0.15s ease, box-shadow 0.15s ease;
    `
    el.innerHTML = `
      <span style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:${color};color:#fff;font-size:12px;font-weight:700;box-shadow:0 1px 3px rgba(0,0,0,0.15);">${initial}</span>
      <span style="max-width:${selected ? '180px' : '150px'};overflow:hidden;text-overflow:ellipsis;">${name}</span>
    `

    const position = new kakao.maps.LatLng(f.lat, f.lon)
    const overlay = new kakao.maps.CustomOverlay({
      position,
      content: el,
      yAnchor: 0.88,
      xAnchor: 0.5,
      zIndex: selected ? 120 : 20,
      clickable: true,
    })

    el.addEventListener('click', (e) => {
      e.stopPropagation()
      overlay.setZIndex?.(200)
      const iw = infoWindowRef.current
      if (!iw) return
      iw.setContent(buildInfoContent(f))
      iw.setPosition(position)
      iw.open(map)
      onSelectRef.current?.(f)
    })

    overlay.setMap(map)
    return overlay
  }

  function buildPinMarker(f: Facility, selected: boolean, map: kakao.maps.Map): kakao.maps.Marker {
    const kakao = window.kakao!
    const width = selected ? 48 : 40
    const height = selected ? 60 : 50
    const imageSize = new kakao.maps.Size(width, height)
    const imageOption = { offset: new kakao.maps.Point(width / 2, height) }
    const markerImage = new kakao.maps.MarkerImage(
      pinDataUrl(f.ftype, selected),
      imageSize,
      imageOption
    )

    const marker = new kakao.maps.Marker({
      position: new kakao.maps.LatLng(f.lat, f.lon),
      image: markerImage,
      title: f.name,
      zIndex: selected ? 100 : 1,
    })
    ;(marker as unknown as { ftype: string }).ftype = f.ftype

    kakao.maps.event.addListener(marker, 'click', () => {
      const iw = infoWindowRef.current
      if (!iw) return
      iw.setContent(buildInfoContent(f))
      iw.open(map, marker)
      onSelectRef.current?.(f)
    })

    return marker
  }

  function buildMarkers(facs: Facility[]) {
    const map = mapRef.current
    const kakao = window.kakao
    if (!map || !kakao) return

    const selectedId = selectedFacilityIdRef.current
    const level = map.getLevel()
    const showAllLabels = level <= LABEL_ZOOM_THRESHOLD

    facs.forEach((f) => {
      const isSelected = selectedId === f.facility_id
      const useLabel = showAllLabels || isSelected

      if (useLabel) {
        const overlay = buildLabelOverlay(f, isSelected, map)
        labelOverlaysRef.current.push(overlay)
      } else {
        const marker = buildPinMarker(f, isSelected, map)
        markersRef.current.push(marker)
        marker.setMap(map)
      }
    })
  }

  function buildClusterInfoContent(
    cluster: Cluster<Facility & { id: string }>,
    color: string
  ): string {
    const breakdown = clusterTypeBreakdown(cluster).slice(0, 3)
    const items = breakdown
      .map((b) => {
        const meta = FTYPE_META[b.ftype] ?? DEFAULT_META
        return (
          `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:#4B5563;">` +
          `<span style="width:6px;height:6px;border-radius:50%;background:${escapeHtml(meta.color)}"></span>` +
          `${escapeHtml(b.ftype)} ${b.count}` +
          `</span>`
        )
      })
      .join(' ')
    return (
      `<div style="padding:12px 14px;min-width:160px;max-width:220px;border-radius:12px;background:white;` +
      `box-shadow:0 4px 20px rgba(0,0,0,0.12);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">` +
      `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">` +
      `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};"></span>` +
      `<b style="font-size:14px;color:#111;">클러스터 ${cluster.id}</b>` +
      `<span style="font-size:11px;color:#6B7280;">${cluster.points.length}개소</span>` +
      `</div>` +
      `<div style="display:flex;flex-wrap:wrap;gap:6px;">${items}</div>` +
      `</div>`
    )
  }

  function buildClusterLayer(facs: Facility[]) {
    const map = mapRef.current
    const kakao = window.kakao
    if (!map || !kakao) return

    const opts = clusterOptionsRef.current ?? {
      algorithm: 'dbscan',
      eps: 500,
      minPts: 3,
      k: 4,
    }
    if (facs.length === 0) return

    const points: (Facility & { id: string })[] = facs.map((f) => ({ ...f, id: f.facility_id }))
    let clusters: Cluster<Facility & { id: string }>[] = []
    let noise: (Facility & { id: string })[] = []

    if (opts.algorithm === 'dbscan') {
      const res = dbscan(points, opts.eps, opts.minPts)
      clusters = res.clusters
      noise = res.noise
    } else {
      clusters = kmeans(points, opts.k)
    }

    clusters.forEach((cluster, idx) => {
      const color = CLUSTER_COLORS[idx % CLUSTER_COLORS.length]
      const center = new kakao.maps.LatLng(cluster.center.lat, cluster.center.lon)

      const handler = () => {
        const iw = infoWindowRef.current
        if (iw) {
          iw.setContent(buildClusterInfoContent(cluster, color))
          iw.setPosition(center)
          iw.open(map)
        }
        onClusterRef.current?.(cluster.points, cluster)
      }

      let shape: kakao.maps.Polygon | kakao.maps.Circle
      if (cluster.hull.length >= 3) {
        const polygon = new kakao.maps.Polygon({
          path: cluster.hull.map((p) => new kakao.maps.LatLng(p.lat, p.lon)),
          strokeWeight: 2,
          strokeColor: color,
          strokeOpacity: 0.85,
          strokeStyle: 'solid',
          fillColor: color,
          fillOpacity: 0.18,
        })
        polygon.setMap(map)
        shape = polygon
      } else {
        let radius = opts.eps
        if (opts.algorithm === 'kmeans') {
          radius = Math.max(
            10,
            ...cluster.points.map((p) =>
              haversineMeters(
                { id: '', lat: cluster.center.lat, lon: cluster.center.lon },
                { id: '', lat: p.lat, lon: p.lon }
              )
            )
          )
        }
        const circle = new kakao.maps.Circle({
          center,
          radius,
          strokeWeight: 2,
          strokeColor: color,
          strokeOpacity: 0.85,
          fillColor: color,
          fillOpacity: 0.18,
        })
        circle.setMap(map)
        shape = circle
      }
      clusterPolygonsRef.current.push(shape)
      kakao.maps.event.addListener(shape, 'click', handler)
      clusterClickHandlersRef.current.push({ target: shape, handler })

      const breakdown = clusterTypeBreakdown(cluster)
      const top = breakdown[0]
      const topColor = top ? (FTYPE_META[top.ftype]?.color ?? color) : color

      const el = document.createElement('div')
      el.style.cssText = `
        display: flex; align-items: center; gap: 5px;
        padding: 5px 10px 5px 6px;
        background: rgba(255,255,255,0.96);
        border: 1.5px solid ${color};
        border-radius: 999px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.12);
        font-family: -apple-system,BlinkMacSystemFont,'Segoe UI','Pretendard','Noto Sans KR',sans-serif;
        font-size: 12px; font-weight: 700; color: #1f2937;
        white-space: nowrap; cursor: pointer;
      `
      el.innerHTML = `
        <span style="display:flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:${topColor};color:#fff;font-size:10px;font-weight:800;">${cluster.points.length}</span>
        <span>클러스터 ${cluster.id}</span>
      `
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        handler()
      })

      const overlay = new kakao.maps.CustomOverlay({
        position: center,
        content: el,
        yAnchor: 0.5,
        xAnchor: 0.5,
        zIndex: 30,
        clickable: true,
      })
      overlay.setMap(map)
      clusterOverlaysRef.current.push(overlay)
    })

    if (noise.length > 0) {
      const dotUrl = smallDotDataUrl('#9CA3AF')
      const imageSize = new kakao.maps.Size(12, 12)
      const imageOption = { offset: new kakao.maps.Point(6, 6) }
      const markerImage = new kakao.maps.MarkerImage(dotUrl, imageSize, imageOption)
      noise.forEach((p) => {
        const marker = new kakao.maps.Marker({
          position: new kakao.maps.LatLng(p.lat, p.lon),
          image: markerImage,
          zIndex: 5,
        })
        marker.setMap(map)
        clusterNoiseMarkersRef.current.push(marker)
      })
    }
  }

  function getViewportBounds(): { minLat: number; maxLat: number; minLng: number; maxLng: number } | null {
    const map = mapRef.current
    if (!map) return null
    const bounds = map.getBounds()
    const sw = bounds.getSouthWest()
    const ne = bounds.getNorthEast()
    return {
      minLat: sw.getLat(),
      maxLat: ne.getLat(),
      minLng: sw.getLng(),
      maxLng: ne.getLng(),
    }
  }

  function buildHeatmap(
    facs: Facility[],
    mode: HeatmapMode,
    valueMode: HeatmapValueMode,
    palette: HeatmapPalette
  ) {
    const map = mapRef.current
    const kakao = window.kakao
    if (!map || !kakao) return

    const bounds = getViewportBounds()
    if (!bounds) return

    const cellSizeMeters = viewportCellSizeMeters(bounds, 32)
    const bandwidthMeters = cellSizeMeters * 2

    const result =
      mode === 'grid'
        ? computeGridCells(facs, bounds, cellSizeMeters, valueMode)
        : computeKernelCells(facs, bounds, cellSizeMeters, bandwidthMeters, valueMode)

    if (result.cells.length === 0 || result.valid.length === 0) return
    const { cells, valid } = result
    const cap = capForCells(cells, valueMode)
    const showLabels = cells.length <= 80

    cells.forEach((cell) => {
      const rawValue = valueMode === 'capacity' ? cell.value : cell.count
      const intensity = Math.min(1, rawValue / cap)
      const color = getHeatmapColor(intensity, palette)
      const stroke = getHeatmapStrokeColor(intensity, palette)
      const fillOpacity = mode === 'kernel' ? 0.25 + intensity * 0.35 : 0.2 + intensity * 0.45

      const rectangle = new kakao.maps.Rectangle({
        bounds: new kakao.maps.LatLngBounds(
          new kakao.maps.LatLng(cell.minLat, cell.minLng),
          new kakao.maps.LatLng(cell.maxLat, cell.maxLng)
        ),
        strokeWeight: mode === 'kernel' ? 0 : 1,
        strokeColor: stroke,
        strokeOpacity: mode === 'kernel' ? 0 : 0.35,
        fillColor: color,
        fillOpacity,
      })
      rectangle.setMap(map)
      heatRectanglesRef.current.push(rectangle)

      if (showLabels) {
        const labelText =
          mode === 'kernel'
            ? Math.round(rawValue).toLocaleString()
            : `${cell.count}${valueMode === 'capacity' ? ` / ${Math.round(cell.value).toLocaleString()}` : ''}`

        const labelEl = document.createElement('div')
        labelEl.style.cssText = `
          padding: 2px 6px;
          background: rgba(255,255,255,0.92);
          border-radius: 999px;
          font-size: 10px;
          font-weight: 700;
          color: #374151;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          pointer-events: auto;
          cursor: pointer;
        `
        labelEl.textContent = labelText

        const label = new kakao.maps.CustomOverlay({
          position: new kakao.maps.LatLng(cell.lat, cell.lng),
          content: labelEl,
          yAnchor: 0.5,
          xAnchor: 0.5,
          zIndex: 5,
          clickable: true,
        })
        label.setMap(map)
        heatGridLabelsRef.current.push(label)

        labelEl.addEventListener('click', (e) => {
          e.stopPropagation()
          handler()
        })
      }

      const handler = () => {
        const inside = valid.filter(
          (f) => f.lat >= cell.minLat && f.lat <= cell.maxLat && f.lon >= cell.minLng && f.lon <= cell.maxLng
        )
        onHeatmapRef.current?.(inside, cell)
      }

      kakao.maps.event.addListener(rectangle, 'click', handler)
      heatClickHandlersRef.current.push({ marker: rectangle as unknown as kakao.maps.Marker, handler })
    })
  }

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      <div
        ref={containerRef}
        role="application"
        aria-label="경상남도 공공시설 지도"
        style={{ height: '100%', width: '100%' }}
      />
      {loadState === 'ready' && zoomLevel !== null && (
        <div
          style={{
            position: 'absolute',
            bottom: '12px',
            right: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 10px',
            background: 'rgba(255,255,255,0.92)',
            borderRadius: '999px',
            boxShadow: '0 1px 6px rgba(0,0,0,0.12)',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            fontSize: '11px',
            color: '#475569',
            pointerEvents: 'none',
            backdropFilter: 'blur(4px)',
            zIndex: 10,
          }}
        >
          <span style={{ color: '#94A3B8' }}>줌</span>
          <span style={{ fontWeight: 700, color: '#1E293B' }}>{zoomLevel}</span>
          <span style={{ color: '#CBD5E1', margin: '0 2px' }}>·</span>
          <span style={{ color: '#94A3B8' }}>ESC 인포창 닫기</span>
        </div>
      )}
      {loadState !== 'ready' && (
        <div
          className="bg-slate-50/90 dark:bg-slate-900/90 text-slate-600 dark:text-slate-400"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            fontSize: '14px',
            pointerEvents: loadState === 'error' ? 'auto' : 'none',
            textAlign: 'center',
            padding: '16px',
          }}
        >
          {loadState === 'loading' ? (
            <>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  border: '3px solid #E2E8F0',
                  borderTopColor: '#3B82F6',
                  borderRadius: '50%',
                  animation: 'map-spin 1s linear infinite',
                }}
              />
              <style>{`@keyframes map-spin { to { transform: rotate(360deg); } }`}</style>
              <span>지도를 불러오는 중...</span>
            </>
          ) : (
            <>
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {!process.env.NEXT_PUBLIC_KAKAO_MAP_KEY
                  ? '카카오맵 API 키가 설정되지 않았습니다.'
                  : '지도를 불러올 수 없습니다.'}
              </span>
              <span className="text-slate-500 dark:text-slate-400" style={{ fontSize: '13px', maxWidth: '320px' }}>
                {!process.env.NEXT_PUBLIC_KAKAO_MAP_KEY
                  ? '.env.local에 NEXT_PUBLIC_KAKAO_MAP_KEY를 추가한 뒤 개발 서버를 재시작해 주세요.'
                  : '네트워크 또는 카카오맵 SDK 로딩 문제일 수 있습니다. 잠시 후 다시 시도해 주세요.'}
              </span>
              {process.env.NEXT_PUBLIC_KAKAO_MAP_KEY && (
                <button
                  onClick={() => {
                    resetKakaoLoader()
                    setRetry((r) => r + 1)
                  }}
                  style={{
                    marginTop: '4px',
                    padding: '8px 16px',
                    borderRadius: '8px',
                    background: '#3B82F6',
                    color: '#fff',
                    fontSize: '13px',
                    fontWeight: 600,
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  다시 시도
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default forwardRef(MapInner)
