'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { OntologyNode } from '@/lib/ontology-utils'
import { extractGeoCoord } from '@/lib/ontology/layout-helpers'

// ── 타입 ─────────────────────────────────────────────────────────────────────

export interface OntologyLink {
  src: string
  dst: string
  rel?: string
  weight?: number
}

interface KakaoOntologyMapProps {
  nodes: OntologyNode[]
  links?: OntologyLink[]
  selectedId?: string | null
  onSelect?: (node: OntologyNode | null) => void
  className?: string
}

// ── 상수 ─────────────────────────────────────────────────────────────────────

const NODE_TYPE_COLORS: Record<string, string> = {
  '시군': '#6366F1', '청년': '#10B981', '정책': '#F59E0B',
  '시설': '#3B82F6', '교통': '#8B5CF6', '복지': '#EC4899',
  '의료': '#EF4444', '문화': '#06B6D4', '체육': '#F97316',
  '환경': '#22C55E', '산업': '#78716C', '주거': '#A78BFA',
  '교육': '#14B8A6', '취업': '#FBBF24', '관광': '#FB7185',
  '농업': '#86EFAC', '어업': '#67E8F9',
}

const NODE_TYPE_ICON: Record<string, string> = {
  '시군': '🗺', '청년': '👤', '정책': '📋', '시설': '🏢',
  '교통': '🚌', '복지': '❤', '의료': '🏥', '문화': '🎭',
  '체육': '⚽', '환경': '🌿', '산업': '🏭', '주거': '🏠',
  '교육': '📚', '취업': '💼', '관광': '✈', '농업': '🌾', '어업': '🐟',
}

const DEFAULT_COLOR = '#94A3B8'
const DEFAULT_ICON = '●'

// ── SDK 로더 (MapInner.tsx 패턴 동일) ────────────────────────────────────────

// window.kakao is declared globally in MapInner.tsx; we only need the local ambient declaration
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const kakao: any

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

// ── 헬퍼 함수들 ──────────────────────────────────────────────────────────────

function computeDegrees(nodes: OntologyNode[], links: OntologyLink[]): Map<string, number> {
  const deg = new Map<string, number>()
  nodes.forEach(n => deg.set(n.obj_id, 0))
  links?.forEach(l => {
    deg.set(l.src, (deg.get(l.src) ?? 0) + 1)
    deg.set(l.dst, (deg.get(l.dst) ?? 0) + 1)
  })
  return deg
}

function parsePropsToKV(props: string): Record<string, string> {
  const result: Record<string, string> = {}
  props.split(';').forEach(part => {
    const idx = part.indexOf('=')
    if (idx === -1) return
    const key = part.slice(0, idx).trim()
    const val = part.slice(idx + 1).trim()
    if (key) result[key] = val
  })
  return result
}

function createMarkerEl(
  node: OntologyNode,
  selected: boolean,
  color: string,
  icon: string
): HTMLDivElement {
  const el = document.createElement('div')
  el.style.cssText = [
    'display:flex;align-items:center;gap:5px',
    'padding:4px 10px 4px 6px',
    'background:rgba(255,255,255,0.97)',
    `border:1.5px solid ${selected ? color : 'rgba(0,0,0,0.1)'}`,
    'border-radius:999px',
    'box-shadow:0 2px 8px rgba(0,0,0,0.12)',
    "font-family:-apple-system,BlinkMacSystemFont,'Pretendard',sans-serif",
    'font-size:12px;font-weight:600;color:#1f2937',
    'cursor:pointer;white-space:nowrap;max-width:160px',
    `transform:${selected ? 'scale(1.1)' : 'scale(1)'}`,
    'transition:transform 0.15s,border-color 0.15s',
  ].join(';')

  const iconEl = document.createElement('span')
  iconEl.textContent = icon
  iconEl.style.cssText = 'font-size:14px;flex-shrink:0'

  const textEl = document.createElement('span')
  textEl.textContent = node.label.length > 12 ? node.label.slice(0, 12) + '…' : node.label
  textEl.style.cssText = `color:${color};overflow:hidden;text-overflow:ellipsis`

  el.appendChild(iconEl)
  el.appendChild(textEl)
  return el
}

