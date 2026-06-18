/**
 * AI 질의 결과를 자연어로 요약합니다.
 */

import type { ModifierResult, FilterCondition } from './query-modifiers'

export interface SummaryInput {
  intent: string | null
  sigun?: string | null
  columns: string[]
  rows: Record<string, unknown>[]
  topN?: number
  direction?: 'asc' | 'desc'
  filters?: FilterCondition[]
}

function toNumber(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const n = Number(v.replace(/[^0-9.\-]/g, ''))
    return Number.isNaN(n) ? 0 : n
  }
  return 0
}

function isNumericCol(col: string, rows: Record<string, unknown>[]): boolean {
  const labelCols = ['sigun', '시군명', 'sigun_nm', 'name', 'ftype', 'industry', 'status', '시설유형', '시군구분', '주제', '설명', '예시질문']
  if (labelCols.some((l) => col.toLowerCase().includes(l.toLowerCase()))) return false
  const sample = rows.slice(0, 10).map((r) => r[col])
  const nonEmpty = sample.filter((v) => v != null && v !== '')
  return (
    nonEmpty.length > 0 &&
    nonEmpty.every(
      (v) =>
        typeof v === 'number' ||
        (typeof v === 'string' && !Number.isNaN(Number(String(v).replace(/[^0-9.\-]/g, ''))))
    )
  )
}

function formatKorean(n: number): string {
  if (Math.abs(n) >= 10000) return `${(n / 10000).toFixed(1)}만`
  return n.toLocaleString()
}

function opText(op: string): string {
  switch (op) {
    case 'gt': return '초과'
    case 'gte': return '이상'
    case 'lt': return '미만'
    case 'lte': return '이하'
    case 'eq': return '동일'
    case 'neq': return '제외'
    default: return '이상'
  }
}

function filterText(filters: FilterCondition[]): string {
  return filters.map((f) => `${f.column} ${formatKorean(f.value)}${opText(f.op)}`).join(', ')
}

/**
 * 결과를 1~3문장의 한국어로 요약합니다.
 */
export function summarize(input: SummaryInput): string {
  const { intent, sigun, columns, rows, topN, direction, filters } = input
  const regionText = sigun ? `${sigun} ` : ''
  const intentText = intent ?? '데이터'

  if (rows.length === 0) {
    return `${regionText}${intentText}에 대한 조건을 만족하는 결과가 없습니다.`
  }

  const sentences: string[] = []

  // 1. 결과 개수 문장
  let countSentence = `${regionText}${intentText} 결과는 총 ${rows.length}개입니다.`
  if (topN && topN > 0) {
    const directionText = direction === 'asc' ? '하위' : '상위'
    countSentence = `${regionText}${intentText} 결과 중 ${directionText} ${topN}개를 조회했습니다.`
  }
  sentences.push(countSentence)

  // 2. 필터 설명
  if (filters && filters.length > 0) {
    sentences.push(`적용된 필터: ${filterText(filters)}`)
  }

  // 3. 핵심 수치 요약
  const numericCols = columns.filter((c) => isNumericCol(c, rows))
  if (numericCols.length > 0) {
    const mainCol = numericCols[0]
    const values = rows.map((r) => toNumber(r[mainCol]))
    const max = Math.max(...values)
    const min = Math.min(...values)
    const avg = values.reduce((a, b) => a + b, 0) / values.length

    const statSentence =
      `${mainCol} 기준 최고 ${formatKorean(max)}, 최저 ${formatKorean(min)}, 평균 ${formatKorean(avg)}입니다.`
    sentences.push(statSentence)

    // 상위 1개 추가 설명
    if (rows.length > 1 && columns.includes('sigun')) {
      const first = rows[0]
      sentences.push(`1위는 ${first.sigun}(${formatKorean(toNumber(first[mainCol]))})입니다.`)
    }
  }

  return sentences.join(' ')
}
