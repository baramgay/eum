export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { jsPDF } from 'jspdf'
import { readFileSync } from 'fs'
import { join } from 'path'
import { createClient } from '@/lib/supabase/server'
import { computeIndicators } from '@/lib/evaluation'

let pretendardBase64: string | null = null

function getPretendardFont(): string {
  if (!pretendardBase64) {
    const file = join(process.cwd(), 'node_modules/pretendard/dist/public/static/alternative/Pretendard-Regular.ttf')
    pretendardBase64 = readFileSync(file).toString('base64')
  }
  return pretendardBase64
}

function setupFont(pdf: jsPDF) {
  pdf.addFileToVFS('Pretendard-Regular.ttf', getPretendardFont())
  pdf.addFont('Pretendard-Regular.ttf', 'Pretendard', 'normal')
  pdf.setFont('Pretendard')
}

function todayKor() {
  return new Date().toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric',
  })
}

interface Indicators {
  overall: number
  total_points: number
  areas: Array<{
    name: string
    weight: number
    score: number
    ok: number
    warn: number
    na?: number
    indicators: Array<{ name: string; value: string; status: string; desc: string }>
  }>
  bonus: { synthetic_cases: number; bonus_score: number }
  summary: {
    datasets: number
    open: number
    ai_ready: number
    quality_pass: number
    quality_total: number
    tenants_on: number
    tenants_total: number
  }
}

function addWrappedText(pdf: jsPDF, text: string, x: number, y: number, maxWidth: number, lineHeight: number): number {
  const lines = pdf.splitTextToSize(text, maxWidth)
  pdf.text(lines, x, y)
  return y + lines.length * lineHeight
}

function drawReport(pdf: jsPDF, data: Indicators, tenantName?: string) {
  setupFont(pdf)

  const pageWidth = pdf.internal.pageSize.getWidth()
  const margin = 14
  const contentWidth = pageWidth - margin * 2
  let y = margin

  pdf.setFontSize(16)
  pdf.text('데이터 관리 역량 평가편람 대응 리포트', margin, y)
  y += 8

  pdf.setFontSize(10)
  pdf.setTextColor(80, 80, 80)
  pdf.text(`산출일: ${todayKor()}`, margin, y)
  if (tenantName) {
    pdf.text(`기관: ${tenantName}`, margin + 50, y)
  }
  y += 10
  pdf.setTextColor(0, 0, 0)

  // 종합 점수
  const actual = Math.round(data.overall * data.total_points / 100)
  const bonus = data.bonus?.bonus_score ?? 0
  const grand = actual + bonus

  pdf.setFontSize(12)
  pdf.text(`종합 점수: ${grand}점 / 만점 ${data.total_points}점`, margin, y)
  y += 7
  pdf.setFontSize(9)
  pdf.text(`기여 점수 ${actual}점${bonus > 0 ? ` + 가점 ${bonus}점` : ''}`, margin, y)
  y += 12

  // 영역 요약
  pdf.setFontSize(11)
  pdf.text('영역별 요약', margin, y)
  y += 6
  pdf.setFontSize(9)
  pdf.text('영역', margin, y)
  pdf.text('점수', margin + 60, y)
  pdf.text('충족 / 미흡 / N/A', margin + 85, y)
  y += 5
  pdf.setDrawColor(200, 200, 200)
  pdf.line(margin, y, pageWidth - margin, y)
  y += 4

  for (const area of data.areas) {
    if (y > 270) { pdf.addPage(); y = margin }
    pdf.text(area.name, margin, y)
    pdf.text(`${area.score}점`, margin + 60, y)
    pdf.text(`${area.ok} / ${area.warn} / ${area.na ?? 0}`, margin + 85, y)
    y += 5
  }
  y += 8

  // 지표 상세
  for (const area of data.areas) {
    if (y > 250) { pdf.addPage(); y = margin }
    pdf.setFontSize(11)
    pdf.setTextColor(20, 40, 120)
    pdf.text(`${area.name} (가중치 ${area.weight}점)`, margin, y)
    y += 6
    pdf.setFontSize(8)
    pdf.setTextColor(0, 0, 0)

    for (const ind of area.indicators) {
      if (y > 260) { pdf.addPage(); y = margin }
      const statusLabel = ind.status === 'ok' ? '충족' : ind.status === 'warn' ? '미흡' : 'N/A'
      const header = `• [${statusLabel}] ${ind.name} — ${ind.value}`
      y = addWrappedText(pdf, header, margin, y, contentWidth, 4) + 2
      y = addWrappedText(pdf, `  ${ind.desc}`, margin + 2, y, contentWidth - 4, 3.5) + 3
    }
    y += 4
  }

  // 요약 지표
  if (y > 250) { pdf.addPage(); y = margin }
  pdf.setFontSize(11)
  pdf.setTextColor(20, 40, 120)
  pdf.text('주요 집계 지표', margin, y)
  y += 6
  pdf.setFontSize(9)
  pdf.setTextColor(0, 0, 0)
  const s = data.summary
  const lines = [
    `등록 데이터셋: ${s.datasets}개`,
    `개방 데이터셋: ${s.open}개`,
    `AI-Ready: ${s.ai_ready}개`,
    `품질 통과: ${s.quality_pass}/${s.quality_total}건`,
    `입주 기관: ${s.tenants_on}/${s.tenants_total}개`,
  ]
  for (const line of lines) {
    pdf.text(line, margin, y)
    y += 5
  }
}

