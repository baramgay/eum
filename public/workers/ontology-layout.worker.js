/**
 * 온톨로지 그래프 레이아웃 Web Worker
 * D3 의존성 없이 가벼운 force-directed placement 수행
 *
 * 메시지 형식:
 *   입력: { nodes: { obj_id, degree? }[], edges: { source, target, weight? }[], layout: 'force' | ... , width: number, height: number }
 *   출력: { positions: { obj_id, x, y, vx?, vy? }[] }
 */

/* global self */

function uuid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function runForceLayout(nodes, edges, width, height) {
  const positions = new Map()
  const centerX = width / 2
  const centerY = height / 2

  // 초기 위치: 중심 주변 원형 분포 + 약간의 무작위성
  nodes.forEach((n, i) => {
    const angle = (i / Math.max(1, nodes.length)) * Math.PI * 2
    const r = Math.min(width, height) * 0.15
    positions.set(n.obj_id, {
      x: centerX + r * Math.cos(angle) + (Math.random() - 0.5) * r,
      y: centerY + r * Math.sin(angle) + (Math.random() - 0.5) * r,
      vx: 0,
      vy: 0,
    })
  })

  const linkMap = new Map()
  edges.forEach((e, i) => {
    const key = [e.source, e.target].sort().join('||')
    if (!linkMap.has(key)) {
      linkMap.set(key, { source: e.source, target: e.target, weight: e.weight ?? 1, count: 0 })
    }
    const link = linkMap.get(key)
    link.weight += (e.weight ?? 1)
    link.count += 1
  })
  const links = Array.from(linkMap.values())

  const repulsion = 4000
  const springLength = 80
  const springStrength = 0.05
  const damping = 0.8
  const centerStrength = 0.02
  const iterations = 300
  const nodeIds = nodes.map(n => n.obj_id)

  for (let iter = 0; iter < iterations; iter++) {
    // 중심 끌기
    for (const id of nodeIds) {
      const p = positions.get(id)
      p.vx += (centerX - p.x) * centerStrength
      p.vy += (centerY - p.y) * centerStrength
    }

    // 반발력 (O(n²), 대형 그래프용 단순 구현)
    for (let i = 0; i < nodeIds.length; i++) {
      const a = positions.get(nodeIds[i])
      const degA = nodes[i].degree ?? 1
      for (let j = i + 1; j < nodeIds.length; j++) {
        const b = positions.get(nodeIds[j])
        let dx = a.x - b.x
        let dy = a.y - b.y
        let dist2 = dx * dx + dy * dy
        if (dist2 < 1) {
          dx = Math.random() - 0.5
          dy = Math.random() - 0.5
          dist2 = dx * dx + dy * dy + 1
        }
        const dist = Math.sqrt(dist2)
        const force = (repulsion * Math.sqrt(degA * (nodes[j].degree ?? 1))) / dist2
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force
        a.vx += fx
        a.vy += fy
        b.vx -= fx
        b.vy -= fy
      }
    }

    // 인력 (스프링)
    for (const link of links) {
      const a = positions.get(link.source)
      const b = positions.get(link.target)
      if (!a || !b) continue
      let dx = b.x - a.x
      let dy = b.y - a.y
      const dist = Math.sqrt(dx * dx + dy * dy) || 1
      const force = (dist - springLength) * springStrength * Math.log1p(link.weight)
      const fx = (dx / dist) * force
      const fy = (dy / dist) * force
      a.vx += fx
      a.vy += fy
      b.vx -= fx
      b.vy -= fy
    }

    // 위치/속도 업데이트, 온도 점진 감소
    const temp = 1 - iter / iterations
    for (let i = 0; i < nodeIds.length; i++) {
      const id = nodeIds[i]
      const p = positions.get(id)
      const speedLimit = 10 * temp + 0.5
      p.vx *= damping
      p.vy *= damping
      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy)
      if (speed > speedLimit) {
        p.vx = (p.vx / speed) * speedLimit
        p.vy = (p.vy / speed) * speedLimit
      }
      p.x += p.vx
      p.y += p.vy
    }
  }

  return nodeIds.map(id => {
    const p = positions.get(id)
    return { obj_id: id, x: p.x, y: p.y, vx: p.vx, vy: p.vy }
  })
}

self.onmessage = function (event) {
  const { nodes = [], edges = [], layout = 'force', width = 800, height = 600 } = event.data || {}

  try {
    let positions = []
    if (layout === 'force' && nodes.length > 0) {
      positions = runForceLayout(nodes, edges, width, height)
    } else {
      // 기타 레이아웃은 초기 위치만 반환 (메인 스레드 D3가 최종 배치)
      const cx = width / 2
      const cy = height / 2
      positions = nodes.map((n, i) => {
        const angle = (i / Math.max(1, nodes.length)) * Math.PI * 2
        const r = Math.min(width, height) * 0.25
        return {
          obj_id: n.obj_id,
          x: cx + r * Math.cos(angle),
          y: cy + r * Math.sin(angle),
        }
      })
    }
    self.postMessage({ positions })
  } catch (err) {
    self.postMessage({ error: err?.message ?? String(err), positions: [] })
  }
}
