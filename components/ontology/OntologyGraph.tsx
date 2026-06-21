'use client'

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { select } from 'd3-selection'
import { zoom, zoomIdentity } from 'd3-zoom'
import type { ZoomBehavior, ZoomTransform } from 'd3-zoom'
import { drag } from 'd3-drag'
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceX,
  forceY,
  forceCollide,
} from 'd3-force'
import { extent } from 'd3-array'
import { scaleLinear, scaleBand } from 'd3-scale'
import { hierarchy, tree } from 'd3-hierarchy'
import { Btn } from '@/components/ui'
import KakaoOntologyMap from '@/components/ontology/KakaoOntologyMap'
import type { OntologyNode, OntologyEdge } from '@/lib/ontology-utils'
import { parseProps } from '@/lib/ontology-utils'
import type { GraphLayoutType, AnalyticsResult } from '@/lib/ontology/types'
import {
  buildHierarchy,
  findRootNodeId,
  radialToCartesian,
  extractGeoCoord,
  extractYear,
  supportsLayout,
  computeClusterPositions,
  computeCircularPositions,
  nodeLabelOpacity,
  linkLabelOpacity,
  lodStrokeWidth,
  linkBaseOpacity,
  buildGeoGrid,
  buildTimeAxis,
  computeLineageLayout,
  bfsPath,
} from '@/lib/ontology/layout-helpers'
import GraphToolbar from './GraphToolbar'
import MiniMap from './MiniMap'
import {
  useGraphState,
  baseNodeRadius,
} from './hooks'
import type { SimNode, SimLink } from './hooks'

const DEFAULT_NODE_COLOR = '#94A3B8'
const DEFAULT_EDGE_COLOR = '#CBD5E1'
const WORKER_THRESHOLD = 800

const NODE_TYPE_ICON: Record<string, string> = {
  '시군': '🗺',
  '청년': '👤',
  '정책': '📋',
  '시설': '🏢',
  '교통': '🚌',
  '복지': '❤',
  '의료': '🏥',
  '문화': '🎭',
  '체육': '⚽',
  '환경': '🌿',
  '산업': '🏭',
  '주거': '🏠',
  '교육': '📚',
  '취업': '💼',
  '관광': '✈',
  '농업': '🌾',
  '어업': '🐟',
}

const COMMUNITY_PALETTE = [
  'rgba(99,102,241,0.08)',
  'rgba(16,185,129,0.08)',
  'rgba(245,158,11,0.08)',
  'rgba(239,68,68,0.08)',
  'rgba(139,92,246,0.08)',
  'rgba(20,184,166,0.08)',
]

interface Props {
  nodes: OntologyNode[]
  edges: OntologyEdge[]
  width?: number
  height?: number
  selectedId?: string | null
  onSelect?: (node: OntologyNode | null) => void
  onDoubleClick?: (node: OntologyNode) => void
  relationFilter?: string[]
  layout?: GraphLayoutType
  onLayoutChange?: (layout: GraphLayoutType) => void
  analysisResult?: AnalyticsResult | null
}

// ─── Canvas drawing helpers ───────────────────────────────────────────────────

function drawArrow(
  ctx: CanvasRenderingContext2D,
  cpx: number,
  cpy: number,
  tx: number,
  ty: number
) {
  const angle = Math.atan2(ty - cpy, tx - cpx)
  const len = 8
  ctx.beginPath()
  ctx.moveTo(tx, ty)
  ctx.lineTo(tx - len * Math.cos(angle - 0.4), ty - len * Math.sin(angle - 0.4))
  ctx.lineTo(tx - len * Math.cos(angle + 0.4), ty - len * Math.sin(angle + 0.4))
  ctx.closePath()
  ctx.fill()
}

function drawEdge(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  curvature = 0.15,
  side = 1
) {
  const mx = (sx + tx) / 2
  const my = (sy + ty) / 2
  const dx = tx - sx
  const dy = ty - sy
  const cpx = mx - dy * curvature * side
  const cpy = my + dx * curvature * side
  ctx.beginPath()
  ctx.moveTo(sx, sy)
  ctx.quadraticCurveTo(cpx, cpy, tx, ty)
  ctx.stroke()
  drawArrow(ctx, cpx, cpy, tx, ty)
}

function makeDotGridPattern(
  ctx: CanvasRenderingContext2D,
  spacing: number,
  dpr: number
): CanvasPattern | null {
  const tileSize = Math.round(spacing * dpr)
  const offscreen = document.createElement('canvas')
  offscreen.width = tileSize
  offscreen.height = tileSize
  const octx = offscreen.getContext('2d')
  if (!octx) return null
  octx.fillStyle = 'rgba(255,255,255,0.055)'
  octx.beginPath()
  octx.arc(tileSize / 2, tileSize / 2, 1.2 * dpr, 0, Math.PI * 2)
  octx.fill()
  return ctx.createPattern(offscreen, 'repeat')
}

function drawDotGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  k: number,
  tx: number,
  ty: number,
  patternRef: { current: CanvasPattern | null },
  dprRef: { current: number }
) {
  const dpr = window.devicePixelRatio || 1
  const spacing = 24 * k
  // Rebuild pattern tile only when DPR changes (very rare)
  if (patternRef.current === null || dprRef.current !== dpr) {
    patternRef.current = makeDotGridPattern(ctx, spacing / k, dpr)
    dprRef.current = dpr
  }
  const pattern = patternRef.current
  if (!pattern) return
  // Offset the pattern so dots shift with pan/zoom
  const ox = ((tx % spacing) + spacing) % spacing - spacing / 2
  const oy = ((ty % spacing) + spacing) % spacing - spacing / 2
  ctx.save()
  ctx.translate(ox, oy)
  ctx.fillStyle = pattern
  ctx.fillRect(-spacing, -spacing, width + spacing * 2, height + spacing * 2)
  ctx.restore()
}

// ─── Node status helpers ──────────────────────────────────────────────────────

