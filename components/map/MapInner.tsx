'use client'

import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import L from 'leaflet'
import 'leaflet.markercluster'

export interface Facility {
  facility_id: string; sgg_cd: string; sigun: string
  ftype: string; name: string; lon: number; lat: number; capacity: number
}

export interface MapInnerRef {
  setCenter: (lat: number, lng: number) => void
  getCenter: () => { lat: number; lng: number } | null
  getLevel: () => number | null
  setCurrentLocation: (lat: number, lng: number) => void
}

interface HeatmapCell {
  lat: number
  lng: number
  count: number
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
}

interface Props {
  facilities: Facility[]
  layerMode?: 'marker' | 'cluster' | 'heatmap'
  onSelectFacility?: (facility: Facility) => void
  onHeatmapClick?: (facilities: Facility[], cell: HeatmapCell) => void
  onCenterChange?: (center: { lat: number; lng: number }) => void
}

// ── 시설 유형별 색상 ──────────────────────────────────────────
const FTYPE_COLOR: Record<string, string> = {
  '청년센터': '#EC4899',
  '도서관':   '#2563EB',
  '체육관':   '#F59E0B',
  '문화센터': '#8B5CF6',
}

const FTYPE_ICON: Record<string, string> = {
  '청년센터': '👤',
  '도서관':   '📖',
  '체육관':   '🏋️',
  '문화센터': '🎵',
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

// ── 핀 아이콘 SVG ─────────────────────────────────────────────
function pinSvg(ftype: string): string {
  const color = FTYPE_COLOR[ftype] ?? '#6B7280'
  const icon = FTYPE_ICON[ftype] ?? '📍'
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="40" height="50" viewBox="0 0 36 44">
      <path d="M19 3 C10.7 3 4 9.7 4 18 C4 27.5 19 42 19 42 C19 42 34 27.5 34 18 C34 9.7 27.3 3 19 3Z"
            fill="black" opacity="0.12"/>
      <path d="M18 2 C9.7 2 3 8.7 3 17 C3 26.5 18 41 18 41 C18 41 33 26.5 33 17 C33 8.7 26.3 2 18 2Z"
            fill="${color}"/>
      <ellipse cx="14" cy="10" rx="5" ry="4" fill="white" opacity="0.25"/>
      <circle cx="18" cy="16.5" r="11.5" fill="white"/>
      <text x="18" y="21" text-anchor="middle" font-size="12">${icon}</text>
    </svg>
  `
}

function makePinIcon(ftype: string): L.DivIcon {
  return L.divIcon({
    className: '',
    html: pinSvg(ftype),
    iconSize: [40, 50],
    iconAnchor: [20, 50],
    popupAnchor: [0, -44],
  })
}

// ── 클러스터 아이콘 ───────────────────────────────────────────
function makeClusterIcon(count: number, dominantType: string): L.DivIcon {
  const color = FTYPE_COLOR[dominantType] ?? '#6B7280'
  const size = count < 10 ? 32 : count < 100 ? 40 : 48
  return L.divIcon({
    className: '',
    html: `
      <div style="
        width:${size}px;height:${size}px;border-radius:50%;
        background:${color};color:white;display:flex;align-items:center;justify-content:center;
        font-size:${count < 100 ? 13 : 12}px;font-weight:700;
        box-shadow:0 2px 8px ${color}60;border:2px solid white;
      ">${count}</div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

// ── 히트맵 색상 ───────────────────────────────────────────────
function heatColor(intensity: number): string {
  const stops = [
    { t: 0.00, r: 59,  g: 130, b: 246 },
    { t: 0.35, r: 16,  g: 185, b: 129 },
    { t: 0.65, r: 245, g: 158, b: 11 },
    { t: 1.00, r: 239, g: 68,  b: 68 },
  ]
  let a = stops[0]
  let b = stops[stops.length - 1]
  for (let i = 0; i < stops.length - 1; i++) {
    if (intensity >= stops[i].t && intensity <= stops[i + 1].t) {
      a = stops[i]
      b = stops[i + 1]
      break
    }
  }
  const len = b.t - a.t
  const ratio = len === 0 ? 0 : (intensity - a.t) / len
  const r = Math.round(a.r + (b.r - a.r) * ratio)
  const g = Math.round(a.g + (b.g - a.g) * ratio)
  const bl = Math.round(a.b + (b.b - a.b) * ratio)
  return `rgba(${r},${g},${bl},0.55)`
}

// ── 현재 위치 마커 아이콘 ─────────────────────────────────────
function currentLocationIcon(): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `
      <div style="position:relative;width:20px;height:20px;">
        <div style="position:absolute;inset:0;border-radius:50%;background:#3B82F6;opacity:0.3;animation:pulse 1.5s infinite;"></div>
        <div style="position:absolute;top:5px;left:5px;width:10px;height:10px;border-radius:50%;background:#2563EB;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.25);"></div>
      </div>
      <style>@keyframes pulse{0%{transform:scale(1);opacity:0.3;}100%{transform:scale(2.5);opacity:0;}}</style>
    `,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  })
}

