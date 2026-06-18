process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'

import {
  assertAllowedTable,
  getAreaLabel,
  inferArea,
  getIssueSeverity,
} from '@/lib/quality'

describe('assertAllowedTable()', () => {
  it('gold_youth_population — 통과', () => {
    expect(assertAllowedTable('gold_youth_population')).toBe('gold_youth_population')
  })

  it('gold_business — 통과', () => {
    expect(assertAllowedTable('gold_business')).toBe('gold_business')
  })

  it('gold_public_facility — 통과', () => {
    expect(assertAllowedTable('gold_public_facility')).toBe('gold_public_facility')
  })

  it('sub_ 접두어 테이블 — 통과', () => {
    expect(assertAllowedTable('sub_custom')).toBe('sub_custom')
  })

  it('미허용 테이블명 — 에러 throw', () => {
    expect(() => assertAllowedTable('users')).toThrow('허용되지 않은 테이블')
  })

  it('임의 문자열 — 에러 throw', () => {
    expect(() => assertAllowedTable('silver_table')).toThrow('허용되지 않은 테이블')
  })

  it('null — 에러 throw', () => {
    expect(() => assertAllowedTable(null)).toThrow('허용되지 않은 테이블')
  })

  it('undefined — 에러 throw', () => {
    expect(() => assertAllowedTable(undefined)).toThrow('허용되지 않은 테이블')
  })

  it('빈 문자열 — 에러 throw', () => {
    expect(() => assertAllowedTable('')).toThrow('허용되지 않은 테이블')
  })
})

describe('getAreaLabel()', () => {
  it('completeness → 완전성', () => {
    expect(getAreaLabel('completeness')).toBe('완전성')
  })

  it('accuracy → 정확성', () => {
    expect(getAreaLabel('accuracy')).toBe('정확성')
  })

  it('consistency → 일관성', () => {
    expect(getAreaLabel('consistency')).toBe('일관성')
  })

  it('recency → 최신성', () => {
    expect(getAreaLabel('recency')).toBe('최신성')
  })

  it('metadata → 메타데이터', () => {
    expect(getAreaLabel('metadata')).toBe('메타데이터')
  })
})

describe('inferArea()', () => {
  it('NULL 포함 규칙명 → completeness', () => {
    expect(inferArea('population NULL 금지')).toBe('completeness')
  })

  it('결측 포함 규칙명 → completeness', () => {
    expect(inferArea('산업분류 결측 금지')).toBe('completeness')
  })

  it('연도 포함 규칙명 → recency', () => {
    expect(inferArea('연도 범위(2018-2025)')).toBe('recency')
  })

  it('최신 포함 규칙명 → recency', () => {
    expect(inferArea('최신 데이터 기준')).toBe('recency')
  })

  it('정합성 포함 규칙명 → consistency', () => {
    expect(inferArea('종사자>=사업체 정합성')).toBe('consistency')
  })

  it('중복 포함 규칙명 → consistency', () => {
    expect(inferArea('중복행 금지')).toBe('consistency')
  })

  it('메타 포함 규칙명 → metadata', () => {
    expect(inferArea('메타데이터 형식')).toBe('metadata')
  })

  it('그 외 → accuracy', () => {
    expect(inferArea('사업체수 양수 조건')).toBe('accuracy')
  })
})

describe('getIssueSeverity()', () => {
  it('violations=0, checkedPerRule > 0 → low', () => {
    expect(getIssueSeverity(0, 1000)).toBe('low')
  })

  it('checkedPerRule=0, violations > 0 → high', () => {
    expect(getIssueSeverity(5, 0)).toBe('high')
  })

  it('checkedPerRule=0, violations=0 → low', () => {
    expect(getIssueSeverity(0, 0)).toBe('low')
  })

  it('ratio >= 0.5 → critical', () => {
    // 500/1000 = 0.5
    expect(getIssueSeverity(500, 1000)).toBe('critical')
  })

  it('violations >= 10000 → critical', () => {
    expect(getIssueSeverity(10000, 1000000)).toBe('critical')
  })

  it('ratio >= 0.01 → high', () => {
    // 10/1000 = 0.01
    expect(getIssueSeverity(10, 1000)).toBe('high')
  })

  it('violations >= 1000 → high', () => {
    expect(getIssueSeverity(1000, 10000000)).toBe('high')
  })

  it('ratio >= 0.001 → medium', () => {
    // 1/1000 = 0.001
    expect(getIssueSeverity(1, 1000)).toBe('medium')
  })

  it('ratio < 0.001 → low', () => {
    // 1/10000 = 0.0001
    expect(getIssueSeverity(1, 10000)).toBe('low')
  })
})
