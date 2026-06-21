'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { select } from 'd3-selection'
import 'd3-transition'
import Card from '@/components/ui/Card'
import Skeleton from '@/components/ui/Skeleton'
import type { LineageGraph, LineageNode, LineageEdge } from '@/app/api/lineage/graph/route'

const NODE_TYPE_COLOR: Record<LineageNode['type'], string> = {
  source:   '#2563EB',
  pipeline: '#EA580C',
  catalog:  '#16A34A',
}

const NODE_TYPE_LABEL: Record<LineageNode['type'], string> = {
  source:   '수집소스',
  pipeline: '파이프라인',
  catalog:  '데이터포털',
}

const TYPE_ORDER: LineageNode['type'][] = ['source', 'pipeline', 'catalog']

const COL_X: Record<LineageNode['type'], number> = {
  source:   80,
  pipeline: 320,
  catalog:  560,
}

const NODE_W  = 160
const NODE_H  = 40
const ROW_GAP = 60
const PAD_TOP = 32

function routeForNode(node: LineageNode): string {
  if (node.type === 'source')   return '/collect'
  if (node.type === 'pipeline') return '/process'
  const rawId = node.id.replace(/^cat-/, '')
  return `/portal?id=${rawId}`
}

interface LayoutNode extends LineageNode {
  x: number
  y: number
}

function buildLayout(nodes: LineageNode[]): LayoutNode[] {
  const counters: Record<string, number> = {}
  return nodes.map(n => {
    const col = n.type
    const idx = counters[col] ?? 0
    counters[col] = idx + 1
    return { ...n, x: COL_X[col], y: PAD_TOP + idx * ROW_GAP }
  })
}

function svgHeight(layoutNodes: LayoutNode[]): number {
  const maxY = layoutNodes.reduce((m, n) => Math.max(m, n.y), 0)
  return maxY + NODE_H + PAD_TOP
}

function edgePath(
  from: LayoutNode,
  to: LayoutNode,
): string {
  const x1 = from.x + NODE_W
  const y1 = from.y + NODE_H / 2
  const x2 = to.x
  const y2 = to.y + NODE_H / 2
  const mx = (x1 + x2) / 2
  return `M ${x1} ${y1} C ${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`
}

export default function LineageWidget() {
  const svgRef  = useRef<SVGSVGElement>(null)
  const router  = useRouter()
  const [graph,   setGraph]   = useState<LineageGraph | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/lineage/graph')
      .then(r => r.ok ? r.json() : r.json().then((e: { error?: string }) => Promise.reject(e)))
      .then((g: LineageGraph) => { setGraph(g); setLoading(false) })
      .catch((e: { error?: string }) => { setError(e?.error ?? '오류'); setLoading(false) })
  }, [])

  useEffect(() => {
    if (!graph || !svgRef.current) return

    const layoutNodes = buildLayout(graph.nodes)
    const nodeMap = new Map(layoutNodes.map(n => [n.id, n]))
    const validEdges: LineageEdge[] = graph.edges.filter(
      e => nodeMap.has(e.from) && nodeMap.has(e.to)
    )
    const h = svgHeight(layoutNodes)

    const svg = select(svgRef.current)
    svg.selectAll('*').remove()
    svg.attr('height', h)

    svg.append('defs').append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 0 10 10')
      .attr('refX', 10)
      .attr('refY', 5)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto-start-reverse')
      .append('path')
      .attr('d', 'M 0 0 L 10 5 L 0 10 z')
      .attr('fill', '#94A3B8')

    for (const e of validEdges) {
      const from = nodeMap.get(e.from)!
      const to   = nodeMap.get(e.to)!
      svg.append('path')
        .attr('d', edgePath(from, to))
        .attr('fill', 'none')
        .attr('stroke', '#CBD5E1')
        .attr('stroke-width', 1.5)
        .attr('marker-end', 'url(#arrow)')
    }

    const colLabels: Record<string, boolean> = {}
    for (const n of layoutNodes) {
      if (!colLabels[n.type]) {
        colLabels[n.type] = true
        svg.append('text')
          .attr('x', COL_X[n.type] + NODE_W / 2)
          .attr('y', PAD_TOP - 10)
          .attr('text-anchor', 'middle')
          .attr('font-size', 11)
          .attr('fill', '#94A3B8')
          .attr('font-family', 'Pretendard, sans-serif')
          .text(NODE_TYPE_LABEL[n.type])
      }

      const g = svg.append('g')
        .attr('transform', `translate(${n.x},${n.y})`)
        .style('cursor', 'pointer')
        .on('click', () => router.push(routeForNode(n)))

      g.append('rect')
        .attr('width', NODE_W)
        .attr('height', NODE_H)
        .attr('rx', 6)
        .attr('fill', `${NODE_TYPE_COLOR[n.type]}18`)
        .attr('stroke', NODE_TYPE_COLOR[n.type])
        .attr('stroke-width', 1.5)

      g.append('circle')
        .attr('cx', 14)
        .attr('cy', NODE_H / 2)
        .attr('r', 4)
        .attr('fill', NODE_TYPE_COLOR[n.type])

      g.append('text')
        .attr('x', 26)
        .attr('y', NODE_H / 2 + 1)
        .attr('dominant-baseline', 'middle')
        .attr('font-size', 12)
        .attr('fill', '#1E293B')
        .attr('font-family', 'Pretendard, sans-serif')
        .attr('class', 'dark:text-slate-100')
        .text(n.label.length > 16 ? `${n.label.slice(0, 15)}…` : n.label)
    }
  }, [graph, router])

  const isEmpty = !loading && !error && graph && graph.nodes.length === 0

  return (
    <Card padding="md">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
          데이터 계보
        </h3>
        <div className="flex items-center gap-3">
          <Link href="/ontology" className="text-xs text-blue-500 hover:text-blue-700 hover:underline transition-colors">바로가기 →</Link>
          {TYPE_ORDER.map(t => (
            <span key={t} className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: NODE_TYPE_COLOR[t] }}
              />
              {NODE_TYPE_LABEL[t]}
            </span>
          ))}
        </div>
      </div>

      {loading && <Skeleton className="h-48 w-full" />}

      {error && (
        <p className="text-sm text-red-500 py-8 text-center">{error}</p>
      )}

      {isEmpty && (
        <p className="text-sm text-gray-400 py-8 text-center">계보 데이터가 없습니다</p>
      )}

      {!loading && !error && !isEmpty && (
        <div className="overflow-x-auto">
          <svg
            ref={svgRef}
            width={COL_X['catalog'] + NODE_W + 40}
            className="block"
          />
        </div>
      )}
    </Card>
  )
}
