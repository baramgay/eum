'use client'

import type { SimulationNodePosition } from '@/lib/ontology/types'

export interface MiniMapProps {
  nodes: SimulationNodePosition[]
  transform: { x: number; y: number; k: number }
  width?: number
  height?: number
  mapWidth?: number
  mapHeight?: number
  className?: string
}

export default function MiniMap({
  nodes,
  transform,
  width = 900,
  height = 600,
  mapWidth = 160,
  mapHeight = 100,
  className = '',
}: MiniMapProps) {
  if (nodes.length === 0 || width === 0 || height === 0) return null

  // 데이터 좌표 공간의 경계
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const n of nodes) {
    if (n.x == null || n.y == null) continue
    if (n.x < minX) minX = n.x
    if (n.y < minY) minY = n.y
    if (n.x > maxX) maxX = n.x
    if (n.y > maxY) maxY = n.y
  }
  if (!isFinite(minX)) {
    minX = 0
    minY = 0
    maxX = width
    maxY = height
  }

  const padding = 10
  const dataW = Math.max(1, maxX - minX)
  const dataH = Math.max(1, maxY - minY)
  const scale = Math.min(
    (mapWidth - padding * 2) / dataW,
    (mapHeight - padding * 2) / dataH
  )
  const offsetX = (mapWidth - dataW * scale) / 2 - minX * scale
  const offsetY = (mapHeight - dataH * scale) / 2 - minY * scale

  const viewportX = -transform.x * scale / transform.k + offsetX
  const viewportY = -transform.y * scale / transform.k + offsetY
  const viewportW = width * scale / transform.k
  const viewportH = height * scale / transform.k

  return (
    <div
      className={`absolute bottom-3 right-3 bg-gray-900/80 backdrop-blur-sm rounded-lg border border-white/10 shadow-lg overflow-hidden ${className}`}
      style={{ width: mapWidth, height: mapHeight }}
    >
      <svg width={mapWidth} height={mapHeight}>
        {nodes.map(n =>
          n.x == null || n.y == null ? null : (
            <circle
              key={n.obj_id}
              cx={n.x * scale + offsetX}
              cy={n.y * scale + offsetY}
              r={1.2}
              fill="#94A3B8"
              opacity={0.8}
            />
          )
        )}
        <rect
          x={viewportX}
          y={viewportY}
          width={viewportW}
          height={viewportH}
          fill="rgba(99,102,241,0.15)"
          stroke="#818CF8"
          strokeWidth={1}
          rx={2}
        />
      </svg>
    </div>
  )
}