// ── 컴포넌트 ─────────────────────────────────────────────────────────────────

export default function KakaoOntologyMap({
  nodes,
  links = [],
  selectedId,
  onSelect,
  className,
}: KakaoOntologyMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const overlaysRef = useRef<any[]>([])
  const [loadState, setLoadState] = useState<'loading' | 'error' | 'ready'>('loading')
  const [retry, setRetry] = useState(0)
  const [popupNode, setPopupNode] = useState<OntologyNode | null>(null)

  // 최신 값 ref (effect 내 stale closure 방지)
  const nodesRef = useRef(nodes)
  const linksRef = useRef(links)
  const selectedIdRef = useRef(selectedId)
  const onSelectRef = useRef(onSelect)
  nodesRef.current = nodes
  linksRef.current = links
  selectedIdRef.current = selectedId
  onSelectRef.current = onSelect

  // geo 좌표를 가진 노드 집합
  const geoNodes = nodes.filter(n => extractGeoCoord(n.props) !== null)
  const nonGeoCount = nodes.length - geoNodes.length

  // 노드 타입 중 실제 존재하는 것만 레전드에 표시
  const presentTypes = Array.from(new Set(nodes.map(n => n.obj_type)))

  // 오버레이 전체 제거
  function clearOverlays() {
    overlaysRef.current.forEach(o => {
      try { o.setMap(null) } catch (_) { /* no-op */ }
    })
    overlaysRef.current = []
  }

  // 마커 빌드
  const buildMarkers = useCallback(() => {
    const map = mapRef.current
    if (!map || !window.kakao) return

    clearOverlays()

    const currentNodes = nodesRef.current
    const currentLinks = linksRef.current
    const currentSelectedId = selectedIdRef.current
    const degrees = computeDegrees(currentNodes, currentLinks)

    const geoItems: { node: OntologyNode; lat: number; lng: number }[] = []

    currentNodes.forEach(node => {
      const coord = extractGeoCoord(node.props)
      if (!coord) return
      geoItems.push({ node, lat: coord.lat, lng: coord.lng })
    })

    if (geoItems.length === 0) return

    geoItems.forEach(({ node, lat, lng }) => {
      const selected = node.obj_id === currentSelectedId
      const color = NODE_TYPE_COLORS[node.obj_type] ?? DEFAULT_COLOR
      const icon = NODE_TYPE_ICON[node.obj_type] ?? DEFAULT_ICON

      const el = createMarkerEl(node, selected, color, icon)

      el.addEventListener('click', (e) => {
        e.stopPropagation()
        onSelectRef.current?.(node)
        setPopupNode(node)
      })

      const position = new window.kakao.maps.LatLng(lat, lng)
      const overlay = new window.kakao.maps.CustomOverlay({
        position,
        content: el,
        yAnchor: 1.15,
        xAnchor: 0.5,
        zIndex: selected ? 120 : 20,
        clickable: true,
      })
      overlay.setMap(map)
      overlaysRef.current.push(overlay)

      // 차수 계산
      const degree = degrees.get(node.obj_id) ?? 0
      void degree // 팝업에서 사용
    })

    // 지도 범위 자동 조정 (최초 1회)
    if (geoItems.length > 0) {
      const bounds = new window.kakao.maps.LatLngBounds()
      geoItems.forEach(({ lat, lng }) => {
        bounds.extend(new window.kakao.maps.LatLng(lat, lng))
      })
      map.setBounds(bounds)
    }
  }, [])

  // SDK 초기화 effect
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const key = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY
    if (!key) {
      setLoadState('error')
      console.error('[KakaoOntologyMap] NEXT_PUBLIC_KAKAO_MAP_KEY is missing')
      return
    }

    let mounted = true

    loadKakaoMapScript(key)
      .then(() => {
        if (!mounted || !containerRef.current || !window.kakao) return
        setLoadState('ready')

        const map = new window.kakao.maps.Map(containerRef.current, {
          center: new window.kakao.maps.LatLng(35.22, 128.44),
          level: 9,
        })
        mapRef.current = map

        // 지도 클릭 시 팝업 닫기 + 선택 해제
        window.kakao.maps.event.addListener(map, 'click', () => {
          setPopupNode(null)
          onSelectRef.current?.(null)
        })

        buildMarkers()
      })
      .catch((err) => {
        if (!mounted) return
        setLoadState('error')
        console.error('[KakaoOntologyMap] Kakao map load error:', err)
      })

    return () => {
      mounted = false
      clearOverlays()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retry])

  // nodes / selectedId 변경 시 마커 재빌드
  useEffect(() => {
    if (!mapRef.current || !window.kakao) return
    buildMarkers()
  }, [nodes, selectedId, links, buildMarkers])

  // ── 팝업 내용 ──────────────────────────────────────────────────────────────
  function PopupContent({ node }: { node: OntologyNode }) {
    const degrees = computeDegrees(nodesRef.current, linksRef.current)
    const degree = degrees.get(node.obj_id) ?? 0
    const color = NODE_TYPE_COLORS[node.obj_type] ?? DEFAULT_COLOR
    const icon = NODE_TYPE_ICON[node.obj_type] ?? DEFAULT_ICON
    const kv = parsePropsToKV(node.props)
    const displayKV = Object.entries(kv)
      .filter(([k]) => k.toLowerCase() !== 'lat' && k.toLowerCase() !== 'lng')
      .slice(0, 6)

    return (
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          zIndex: 200,
          background: 'rgba(255,255,255,0.98)',
          borderRadius: 14,
          boxShadow: '0 4px 24px rgba(0,0,0,0.14)',
          padding: '14px 16px',
          minWidth: 200,
          maxWidth: 280,
          fontFamily: "-apple-system,BlinkMacSystemFont,'Pretendard',sans-serif",
          fontSize: 13,
          color: '#1f2937',
          border: `1.5px solid ${color}`,
        }}
      >
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 18 }}>{icon}</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#111' }}>{node.label}</div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
              <span
                style={{
                  fontSize: 11, fontWeight: 600, color: '#fff',
                  background: color, padding: '1px 8px', borderRadius: 99,
                }}
              >
                {node.obj_type}
              </span>
              <span style={{ fontSize: 11, color: '#9CA3AF' }}>연결 {degree}개</span>
            </div>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); setPopupNode(null) }}
            style={{
              marginLeft: 'auto', background: 'none', border: 'none',
              cursor: 'pointer', color: '#9CA3AF', fontSize: 16, lineHeight: 1, padding: 2,
            }}
            aria-label="닫기"
          >
            ×
          </button>
        </div>

        {/* 속성 테이블 */}
        {displayKV.length > 0 && (
          <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
            <tbody>
              {displayKV.map(([k, v]) => (
                <tr key={k} style={{ borderTop: '1px solid #F3F4F6' }}>
                  <td style={{ padding: '4px 8px 4px 0', color: '#6B7280', fontWeight: 500, whiteSpace: 'nowrap' }}>{k}</td>
                  <td style={{ padding: '4px 0', color: '#374151', wordBreak: 'break-all' }}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    )
  }

  // ── 렌더 ───────────────────────────────────────────────────────────────────
  return (
    <div
      className={className}
      style={{ position: 'relative', height: '100%', width: '100%' }}
    >
      {/* 지도 컨테이너 */}
      <div
        ref={containerRef}
        role="application"
        aria-label="온톨로지 노드 지도"
        style={{ height: '100%', width: '100%' }}
      />

      {/* 로딩/오류 오버레이 */}
      {loadState !== 'ready' && (
        <div
          style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: 12,
            background: 'rgba(248,250,252,0.92)',
            color: '#475569',
            fontFamily: "-apple-system,BlinkMacSystemFont,'Pretendard',sans-serif",
            fontSize: 14,
            pointerEvents: loadState === 'error' ? 'auto' : 'none',
            textAlign: 'center', padding: 16,
          }}
        >
          {loadState === 'loading' ? (
            <>
              <div
                style={{
                  width: 32, height: 32,
                  border: '3px solid #E2E8F0',
                  borderTopColor: '#3B82F6',
                  borderRadius: '50%',
                  animation: 'kom-spin 1s linear infinite',
                }}
              />
              <style>{`@keyframes kom-spin { to { transform: rotate(360deg); } }`}</style>
              <span>지도를 불러오는 중...</span>
            </>
          ) : (
            <>
              <span style={{ fontWeight: 600, color: '#334155' }}>
                {!process.env.NEXT_PUBLIC_KAKAO_MAP_KEY
                  ? '카카오맵 API 키가 설정되지 않았습니다.'
                  : '지도를 불러올 수 없습니다.'}
              </span>
              <span style={{ fontSize: 13, color: '#64748B', maxWidth: 320 }}>
                {!process.env.NEXT_PUBLIC_KAKAO_MAP_KEY
                  ? '.env.local에 NEXT_PUBLIC_KAKAO_MAP_KEY를 추가한 뒤 개발 서버를 재시작해 주세요.'
                  : '네트워크 또는 카카오맵 SDK 로딩 문제일 수 있습니다.'}
              </span>
              {process.env.NEXT_PUBLIC_KAKAO_MAP_KEY && (
                <button
                  onClick={() => { resetKakaoLoader(); setRetry(r => r + 1) }}
                  style={{
                    marginTop: 4, padding: '8px 16px',
                    borderRadius: 8, background: '#3B82F6',
                    color: '#fff', fontSize: 13, fontWeight: 600,
                    border: 'none', cursor: 'pointer',
                  }}
                >
                  다시 시도
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* 빈 상태 (geo 노드 없음) */}
      {loadState === 'ready' && geoNodes.length === 0 && (
        <div
          style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              background: 'rgba(255,255,255,0.92)',
              borderRadius: 12, padding: '12px 20px',
              fontSize: 13, color: '#6B7280',
              fontFamily: "-apple-system,BlinkMacSystemFont,'Pretendard',sans-serif",
              boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
            }}
          >
            지도 좌표(lat/lng)를 가진 노드가 없습니다
          </div>
        </div>
      )}

      {/* 선택 노드 팝업 */}
      {loadState === 'ready' && popupNode && (
        <PopupContent node={popupNode} />
      )}

      {/* 비지오 노드 카운트 배지 */}
      {loadState === 'ready' && nonGeoCount > 0 && (
        <div
          style={{
            position: 'absolute', bottom: 12, right: 12,
            background: 'rgba(255,255,255,0.92)',
            borderRadius: 999,
            padding: '5px 12px',
            fontSize: 12, fontWeight: 600,
            color: '#6B7280',
            fontFamily: "-apple-system,BlinkMacSystemFont,'Pretendard',sans-serif",
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            border: '1px solid rgba(0,0,0,0.07)',
            pointerEvents: 'none',
          }}
        >
          지도 외 {nonGeoCount}개 노드
        </div>
      )}

      {/* 레전드 */}
      {loadState === 'ready' && presentTypes.length > 0 && (
        <div
          style={{
            position: 'absolute', top: 12, right: 12,
            background: 'rgba(255,255,255,0.95)',
            borderRadius: 12, padding: '10px 14px',
            boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
            border: '1px solid rgba(0,0,0,0.07)',
            fontFamily: "-apple-system,BlinkMacSystemFont,'Pretendard',sans-serif",
            fontSize: 12, maxWidth: 160,
            maxHeight: 260, overflowY: 'auto',
          }}
        >
          <div style={{ fontWeight: 700, color: '#374151', marginBottom: 8, fontSize: 11 }}>
            노드 타입
          </div>
          {presentTypes.map(type => (
            <div
              key={type}
              style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}
            >
              <span style={{ fontSize: 14 }}>{NODE_TYPE_ICON[type] ?? DEFAULT_ICON}</span>
              <div
                style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: NODE_TYPE_COLORS[type] ?? DEFAULT_COLOR,
                }}
              />
              <span style={{ color: '#4B5563', fontSize: 11 }}>{type}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
