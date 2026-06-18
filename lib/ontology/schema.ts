/**
 * 온톨로지 YAML 스키마 로더
 * config/ontology-schema.yaml 을 서버 시작(최초 접근) 시 한 번 로드하고 캐싱한다.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { load as yamlLoad } from 'js-yaml'
import type { OntologySchemaConfig, DomainConfig, DomainMetricConfig } from './types'

export type { OntologySchemaConfig }

/** YAML actions 항목의 개별 액션 타입 */
export type OntologyActionConfig = OntologySchemaConfig['actions'][string]

/** YAML sample_domains 항목의 개별 도메인 타입 */
export type OntologyDomainConfig = OntologySchemaConfig['sample_domains'][string]

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function assertStringArray(arr: unknown, name: string): string[] {
  if (!Array.isArray(arr)) {
    throw new Error(`스키마 오류: ${name}은(는) 문자열 배열이어야 합니다`)
  }
  if (!arr.every(i => typeof i === 'string')) {
    throw new Error(`스키마 오류: ${name}의 모든 항목은 문자열이어야 합니다`)
  }
  return arr as string[]
}

function assertMetricConfig(v: unknown, path: string): DomainMetricConfig {
  if (!isRecord(v)) {
    throw new Error(`스키마 오류: ${path}는 객체여야 합니다`)
  }
  if (typeof v.key !== 'string') {
    throw new Error(`스키마 오류: ${path}.key는 문자열이어야 합니다`)
  }
  if (typeof v.label !== 'string') {
    throw new Error(`스키마 오류: ${path}.label는 문자열이어야 합니다`)
  }
  if (v.aggregate !== 'sum' && v.aggregate !== 'avg') {
    throw new Error(`스키마 오류: ${path}.aggregate는 'sum' 또는 'avg'여야 합니다`)
  }
  return {
    key: v.key,
    label: v.label,
    aggregate: v.aggregate as DomainMetricConfig['aggregate'],
    fractionDigits: typeof v.fractionDigits === 'number' ? v.fractionDigits : undefined,
  }
}

function assertDomainConfig(v: unknown, key: string): DomainConfig {
  if (!isRecord(v)) {
    throw new Error(`스키마 오류: sample_domains.${key}는 객체여야 합니다`)
  }
  if (typeof v.name !== 'string') {
    throw new Error(`스키마 오류: sample_domains.${key}.name은 문자열이어야 합니다`)
  }
  if (typeof v.relation !== 'string') {
    throw new Error(`스키마 오류: sample_domains.${key}.relation은 문자열이어야 합니다`)
  }
  const metrics = Array.isArray(v.metrics)
    ? v.metrics.map((m, i) => assertMetricConfig(m, `sample_domains.${key}.metrics[${i}]`))
    : undefined
  return { name: v.name, relation: v.relation, metrics }
}

function assertWeights(weights: Record<string, unknown>, key: string): OntologyActionConfig['weights'] {
  for (const w of ['youth_pop', 'employees', 'facility_gap', 'outmigration'] as const) {
    if (typeof weights[w] !== 'number') {
      throw new Error(`스키마 오류: actions.${key}.weights.${w}는 숫자여야 합니다`)
    }
  }
  return {
    youth_pop: weights.youth_pop as number,
    employees: weights.employees as number,
    facility_gap: weights.facility_gap as number,
    outmigration: weights.outmigration as number,
  }
}

function validateSchema(raw: unknown): OntologySchemaConfig {
  if (!isRecord(raw)) {
    throw new Error('ontology-schema.yaml 최상위는 객체여야 합니다')
  }
  if (typeof raw.facility_filter !== 'string') {
    throw new Error('스키마 오류: facility_filter는 문자열이어야 합니다')
  }

  if (!isRecord(raw.sample_domains)) {
    throw new Error('스키마 오류: sample_domains는 객체여야 합니다')
  }
  const sampleDomains: Record<string, DomainConfig> = {}
  for (const [key, value] of Object.entries(raw.sample_domains)) {
    sampleDomains[key] = assertDomainConfig(value, key)
  }

  if (!isRecord(raw.actions)) {
    throw new Error('스키마 오류: actions는 객체여야 합니다')
  }
  const actions: Record<string, OntologyActionConfig> = {}
  for (const [key, value] of Object.entries(raw.actions)) {
    if (!isRecord(value)) {
      throw new Error(`스키마 오류: actions.${key}는 객체여야 합니다`)
    }
    if (typeof value.name !== 'string') {
      throw new Error(`스키마 오류: actions.${key}.name은 문자열이어야 합니다`)
    }
    if (typeof value.description !== 'string') {
      throw new Error(`스키마 오류: actions.${key}.description은 문자열이어야 합니다`)
    }
    if (!isRecord(value.weights)) {
      throw new Error(`스키마 오류: actions.${key}.weights는 객체여야 합니다`)
    }
    actions[key] = {
      name: value.name,
      description: value.description,
      weights: assertWeights(value.weights as Record<string, unknown>, key),
    }
  }

  if (!isRecord(raw.keyword_mapping)) {
    throw new Error('스키마 오류: keyword_mapping은 객체여야 합니다')
  }
  const keywordMapping: Record<string, string[]> = {}
  for (const [key, value] of Object.entries(raw.keyword_mapping)) {
    keywordMapping[key] = assertStringArray(value, `keyword_mapping.${key}`)
  }

  return {
    facility_filter: raw.facility_filter,
    facility_filters: assertStringArray(raw.facility_filters, 'facility_filters'),
    sample_domains: sampleDomains,
    actions,
    keyword_mapping: keywordMapping,
  }
}

let _schema: OntologySchemaConfig | null = null

export function getSchema(): OntologySchemaConfig {
  if (!_schema) {
    const p = join(process.cwd(), 'config', 'ontology-schema.yaml')
    _schema = validateSchema(yamlLoad(readFileSync(p, 'utf8')))
  }
  return _schema
}

/** 스키마 캐시 초기화 (테스트 전용) */
export function resetSchemaCache(): void {
  _schema = null
}
