/**
 * 데이터 품질 계약(Quality Data Contract) 해석기
 * catalog.quality_contract JSONB 를 읽어 runQuality 에서 사용할 규칙 함수를 생성한다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { NIACharacteristic } from './quality-nia'

export type ContractCheck =
  | { type: 'not_null'; column: string }
  | { type: 'range'; column: string; min?: number; max?: number; includeMin?: boolean; includeMax?: boolean }
  | { type: 'in'; column: string; values: string[] }
  | { type: 'year_range'; column: string; min: number; max: number }
  | { type: 'or_null'; columns: string[] }
  | { type: 'rpc'; name: string }

export interface ContractRule {
  name: string
  area?: string
  niaTrait?: NIACharacteristic   // NIA 9대 품질 특성 (명시 or 체크 타입별 기본값)
  check: ContractCheck
}

// 체크 타입별 기본 NIA 특성 (사용자가 명시하지 않을 때)
const CHECK_TYPE_DEFAULT_NIA: Partial<Record<ContractCheck['type'], NIACharacteristic>> = {
  not_null:   'completeness',
  range:      'syntacticAccuracy',
  in:         'standardConformance',
  year_range: 'validity',
  or_null:    'completeness',
}

export interface QualityContract {
  rules: ContractRule[]
}

type CountOp = 'lt' | 'lte' | 'gt' | 'gte' | 'eq' | 'neq'

async function countWhere(sb: SupabaseClient, table: string, col: string, op: CountOp, val: number) {
  const base = sb.from(table).select('*', { count: 'exact', head: true })
  let res: { count: number | null }
  switch (op) {
    case 'lt':  res = await base.lt(col, val); break
    case 'lte': res = await base.lte(col, val); break
    case 'gt':  res = await base.gt(col, val); break
    case 'gte': res = await base.gte(col, val); break
    case 'eq':  res = await base.eq(col, val); break
    case 'neq': res = await base.neq(col, val); break
  }
  return res.count ?? 0
}

async function countNull(sb: SupabaseClient, table: string, col: string) {
  const { count } = await sb.from(table).select('*', { count: 'exact', head: true }).is(col, null)
  return count ?? 0
}

async function countNotIn(sb: SupabaseClient, table: string, col: string, vals: string[]) {
  const { count } = await sb.from(table).select('*', { count: 'exact', head: true }).not(col, 'in', `(${vals.map(v => `"${v}"`).join(',')})`)
  return count ?? 0
}

async function countYearOutOfRange(sb: SupabaseClient, table: string, col: string, min: number, max: number) {
  const { count: a } = await sb.from(table).select('*', { count: 'exact', head: true }).lt(col, min)
  const { count: b } = await sb.from(table).select('*', { count: 'exact', head: true }).gt(col, max)
  return (a ?? 0) + (b ?? 0)
}

async function countOrNull(sb: SupabaseClient, table: string, columns: string[]) {
  const conditions = columns.map(c => `${c}.is.null`).join(',')
  const { count } = await sb.from(table).select('*', { count: 'exact', head: true }).or(conditions)
  return count ?? 0
}

/**
 * 품질 계약 객체를 유효성 검사 없이 받아들인다.
 * 실패하는 규칙은 0 위반을 반환하는 안전한 함수로 대첾한다.
 * 반환 타입은 quality.ts RuleEntry와 동일 — 3번째 요소로 NIA 특성 포함.
 */
export function contractToRuleFns(
  tableName: string,
  contract: QualityContract,
): Array<[string, (sb: SupabaseClient) => Promise<number>, NIACharacteristic?]> {
  if (!contract?.rules || !Array.isArray(contract.rules)) return []

  return contract.rules.map((rule, index) => {
    const name = rule.name || `계약 규칙 ${index + 1}`
    const check = rule.check
    const niaTrait: NIACharacteristic | undefined =
      rule.niaTrait ?? CHECK_TYPE_DEFAULT_NIA[check.type]

    switch (check.type) {
      case 'not_null':
        return [name, sb => countNull(sb, tableName, check.column), niaTrait]
      case 'range': {
        return [name, async sb => {
          let total = 0
          const includeMin = check.includeMin ?? true
          const includeMax = check.includeMax ?? true
          if (check.min !== undefined) {
            total += await countWhere(sb, tableName, check.column, includeMin ? 'lt' : 'lte', check.min)
          }
          if (check.max !== undefined) {
            total += await countWhere(sb, tableName, check.column, includeMax ? 'gt' : 'gte', check.max)
          }
          return total
        }, niaTrait]
      }
      case 'in':
        return [name, sb => countNotIn(sb, tableName, check.column, check.values), niaTrait]
      case 'year_range':
        return [name, sb => countYearOutOfRange(sb, tableName, check.column, check.min, check.max), niaTrait]
      case 'or_null':
        return [name, sb => countOrNull(sb, tableName, check.columns), niaTrait]
      case 'rpc':
        return [name, async sb => {
          const { data, error } = await sb.rpc(check.name)
          if (error) {
            // eslint-disable-next-line no-console
            console.warn(`[quality-contract] RPC ${check.name} 실패:`, error.message)
            return 0
          }
          return Number(data ?? 0)
        }, niaTrait]
      default:
        return [name, async () => 0, niaTrait]
    }
  })
}

export function isQualityContract(value: unknown): value is QualityContract {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return Array.isArray(v.rules)
}