function parseNodeStatus(props: string): 'error' | 'stale' | 'building' | 'ok' {
  const lower = props.toLowerCase()
  if (lower.includes('status=error') || lower.includes('오류')) return 'error'
  if (lower.includes('status=stale') || lower.includes('만료') || lower.includes('미갱신')) return 'stale'
  if (lower.includes('status=building') || lower.includes('수집중') || lower.includes('처리중')) return 'building'
  return 'ok'
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function OntologyGraph({
  nodes,
  edges,
  width: widthProp = 900,
  height: heightProp = 600,
  selectedId,
  onSelect,
  onDoubleClick,
  relationFilter,
  layout: layoutProp = 'force',
  onLayoutChange,
  analysisResult = null,
}: Props) {
  const [yearFilter, setYearFilter] = useState<number | null>(null)
  const [showMap, setShowMap] = useState(false)
  const [tooltip, setTooltip] = useState<{ node: SimNode; x: number; y: number } | null>(null)
  const [pathStart, setPathStart] = useState<string | null>(null)
  const [highlightPath, setHighlightPath] = useState<Set<string>>(new Set())
  const [highlightPathEdges, setHighlightPathEdges] = useState<Set<string>>(new Set())
  const [colorMode, setColorMode] = useState<'type' | 'status' | 'layer'>('type')
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: SimNode } | null>(null)
  const [hoveredEdge, setHoveredEdge] = useState<{ rel: string; weight: number; x: number; y: number } | null>(null)
  const pinnedNodesRef = useRef<Set<string>>(new Set())

  const allYears = useMemo(
    () =>
      Array.from(
        new Set(nodes.map(n => extractYear(n.props)).filter((y): y is number => y != null))
      ).sort((a, b) => a - b),
    [nodes]
  )

  const displayNodes = useMemo(() => {
    if (yearFilter === null) return nodes
    return nodes.filter(n => {
      const y = extractYear(n.props)
      return y === null || y === yearFilter
    })
  }, [nodes, yearFilter])

  const displayNodeIds = useMemo(() => new Set(displayNodes.map(n => n.obj_id)), [displayNodes])

  const displayEdges = useMemo(
    () => edges.filter(e => displayNodeIds.has(e.src) && displayNodeIds.has(e.dst)),
    [edges, displayNodeIds]
  )

  // ── Graph state (non-SVG parts only) ────────────────────────────────────────
  const state = useGraphState({
    nodes: displayNodes,
    edges: displayEdges,
    width: widthProp,
    height: heightProp,
    selectedId,
    onSelect,
    onDoubleClick,
    relationFilter,
    layout: layoutProp,
    onLayoutChange,
    analysisResult,
  })

  const {
    wrapRef,
    simRef,
    lastMinimapUpdateRef,
    selected,
    setSelected,
    setHovered,
    activeRels,
    paused,
    showNodeLabels,
    showRelLabels,
    zoomScale,
    setZoomScale,
    layout,
    setWorkerLoading,
    setNodePositions,
    degrees,
    NODE_COLORS,
    EDGE_COLORS,
    encoding,
    neighborMap,
    resetLayout,
    toggleRel,
    togglePhysics,
    toggleFullscreen,
    handleLayoutChange,
    handleToolbarSelect,
    runWorkerLayout,
    onSelect: onSelectProp,
    width,
    height,
    relTypes,
    fullscreen,
    exporting,
    setShowNodeLabels,
    setShowRelLabels,
  } = state

  // ── Canvas-specific refs ────────────────────────────────────────────────────
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const transformRef = useRef<{ k: number; x: number; y: number }>({ k: 1, x: 0, y: 0 })
  const zoomBehaviorRef = useRef<ZoomBehavior<HTMLCanvasElement, unknown> | null>(null)
  const nodesRef = useRef<SimNode[]>([])
  const linksRef = useRef<SimLink[]>([])
  const rafRef = useRef<number>(0)
  const frameRef = useRef<number>(0)
  const anomalySetRef = useRef<Set<string>>(new Set())
  const communityMapRef = useRef<Map<string, number>>(new Map())
  // parallel edge set: canonical key "minId|maxId" → true if both directions exist
  const parallelEdgeSetRef = useRef<Set<string>>(new Set())
  // per-node status cache — recomputed when nodes change, not every frame
  const nodeStatusCacheRef = useRef<Map<string, 'error' | 'stale' | 'building' | 'ok'>>(new Map())
  // directed edge set for parallel-edge detection — recomputed when links change, not every frame
  const edgeDirSetRef = useRef<Set<string>>(new Set())
  // offscreen canvas for dot-grid pattern tile (size-invariant, redrawn only on DPR change)
  const dotGridPatternRef = useRef<CanvasPattern | null>(null)
  const dotGridDprRef = useRef<number>(0)

  // ── Export PNG (canvas native) ───────────────────────────────────────────────
  const exportPng = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const url = canvas.toDataURL('image/png')
    const a = document.createElement('a')
    a.href = url
    a.download = `eum-ontology-${new Date().toISOString().slice(0, 10)}.png`
    a.click()
  }, [])

  // ── Schedule a rAF draw ──────────────────────────────────────────────────────
  function scheduleFrame() {
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(drawFrame)
  }

  // ── Hit testing ──────────────────────────────────────────────────────────────
  function getNodeAt(ex: number, ey: number): SimNode | null {
    const { k, x, y } = transformRef.current
    const wx = (ex - x) / k
    const wy = (ey - y) / k
    return (
      nodesRef.current.find(n => {
        const dx = (n.x ?? 0) - wx
        const dy = (n.y ?? 0) - wy
        const r = baseNodeRadius(n) + 4
        return dx * dx + dy * dy <= r * r
      }) ?? null
    )
  }

  function getEdgeAt(ex: number, ey: number): { rel: string; weight: number } | null {
    const { k, x, y } = transformRef.current
    const wx = (ex - x) / k
    const wy = (ey - y) / k
    const threshold = 8 / k
    for (const l of linksRef.current) {
      const src = l.source as SimNode
      const tgt = l.target as SimNode
      const sx = src.x ?? 0; const sy = src.y ?? 0
      const tx2 = tgt.x ?? 0; const ty2 = tgt.y ?? 0
      const dx = tx2 - sx; const dy = ty2 - sy
      const len2 = dx * dx + dy * dy
      if (len2 === 0) continue
      const t = Math.max(0, Math.min(1, ((wx - sx) * dx + (wy - sy) * dy) / len2))
      const px = sx + t * dx; const py = sy + t * dy
      if (Math.hypot(wx - px, wy - py) < threshold) return { rel: l.rel, weight: l.weight ?? 1 }
    }
    return null
  }

  // ── Main draw function ───────────────────────────────────────────────────────
  function drawFrame() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    const cssW = canvas.clientWidth || width
    const cssH = canvas.clientHeight || height
    if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) {
      canvas.width = cssW * dpr
      canvas.height = cssH * dpr
    }
    ctx.save()
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, cssW, cssH)

    const { k, x, y } = transformRef.current

    // 1. Dot-grid background (in screen space, not world space)
    drawDotGrid(ctx, cssW, cssH, k, x, y, dotGridPatternRef, dotGridDprRef)

    ctx.save()
    ctx.translate(x, y)
    ctx.scale(k, k)

    const simNodes = nodesRef.current
    const simLinks = linksRef.current
    const focusId = state.hovered?.obj_id ?? selected?.obj_id ?? null
    const focusNeighbors = focusId ? neighborMap.get(focusId) : null

    // Build parallel-edge lookup: pre-computed in useEffect, not rebuilt per frame
    const edgeDirSet = edgeDirSetRef.current

    // ── 2. Community halos ───────────────────────────────────────────────────
    if (communityMapRef.current.size > 0 && k > 0.2) {
      const communityGroups = new Map<number, SimNode[]>()
      simNodes.forEach(n => {
        const cid = communityMapRef.current.get(n.obj_id)
        if (cid !== undefined) {
          if (!communityGroups.has(cid)) communityGroups.set(cid, [])
          communityGroups.get(cid)!.push(n)
        }
      })
      communityGroups.forEach((members, cid) => {
        if (members.length === 0) return
        const cx = members.reduce((s, n) => s + (n.x ?? 0), 0) / members.length
        const cy = members.reduce((s, n) => s + (n.y ?? 0), 0) / members.length
        const maxR =
          Math.max(...members.map(n => Math.hypot((n.x ?? 0) - cx, (n.y ?? 0) - cy))) +
          baseNodeRadius(members[0]) +
          20
        ctx.beginPath()
        ctx.arc(cx, cy, Math.max(maxR, 30), 0, Math.PI * 2)
        ctx.fillStyle = COMMUNITY_PALETTE[cid % COMMUNITY_PALETTE.length]
        ctx.fill()
      })
    }

    // ── 3. Geo/Time background grid ──────────────────────────────────────────
    if ((layout as string) === 'geo') {
      const { lines, labels } = buildGeoGrid(width, height)
      ctx.strokeStyle = 'rgba(255,255,255,0.06)'
      ctx.lineWidth = 1
      lines.forEach(l => {
        ctx.beginPath()
        ctx.moveTo(l.x1, l.y1)
        ctx.lineTo(l.x2, l.y2)
        ctx.stroke()
      })
      ctx.fillStyle = 'rgba(255,255,255,0.25)'
      ctx.font = '10px sans-serif'
      ctx.textAlign = 'right'
      labels.forEach(l => ctx.fillText(l.text, l.x, l.y))
    }

    if ((layout as string) === 'time') {
      const years = simNodes.map(n => extractYear(n.props)).filter((y): y is number => y != null)
      const { ticks } = buildTimeAxis(width, height, years, simNodes.map(n => n.obj_type))
      ctx.lineWidth = 1
      ticks
        .filter(t => t.type === 'year')
        .forEach(t => {
          ctx.strokeStyle = 'rgba(255,255,255,0.06)'
          ctx.beginPath()
          ctx.moveTo(t.x, 60)
          ctx.lineTo(t.x, height - 60)
          ctx.stroke()
        })
      ticks.forEach(t => {
        ctx.fillStyle = t.type === 'year' ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.25)'
        ctx.font = `${t.type === 'year' ? 10 : 9}px sans-serif`
        ctx.textAlign = t.type === 'year' ? 'center' : 'right'
        ctx.fillText(t.text, t.x, t.y)
      })
    }

    // ── 4. Edges ─────────────────────────────────────────────────────────────
    const baseOpacity = linkBaseOpacity(k)

    simLinks.forEach(l => {
      const src = l.source as SimNode
      const tgt = l.target as SimNode
      const sx = src.x ?? 0
      const sy = src.y ?? 0
      const tx2 = tgt.x ?? 0
      const ty2 = tgt.y ?? 0

      const sid = src.obj_id
      const tid = tgt.obj_id
      const hasReverse = edgeDirSet.has(`${tid}|${sid}`)

      let edgeOpacity = baseOpacity
      if (focusId) {
        if (sid === focusId || tid === focusId) edgeOpacity = 1
        else edgeOpacity = Math.max(0.15, baseOpacity * 0.4)
      }

      const edgeKey = `${sid}|${tid}`
      const isPathEdge = highlightPathEdges.size > 0 && highlightPathEdges.has(edgeKey)

      if (highlightPathEdges.size > 0 && !isPathEdge) {
        ctx.strokeStyle = EDGE_COLORS[l.rel] ?? DEFAULT_EDGE_COLOR
        ctx.fillStyle = EDGE_COLORS[l.rel] ?? DEFAULT_EDGE_COLOR
        ctx.lineWidth = Math.max(1, Math.sqrt(l.weight ?? 1) * 1.1)
        ctx.globalAlpha = edgeOpacity * 0.12
      } else if (isPathEdge) {
        ctx.strokeStyle = '#60A5FA'
        ctx.fillStyle = '#60A5FA'
        ctx.lineWidth = 3
        ctx.globalAlpha = 1
      } else {
        const color = EDGE_COLORS[l.rel] ?? DEFAULT_EDGE_COLOR
        ctx.strokeStyle = color
        ctx.fillStyle = color
        const rawW = Math.max(1, Math.sqrt(l.weight ?? 1) * 1.1)
        const isFocusEdge = focusId && (sid === focusId || tid === focusId)
        ctx.lineWidth = isFocusEdge ? rawW + 1.5 : rawW
        ctx.globalAlpha = edgeOpacity
      }

      const curvature = hasReverse ? 0.18 : 0.12
      const side = hasReverse ? 1 : 0
      drawEdge(ctx, sx, sy, tx2, ty2, curvature, side)
    })
    ctx.globalAlpha = 1

    // ── 5. Edge labels (LOD: zoom > 0.6) ────────────────────────────────────
    if (k > 0.6) {
      simLinks.forEach(l => {
        const src = l.source as SimNode
        const tgt = l.target as SimNode
        const sid = src.obj_id
        const tid = tgt.obj_id
        const opacity = linkLabelOpacity(
          { source: { obj_id: sid }, target: { obj_id: tid } },
          k,
          showRelLabels,
          focusId
        )
        if (opacity <= 0) return
        const mx = ((src.x ?? 0) + (tgt.x ?? 0)) / 2
        const my = ((src.y ?? 0) + (tgt.y ?? 0)) / 2 - 5
        ctx.globalAlpha = opacity
        ctx.font = '500 10px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillStyle = '#E2E8F0'
        ctx.fillText(l.rel, mx, my)
      })
      ctx.globalAlpha = 1
    }

    // ── 6. Nodes ─────────────────────────────────────────────────────────────
    simNodes.forEach(n => {
      const nx = n.x ?? 0
      const ny = n.y ?? 0
      const r = encoding?.nodeRadii.get(n.obj_id) ?? baseNodeRadius(n)
      let color = encoding?.nodeColors.get(n.obj_id) ?? NODE_COLORS[n.obj_type] ?? DEFAULT_NODE_COLOR
      if (colorMode === 'status') {
        const s = nodeStatusCacheRef.current.get(n.obj_id) ?? 'ok'
        color = s === 'error' ? '#EF4444' : s === 'stale' ? '#F59E0B' : s === 'building' ? '#3B82F6' : '#10B981'
      } else if (colorMode === 'layer') {
        const layerColors: Record<string, string> = {
          '시군': '#6366F1', '청년': '#8B5CF6', '정책': '#EC4899', '시설': '#F59E0B',
          '교통': '#14B8A6', '복지': '#10B981', '의료': '#EF4444', '문화': '#3B82F6',
        }
        color = layerColors[n.obj_type] ?? DEFAULT_NODE_COLOR
      }
      const isAnomaly = anomalySetRef.current.has(n.obj_id)
      const isFocus = n.obj_id === focusId
      const isNeighbor = focusNeighbors?.has(n.obj_id) ?? false

      let nodeOpacity = 1
      if (focusId && !isFocus && !isNeighbor) nodeOpacity = 0.15
      const isPathNode = highlightPath.size > 0 && highlightPath.has(n.obj_id)
      if (highlightPath.size > 0 && !isPathNode) nodeOpacity = Math.min(nodeOpacity, 0.15)

      ctx.globalAlpha = nodeOpacity

      // Anomaly outer glow
      if (isAnomaly) {
        ctx.save()
        ctx.shadowColor = '#EF4444'
        ctx.shadowBlur = 14 / k
        ctx.beginPath()
        ctx.arc(nx, ny, r + 4, 0, Math.PI * 2)
        ctx.strokeStyle = '#EF4444'
        ctx.lineWidth = 2.5
        ctx.stroke()
        ctx.restore()
      }

      // Type ring
      ctx.beginPath()
      ctx.arc(nx, ny, r + 3.5, 0, Math.PI * 2)
      ctx.strokeStyle = NODE_COLORS[n.obj_type] ?? DEFAULT_NODE_COLOR
      ctx.lineWidth = 1.5
      ctx.globalAlpha = nodeOpacity * 0.45
      ctx.stroke()
      ctx.globalAlpha = nodeOpacity

      // Status ring
      const nodeStatus = nodeStatusCacheRef.current.get(n.obj_id) ?? 'ok'
      if (nodeStatus !== 'ok') {
        ctx.save()
        const outerR = r + 6
        if (nodeStatus === 'error') {
          ctx.strokeStyle = '#EF4444'
          ctx.lineWidth = 2.5
          ctx.globalAlpha = nodeOpacity
          ctx.beginPath()
          ctx.arc(nx, ny, outerR, 0, Math.PI * 2)
          ctx.stroke()
          // ! badge
          ctx.fillStyle = '#EF4444'
          ctx.beginPath()
          ctx.arc(nx + r * 0.7, ny - r * 0.7, 5, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = '#fff'
          ctx.font = 'bold 6px sans-serif'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText('!', nx + r * 0.7, ny - r * 0.7)
          ctx.textBaseline = 'alphabetic'
        } else if (nodeStatus === 'stale') {
          ctx.strokeStyle = '#F59E0B'
          ctx.lineWidth = 2
          ctx.setLineDash([4, 3])
          ctx.globalAlpha = nodeOpacity * 0.85
          ctx.beginPath()
          ctx.arc(nx, ny, outerR, 0, Math.PI * 2)
          ctx.stroke()
          ctx.setLineDash([])
        } else if (nodeStatus === 'building') {
          // animated arc using frameRef
          const progress = (frameRef.current % 120) / 120
          ctx.strokeStyle = '#3B82F6'
          ctx.lineWidth = 2.5
          ctx.globalAlpha = nodeOpacity * 0.9
          ctx.beginPath()
          const startAngle = progress * Math.PI * 2 - Math.PI / 2
          ctx.arc(nx, ny, outerR, startAngle, startAngle + Math.PI * 1.2)
          ctx.stroke()
        }
        ctx.restore()
      }

      // Main circle
      ctx.beginPath()
      ctx.arc(nx, ny, r, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
      const sw = lodStrokeWidth(k, isFocus)
      if (sw > 0) {
        ctx.strokeStyle = isAnomaly
          ? '#EF4444'
          : encoding?.nodeStrokes.get(n.obj_id) ?? 'rgba(255,255,255,0.6)'
        ctx.lineWidth = isAnomaly ? 2 : sw
        ctx.stroke()
      }

      // Emoji icon
      const icon = NODE_TYPE_ICON[n.obj_type]
      if (icon) {
        const fontSize = Math.round(r * 0.85)
        ctx.font = `${fontSize}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(icon, nx, ny)
      }

      // Node label (LOD: zoom > 0.35)
      const labelOpacity = nodeLabelOpacity(n, k, showNodeLabels, focusId, focusNeighbors)
      if (labelOpacity > 0) {
        const maxLen = 10
        const labelText = n.label.length > maxLen ? `${n.label.slice(0, maxLen)}…` : n.label
        const fontSize = 9
        ctx.font = `600 ${fontSize}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'alphabetic'
        const tw = Math.min(n.label.length, 10) * 5.5 + 4
        const lx = nx - tw / 2
        const ly = ny + r + 4

        ctx.globalAlpha = nodeOpacity * labelOpacity
        ctx.fillStyle = 'rgba(0,0,0,0.45)'
        ctx.beginPath()
        ctx.roundRect(lx, ly - 2, tw, 14, 3)
        ctx.fill()
        ctx.strokeStyle = 'rgba(255,255,255,0.1)'
        ctx.lineWidth = 0.5
        ctx.stroke()
        ctx.fillStyle = '#fff'
        ctx.fillText(labelText, nx, ly + 9)
      }

      ctx.globalAlpha = 1
      ctx.textBaseline = 'alphabetic'
    })

    ctx.restore()
    ctx.restore()

    // Increment frame counter for animations
    frameRef.current++

    // Re-schedule if any building nodes need animation
    const hasBuilding = nodesRef.current.some(n => nodeStatusCacheRef.current.get(n.obj_id) === 'building')
    if (hasBuilding) {
      rafRef.current = requestAnimationFrame(drawFrame)
    }
  }

  // ── Zoom controls (canvas-native) ────────────────────────────────────────────
  const resetZoom = useCallback(() => {
    const canvas = canvasRef.current
    const zb = zoomBehaviorRef.current
    if (!canvas || !zb) return
    select(canvas).transition().duration(500).call(zb.transform as any, zoomIdentity)
  }, [])

  const zoomBy = useCallback((factor: number) => {
    const canvas = canvasRef.current
    const zb = zoomBehaviorRef.current
    if (!canvas || !zb) return
    select(canvas).transition().duration(250).call(zb.scaleBy as any, factor)
  }, [])

  const fitToBounds = useCallback(() => {
    const canvas = canvasRef.current
    const zb = zoomBehaviorRef.current
    const simNodes = nodesRef.current
    if (!canvas || !zb || simNodes.length === 0) return
    const xs = simNodes.map(n => n.x ?? 0)
    const ys = simNodes.map(n => n.y ?? 0)
    const [minX, maxX] = [Math.min(...xs), Math.max(...xs)]
    const [minY, maxY] = [Math.min(...ys), Math.max(...ys)]
    const bw = maxX - minX || 1
    const bh = maxY - minY || 1
    const scale = Math.min((width - 80) / bw, (height - 80) / bh, 2)
    const transform = zoomIdentity
      .translate(width / 2, height / 2)
      .scale(scale)
      .translate(-(minX + bw / 2), -(minY + bh / 2))
    select(canvas).transition().duration(600).call(zb.transform as any, transform)
  }, [width, height])

  const focusNode = useCallback(
    (nodeId: string) => {
      const canvas = canvasRef.current
      const zb = zoomBehaviorRef.current
      const target = nodesRef.current.find(n => n.obj_id === nodeId)
      if (!canvas || !zb || !target || target.x == null || target.y == null) return
      const scale = 1.4
      const transform = zoomIdentity
        .translate(width / 2, height / 2)
        .scale(scale)
        .translate(-target.x, -target.y)
      select(canvas).transition().duration(600).call(zb.transform as any, transform)
    },
    [width, height]
  )

  // Focus when selection changes
  useEffect(() => {
    if (selected) focusNode(selected.obj_id)
  }, [selected, focusNode])

  // Keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      setContextMenu(null)
      setPathStart(null)
      setHighlightPath(new Set())
      setHighlightPathEdges(new Set())
      setSelected(null)
      onSelectProp?.(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onSelectProp, setSelected])

  // Redraw on highlight/state changes
  useEffect(() => {
    scheduleFrame()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    state.hovered,
    selected,
    showNodeLabels,
    showRelLabels,
    zoomScale,
    neighborMap,
    encoding,
    NODE_COLORS,
    EDGE_COLORS,
    layout,
    colorMode,
  ])

  // ── applyLayout (pure position mutation, unchanged logic) ────────────────────
  function applyLayout(
    simNodes: SimNode[],
    _simLinks: SimLink[],
    effectiveLayout: GraphLayoutType,
    workerPositions?: Map<string, { obj_id: string; x: number; y: number; vx?: number; vy?: number }>
  ) {
    const nodeMap = new Map(simNodes.map(n => [n.obj_id, n]))

    if (effectiveLayout === 'force') {
      if (workerPositions && workerPositions.size > 0) {
        simNodes.forEach(n => {
          const p = workerPositions.get(n.obj_id)
          if (p) {
            n.x = p.x
            n.y = p.y
            n.vx = p.vx ?? 0
            n.vy = p.vy ?? 0
          }
        })
      }
      return
    }

    if (effectiveLayout === 'cluster' || effectiveLayout === 'galaxy') {
      const positions = computeClusterPositions(
        simNodes,
        edges,
        width,
        height,
        effectiveLayout === 'cluster' ? 85 : 130
      )
      positions.forEach((p, id) => {
        const n = nodeMap.get(id)
        if (n) { n.x = p.x; n.y = p.y }
      })
      return
    }

    if (effectiveLayout === 'circular') {
      const positions = computeCircularPositions(simNodes, edges, width, height)
      positions.forEach((p, id) => {
        const n = nodeMap.get(id)
        if (n) { n.x = p.x; n.y = p.y }
      })
      return
    }

    if (effectiveLayout === 'hierarchical') {
      const rootId = findRootNodeId(simNodes, edges)
      const treeData = buildHierarchy(simNodes, edges, rootId)
      const root = hierarchy(treeData as any)
      const treeLayout = tree().size([width - 120, height - 120]) as any
      treeLayout(root)
      root.each((d: any) => {
        const n = nodeMap.get(d.data.id)
        if (n) { n.x = (d.x ?? 0) + 60; n.y = (d.y ?? 0) + 60 }
      })
      return
    }

    if (effectiveLayout === 'radial') {
      const rootId = findRootNodeId(simNodes, edges)
      const treeData = buildHierarchy(simNodes, edges, rootId)
      const root = hierarchy(treeData as any)
      const radius = Math.min(width, height) / 2 - 80
      const treeLayout = tree().size([2 * Math.PI, radius]) as any
      treeLayout(root)
      root.each((d: any) => {
        const n = nodeMap.get(d.data.id)
        if (n) {
          const p = radialToCartesian(d.x ?? 0, d.y ?? 0)
          n.x = p.x + width / 2
          n.y = p.y + height / 2
        }
      })
      return
    }

    if (effectiveLayout === 'geo') {
      const coords = simNodes
        .map(n => ({ n, coord: extractGeoCoord(n.props) }))
        .filter(x => x.coord)
      if (coords.length > 0) {
        const lngs = coords.map(c => c.coord!.lng)
        const lats = coords.map(c => c.coord!.lat)
        const [minLng, maxLng] = extent(lngs) as [number, number]
        const [minLat, maxLat] = extent(lats) as [number, number]
        const xScale = scaleLinear().domain([minLng, maxLng]).range([80, width - 80])
        const yScale = scaleLinear().domain([minLat, maxLat]).range([height - 80, 80])
        coords.forEach(({ n, coord }) => {
          const target = nodeMap.get(n.obj_id)
          if (target && coord) {
            target.x = xScale(coord.lng)
            target.y = yScale(coord.lat)
          }
        })
      }
      return
    }

    if (effectiveLayout === 'time') {
      const withYear = simNodes.map(n => ({ n, year: extractYear(n.props) })).filter(x => x.year != null)
      if (withYear.length > 0) {
        const years = withYear.map(x => x.year as number)
        const [minYear, maxYear] = extent(years) as [number, number]
        const xScale = scaleLinear().domain([minYear, maxYear]).range([100, width - 100])
        const yScale = scaleBand(simNodes.map(n => n.obj_type), [height - 80, 80]).padding(0.2)
        withYear.forEach(({ n, year }) => {
          const target = nodeMap.get(n.obj_id)
          if (target && year != null) {
            target.x = xScale(year)
            target.y = (yScale(n.obj_type) ?? height / 2) + yScale.bandwidth() / 2
          }
        })
      }
    }

    if (effectiveLayout === 'lineage') {
      const positions = computeLineageLayout(simNodes, edges, width, height)
      positions.forEach((p, id) => {
        const n = nodeMap.get(id)
        if (n) { n.x = p.x; n.y = p.y }
      })
      return
    }
  }

  // ── Main effect: setup simulation + canvas events ────────────────────────────
  useEffect(() => {
    if (!canvasRef.current || displayNodes.length === 0) return
    let cancelled = false

    async function init() {
      simRef.current?.stop()

      const canvas = canvasRef.current!

      // Build sim data
      const simNodes: SimNode[] = displayNodes.map(n => ({
        ...n,
        degree: degrees.get(n.obj_id) ?? 0,
      }))
      const nodeMap = new Map(simNodes.map(n => [n.obj_id, n]))

      const simLinks: SimLink[] = displayEdges
        .filter(e => activeRels.has(e.rel) && nodeMap.has(e.src) && nodeMap.has(e.dst))
        .map(e => ({ source: e.src, target: e.dst, rel: e.rel, weight: e.weight }))

      nodesRef.current = simNodes
      linksRef.current = simLinks

      // Populate per-node status cache (avoids repeated string parsing in drawFrame)
      const statusCache = new Map<string, 'error' | 'stale' | 'building' | 'ok'>()
      simNodes.forEach(n => statusCache.set(n.obj_id, parseNodeStatus(n.props ?? '')))
      nodeStatusCacheRef.current = statusCache

      // Populate directed-edge set for parallel-edge detection (avoids per-frame Set rebuild)
      const dirSet = new Set<string>()
      simLinks.forEach(l => {
        const s = (l.source as SimNode).obj_id ?? String(l.source)
        const t = (l.target as SimNode).obj_id ?? String(l.target)
        dirSet.add(`${s}|${t}`)
      })
      edgeDirSetRef.current = dirSet

      // Analysis overlays
      anomalySetRef.current = new Set<string>(
        analysisResult?.type === 'anomaly'
          ? analysisResult.results.map(r => r.obj_id)
          : []
      )
      communityMapRef.current = new Map<string, number>(
        analysisResult?.type === 'community'
          ? analysisResult.communities.flatMap(c =>
              c.nodes.map(n => [n.obj_id, c.communityId] as [string, number])
            )
          : []
      )

      // Parallel edge detection
      const edgePairSet = new Set<string>()
      displayEdges.forEach(e => {
        const key = [e.src, e.dst].sort().join('|')
        edgePairSet.add(key)
      })
      parallelEdgeSetRef.current = edgePairSet

      let effectiveLayout = layout

      if ((layout === 'geo' || layout === 'time') && !supportsLayout(layout, displayNodes)) {
        console.warn(
          `[OntologyGraph] layout '${layout}' requires ${layout === 'geo' ? 'lat/lng props' : 'year props'}, falling back to force`
        )
        effectiveLayout = 'force'
      }

      // Web Worker for large graphs
      let workerPositions:
        | Map<string, { obj_id: string; x: number; y: number; vx?: number; vy?: number }>
        | undefined
      if (effectiveLayout === 'force' && simNodes.length > WORKER_THRESHOLD) {
        setWorkerLoading(true)
        try {
          workerPositions = await runWorkerLayout(simNodes, simLinks, effectiveLayout)
        } catch (e) {
          console.warn('[OntologyGraph] worker layout failed, falling back to main thread', e)
        } finally {
          setWorkerLoading(false)
        }
      }

      if (cancelled) return

      applyLayout(simNodes, simLinks, effectiveLayout, workerPositions)

      // ── D3 Zoom on canvas ───────────────────────────────────────────────────
      const zb = zoom<HTMLCanvasElement, unknown>()
        .scaleExtent([0.1, 4])
        .on('zoom', e => {
          const t: ZoomTransform = e.transform
          transformRef.current = { k: t.k, x: t.x, y: t.y }
          // Also sync to useGraphState.transformRef for MiniMap
          state.transformRef.current = t as unknown as typeof state.transformRef.current
          setZoomScale(t.k)
          scheduleFrame()
        })
      zoomBehaviorRef.current = zb
      select(canvas).call(zb)

      // ── D3 drag on canvas ───────────────────────────────────────────────────
      const dragBehavior = drag<HTMLCanvasElement, unknown>()
        .filter(event => {
          // Only drag if the pointer is on a node
          const rect = canvas.getBoundingClientRect()
          const node = getNodeAt(event.clientX - rect.left, event.clientY - rect.top)
          return node !== null
        })
        .on('start', event => {
          const rect = canvas.getBoundingClientRect()
          const node = getNodeAt(event.clientX - rect.left, event.clientY - rect.top)
          if (!node) return
          if (!event.active) simRef.current?.alphaTarget(0.3).restart()
          node.fx = node.x
          node.fy = node.y
          ;(event as any)._draggingNode = node
        })
        .on('drag', event => {
          const node: SimNode | undefined = (event as any)._draggingNode
          if (!node) return
          const { k, x, y } = transformRef.current
          node.fx = (event.x - x) / k
          node.fy = (event.y - y) / k
        })
        .on('end', event => {
          const node: SimNode | undefined = (event as any)._draggingNode
          if (!node) return
          if (!event.active) simRef.current?.alphaTarget(0)
          if (!pinnedNodesRef.current.has(node.obj_id)) {
            node.fx = null
            node.fy = null
          }
        })

      // Apply drag after zoom so drag can steal pointer events for nodes
      select(canvas).call(dragBehavior as any)

      // ── Canvas pointer events ───────────────────────────────────────────────
      function onMouseMove(e: MouseEvent) {
        const rect = canvas.getBoundingClientRect()
        const ex = e.clientX - rect.left
        const ey = e.clientY - rect.top
        const node = getNodeAt(ex, ey)
        if (node) {
          canvas.style.cursor = 'pointer'
          setHovered({ ...node })
          setTooltip({ node, x: ex + 14, y: ey - 14 })
          setHoveredEdge(null)
        } else {
          const edge = getEdgeAt(ex, ey)
          if (edge) {
            canvas.style.cursor = 'crosshair'
            setHoveredEdge({ ...edge, x: ex + 14, y: ey - 14 })
          } else {
            canvas.style.cursor = 'grab'
            setHoveredEdge(null)
          }
          setHovered(null)
          setTooltip(null)
        }
      }

      function onClick(e: MouseEvent) {
        setContextMenu(null)
        const rect = canvas.getBoundingClientRect()
        const node = getNodeAt(e.clientX - rect.left, e.clientY - rect.top)
        if (e.shiftKey && node) {
          if (!pathStart) {
            setPathStart(node.obj_id)
            setHighlightPath(new Set([node.obj_id]))
            setHighlightPathEdges(new Set())
          } else {
            const path = bfsPath(pathStart, node.obj_id, displayEdges)
            if (path) {
              setHighlightPath(new Set(path))
              const edgeKeys = new Set<string>()
              for (let i = 0; i < path.length - 1; i++) {
                edgeKeys.add(`${path[i]}|${path[i + 1]}`)
                edgeKeys.add(`${path[i + 1]}|${path[i]}`)
              }
              setHighlightPathEdges(edgeKeys)
            }
            setPathStart(null)
          }
          return
        }
        // Normal click — reset path
        setPathStart(null)
        setHighlightPath(new Set())
        setHighlightPathEdges(new Set())
        if (node) {
          setSelected({ ...node })
          onSelectProp?.({ ...node })
        } else {
          setSelected(null)
          onSelectProp?.(null)
        }
      }

      let lastClickTime = 0
      let lastClickNode: SimNode | null = null
      function onDblClick(e: MouseEvent) {
        const rect = canvas.getBoundingClientRect()
        const node = getNodeAt(e.clientX - rect.left, e.clientY - rect.top)
        if (node) onDoubleClick?.({ ...node })
      }

      function onMouseLeave() {
        setHovered(null)
        setTooltip(null)
        setHoveredEdge(null)
      }

      function onContextMenu(e: MouseEvent) {
        e.preventDefault()
        const rect = canvas.getBoundingClientRect()
        const node = getNodeAt(e.clientX - rect.left, e.clientY - rect.top)
        if (node) {
          setContextMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top, node })
        } else {
          setContextMenu(null)
        }
      }

      canvas.addEventListener('mousemove', onMouseMove)
      canvas.addEventListener('click', onClick)
      canvas.addEventListener('dblclick', onDblClick)
      canvas.addEventListener('mouseleave', onMouseLeave)
      canvas.addEventListener('contextmenu', onContextMenu)

      // ── Force simulation ────────────────────────────────────────────────────
      const clusterCenters = computeClusterPositions(simNodes, edges, width, height, 100)
      const clusterForceX = forceX<SimNode>(d => {
        if (d.obj_type === '시군') return clusterCenters.get(d.obj_id)?.x ?? width / 2
        const parent =
          edges.find(e => e.dst === d.obj_id && e.src.startsWith('sigun:'))?.src ??
          edges.find(e => e.src === d.obj_id && e.dst.startsWith('sigun:'))?.dst
        return clusterCenters.get(parent ?? '')?.x ?? width / 2
      }).strength(0.06)
      const clusterForceY = forceY<SimNode>(d => {
        if (d.obj_type === '시군') return clusterCenters.get(d.obj_id)?.y ?? height / 2
        const parent =
          edges.find(e => e.dst === d.obj_id && e.src.startsWith('sigun:'))?.src ??
          edges.find(e => e.src === d.obj_id && e.dst.startsWith('sigun:'))?.dst
        return clusterCenters.get(parent ?? '')?.y ?? height / 2
      }).strength(0.06)

      const sim = forceSimulation<SimNode>(simNodes)

      if (effectiveLayout === 'force') {
        const linkDistance = Math.min(180, Math.max(45, 700 / Math.sqrt(simNodes.length)))
        sim
          .force('link', forceLink<SimNode, SimLink>(simLinks).id(d => d.obj_id).distance(linkDistance).strength(0.5))
          .force('charge', forceManyBody<SimNode>().strength(-900).distanceMax(280))
          .force('center', forceCenter(width / 2, height / 2).strength(0.03))
          .force('clusterX', clusterForceX)
          .force('clusterY', clusterForceY)
          .force(
            'collide',
            forceCollide<SimNode>(d => {
              const base = d.obj_type === '시군' ? 18 : 9
              return base + Math.min((d.degree ?? 0) * 0.5, 5) + 4
            }).iterations(3)
          )
          .alphaDecay(0.02)
        if (workerPositions && workerPositions.size > 0) {
          sim.alpha(0.25).restart()
        }
      } else {
        sim
          .force('center', forceCenter(width / 2, height / 2).strength(0.02))
          .force(
            'collide',
            forceCollide<SimNode>(d => {
              const base = d.obj_type === '시군' ? 18 : 9
              return base + Math.min((d.degree ?? 0) * 0.5, 5) + 3
            })
              .strength(0.4)
              .iterations(3)
          )
          .alphaDecay(0.03)
      }

      sim.on('tick', () => {
        scheduleFrame()
        const now = performance.now()
        if (now - lastMinimapUpdateRef.current > 250) {
          lastMinimapUpdateRef.current = now
          setNodePositions(simNodes.map(n => ({ obj_id: n.obj_id, x: n.x ?? 0, y: n.y ?? 0 })))
        }
      })

      simRef.current = sim
      if (paused) sim.stop()

      sim.on('end', () => {
        fitToBounds()
        sim.on('end', null)
        setNodePositions(simNodes.map(n => ({ obj_id: n.obj_id, x: n.x ?? 0, y: n.y ?? 0 })))
      })

      scheduleFrame()

      return () => {
        canvas.removeEventListener('mousemove', onMouseMove)
        canvas.removeEventListener('click', onClick)
        canvas.removeEventListener('dblclick', onDblClick)
        canvas.removeEventListener('mouseleave', onMouseLeave)
        canvas.removeEventListener('contextmenu', onContextMenu)
        select(canvas).on('.zoom', null)
        select(canvas).on('.drag', null)
      }
    }

    let cleanup: (() => void) | undefined
    init().then(c => { if (c) cleanup = c })

    return () => {
      cancelled = true
      simRef.current?.stop()
      cancelAnimationFrame(rafRef.current)
      cleanup?.()
    }
    // paused intentionally excluded — handled by togglePhysics
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    displayNodes,
    displayEdges,
    width,
    height,
    activeRels,
    degrees,
    onSelectProp,
    onDoubleClick,
    layout,
    runWorkerLayout,
    setZoomScale,
    setNodePositions,
    setWorkerLoading,
    setHovered,
    setSelected,
    simRef,
    lastMinimapUpdateRef,
    encoding,
    analysisResult,
  ])

  const selectedProps = selected ? parseProps(selected.props) : {}

  return (
    <div className="space-y-3">
      <GraphToolbar
        layout={layout}
        onLayoutChange={handleLayoutChange}
        paused={paused}
        onTogglePhysics={togglePhysics}
        onReheat={resetLayout}
        onFit={fitToBounds}
        onZoomIn={() => zoomBy(1.3)}
        onZoomOut={() => zoomBy(0.77)}
        onResetZoom={resetZoom}
        fullscreen={fullscreen}
        onToggleFullscreen={toggleFullscreen}
        exporting={exporting}
        onExportPng={exportPng}
        activeRels={activeRels}
        relTypes={relTypes}
        edgeColors={EDGE_COLORS}
        showNodeLabels={showNodeLabels}
        onToggleNodeLabels={() => setShowNodeLabels(p => !p)}
        showRelLabels={showRelLabels}
        onToggleRelLabels={() => setShowRelLabels(p => !p)}
        onToggleRel={toggleRel}
        nodes={displayNodes}
        selectedNodeId={selected?.obj_id ?? null}
        onSelectNode={handleToolbarSelect}
        years={allYears}
        yearFilter={yearFilter}
        onYearChange={setYearFilter}
        showMap={showMap}
        onToggleMap={() => setShowMap(p => !p)}
      />

      <div
        ref={wrapRef}
        className="relative bg-gray-900 rounded-lg overflow-hidden"
        style={{ height: fullscreen ? '100vh' : height }}
      >
        {/* Analysis overlay legend */}
        {encoding && encoding.legend.length > 0 && (
          <div className="absolute top-3 left-3 bg-gray-900/80 backdrop-blur-sm text-white text-xs rounded-xl p-3 space-y-1.5 z-10 shadow-lg border border-white/10 max-w-[180px]">
            <div className="font-semibold text-gray-200 mb-1">분석 오버레이</div>
            {encoding.legend.map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                {item.type === 'node' ? (
                  <div className="w-3 h-3 rounded-full ring-2 ring-white/20" style={{ backgroundColor: item.color }} />
                ) : (
                  <div className="w-6 h-1 rounded" style={{ backgroundColor: item.color }} />
                )}
                <span className="text-gray-100 truncate">{item.label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Legend */}
        <div className="absolute top-3 right-3 bg-gray-900/80 backdrop-blur-sm text-white text-xs rounded-xl p-3 space-y-1.5 z-10 shadow-lg border border-white/10">
          <div className="font-semibold text-gray-200 mb-1">노드 타입</div>
          {Object.entries(NODE_COLORS).map(([k, c]) => (
            <div key={k} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full ring-2 ring-white/20" style={{ backgroundColor: c }} />
              <span className="text-gray-100">{k}</span>
            </div>
          ))}
          <div className="border-t border-white/20 my-1.5" />
          <div className="font-semibold text-gray-200 mb-1">관계 타입</div>
          {Object.entries(EDGE_COLORS).map(([k, c]) => (
            <div key={k} className="flex items-center gap-2">
              <div className="w-6 h-1 rounded" style={{ backgroundColor: c }} />
              <span className="text-gray-100">{k}</span>
            </div>
          ))}
        </div>

        {/* Stats */}
        <div className="absolute bottom-3 left-3 bg-black/60 text-white text-[10px] rounded-lg px-2.5 py-1.5 z-10 space-y-0.5">
          <div>노드 {displayNodes.length}개 · 엣지 {displayEdges.length}개</div>
          {layout && <div>레이아웃: {layout}</div>}
          {state.workerLoading && <div>Worker 레이아웃 계산 중...</div>}
          {selected && <div>선택: {selected.label}</div>}
          {state.hovered && state.hovered.obj_id !== selected?.obj_id && (
            <div>포인터: {state.hovered.label}</div>
          )}
        </div>

        <MiniMap
          nodes={state.nodePositions}
          transform={{
            x: transformRef.current.x,
            y: transformRef.current.y,
            k: transformRef.current.k,
          }}
          width={width}
          height={height}
        />

        {/* Color mode selector */}
        <div className="absolute bottom-14 right-3 z-10 flex flex-col gap-1">
          {(['type', 'status', 'layer'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setColorMode(mode)}
              className={`px-2 py-0.5 text-[10px] rounded font-medium transition-all ${
                colorMode === mode
                  ? 'bg-white/20 text-white ring-1 ring-white/40'
                  : 'bg-black/20 text-white/50 hover:bg-black/30'
              }`}
            >
              {mode === 'type' ? '유형' : mode === 'status' ? '상태' : '계층'}
            </button>
          ))}
        </div>

        {/* Status color legend */}
        {colorMode === 'status' && (
          <div className="absolute bottom-32 right-3 z-10 bg-black/60 rounded-lg p-2 space-y-1">
            {([['#10B981', '정상'], ['#F59E0B', '만료'], ['#3B82F6', '수집중'], ['#EF4444', '오류']] as const).map(([c, l]) => (
              <div key={l} className="flex items-center gap-1.5 text-[10px] text-white">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: c }} />
                {l}
              </div>
            ))}
          </div>
        )}

        <canvas
          ref={canvasRef}
          data-testid="ontology-graph-canvas"
          role="img"
          aria-label={`온톨로지 그래프, 노드 ${displayNodes.length}개, 엣지 ${displayEdges.length}개${selected ? `, 선택된 노드 ${selected.label}` : ''}`}
          className="w-full h-full cursor-grab active:cursor-grabbing"
          style={{ display: 'block' }}
        />

        {/* BFS 경로 탐색 힌트 */}
        {pathStart && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 bg-blue-600/90 text-white text-xs px-3 py-1 rounded-full shadow-lg pointer-events-none">
            Shift+클릭으로 경로 탐색 종점 선택
          </div>
        )}

        {/* 노드 호버 툴팁 */}
        {tooltip && !contextMenu && (
          <div
            className="absolute z-30 pointer-events-none bg-gray-800/95 backdrop-blur-sm text-white text-xs rounded-xl px-3 py-2.5 shadow-xl border border-white/10 max-w-[240px]"
            style={{ left: Math.min(tooltip.x, width - 260), top: Math.max(tooltip.y, 4) }}
          >
            <div className="font-semibold text-white mb-0.5 truncate">{tooltip.node.label}</div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-gray-400">{tooltip.node.obj_type}</span>
              {(() => {
                const s = nodeStatusCacheRef.current.get(tooltip.node.obj_id)
                if (!s || s === 'ok') return null
                const cfg = s === 'error'
                  ? { cls: 'bg-red-900/60 text-red-300', label: '오류' }
                  : s === 'stale'
                  ? { cls: 'bg-yellow-900/60 text-yellow-300', label: '만료' }
                  : { cls: 'bg-blue-900/60 text-blue-300', label: '수집중' }
                return <span className={`text-[9px] px-1 py-0.5 rounded ${cfg.cls}`}>{cfg.label}</span>
              })()}
            </div>
            {(tooltip.node.degree ?? 0) > 0 && (
              <div className="text-gray-500 mt-0.5">연결 {tooltip.node.degree}개</div>
            )}
            {pinnedNodesRef.current.has(tooltip.node.obj_id) && (
              <div className="text-indigo-400 mt-0.5 text-[10px]">📌 핀 고정됨</div>
            )}
            <div className="mt-1.5 text-gray-600 text-[10px] border-t border-white/10 pt-1.5 space-y-0.5">
              <div>클릭: 선택 · 더블클릭: AI 질의</div>
              <div>우클릭: 메뉴 · Shift+클릭: 경로</div>
            </div>
          </div>
        )}

        {/* 엣지 호버 툴팁 */}
        {hoveredEdge && !contextMenu && (
          <div
            className="absolute z-30 pointer-events-none bg-gray-700/95 backdrop-blur-sm text-white text-[11px] rounded-lg px-2.5 py-1.5 shadow-lg border border-white/10"
            style={{ left: Math.min(hoveredEdge.x, width - 160), top: Math.max(hoveredEdge.y, 4) }}
          >
            <div className="font-medium text-gray-200">{hoveredEdge.rel}</div>
            <div className="text-gray-500">가중치 {hoveredEdge.weight}</div>
          </div>
        )}

        {/* 우클릭 컨텍스트 메뉴 */}
        {contextMenu && (
          <div
            className="absolute z-50 bg-gray-800/98 backdrop-blur-sm rounded-xl shadow-2xl border border-white/15 py-1.5 min-w-[168px]"
            style={{
              left: Math.min(contextMenu.x, width - 180),
              top: Math.min(contextMenu.y, height - 220),
            }}
          >
            <div className="px-3 py-1.5 text-[10px] text-gray-400 font-medium border-b border-white/10 mb-1 truncate">
              {contextMenu.node.label}
              <span className="ml-1.5 text-gray-600">{contextMenu.node.obj_type}</span>
            </div>
            {[
              {
                label: '노드 선택',
                icon: '◎',
                onClick: () => {
                  setSelected({ ...contextMenu.node })
                  onSelectProp?.({ ...contextMenu.node })
                },
              },
              {
                label: 'AI 질의',
                icon: '✦',
                onClick: () => onDoubleClick?.({ ...contextMenu.node }),
              },
              {
                label: '화면 중앙',
                icon: '⊕',
                onClick: () => focusNode(contextMenu.node.obj_id),
              },
              {
                label: '경로 시작점 설정',
                icon: '→',
                onClick: () => {
                  setPathStart(contextMenu.node.obj_id)
                  setHighlightPath(new Set([contextMenu.node.obj_id]))
                  setHighlightPathEdges(new Set())
                },
              },
              {
                label: pinnedNodesRef.current.has(contextMenu.node.obj_id) ? '핀 해제' : '핀 고정',
                icon: '📌',
                onClick: () => {
                  const n = nodesRef.current.find(x => x.obj_id === contextMenu.node.obj_id)
                  if (!n) return
                  if (pinnedNodesRef.current.has(n.obj_id)) {
                    pinnedNodesRef.current.delete(n.obj_id)
                    n.fx = null; n.fy = null
                  } else {
                    pinnedNodesRef.current.add(n.obj_id)
                    n.fx = n.x; n.fy = n.y
                  }
                  simRef.current?.alpha(0.1).restart()
                },
              },
            ].map(item => (
              <button
                key={item.label}
                onClick={() => { item.onClick(); setContextMenu(null) }}
                className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-xs text-gray-200 hover:bg-white/10 transition-colors"
              >
                <span className="text-gray-500 w-4 text-center flex-shrink-0">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
        )}

        {/* 지도 오버레이 — Kakao 지도 패널 */}
        {showMap && (
          <div className="absolute bottom-14 left-3 z-20 rounded-xl overflow-hidden shadow-xl w-80 h-72 border border-white/10">
            <KakaoOntologyMap
              nodes={displayNodes}
              links={displayEdges}
              selectedId={selected?.obj_id ?? null}
              onSelect={node => onSelectProp?.(node)}
              className="w-full h-full"
            />
          </div>
        )}

        {displayNodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">
            온톨로지를 먼저 재구축하세요 (우측 상단 버튼)
          </div>
        )}
      </div>

      {/* 키보드 접근 가능한 노드/범례 목록 */}
      {displayNodes.length > 0 && (
        <details className="bg-white dark:bg-gray-900 border rounded-lg p-3 text-sm group">
          <summary className="cursor-pointer font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
            <span>그래프 범례 및 노드 목록</span>
            <span className="text-xs text-gray-400 dark:text-gray-300">(노드 {displayNodes.length}개)</span>
          </summary>
          <div className="mt-3 space-y-4 max-h-72 overflow-y-auto">
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">노드 타입 범례</p>
              <ul className="flex flex-wrap gap-3" aria-label="노드 타입 범례">
                {Object.entries(NODE_COLORS).map(([type, color]) => (
                  <li key={type} className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-300">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                    {type}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">노드 목록 (처음 50개)</p>
              <ul className="space-y-1" aria-label="온톨로지 노드 목록">
                {displayNodes.slice(0, 50).map(n => (
                  <li key={n.obj_id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(n)
                        onSelectProp?.(n)
                      }}
                      className="w-full text-left flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50 dark:hover:bg-gray-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: NODE_COLORS[n.obj_type] ?? DEFAULT_NODE_COLOR }}
                      />
                      <span className="text-xs text-gray-700 dark:text-gray-300 truncate">{n.label}</span>
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0">{n.obj_type}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {displayNodes.length > 50 && (
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2">
                  외 {displayNodes.length - 50}개 노드가 더 있습니다.
                </p>
              )}
            </div>
          </div>
        </details>
      )}

      {selected && (
        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: NODE_COLORS[selected.obj_type] ?? DEFAULT_NODE_COLOR }}
              />
              <span className="font-medium text-gray-800">{selected.label}</span>
              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                {selected.obj_type}
              </span>
              <span className="text-xs text-gray-400">연결 {degrees.get(selected.obj_id) ?? 0}개</span>
            </div>
            <button
              onClick={() => {
                setSelected(null)
                onSelectProp?.(null)
              }}
              className="text-gray-400 hover:text-gray-600 text-xs"
            >
              닫기
            </button>
          </div>
          {Object.keys(selectedProps).length > 0 ? (
            <table className="text-xs w-full">
              <tbody className="divide-y divide-gray-100">
                {Object.entries(selectedProps).map(([k, v]) => (
                  <tr key={k}>
                    <td className="py-1 pr-4 text-gray-500 font-medium w-32">{k}</td>
                    <td className="py-1 text-gray-800">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-xs text-gray-400">속성 없음 (ID: {selected.obj_id})</p>
          )}
        </div>
      )}
    </div>
  )
}
