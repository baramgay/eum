'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react'

interface LineageNode {
  id: string
  label: string
  type: 'source' | 'pipeline' | 'catalog'
}

interface LineageEdge {
  from: string
  to: string
}

interface LineageGraph {
  nodes: LineageNode[]
  edges: LineageEdge[]
}

const TYPE_COLOR: Record<string, string> = {
  source: '#3b82f6',
  pipeline: '#f59e0b',
  catalog: '#10b981',
}

const TYPE_LABEL: Record<string, string> = {
  source: '수집원',
  pipeline: '파이프라인',
  catalog: '카탈로그',
}

function drawGraph(
  canvas: HTMLCanvasElement,
  graph: LineageGraph,
  hoverId: string | null,
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const W = canvas.width
  const H = canvas.height
  ctx.clearRect(0, 0, W, H)

  if (graph.nodes.length === 0) return

  // Layout: group by type in columns (source → pipeline → catalog)
  const typeOrder = ['source', 'pipeline', 'catalog']
  const byType: Record<string, LineageNode[]> = {}
  for (const n of graph.nodes) {
    ;(byType[n.type] ?? (byType[n.type] = [])).push(n)
  }

  const positions = new Map<string, { x: number; y: number }>()
  const colCount = typeOrder.filter((t) => (byType[t]?.length ?? 0) > 0).length
  const colWidth = W / (colCount + 1)
  let colIdx = 0

  for (const type of typeOrder) {
    const nodes = byType[type] ?? []
    if (nodes.length === 0) continue
    colIdx++
    const colX = colIdx * colWidth
    nodes.forEach((n, i) => {
      const rowH = H / (nodes.length + 1)
      positions.set(n.id, { x: colX, y: (i + 1) * rowH })
    })
  }

  // Draw edges
  ctx.save()
  ctx.strokeStyle = '#94a3b8'
  ctx.lineWidth = 1.5
  for (const e of graph.edges) {
    const from = positions.get(e.from)
    const to = positions.get(e.to)
    if (!from || !to) continue
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    // Bezier curve
    const cpX = (from.x + to.x) / 2
    ctx.bezierCurveTo(cpX, from.y, cpX, to.y, to.x, to.y)
    ctx.stroke()
    // Arrow
    const angle = Math.atan2(to.y - from.y, to.x - from.x)
    ctx.fillStyle = '#94a3b8'
    ctx.beginPath()
    ctx.moveTo(to.x, to.y)
    ctx.lineTo(to.x - 10 * Math.cos(angle - 0.4), to.y - 10 * Math.sin(angle - 0.4))
    ctx.lineTo(to.x - 10 * Math.cos(angle + 0.4), to.y - 10 * Math.sin(angle + 0.4))
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()

  // Draw nodes
  const R = 28
  for (const n of graph.nodes) {
    const pos = positions.get(n.id)
    if (!pos) continue
    const color = TYPE_COLOR[n.type] ?? '#6b7280'
    const isHover = hoverId === n.id

    ctx.save()
    ctx.shadowColor = isHover ? color : 'transparent'
    ctx.shadowBlur = isHover ? 12 : 0
    ctx.fillStyle = color
    ctx.globalAlpha = isHover ? 1 : 0.85
    ctx.beginPath()
    ctx.arc(pos.x, pos.y, R, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    ctx.save()
    ctx.fillStyle = '#fff'
    ctx.font = `bold 11px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const shortLabel = n.label.length > 12 ? n.label.slice(0, 11) + '…' : n.label
    ctx.fillText(shortLabel, pos.x, pos.y)
    ctx.restore()

    ctx.save()
    ctx.fillStyle = '#374151'
    ctx.font = '10px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(TYPE_LABEL[n.type] ?? n.type, pos.x, pos.y + R + 4)
    ctx.restore()
  }
}

export default function LineageTab() {
  const [graph, setGraph] = useState<LineageGraph | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const positionsRef = useRef<Map<string, { x: number; y: number }>>(new Map())

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/lineage/graph')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as LineageGraph
      setGraph(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : '데이터 로드 실패')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (!graph || !canvasRef.current) return
    const canvas = canvasRef.current
    // Rebuild positions map for hover detection
    const W = canvas.width
    const H = canvas.height
    const typeOrder = ['source', 'pipeline', 'catalog']
    const byType: Record<string, LineageNode[]> = {}
    for (const n of graph.nodes) {
      ;(byType[n.type] ?? (byType[n.type] = [])).push(n)
    }
    const map = new Map<string, { x: number; y: number }>()
    const colCount = typeOrder.filter((t) => (byType[t]?.length ?? 0) > 0).length
    const colWidth = W / (colCount + 1)
    let colIdx = 0
    for (const type of typeOrder) {
      const nodes = byType[type] ?? []
      if (nodes.length === 0) continue
      colIdx++
      nodes.forEach((n, i) => {
        map.set(n.id, { x: colIdx * colWidth, y: (i + 1) * (H / (nodes.length + 1)) })
      })
    }
    positionsRef.current = map
    drawGraph(canvas, graph, hoverId)
  }, [graph, hoverId])

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left) * (canvas.width / rect.width)
    const y = (e.clientY - rect.top) * (canvas.height / rect.height)
    const R = 28
    let found: string | null = null
    for (const [id, pos] of positionsRef.current) {
      if (Math.hypot(pos.x - x, pos.y - y) <= R) { found = id; break }
    }
    setHoverId(found)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-2 text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span>계보 그래프 로딩 중...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-red-500">
        <AlertCircle className="w-8 h-8" />
        <span>{error}</span>
        <button onClick={load} className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 transition-colors duration-150">
          <RefreshCw className="w-4 h-4" /> 다시 시도
        </button>
      </div>
    )
  }

  const isEmpty = !graph || graph.nodes.length === 0

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          데이터 계보 DAG (수집원 → 파이프라인 → 카탈로그)
        </h3>
        <button onClick={load} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 transition-colors duration-150">
          <RefreshCw className="w-3 h-3" /> 새로고침
        </button>
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-xs text-gray-600 dark:text-gray-400">
        {Object.entries(TYPE_COLOR).map(([type, color]) => (
          <span key={type} className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
            {TYPE_LABEL[type]}
          </span>
        ))}
      </div>

      {isEmpty ? (
        <div className="flex items-center justify-center h-48 text-gray-400 text-sm border border-dashed rounded-lg">
          계보 데이터가 없습니다. 수집 또는 가공을 실행하면 여기에 표시됩니다.
        </div>
      ) : (
        <canvas
          ref={canvasRef}
          width={900}
          height={400}
          className="w-full border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 cursor-crosshair"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverId(null)}
        />
      )}

      {/* Node count summary */}
      {graph && graph.nodes.length > 0 && (
        <p className="text-xs text-gray-400">
          노드 {graph.nodes.length}개 · 엣지 {graph.edges.length}개
        </p>
      )}
    </div>
  )
}
