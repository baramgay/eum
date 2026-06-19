'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { select } from 'd3-selection'
import 'd3-transition'
import { zoom as d3zoom } from 'd3-zoom'
import { drag as d3drag } from 'd3-drag'
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
} from 'd3-force'
import type { WordNetworkNode, WordNetworkEdge } from '@/app/api/ontology/text-analysis/route'

interface SimNode extends WordNetworkNode {
  x?: number; y?: number; vx?: number; vy?: number; fx?: number | null; fy?: number | null
}

interface SimEdge extends WordNetworkEdge {
  source: SimNode | string
  target: SimNode | string
}

interface Props {
  nodes: WordNetworkNode[]
  edges: WordNetworkEdge[]
  height?: number
}

const TYPE_COLOR: Record<string, string> = {
  label:    '#6366f1',
  relation: '#10b981',
  type:     '#8b5cf6',
}
const TYPE_LABEL: Record<string, string> = {
  label:    '레이블',
  relation: '관계',
  type:     '유형',
}

function nodeRadius(freq: number, maxFreq: number): number {
  return 5 + (freq / maxFreq) * 20
}

export default function WordNetworkGraph({ nodes, edges, height = 440 }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState<SimNode | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const simRef = useRef<any | null>(null)

  const render = useCallback(() => {
    const svgEl = svgRef.current
    const container = containerRef.current
    if (!svgEl || !container || !nodes.length) return

    const width = container.clientWidth || 640
    const maxFreq = Math.max(...nodes.map(n => n.freq), 1)

    const nodeData: SimNode[] = nodes.map(n => ({ ...n }))
    const nodeById = new Map<string, SimNode>(nodeData.map(n => [n.id, n]))

    const edgeData: SimEdge[] = edges
      .filter(e => nodeById.has(e.src) && nodeById.has(e.dst))
      .map(e => ({ ...e, source: e.src, target: e.dst }))

    select(svgEl).selectAll('*').remove()

    const svg = select(svgEl)
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`)

    const g = svg.append('g')

    // zoom
    const zoomBeh = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.25, 4])
      .on('zoom', ev => g.attr('transform', ev.transform.toString()))
    svg.call(zoomBeh)

    // defs: arrowhead marker
    const defs = svg.append('defs')
    defs.append('marker')
      .attr('id', 'wn-arrow')
      .attr('markerWidth', 6).attr('markerHeight', 6)
      .attr('refX', 5).attr('refY', 3)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,0 L0,6 L6,3 z')
      .attr('fill', '#cbd5e1')

    // edges
    const linkSel = g.append('g')
      .selectAll<SVGLineElement, SimEdge>('line')
      .data(edgeData)
      .join('line')
      .attr('stroke', '#cbd5e1')
      .attr('stroke-width', d => Math.min(3, 0.8 + d.weight * 0.3))
      .attr('stroke-opacity', 0.55)

    // node groups
    const nodeG = g.append('g')
      .selectAll<SVGGElement, SimNode>('g')
      .data(nodeData)
      .join('g')
      .attr('cursor', 'grab')
      .call(
        d3drag<SVGGElement, SimNode>()
          .on('start', (ev, d) => {
            if (!ev.active) simRef.current?.alphaTarget(0.3).restart()
            d.fx = d.x; d.fy = d.y
          })
          .on('drag', (ev, d) => { d.fx = ev.x; d.fy = ev.y })
          .on('end', (ev, d) => {
            if (!ev.active) simRef.current?.alphaTarget(0)
            d.fx = null; d.fy = null
          })
      )

    nodeG.append('circle')
      .attr('r', d => nodeRadius(d.freq, maxFreq))
      .attr('fill', d => TYPE_COLOR[d.type] ?? TYPE_COLOR.label)
      .attr('fill-opacity', 0.82)
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)

    nodeG.append('text')
      .text(d => d.text)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('font-size', d => Math.max(8, nodeRadius(d.freq, maxFreq) * 0.75))
      .attr('font-weight', d => d.freq > maxFreq * 0.5 ? '600' : '400')
      .attr('fill', '#1e293b')
      .attr('pointer-events', 'none')
      .clone(true) // shadow for readability
      .lower()
      .attr('stroke', '#fff')
      .attr('stroke-width', 2.5)
      .attr('stroke-linejoin', 'round')

    nodeG
      .on('mouseenter', (_, d) => setHovered(d))
      .on('mouseleave', () => setHovered(null))

    // force simulation
    const sim = forceSimulation<SimNode>(nodeData)
      .force(
        'link',
        forceLink<SimNode, SimEdge>(edgeData)
          .id(d => d.id)
          .strength(d => 0.08 + Math.min(d.weight, 5) * 0.04)
          .distance(60)
      )
      .force('charge', forceManyBody<SimNode>().strength(d => -40 - nodeRadius(d.freq, maxFreq) * 4))
      .force('center', forceCenter(width / 2, height / 2))
      .force('collide', forceCollide<SimNode>().radius(d => nodeRadius(d.freq, maxFreq) + 6))

    simRef.current = sim

    sim.on('tick', () => {
      linkSel
        .attr('x1', d => (d.source as SimNode).x ?? 0)
        .attr('y1', d => (d.source as SimNode).y ?? 0)
        .attr('x2', d => (d.target as SimNode).x ?? 0)
        .attr('y2', d => (d.target as SimNode).y ?? 0)
      nodeG.attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`)
    })

    return () => sim.stop()
  }, [nodes, edges, height])

  useEffect(() => {
    const cleanup = render()
    return () => { cleanup?.(); simRef.current?.stop() }
  }, [render])

  // re-render on container resize
  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(() => render())
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [render])

  const connectedWords = hovered
    ? edges
        .filter(e => e.src === hovered.id || e.dst === hovered.id)
        .map(e => (e.src === hovered.id ? e.dst : e.src))
    : []

  return (
    <div ref={containerRef} className="relative w-full">
      <svg
        ref={svgRef}
        className="w-full rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800"
        style={{ height }}
      />

      {/* legend */}
      <div className="absolute top-2 left-2 flex gap-2 flex-wrap pointer-events-none">
        {Object.entries(TYPE_COLOR).map(([t, c]) => (
          <span key={t} className="flex items-center gap-1 text-[10px] text-gray-500 bg-white/80 dark:bg-gray-900/80 px-1.5 py-0.5 rounded border border-gray-100 dark:border-gray-700">
            <span className="w-2 h-2 rounded-full inline-block flex-shrink-0" style={{ background: c }} />
            {TYPE_LABEL[t]}
          </span>
        ))}
      </div>

      {/* tooltip */}
      {hovered && (
        <div className="absolute bottom-2 left-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-xs shadow-md pointer-events-none max-w-[260px]">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: TYPE_COLOR[hovered.type] }} />
            <span className="font-semibold text-gray-900 dark:text-gray-100">{hovered.text}</span>
            <span className="text-gray-400 ml-auto">빈도 {hovered.freq}</span>
          </div>
          {connectedWords.length > 0 && (
            <div className="text-gray-500 leading-relaxed">
              연결: {connectedWords.slice(0, 6).join(' · ')}
              {connectedWords.length > 6 && <span className="text-gray-400"> +{connectedWords.length - 6}</span>}
            </div>
          )}
        </div>
      )}

      <p className="mt-1.5 text-[10px] text-gray-400 text-right">드래그로 노드 이동 · 스크롤로 확대/축소</p>
    </div>
  )
}
