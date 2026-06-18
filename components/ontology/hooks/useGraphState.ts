'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { select } from 'd3-selection'
import type { Selection } from 'd3-selection'
import { zoom, zoomIdentity, ZoomBehavior, ZoomTransform } from 'd3-zoom'
import type { Simulation, SimulationNodeDatum, SimulationLinkDatum } from 'd3-force'
import html2canvas from 'html2canvas'
import type { OntologyNode, OntologyEdge } from '@/lib/ontology-utils'
import { computeDegrees, buildTypeColorMap } from '@/lib/ontology-utils'
import type { GraphLayoutType, SimulationNodePosition, AnalyticsResult } from '@/lib/ontology/types'
import { encodeAnalyticsOverlay } from '@/lib/ontology/visual-encoders'
import { normalizePositions } from '@/lib/ontology/layout-helpers'

export interface SimNode extends SimulationNodeDatum {
  obj_id: string
  label: string
  obj_type: string
  props: string
  degree?: number
}

export interface SimLink extends SimulationLinkDatum<SimNode> {
  rel: string
  weight: number
}

export function baseNodeRadius(d: SimNode): number {
  const base = d.obj_type === '시군' ? 16 : 7
  const deg = d.degree ?? 0
  return base + Math.min(deg * 0.5, 6)
}

export function edgeLookupKey(d: SimLink): string {
  const s = typeof d.source === 'string' ? d.source : (d.source as SimNode).obj_id
  const t = typeof d.target === 'string' ? d.target : (d.target as SimNode).obj_id
  return `${s}|${d.rel}|${t}`
}

export interface UseGraphStateOptions {
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

export function useGraphState(options: UseGraphStateOptions) {
  const {
    nodes,
    edges,
    width = 900,
    height = 600,
    selectedId,
    onSelect,
    onDoubleClick,
    relationFilter,
    layout: layoutProp = 'force',
    onLayoutChange,
    analysisResult = null,
  } = options

  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null)
  const gRef = useRef<Selection<SVGGElement, unknown, null, undefined> | null>(null)
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const transformRef = useRef<ZoomTransform>(zoomIdentity)
  const lastMinimapUpdateRef = useRef(0)

  const [selected, setSelected] = useState<OntologyNode | null>(null)
  const [hovered, setHovered] = useState<OntologyNode | null>(null)
  const [activeRels, setActiveRels] = useState<Set<string>>(
    () => new Set(Array.from(new Set(edges.map(e => e.rel))))
  )
  const [paused, setPaused] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [showNodeLabels, setShowNodeLabels] = useState(false)
  const [showRelLabels, setShowRelLabels] = useState(false)
  const [zoomScale, setZoomScale] = useState(1)
  const [layout, setLayout] = useState<GraphLayoutType>(layoutProp)
  const [workerLoading, setWorkerLoading] = useState(false)
  const [nodePositions, setNodePositions] = useState<SimulationNodePosition[]>([])

  useEffect(() => {
    if (selectedId === undefined) return
    const node = nodes.find(n => n.obj_id === selectedId) ?? null
    setSelected(node)
  }, [selectedId, nodes])

  useEffect(() => {
    if (relationFilter) setActiveRels(new Set(relationFilter))
  }, [relationFilter])

  useEffect(() => {
    setLayout(layoutProp)
  }, [layoutProp])

  const degrees = useMemo(() => computeDegrees(nodes, edges), [nodes, edges])
  const nodeTypes = useMemo(
    () => Array.from(new Set(nodes.map(n => n.obj_type))).sort((a, b) => a.localeCompare(b, 'ko')),
    [nodes]
  )
  const relTypes = useMemo(
    () => Array.from(new Set(edges.map(e => e.rel))).sort((a, b) => a.localeCompare(b, 'ko')),
    [edges]
  )
  const NODE_COLORS = useMemo(() => buildTypeColorMap(nodeTypes), [nodeTypes])
  const EDGE_COLORS = useMemo(() => buildTypeColorMap(relTypes), [relTypes])
  const encoding = useMemo(
    () => (analysisResult ? encodeAnalyticsOverlay(nodes, edges, analysisResult) : null),
    [analysisResult, nodes, edges]
  )

  const neighborMap = useMemo(() => {
    const map = new Map<string, Set<string>>()
    nodes.forEach(n => map.set(n.obj_id, new Set()))
    edges.forEach(e => {
      if (activeRels.has(e.rel)) {
        map.get(e.src)?.add(e.dst)
        map.get(e.dst)?.add(e.src)
      }
    })
    return map
  }, [nodes, edges, activeRels])

  const resetZoom = useCallback(() => {
    if (!svgRef.current || !zoomRef.current) return
    const svg = select(svgRef.current)
    svg.transition().duration(500).call(zoomRef.current.transform as any, zoomIdentity)
  }, [])

  const zoomBy = useCallback(
    (factor: number) => {
      if (!svgRef.current || !zoomRef.current) return
      const svg = select(svgRef.current)
      svg.transition().duration(250).call(zoomRef.current.scaleBy as any, factor)
    },
    []
  )

