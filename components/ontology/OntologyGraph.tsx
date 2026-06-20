'use client'

import { useEffect, useMemo, useState } from 'react'
import { select } from 'd3-selection'
import 'd3-transition'
import { zoom, zoomIdentity } from 'd3-zoom'
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
} from '@/lib/ontology/layout-helpers'
import GraphToolbar from './GraphToolbar'
import MiniMap from './MiniMap'
import {
  useGraphState,
  useGraphHighlight,
  baseNodeRadius,
  edgeLookupKey,
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

  const allYears = useMemo(
    () => Array.from(new Set(nodes.map(n => extractYear(n.props)).filter((y): y is number => y != null))).sort((a, b) => a - b),
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
    svgRef,
    simRef,
    gRef,
    zoomRef,
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
    exportPng,
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
    resetZoom,
    zoomBy,
    fitToBounds,
  } = state

  useGraphHighlight({
    gRef,
    selected,
    hovered: state.hovered,
    neighborMap,
    showNodeLabels,
    showRelLabels,
    zoomScale,
    NODE_COLORS,
    EDGE_COLORS,
    encoding,
  })

  // Main render effect
  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return
    let cancelled = false

    async function init() {
      simRef.current?.stop()

      const svg = select(svgRef.current)
      svg.selectAll('*').remove()

      // ── Visual defs ──────────────────────────────────────────────────────
      const mainDefs = svg.append('defs')

      // Dot-grid background pattern
      const dotPattern = mainDefs.append('pattern')
        .attr('id', 'eum-dot-grid').attr('width', 24).attr('height', 24)
        .attr('patternUnits', 'userSpaceOnUse')
      dotPattern.append('circle').attr('cx', 1).attr('cy', 1).attr('r', 1).attr('fill', 'rgba(255,255,255,0.055)')

      // Glow filter for selected/hovered nodes
      const glowFilter = mainDefs.append('filter')
        .attr('id', 'eum-glow').attr('x', '-60%').attr('y', '-60%').attr('width', '220%').attr('height', '220%')
      glowFilter.append('feGaussianBlur').attr('in', 'SourceGraphic').attr('stdDeviation', '5').attr('result', 'blur')
      const glowMerge = glowFilter.append('feMerge')
      glowMerge.append('feMergeNode').attr('in', 'blur')
      glowMerge.append('feMergeNode').attr('in', 'SourceGraphic')
      // ─────────────────────────────────────────────────────────────────────

      // Dot-grid background rect (below the transform group)
      svg.append('rect').attr('width', '100%').attr('height', '100%').attr('fill', 'url(#eum-dot-grid)')

      const g = svg.append('g')
      gRef.current = g

      zoomRef.current = zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.2, 4])
        .on('zoom', event => {
          g.attr('transform', event.transform)
          state.transformRef.current = event.transform
          setZoomScale(event.transform.k)
        })

      svg.call(zoomRef.current as any)

      const simNodes: SimNode[] = nodes.map(n => ({ ...n, degree: degrees.get(n.obj_id) ?? 0 }))
      const nodeMap = new Map(simNodes.map(n => [n.obj_id, n]))

      const simLinks: SimLink[] = edges
        .filter(e => activeRels.has(e.rel) && nodeMap.has(e.src) && nodeMap.has(e.dst))
        .map(e => ({ source: e.src, target: e.dst, rel: e.rel, weight: e.weight }))

      let effectiveLayout = layout

      if ((layout === 'geo' || layout === 'time') && !supportsLayout(layout, nodes)) {
        console.warn(
          `[OntologyGraph] layout '${layout}' requires ${layout === 'geo' ? 'lat/lng props' : 'year props'}, falling back to force`
        )
        effectiveLayout = 'force'
      }

      let workerPositions: Map<string, { obj_id: string; x: number; y: number; vx?: number; vy?: number }> | undefined
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

      // Geo/Time layout backgrounds
      if (effectiveLayout === 'geo') {
        const { lines, labels } = buildGeoGrid(width, height)
        const grid = g.append('g').attr('class', 'geo-grid')
        grid
          .selectAll('line')
          .data(lines)
          .enter()
          .append('line')
          .attr('x1', d => d.x1)
          .attr('y1', d => d.y1)
          .attr('x2', d => d.x2)
          .attr('y2', d => d.y2)
          .attr('stroke', 'rgba(255,255,255,0.06)')
          .attr('stroke-width', 1)
        grid
          .selectAll('text')
          .data(labels)
          .enter()
          .append('text')
          .attr('x', d => d.x)
          .attr('y', d => d.y)
          .attr('fill', 'rgba(255,255,255,0.25)')
          .attr('font-size', 10)
          .attr('text-anchor', 'end')
          .text(d => d.text)
      }

      if (effectiveLayout === 'time') {
        const years = simNodes.map(n => extractYear(n.props)).filter((y): y is number => y != null)
        const { ticks } = buildTimeAxis(width, height, years, simNodes.map(n => n.obj_type))
        const axis = g.append('g').attr('class', 'time-axis')
        axis
          .selectAll('line.time-grid')
          .data(ticks.filter(t => t.type === 'year'))
          .enter()
          .append('line')
          .attr('class', 'time-grid')
          .attr('x1', d => d.x)
          .attr('y1', 60)
          .attr('x2', d => d.x)
          .attr('y2', height - 60)
          .attr('stroke', 'rgba(255,255,255,0.06)')
          .attr('stroke-width', 1)
        axis
          .selectAll('text')
          .data(ticks)
          .enter()
          .append('text')
          .attr('x', d => d.x)
          .attr('y', d => d.y)
          .attr('fill', d => (d.type === 'year' ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.25)'))
          .attr('font-size', d => (d.type === 'year' ? 10 : 9))
          .attr('text-anchor', d => (d.type === 'year' ? 'middle' : 'end'))
          .attr('dy', d => (d.type === 'year' ? 0 : '0.35em'))
          .text(d => d.text)
      }

      // CSS animations for anomaly pulse
      svg.append('defs').append('style').text(`
        @keyframes eum-pulse {
          0% { opacity: 0.9; r: attr(r px); }
          70% { opacity: 0; r: calc(attr(r px) + 12px); }
          100% { opacity: 0; }
        }
        .anomaly-ring {
          animation: eum-pulse 1.8s ease-out infinite;
          pointer-events: none;
        }
      `)

      // anomaly 노드 집합 (analysisResult에서 추출)
      const anomalySet = new Set<string>(
        analysisResult?.type === 'anomaly'
          ? analysisResult.results.map(r => r.obj_id)
          : []
      )

      // community 노드 → communityId 맵
      const communityMap = new Map<string, number>(
        analysisResult?.type === 'community'
          ? analysisResult.communities.flatMap(c => c.nodes.map(n => [n.obj_id, c.communityId] as [string, number]))
          : []
      )

      // arrowhead marker
      svg
        .append('defs')
        .selectAll('marker')
        .data(Object.keys(EDGE_COLORS).concat(['default']))
        .enter()
        .append('marker')
        .attr('id', d => `arrow-${d}`)
        .attr('viewBox', '0 -4 8 8')
        .attr('refX', 14)
        .attr('refY', 0)
        .attr('markerWidth', 5)
        .attr('markerHeight', 5)
        .attr('orient', 'auto')
        .append('path')
        .attr('fill', d => EDGE_COLORS[d] ?? DEFAULT_EDGE_COLOR)
        .attr('d', 'M0,-4L8,0L0,4')

      const link = g
        .append('g')
        .attr('class', 'links')
        .selectAll('path')
        .data(simLinks)
        .enter()
        .append('path')
        .attr('class', 'graph-link')
        .attr('fill', 'none')
        .attr('stroke', d => encoding?.edgeColors.get(edgeLookupKey(d)) ?? EDGE_COLORS[d.rel] ?? DEFAULT_EDGE_COLOR)
        .attr('stroke-width', d => encoding?.edgeWidths.get(edgeLookupKey(d)) ?? Math.max(1, Math.sqrt(d.weight ?? 1) * 1.1))
        .attr('stroke-opacity', linkBaseOpacity(zoomScale))
        .attr('marker-end', d => `url(#arrow-${EDGE_COLORS[d.rel] ? d.rel : 'default'})`)

      const linkLabel = g
        .append('g')
        .attr('class', 'link-labels')
        .selectAll('text')
        .data(simLinks)
        .enter()
        .append('text')
        .attr('class', 'graph-link-label')
        .attr('font-size', 10)
        .attr('font-weight', 500)
        .attr('fill', '#E2E8F0')
        .attr('text-anchor', 'middle')
        .attr('dy', -5)
        .style('pointer-events', 'none')
        .style('text-shadow', '0 1px 2px rgba(0,0,0,0.8)')
        .style('opacity', d => linkLabelOpacity(d as SimLink, zoomScale, showRelLabels, null))
        .text(d => d.rel)

      const node = g
        .append('g')
        .attr('class', 'nodes')
        .selectAll('g')
        .data(simNodes)
        .enter()
        .append('g')
        .attr('class', 'graph-node')
        .attr('cursor', 'pointer')
        .call(
          drag<SVGGElement, SimNode>()
            .on('start', (event, d) => {
              if (!event.active) simRef.current?.alphaTarget(0.3).restart()
              d.fx = d.x
              d.fy = d.y
            })
            .on('drag', (event, d) => {
              d.fx = event.x
              d.fy = event.y
            })
            .on('end', (event, d) => {
              if (!event.active) simRef.current?.alphaTarget(0)
              d.fx = null
              d.fy = null
            })
        )
        .on('mouseenter', (event, d) => {
          setHovered({ ...d })
          if (wrapRef.current) {
            const rect = wrapRef.current.getBoundingClientRect()
            setTooltip({ node: d, x: event.clientX - rect.left + 14, y: event.clientY - rect.top - 14 })
          }
        })
        .on('mousemove', (event, d) => {
          if (wrapRef.current) {
            const rect = wrapRef.current.getBoundingClientRect()
            setTooltip({ node: d, x: event.clientX - rect.left + 14, y: event.clientY - rect.top - 14 })
          }
        })
        .on('mouseleave', () => {
          setHovered(null)
          setTooltip(null)
        })
        .on('click', (_event, d) => {
          const n = { ...d }
          setSelected(n)
          onSelectProp?.(n)
        })
        .on('dblclick', (_event, d) => {
          onDoubleClick?.({ ...d })
        })

      // 이상탐지 펄스 링 (circle 앞에 삽입)
      node
        .filter(d => anomalySet.has(d.obj_id))
        .append('circle')
        .attr('class', 'anomaly-ring')
        .attr('r', d => (encoding?.nodeRadii.get(d.obj_id) ?? baseNodeRadius(d)) + 4)
        .attr('fill', 'none')
        .attr('stroke', '#EF4444')
        .attr('stroke-width', 2.5)

      // 노드 타입 외곽 링 — 타입 색상을 낮은 opacity로 표시
      node
        .append('circle')
        .attr('class', 'node-type-ring')
        .attr('r', d => (encoding?.nodeRadii.get(d.obj_id) ?? baseNodeRadius(d)) + 3.5)
        .attr('fill', 'none')
        .attr('stroke', d => NODE_COLORS[d.obj_type] ?? DEFAULT_NODE_COLOR)
        .attr('stroke-width', 1.5)
        .attr('stroke-opacity', 0.45)

      node
        .append('circle')
        .attr('r', d => encoding?.nodeRadii.get(d.obj_id) ?? baseNodeRadius(d))
        .attr('fill', d => encoding?.nodeColors.get(d.obj_id) ?? NODE_COLORS[d.obj_type] ?? DEFAULT_NODE_COLOR)
        .attr('stroke', d => anomalySet.has(d.obj_id) ? '#EF4444' : (encoding?.nodeStrokes.get(d.obj_id) ?? 'rgba(255,255,255,0.6)'))
        .attr('stroke-width', d => anomalySet.has(d.obj_id) ? 2 : lodStrokeWidth(zoomScale, false))

      // 노드 타입 이모지 아이콘
      node
        .filter(d => !!NODE_TYPE_ICON[d.obj_type])
        .append('text')
        .attr('class', 'node-icon')
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .attr('font-size', d => Math.round((encoding?.nodeRadii.get(d.obj_id) ?? baseNodeRadius(d)) * 0.85))
        .style('pointer-events', 'none')
        .style('user-select', 'none')
        .text(d => NODE_TYPE_ICON[d.obj_type] ?? '')

      const labelGroup = node
        .append('g')
        .attr('class', 'node-label')
        .style('opacity', d => nodeLabelOpacity(d as SimNode, zoomScale, showNodeLabels, null, null))
        .style('pointer-events', 'none')

      labelGroup
        .append('rect')
        .attr('x', d => {
          const len = Math.min(d.label.length, 10)
          return -(len * 5.5 + 4) / 2
        })
        .attr('y', -8)
        .attr('width', d => Math.min(d.label.length, 10) * 5.5 + 4)
        .attr('height', 14)
        .attr('rx', 3)
        .attr('fill', 'rgba(0,0,0,0.45)')
        .attr('stroke', 'rgba(255,255,255,0.1)')
        .attr('stroke-width', 0.5)

      labelGroup
        .append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '0.35em')
        .attr('font-size', 9)
        .attr('font-weight', 600)
        .attr('fill', '#fff')
        .style('text-shadow', '0 1px 2px rgba(0,0,0,0.7)')
        .style('paint-order', 'stroke')
        .text(d => {
          const maxLen = 10
          return d.label.length > maxLen ? `${d.label.slice(0, maxLen)}…` : d.label
        })

      node.append('title').text(d => `${d.label} (${d.obj_type})`)

      const sim = forceSimulation<SimNode>(simNodes)

      const sigunIds = simNodes.filter(n => n.obj_type === '시군').map(n => n.obj_id)
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

      const arcPath = (d: SimLink): string => {
        const sx = (d.source as SimNode).x ?? 0
        const sy = (d.source as SimNode).y ?? 0
        const tx = (d.target as SimNode).x ?? 0
        const ty = (d.target as SimNode).y ?? 0
        const dx = tx - sx, dy = ty - sy
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < 1) return `M${sx},${sy}`
        const dr = dist * 0.45
        return `M${sx},${sy}A${dr},${dr} 0 0,1 ${tx},${ty}`
      }

      sim.on('tick', () => {
        link.attr('d', arcPath)

        linkLabel
          .attr('x', d => (((d.source as SimNode).x ?? 0) + ((d.target as SimNode).x ?? 0)) / 2)
          .attr('y', d => (((d.source as SimNode).y ?? 0) + ((d.target as SimNode).y ?? 0)) / 2)

        node.attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`)

        const now = performance.now()
        if (now - lastMinimapUpdateRef.current > 250) {
          lastMinimapUpdateRef.current = now
          setNodePositions(simNodes.map(n => ({ obj_id: n.obj_id, x: n.x ?? 0, y: n.y ?? 0 })))
        }
      })

      simRef.current = sim
      if (paused) sim.stop()

      const fitOnce = () => {
        const bounds = (g.node() as SVGGElement)?.getBBox()
        if (bounds && bounds.width > 0 && bounds.height > 0) {
          fitToBounds()
        }
      }
      if (!paused) {
        sim.on('end', () => {
          fitOnce()
          sim.on('end', null)
        })
      } else {
        setTimeout(fitOnce, 100)
      }
    }

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
          if (n) {
            n.x = p.x
            n.y = p.y
          }
        })
        return
      }

      if (effectiveLayout === 'circular') {
        const positions = computeCircularPositions(simNodes, edges, width, height)
        positions.forEach((p, id) => {
          const n = nodeMap.get(id)
          if (n) {
            n.x = p.x
            n.y = p.y
          }
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
          if (n) {
            n.x = (d.x ?? 0) + 60
            n.y = (d.y ?? 0) + 60
          }
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
    }

    init()

    return () => {
      cancelled = true
      simRef.current?.stop()
    }
    // paused is intentionally excluded: play/pause is handled by togglePhysics to avoid rebuilding the graph
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
    showNodeLabels,
    showRelLabels,
    zoomScale,
    NODE_COLORS,
    EDGE_COLORS,
    layout,
    runWorkerLayout,
    setZoomScale,
    setNodePositions,
    setWorkerLoading,
    setHovered,
    setSelected,
    simRef,
    svgRef,
    gRef,
    zoomRef,
    lastMinimapUpdateRef,
    encoding,
    fitToBounds,
    // paused is intentionally excluded: play/pause is handled by togglePhysics to avoid rebuilding the graph
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
        {/* analysis overlay legend */}
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

        {/* legend */}
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

        {/* stats */}
        <div className="absolute bottom-3 left-3 bg-black/60 text-white text-[10px] rounded-lg px-2.5 py-1.5 z-10 space-y-0.5">
          <div>노드 {displayNodes.length}개 · 엣지 {displayEdges.length}개</div>
          {layout && <div>레이아웃: {layout}</div>}
          {state.workerLoading && <div>Worker 레이아웃 계산 중...</div>}
          {selected && <div>선택: {selected.label}</div>}
          {state.hovered && state.hovered.obj_id !== selected?.obj_id && <div>포인터: {state.hovered.label}</div>}
        </div>

        <MiniMap
          nodes={state.nodePositions}
          transform={{ x: state.transformRef.current.x, y: state.transformRef.current.y, k: state.transformRef.current.k }}
          width={width}
          height={height}
        />

        <svg
          ref={svgRef}
          data-testid="ontology-graph-svg"
          role="img"
          aria-label={`온톨로지 그래프, 노드 ${displayNodes.length}개, 엣지 ${displayEdges.length}개${selected ? `, 선택된 노드 ${selected.label}` : ''}`}
          width="100%"
          height="100%"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="xMidYMid meet"
          className="w-full h-full cursor-grab active:cursor-grabbing"
          onClick={e => {
            if (e.target === e.currentTarget) {
              setSelected(null)
              onSelectProp?.(null)
            }
          }}
        />

        {/* 노드 호버 툴팁 */}
        {tooltip && (
          <div
            className="absolute z-30 pointer-events-none bg-gray-800/95 backdrop-blur-sm text-white text-xs rounded-xl px-3 py-2.5 shadow-xl border border-white/10 max-w-[240px]"
            style={{ left: tooltip.x, top: tooltip.y }}
          >
            <div className="font-semibold text-white mb-0.5 truncate">{tooltip.node.label}</div>
            <div className="text-gray-400">{tooltip.node.obj_type}</div>
            {(tooltip.node.degree ?? 0) > 0 && (
              <div className="text-gray-500 mt-0.5">연결 {tooltip.node.degree}개</div>
            )}
          </div>
        )}

        {/* 지도 오버레이 (Kakao Map 통합은 TODO) */}
        {showMap && (
          <div className="absolute bottom-14 left-3 z-20 bg-gray-900/90 backdrop-blur-sm border border-white/10 rounded-xl p-3 w-64 max-h-72 overflow-auto shadow-lg">
            <div className="text-xs font-semibold text-gray-200 mb-2 flex items-center justify-between">
              <span>Geo 노드</span>
              <span className="text-[10px] text-gray-400">Kakao Map 통합 TODO</span>
            </div>
            {nodes.filter(n => extractGeoCoord(n.props)).length === 0 ? (
              <p className="text-[11px] text-gray-400">geo 좌표를 가진 노드가 없습니다</p>
            ) : (
              <ul className="space-y-1">
                {nodes
                  .filter(n => extractGeoCoord(n.props))
                  .map(n => {
                    const coord = extractGeoCoord(n.props)
                    return (
                      <li key={n.obj_id} className="text-[11px] text-gray-300 flex justify-between">
                        <span className="truncate pr-2">{n.label}</span>
                        <span className="text-gray-500 flex-shrink-0">
                          {coord?.lat.toFixed(3)}, {coord?.lng.toFixed(3)}
                        </span>
                      </li>
                    )
                  })}
              </ul>
            )}
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
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2">외 {displayNodes.length - 50}개 노드가 더 있습니다.</p>
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
              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{selected.obj_type}</span>
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
