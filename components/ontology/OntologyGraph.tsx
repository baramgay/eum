'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import * as d3 from 'd3'
import { RotateCcw, Filter } from 'lucide-react'

interface OntologyNode { obj_id: string; label: string; obj_type: string; props: string }
interface OntologyEdge { src: string; rel: string; dst: string; weight: number }

const NODE_COLORS: Record<string, string> = {
  '시군':      '#4F46E5',
  '청년인구':  '#EC4899',
  '사업체':    '#F59E0B',
  '청년인프라':'#10B981',
}

const EDGE_COLORS: Record<string, string> = {
  '청년규모': '#93C5FD',
  '순유입':   '#6EE7B7',
  '순유출':   '#FCA5A5',
  '산업기반': '#FCD34D',
  '보유시설': '#C4B5FD',
}

const DEFAULT_NODE_COLOR = '#94A3B8'
const DEFAULT_EDGE_COLOR = '#CBD5E1'

interface SimNode extends d3.SimulationNodeDatum {
  obj_id: string; label: string; obj_type: string; props: string
}
interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  rel: string; weight: number
}

function parseProps(raw: string): Record<string, string> {
  if (!raw) return {}
  return Object.fromEntries(
    raw.split(';').filter(Boolean).map(kv => {
      const i = kv.indexOf('=')
      return i === -1 ? [kv, ''] : [kv.slice(0, i).trim(), kv.slice(i + 1).trim()]
    })
  )
}

interface Props {
  nodes: OntologyNode[]
  edges: OntologyEdge[]
  width?: number
  height?: number
  selectedId?: string | null
  onSelect?: (node: OntologyNode | null) => void
  onDoubleClick?: (node: OntologyNode) => void
  relationFilter?: string[]
}

