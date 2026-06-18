/**
 * 자연어 질의에서 TOP-N / 필터 조건을 파싱하고 결과에 적용합니다.
 */

export type CompareOp = 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq'

export interface FilterCondition {
  /** 결과 Record의 실제 컬럼명 */
  column: string
  op: CompareOp
  value: number
}

export interface ModifierResult {
  /** 추출된 TOP-N 개수 (undefined면 제한 없음) */
  topN?: number
  /** 정렬 방향: 'desc'가 기본, 'asc'는 하위 N개 */
  direction: 'asc' | 'desc'
  /** 추출된 필터 조건 목록 */
  filters: FilterCondition[]
}

const OP_KEYWORDS: { op: CompareOp; pattern: RegExp }[] = [
  { op: 'gte', pattern: /이상(인)?/ },
  { op: 'lte', pattern: /이하(인)?/ },
  { op: 'gt', pattern: /초과/ },
  { op: 'lt', pattern: /미만/ },
]

/**
 * 컬럼 힌트(한글/영문 별칭)를 실제 결과 컬럼명으로 변환합니다.
 * aliases[실제컬럼명] = [별칭, ...]
 */
export function resolveColumn(hint: string, aliases: Record<string, string[]>): string | null {
  const normalized = hint.replace(/\s/g, '').toLowerCase()
  for (const [column, names] of Object.entries(aliases)) {
    if (names.some((n) => normalized.includes(n.replace(/\s/g, '').toLowerCase()))) {
      return column
    }
  }
  return null
}

/**
 * 질문에서 TOP-N 키워드를 파싱합니다.
 *  - "상위 5", "top 5", "Top-5", "5위 이내" 등
 *  - "높은 5개" -> desc, "낮은 5개" -> asc
 */
export function parseTopN(q: string): Pick<ModifierResult, 'topN' | 'direction'> {
  const ql = q.replace(/\s/g, '').toLowerCase()

  // 상위/top + 숫자
  const topMatch = ql.match(/(?:상위|top-?)(\d+)/)
  if (topMatch) {
    return { topN: Number(topMatch[1]), direction: 'desc' }
  }

  // N위(이내/까지)
  const rankMatch = ql.match(/(\d+)위(?:이내|까지)?/)
  if (rankMatch) {
    return { topN: Number(rankMatch[1]), direction: 'desc' }
  }

  // 상위/top ... N개
  const countMatch = ql.match(/(?:상위|top).{0,5}(\d+)개/)
  if (countMatch) {
    return { topN: Number(countMatch[1]), direction: 'desc' }
  }

  // 높은/낮은 N개
  const highMatch = ql.match(/(?:높은|높)(?:\D{0,5})(\d+)개/)
  if (highMatch) {
    return { topN: Number(highMatch[1]), direction: 'desc' }
  }
  const lowMatch = ql.match(/(?:낮은|낮)(?:\D{0,5})(\d+)개/)
  if (lowMatch) {
    return { topN: Number(lowMatch[1]), direction: 'asc' }
  }

  return { direction: 'desc' }
}

/**
 * 질문에서 필터 조건을 파싱합니다.
 *  - "소득 300 이상", "순위 10 이하", "청년인구 10000 이상"
 *  - 여러 조건은 "그리고", ",", "및" 으로 분리됩니다.
 *
 * 연산자(이상/이하/초과/미만) 직전의 숫자만 필터 값으로 사용하므로,
 * TOP-N에 쓰인 숫자는 필터로 오인되지 않습니다.
 */
export function parseFilters(q: string, aliases: Record<string, string[]>): FilterCondition[] {
  const ql = q.replace(/\s/g, '').toLowerCase()
  const results: FilterCondition[] = []

  for (const { op, pattern: opPattern } of OP_KEYWORDS) {
    const regex = new RegExp(opPattern.source, 'g')
    let m: RegExpExecArray | null
    while ((m = regex.exec(ql)) !== null) {
      const beforeOp = ql.slice(0, m.index)
      // 연산자 바로 앞의 마지막 숫자를 찾습니다.
      const numMatch = beforeOp.match(/(\d+(?:\.\d+)?)(?=[^0-9]*$)/)
      if (!numMatch) continue

      const value = Number(numMatch[1])
      const hint = beforeOp.slice(0, numMatch.index).trim()
      const column = resolveColumn(hint, aliases)
      if (column && !Number.isNaN(value)) {
        results.push({ column, op, value })
      }
    }
  }

  return results
}

/**
 * 질문에서 TOP-N과 필터 조건을 한 번에 파싱합니다.
 */
export function parseModifiers(
  q: string,
  aliases: Record<string, string[]> = {}
): ModifierResult {
  const { topN, direction } = parseTopN(q)
  const filters = parseFilters(q, aliases)
  return { topN, direction, filters }
}

/**
 * TOP-N을 이미 정렬된 rows에 적용합니다.
 * direction이 'desc'면 배열 앞에서 N개(상위), 'asc'면 역순으로 N개(하위)를 잘라냅니다.
 */
export function applyTopN<T>(rows: T[], topN: number | undefined, direction: 'asc' | 'desc' = 'desc'): T[] {
  if (!topN || topN <= 0) return rows
  if (direction === 'asc') return [...rows].reverse().slice(0, topN)
  return rows.slice(0, topN)
}

function compareValue(v: unknown, op: CompareOp, value: number): boolean {
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^0-9.\-]/g, ''))
  if (Number.isNaN(n)) return false
  switch (op) {
    case 'gt': return n > value
    case 'gte': return n >= value
    case 'lt': return n < value
    case 'lte': return n <= value
    case 'eq': return n === value
    case 'neq': return n !== value
    default: return false
  }
}

/**
 * 필터 조건을 rows에 적용합니다.
 */
export function applyFilters<T extends Record<string, unknown>>(
  rows: T[],
  filters: FilterCondition[]
): T[] {
  if (!filters.length) return rows
  return rows.filter((row) =>
    filters.every((f) => compareValue(row[f.column], f.op, f.value))
  )
}
