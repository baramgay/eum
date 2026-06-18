'use client'

import { useEffect } from 'react'
import type { MutableRefObject } from 'react'
import type { Selection } from 'd3-selection'
import type { SimNode, SimLink } from './useGraphState'
import { baseNodeRadius, edgeLookupKey } from './useGraphState'
import {
  nodeLabelOpacity,
  linkLabelOpacity,
  lodStrokeWidth,
  linkBaseOpacity,
} from '@/lib/ontology/layout-helpers'
import type { VisualEncoding } from '@/lib/ontology/types'

const DIM_OPACITY = 0.15

interface UseGraphHighlightArgs {
  gRef: MutableRefObject<Selection<SVGGElement, unknown, null, undefined> | null>
  selected: { obj_id: string } | null
  hovered: { obj_id: string } | null
  neighborMap: Map<string, Set<string>>
  showNodeLabels: boolean
  showRelLabels: boolean
  zoomScale: number
  NODE_COLORS: Record<string, string>
  EDGE_COLORS: Record<string, string>
  encoding: VisualEncoding | null
}

export function useGraphHighlight({
  gRef,
  selected,
  hovered,
  neighborMap,
  showNodeLabels,
  showRelLabels,
  zoomScale,
  NODE_COLORS,
  EDGE_COLORS,
  encoding,
}: UseGraphHighlightArgs) {
  useEffect(() => {
    if (!gRef.current) return
    const focusId = hovered?.obj_id ?? selected?.obj_id ?? null
    const focusNeighbors = focusId ? neighborMap.get(focusId) : null

    gRef.current
      .selectAll<SVGGElement, SimNode>('.graph-node')
      .transition()
      .duration(150)
      .style('opacity', d => {
        if (!focusId) return '1'
        if (d.obj_id === focusId) return '1'
        return focusNeighbors?.has(d.obj_id) ? '1' : String(DIM_OPACITY)
      })
      .selectAll<SVGCircleElement, SimNode>('circle')
      .attr('r', d => encoding?.nodeRadii.get(d.obj_id) ?? baseNodeRadius(d))
      .attr('fill', d => encoding?.nodeColors.get(d.obj_id) ?? NODE_COLORS[d.obj_type] ?? '#94A3B8')
      .attr('stroke-width', d => lodStrokeWidth(zoomScale, d.obj_id === focusId))
      .attr('stroke', d =>
        encoding?.nodeStrokes.get(d.obj_id) ?? (zoomScale < 0.3 && d.obj_id !== focusId ? 'none' : '#fff')
      )

    gRef.current
      .selectAll<SVGGElement, SimNode>('.node-label')
      .transition()
      .duration(150)
      .style('opacity', d => nodeLabelOpacity(d as SimNode, zoomScale, showNodeLabels, focusId, focusNeighbors))

    gRef.current
      .selectAll<SVGLineElement, SimLink>('.graph-link')
      .transition()
      .duration(150)
      .style('opacity', d => {
        if (!focusId) return String(linkBaseOpacity(zoomScale))
        const s = (d.source as SimNode).obj_id
        const t = (d.target as SimNode).obj_id
        return s === focusId || t === focusId ? '1' : String(Math.max(DIM_OPACITY, linkBaseOpacity(zoomScale) * 0.4))
      })
      .attr('stroke', d => encoding?.edgeColors.get(edgeLookupKey(d)) ?? EDGE_COLORS[d.rel])
      .attr('stroke-width', d => {
        const s = (d.source as SimNode).obj_id
        const t = (d.target as SimNode).obj_id
        const base = encoding?.edgeWidths.get(edgeLookupKey(d)) ?? Math.max(0.8, Math.sqrt(d.weight ?? 1) * 0.9)
        return focusId && (s === focusId || t === focusId) ? base + 1.5 : base
      })

    gRef.current
      .selectAll<SVGTextElement, SimLink>('.graph-link-label')
      .transition()
      .duration(150)
      .style('opacity', d => linkLabelOpacity(d as SimLink, zoomScale, showRelLabels, focusId))
  }, [
    hovered,
    selected,
    neighborMap,
    showNodeLabels,
    showRelLabels,
    zoomScale,
    NODE_COLORS,
    EDGE_COLORS,
    encoding,
    gRef,
  ])
}