export default function OntologyGraph({
  nodes, edges, width = 900, height = 600,
  selectedId, onSelect, onDoubleClick, relationFilter
}: Props) {
  const svgRef   = useRef<SVGSVGElement>(null)
  const simRef   = useRef<d3.Simulation<SimNode, SimLink> | null>(null)
  const gRef     = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null)
  const zoomRef  = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const [selected, setSelected] = useState<OntologyNode | null>(null)
  const [activeRels, setActiveRels] = useState<Set<string>>(() => new Set(Object.keys(EDGE_COLORS)))

  // sync external selectedId
  useEffect(() => {
    if (selectedId === undefined) return
    const node = nodes.find(n => n.obj_id === selectedId) ?? null
    setSelected(node)
  }, [selectedId, nodes])

  // sync relationFilter prop
  useEffect(() => {
    if (relationFilter) setActiveRels(new Set(relationFilter))
  }, [relationFilter])

  const resetZoom = useCallback(() => {
    if (!svgRef.current || !zoomRef.current) return
    const svg = d3.select(svgRef.current)
    svg.transition().duration(500).call(zoomRef.current.transform as any, d3.zoomIdentity)
  }, [])

  const toggleRel = useCallback((rel: string) => {
    setActiveRels(prev => {
      const next = new Set(prev)
      if (next.has(rel)) next.delete(rel)
      else next.add(rel)
      return next
    })
  }, [])

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return

    simRef.current?.stop()

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const g = svg.append('g')
    gRef.current = g

    zoomRef.current = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .on('zoom', event => g.attr('transform', event.transform))

    svg.call(zoomRef.current)

    const simNodes: SimNode[] = nodes.map(n => ({ ...n }))
    const nodeMap = new Map(simNodes.map(n => [n.obj_id, n]))

    const simLinks: SimLink[] = edges
      .filter(e => activeRels.has(e.rel) && nodeMap.has(e.src) && nodeMap.has(e.dst))
      .map(e => ({ source: e.src, target: e.dst, rel: e.rel, weight: e.weight }))

    // arrowhead marker
    svg.append('defs').selectAll('marker')
      .data(Object.keys(EDGE_COLORS).concat(['default']))
      .enter().append('marker')
        .attr('id', d => `arrow-${d}`)
        .attr('viewBox', '0 -4 8 8')
        .attr('refX', 22).attr('refY', 0)
        .attr('markerWidth', 6).attr('markerHeight', 6)
        .attr('orient', 'auto')
      .append('path')
        .attr('fill', d => EDGE_COLORS[d] ?? DEFAULT_EDGE_COLOR)
        .attr('d', 'M0,-4L8,0L0,4')

    const link = g.append('g').attr('class', 'links')
      .selectAll('line')
      .data(simLinks)
      .enter().append('line')
        .attr('stroke', d => EDGE_COLORS[d.rel] ?? DEFAULT_EDGE_COLOR)
        .attr('stroke-width', d => Math.max(1, Math.sqrt(d.weight ?? 1)))
        .attr('stroke-opacity', 0.7)
        .attr('marker-end', d => `url(#arrow-${EDGE_COLORS[d.rel] ? d.rel : 'default'})`)

    const node = g.append('g').attr('class', 'nodes')
      .selectAll('g')
      .data(simNodes)
      .enter().append('g')
        .attr('cursor', 'pointer')
        .call(
          d3.drag<SVGGElement, SimNode>()
            .on('start', (event, d) => {
              if (!event.active) simRef.current?.alphaTarget(0.3).restart()
              d.fx = d.x; d.fy = d.y
            })
            .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y })
            .on('end', (event, d) => {
              if (!event.active) simRef.current?.alphaTarget(0)
              d.fx = null; d.fy = null
            })
        )
        .on('click', (_event, d) => {
          const n = { ...d }
          setSelected(n)
          onSelect?.(n)
        })
        .on('dblclick', (_event, d) => {
          onDoubleClick?.({ ...d })
        })

    node.append('circle')
      .attr('r', d => d.obj_type === '시군' ? 18 : 14)
      .attr('fill', d => NODE_COLORS[d.obj_type] ?? DEFAULT_NODE_COLOR)
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)

    node.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('font-size', 9)
      .attr('fill', '#fff')
      .attr('pointer-events', 'none')
      .text(d => d.label.slice(0, 4))

    node.append('title').text(d => `${d.label} (${d.obj_type})`)

    const sim = d3.forceSimulation<SimNode>(simNodes)
      .force('link', d3.forceLink<SimNode, SimLink>(simLinks)
        .id(d => d.obj_id).distance(110).strength(0.5))
      .force('charge', d3.forceManyBody<SimNode>().strength(-350))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide<SimNode>(d => d.obj_type === '시군' ? 32 : 28))

    sim.on('tick', () => {
      link
        .attr('x1', d => (d.source as SimNode).x ?? 0)
        .attr('y1', d => (d.source as SimNode).y ?? 0)
        .attr('x2', d => (d.target as SimNode).x ?? 0)
        .attr('y2', d => (d.target as SimNode).y ?? 0)
      node.attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`)
    })

    simRef.current = sim

    return () => { sim.stop() }
  }, [nodes, edges, width, height, activeRels, onSelect, onDoubleClick])

  const selectedProps = selected ? parseProps(selected.props) : {}

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500 flex items-center gap-1"><Filter className="w-3.5 h-3.5" /> 관계 필터</span>
          {Object.keys(EDGE_COLORS).map(rel => (
            <button
              key={rel}
              onClick={() => toggleRel(rel)}
              className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
                activeRels.has(rel)
                  ? 'text-gray-700 border-gray-300'
                  : 'text-gray-400 border-gray-200 line-through'
              }`}
              style={{ backgroundColor: activeRels.has(rel) ? `${EDGE_COLORS[rel]}33` : 'transparent' }}
            >
              {rel}
            </button>
          ))}
        </div>
        <button
          onClick={resetZoom}
          className="flex items-center gap-1 px-2.5 py-1 text-xs text-gray-600 border rounded-md hover:bg-gray-50"
        >
          <RotateCcw className="w-3.5 h-3.5" /> 초기 위치
        </button>
      </div>

      <div className="relative bg-gray-900 rounded-lg overflow-hidden" style={{ height }}>
        {/* legend */}
        <div className="absolute top-3 right-3 bg-black/60 text-white text-xs rounded-lg p-3 space-y-1.5 z-10">
          <div className="font-medium text-gray-300 mb-1">노드 타입</div>
          {Object.entries(NODE_COLORS).map(([k, c]) => (
            <div key={k} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: c }} />
              <span>{k}</span>
            </div>
          ))}
          <div className="border-t border-white/20 my-1.5" />
          <div className="font-medium text-gray-300 mb-1">관계 타입</div>
          {Object.entries(EDGE_COLORS).map(([k, c]) => (
            <div key={k} className="flex items-center gap-1.5">
              <div className="w-6 h-1 rounded" style={{ backgroundColor: c }} />
              <span>{k}</span>
            </div>
          ))}
        </div>

        <svg
          ref={svgRef}
          width="100%" height="100%"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="xMidYMid meet"
          className="w-full h-full"
        />

        {nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">
            온톨로지를 먼저 재구축하세요 (우측 상단 버튼)
          </div>
        )}
      </div>

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
            </div>
            <button onClick={() => { setSelected(null); onSelect?.(null) }} className="text-gray-400 hover:text-gray-600 text-xs">닫기</button>
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