function drawCompare(pdf: jsPDF, base: Indicators, compares: Indicators[], ids: string[]) {
  pdf.addPage()
  setupFont(pdf)
  const margin = 14
  const pageWidth = pdf.internal.pageSize.getWidth()
  let y = margin

  pdf.setFontSize(14)
  pdf.text('기관 비교 리포트', margin, y)
  y += 10

  pdf.setFontSize(9)
  const headers = ['기관', '종합', '데이터셋', '개방', 'AI-Ready', '품질통과']
  const cols = [margin, margin + 35, margin + 65, margin + 90, margin + 115, margin + 145]
  pdf.setFillColor(230, 230, 230)
  pdf.rect(margin, y - 5, pageWidth - margin * 2, 7, 'F')
  headers.forEach((h, i) => pdf.text(h, cols[i], y))
  y += 7

  const rows = [
    { name: '기준', overall: base.overall, ...base.summary },
    ...compares.map((c, i) => ({ name: ids[i] ?? '비교', overall: c.overall, ...c.summary })),
  ]
  for (const row of rows) {
    if (y > 270) { pdf.addPage(); setupFont(pdf); y = margin }
    pdf.text(String(row.name).slice(0, 12), cols[0], y)
    pdf.text(`${Math.round(row.overall)}점`, cols[1], y)
    pdf.text(String(row.datasets), cols[2], y)
    pdf.text(String(row.open), cols[3], y)
    pdf.text(String(row.ai_ready), cols[4], y)
    pdf.text(`${row.quality_pass}/${row.quality_total}`, cols[5], y)
    y += 5
  }
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const role = user.user_metadata?.role as string | undefined
  const tenantId = role === 'center'
    ? (req.nextUrl.searchParams.get('tenant_id') || undefined)
    : (user.user_metadata?.tenant_id as string | undefined)

  const compareIds = req.nextUrl.searchParams.get('compare_ids')
    ?.split(',')
    .map(s => s.trim())
    .filter(Boolean) ?? []

  let tenantName = tenantId ?? '전체 집계'
  if (tenantId) {
    const { data } = await supabase.from('tenants').select('name').eq('tenant_id', tenantId).maybeSingle()
    if (data?.name) tenantName = data.name
  }

  const data = (await computeIndicators(supabase, tenantId)) as Indicators

  let compareData: Indicators[] = []
  if (role === 'center' && compareIds.length > 0) {
    compareData = await Promise.all(
      compareIds.map(id => computeIndicators(supabase, id) as Promise<Indicators>)
    )
  }

  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })
  drawReport(pdf, data, tenantName)
  if (compareData.length) {
    drawCompare(pdf, data, compareData, compareIds)
  }

  const buffer = Buffer.from(pdf.output('arraybuffer'))
  const filename = `평가리포트_${new Date().toISOString().slice(0, 10)}.pdf`

  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
    },
  })
}