  const fitToBounds = useCallback(() => {
    if (!svgRef.current || !gRef.current || nodes.length === 0 || !zoomRef.current) return
    const svg = select(svgRef.current)
    const g = gRef.current
    const bounds = (g.node() as SVGGElement).getBBox()
    if (bounds.width === 0 || bounds.height === 0) return
    const scale = Math.min((width - 40) / bounds.width, (height - 40) / bounds.height, 2)
    const transform = zoomIdentity
      .translate(width / 2, height / 2)
      .scale(scale)
      .translate(-(bounds.x + bounds.width / 2), -(bounds.y + bounds.height / 2))
    svg.transition().duration(600).call(zoomRef.current.transform as any, transform)
  }, [width, height, nodes.length])

  const focusNode = useCallback(
    (nodeId: string) => {
      if (!svgRef.current || !gRef.current || !zoomRef.current || nodes.length === 0) return
      const simNodes = gRef.current.selectAll<SVGGElement, SimNode>('.graph-node').data() as SimNode[]
      const target = simNodes.find(n => n?.obj_id === nodeId)
      if (!target || target.x == null || target.y == null) return
      const svg = select(svgRef.current)
      const scale = 1.4
      const transform = zoomIdentity
        .translate(width / 2, height / 2)
        .scale(scale)
        .translate(-target.x, -target.y)
      svg.transition().duration(600).call(zoomRef.current.transform as any, transform)
    },
    [width, height, nodes.length]
  )

  useEffect(() => {
    if (selected) focusNode(selected.obj_id)
  }, [selected, focusNode])

  const resetLayout = useCallback(() => {
    simRef.current?.alpha(1).restart()
    resetZoom()
  }, [resetZoom])

  const toggleRel = useCallback((rel: string) => {
    setActiveRels(prev => {
      const next = new Set(prev)
      if (next.has(rel)) next.delete(rel)
      else next.add(rel)
      return next
    })
  }, [])

  const togglePhysics = useCallback(() => {
    if (!simRef.current) return
    if (paused) simRef.current.alpha(0.3).restart()
    else simRef.current.stop()
    setPaused(p => !p)
  }, [paused])

  const toggleFullscreen = useCallback(async () => {
    const el = wrapRef.current
    if (!el) return
    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen()
        setFullscreen(true)
      } else {
        await document.exitFullscreen()
        setFullscreen(false)
      }
    } catch {}
  }, [])

  const exportPng = useCallback(async () => {
    const el = wrapRef.current
    if (!el) return
    setExporting(true)
    try {
      const canvas = await html2canvas(el, { backgroundColor: '#111827', scale: 2 })
      const link = document.createElement('a')
      link.download = `eum-ontology-${new Date().toISOString().slice(0, 10)}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    } finally {
      setExporting(false)
    }
  }, [])

  const handleLayoutChange = useCallback(
    (next: GraphLayoutType) => {
      setLayout(next)
      onLayoutChange?.(next)
    },
    [onLayoutChange]
  )

  const handleToolbarSelect = useCallback(
    (node: OntologyNode) => {
      setSelected(node)
      onSelect?.(node)
    },
    [onSelect]
  )

  const runWorkerLayout = useCallback(
    (
      simNodes: SimNode[],
      simLinks: SimLink[],
      effectiveLayout: GraphLayoutType
    ): Promise<Map<string, SimulationNodePosition>> => {
      return new Promise((resolve, reject) => {
        const worker = new Worker('/workers/ontology-layout.worker.js')
        const timer = setTimeout(() => {
          worker.terminate()
          reject(new Error('layout worker timeout'))
        }, 30000)
        worker.onmessage = (event: MessageEvent) => {
          clearTimeout(timer)
          worker.terminate()
          const { positions, error } = event.data as { positions: SimulationNodePosition[]; error?: string }
          if (error) reject(new Error(error))
          else resolve(normalizePositions(simNodes, positions))
        }
        worker.onerror = err => {
          clearTimeout(timer)
          worker.terminate()
          reject(err)
        }
        worker.postMessage({
          nodes: simNodes.map(n => ({ obj_id: n.obj_id, degree: n.degree ?? 0 })),
          edges: simLinks.map(e => ({
            source: typeof e.source === 'string' ? e.source : (e.source as SimNode).obj_id,
            target: typeof e.target === 'string' ? e.target : (e.target as SimNode).obj_id,
            weight: e.weight,
          })),
          layout: effectiveLayout,
          width,
          height,
        })
      })
    },
    [width, height]
  )

  return {
    wrapRef,
    svgRef,
    simRef,
    gRef,
    zoomRef,
    transformRef,
    lastMinimapUpdateRef,
    selected,
    setSelected,
    hovered,
    setHovered,
    activeRels,
    paused,
    fullscreen,
    exporting,
    showNodeLabels,
    setShowNodeLabels,
    showRelLabels,
    setShowRelLabels,
    zoomScale,
    setZoomScale,
    layout,
    workerLoading,
    setWorkerLoading,
    nodePositions,
    setNodePositions,
    degrees,
    nodeTypes,
    relTypes,
    NODE_COLORS,
    EDGE_COLORS,
    encoding,
    neighborMap,
    resetZoom,
    zoomBy,
    fitToBounds,
    focusNode,
    resetLayout,
    toggleRel,
    togglePhysics,
    toggleFullscreen,
    exportPng,
    handleLayoutChange,
    handleToolbarSelect,
    runWorkerLayout,
    onSelect,
    onDoubleClick,
    width,
    height,
  }
}