function MapInner(
  { facilities, layerMode = 'marker', onSelectFacility, onHeatmapClick, onCenterChange }: Props,
  ref: React.ForwardedRef<MapInnerRef>
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null)
  const markerLayerRef = useRef<L.LayerGroup | null>(null)
  const heatLayerRef = useRef<L.LayerGroup | null>(null)
  const openPopupRef = useRef<L.Popup | null>(null)
  const currentLocationRef = useRef<L.Marker | null>(null)
  const facilitiesRef = useRef(facilities)
  const layerModeRef = useRef(layerMode)
  const onSelectRef = useRef(onSelectFacility)
  const onHeatmapRef = useRef(onHeatmapClick)
  const onCenterRef = useRef(onCenterChange)

  facilitiesRef.current = facilities
  layerModeRef.current = layerMode
  onSelectRef.current = onSelectFacility
  onHeatmapRef.current = onHeatmapClick
  onCenterRef.current = onCenterChange

  useImperativeHandle(ref, () => ({
    setCenter: (lat: number, lng: number) => {
      const map = mapRef.current
      if (!map) return
      map.setView([lat, lng], Math.max(map.getZoom() ?? 9, 7))
    },
    getCenter: () => {
      const map = mapRef.current
      if (!map) return null
      const c = map.getCenter()
      return { lat: c.lat, lng: c.lng }
    },
    getLevel: () => mapRef.current?.getZoom() ?? null,
    setCurrentLocation: (lat: number, lng: number) => {
      const map = mapRef.current
      if (!map) return
      currentLocationRef.current?.remove()
      const marker = L.marker([lat, lng], { icon: currentLocationIcon(), zIndexOffset: 1000 })
      marker.addTo(map)
      currentLocationRef.current = marker
    },
  }))

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      center: [35.22, 128.44],
      zoom: 9,
      zoomControl: false,
    })
    mapRef.current = map

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map)

    L.control.zoom({ position: 'bottomright' }).addTo(map)

    clusterRef.current = L.markerClusterGroup({
      disableClusteringAtZoom: 13,
      animate: true,
      spiderfyOnMaxZoom: true,
      iconCreateFunction: (cluster) => {
        const markers = cluster.getAllChildMarkers()
        const counts: Record<string, number> = {}
        markers.forEach((m) => {
          const ftype = (m as L.Marker & { options: { ftype?: string } }).options.ftype
          if (ftype) counts[ftype] = (counts[ftype] ?? 0) + 1
        })
        const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
        return makeClusterIcon(markers.length, dominant)
      },
    })

    markerLayerRef.current = L.layerGroup().addTo(map)
    heatLayerRef.current = L.layerGroup().addTo(map)

    const moveHandler = () => {
      onCenterRef.current?.({ lat: map.getCenter().lat, lng: map.getCenter().lng })
      if (layerModeRef.current === 'heatmap') buildHeatmap(facilitiesRef.current)
    }
    map.on('moveend', moveHandler)

    applyLayer(facilitiesRef.current, layerModeRef.current)

    return () => {
      map.off('moveend', moveHandler)
      map.remove()
      mapRef.current = null
      clusterRef.current = null
      markerLayerRef.current = null
      heatLayerRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!mapRef.current) return
    applyLayer(facilities, layerMode)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facilities, layerMode])

  function applyLayer(facs: Facility[], mode: string) {
    const map = mapRef.current
    const cluster = clusterRef.current
    const markerLayer = markerLayerRef.current
    const heatLayer = heatLayerRef.current
    if (!map || !cluster || !markerLayer || !heatLayer) return

    cluster.clearLayers()
    markerLayer.clearLayers()
    heatLayer.clearLayers()
    openPopupRef.current = null

    if (mode === 'heatmap') {
      buildHeatmap(facs)
      return
    }

    if (mode === 'cluster') {
      buildMarkers(facs, true)
      map.addLayer(cluster)
      return
    }

    // mode === 'marker'
    if (map.hasLayer(cluster)) map.removeLayer(cluster)
    buildMarkers(facs, false)
  }

  function buildMarkers(facs: Facility[], useCluster: boolean) {
    const map = mapRef.current
    const cluster = clusterRef.current
    const markerLayer = markerLayerRef.current
    if (!map || !cluster || !markerLayer) return

    const markers = facs.map((f) => {
      const marker = L.marker([f.lat, f.lon], {
        icon: makePinIcon(f.ftype),
        ftype: f.ftype,
      } as L.MarkerOptions)

      const dotColor = escapeHtml(FTYPE_COLOR[f.ftype] ?? '#6B7280')
      const name = escapeHtml(f.name)
      const ftype = escapeHtml(f.ftype)
      const sigun = escapeHtml(f.sigun)
      const capacity = f.capacity.toLocaleString()

      const popupContent =
        `<div style="padding:14px 16px;min-width:180px;max-width:220px;border-radius:14px;background:white;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">` +
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

      marker.bindPopup(popupContent, {
        closeButton: true,
        className: 'rounded-2xl-popup',
        offset: [0, -44],
      })

      marker.on('click', () => {
        openPopupRef.current?.close()
        marker.openPopup()
        openPopupRef.current = marker.getPopup() ?? null
        onSelectRef.current?.(f)
      })

      return marker
    })

    if (useCluster) {
      cluster.addLayers(markers)
    } else {
      markers.forEach((m) => m.addTo(markerLayer))
    }
  }

  function buildHeatmap(facs: Facility[]) {
    const map = mapRef.current
    const heatLayer = heatLayerRef.current
    if (!map || !heatLayer) return

    heatLayer.clearLayers()

    const valid = facs.filter((f) => typeof f.lat === 'number' && typeof f.lon === 'number')
    if (valid.length === 0) return

    const bounds = map.getBounds()
    const minLat = bounds.getSouthWest().lat
    const maxLat = bounds.getNorthEast().lat
    const minLng = bounds.getSouthWest().lng
    const maxLng = bounds.getNorthEast().lng

    const zoom = map.getZoom()
    const baseCells = Math.max(6, 22 - zoom)
    const latSpan = Math.max(0.0001, maxLat - minLat)
    const lngSpan = Math.max(0.0001, maxLng - minLng)
    const cellLat = latSpan / baseCells
    const cellLng = lngSpan / baseCells

    const grid = new Map<string, HeatmapCell>()

    valid.forEach((f) => {
      if (f.lat < minLat || f.lat > maxLat || f.lon < minLng || f.lon > maxLng) return
      const gy = Math.floor((f.lat - minLat) / cellLat)
      const gx = Math.floor((f.lon - minLng) / cellLng)
      const key = `${gx},${gy}`
      const exist = grid.get(key)
      if (exist) {
        exist.count += 1
      } else {
        grid.set(key, {
          lat: minLat + (gy + 0.5) * cellLat,
          lng: minLng + (gx + 0.5) * cellLng,
          count: 1,
          minLat: minLat + gy * cellLat,
          maxLat: minLat + (gy + 1) * cellLat,
          minLng: minLng + gx * cellLng,
          maxLng: minLng + (gx + 1) * cellLng,
        })
      }
    })

    if (grid.size === 0) return

    const counts = Array.from(grid.values()).map((g) => g.count)
    const maxCount = Math.max(...counts)
    const p95 = [...counts].sort((a, b) => a - b)[Math.floor(counts.length * 0.95)] || maxCount
    const cap = Math.max(1, p95)

    grid.forEach((cell) => {
      const intensity = Math.min(1, cell.count / cap)
      const size = 28 + intensity * 48
      const color = heatColor(intensity)
      const centerColor = color
      const edgeColor = color.replace('0.55', '0.15')

      const el = document.createElement('div')
      el.style.width = `${size}px`
      el.style.height = `${size}px`
      el.style.borderRadius = '50%'
      el.style.background = `radial-gradient(circle, ${centerColor} 0%, ${edgeColor} 70%, transparent 100%)`
      el.style.transform = 'translate(-50%, -50%)'
      el.style.pointerEvents = 'auto'
      el.style.cursor = 'pointer'
      el.title = `${cell.count}개소`

      el.addEventListener('click', (e) => {
        e.stopPropagation()
        const inside = valid.filter(
          (f) => f.lat >= cell.minLat && f.lat <= cell.maxLat && f.lon >= cell.minLng && f.lon <= cell.maxLng
        )
        onHeatmapRef.current?.(inside, cell)
      })

      const marker = L.marker([cell.lat, cell.lng], {
        icon: L.divIcon({
          className: '',
          html: el,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        }),
        interactive: true,
      } as L.MarkerOptions)

      marker.addTo(heatLayer)
    })
  }

  return <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
}

export { FTYPE_COLOR }
export default forwardRef(MapInner)
