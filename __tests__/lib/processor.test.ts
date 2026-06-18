import { applyRules, validateRule, validateRules, type Rule } from '@/lib/processor'

describe('processor', () => {
  describe('validateRule', () => {
    it('객체가 아닌 규칙은 오류를 반환한다', () => {
      expect(validateRule(null, 0)?.message).toContain('객체가 아닙니다')
    })

    it('지원하지 않는 타입은 오류를 반환한다', () => {
      expect(validateRule({ type: 'unknown' }, 0)?.message).toContain('지원하지 않는 규칙 타입')
    })

    it('select 규칙은 columns가 필요하다', () => {
      expect(validateRule({ type: 'select', mode: 'include', columns: [] }, 0)?.message).toContain('컬럼')
      expect(validateRule({ type: 'select', mode: 'include', columns: ['a'] }, 0)).toBeNull()
    })

    it('rename 규칙은 from/to가 필요하다', () => {
      expect(validateRule({ type: 'rename', from: '', to: 'b' }, 0)?.message).toContain('from')
      expect(validateRule({ type: 'rename', from: 'a', to: '' }, 0)?.message).toContain('to')
      expect(validateRule({ type: 'rename', from: 'a', to: 'b' }, 0)).toBeNull()
    })

    it('filter 규칙은 유효한 op가 필요하다', () => {
      expect(validateRule({ type: 'filter', column: 'a', op: 'invalid', value: 1 }, 0)?.message).toContain('연산자')
      expect(validateRule({ type: 'filter', column: 'a', op: '>=', value: 1 }, 0)).toBeNull()
    })

    it('cast 규칙은 유효한 to가 필요하다', () => {
      expect(validateRule({ type: 'cast', column: 'a', to: 'bool' }, 0)?.message).toContain('to')
      expect(validateRule({ type: 'cast', column: 'a', to: 'number' }, 0)).toBeNull()
    })

    it('aggregate 규칙은 유효한 agg가 필요하다', () => {
      expect(validateRule({ type: 'aggregate', groupBy: [], column: 'a', agg: 'avg' }, 0)?.message).toContain('집계')
      expect(validateRule({ type: 'aggregate', groupBy: [], column: 'a', agg: 'sum' }, 0)).toBeNull()
    })
  })

  describe('validateRules', () => {
    it('빈 배열은 오류가 없다', () => {
      expect(validateRules([])).toEqual([])
    })

    it('배열이 아니면 오류를 반환한다', () => {
      expect(validateRules('not-array' as unknown as Rule[])[0].message).toContain('배열')
    })

    it('여러 오류를 모두 반환한다', () => {
      const rules = [
        { type: 'rename', from: '', to: '' },
        { type: 'cast', column: '', to: 'number' },
      ] as unknown as Rule[]
      expect(validateRules(rules)).toHaveLength(2)
    })
  })

  describe('applyRules', () => {
    it('select include는 지정한 컬럼만 남긴다', () => {
      const rows = [{ a: 1, b: 2, c: 3 }]
      const result = applyRules(rows, [{ type: 'select', mode: 'include', columns: ['a', 'c'] }])
      expect(result.rows).toEqual([{ a: 1, c: 3 }])
      expect(result.inputRows).toBe(1)
      expect(result.outputRows).toBe(1)
    })

    it('rename은 컬럼명을 변경한다', () => {
      const rows = [{ a: 1 }]
      const result = applyRules(rows, [{ type: 'rename', from: 'a', to: 'x' }])
      expect(result.rows).toEqual([{ x: 1 }])
    })

    it('cast number는 문자를 숫자로 변환한다', () => {
      const rows = [{ a: '10' }]
      const result = applyRules(rows, [{ type: 'cast', column: 'a', to: 'number' }])
      expect(result.rows).toEqual([{ a: 10 }])
    })

    it('cast number 실패 시 오류를 기록하고 null로 변환한다', () => {
      const rows = [{ a: 'abc' }]
      const result = applyRules(rows, [{ type: 'cast', column: 'a', to: 'number' }])
      expect(result.rows).toEqual([{ a: null }])
      expect(result.errors).toHaveLength(1)
      expect(result.errorRows).toBe(1)
    })

    it('filter는 숫자 비교로 행을 거른다', () => {
      const rows = [{ a: 1 }, { a: 5 }, { a: 10 }]
      const result = applyRules(rows, [{ type: 'filter', column: 'a', op: '>=', value: 5 }])
      expect(result.rows).toEqual([{ a: 5 }, { a: 10 }])
    })

    it('normalize trim은 공백을 제거한다', () => {
      const rows = [{ a: '  hello  ' }]
      const result = applyRules(rows, [{ type: 'normalize', column: 'a', fn: 'trim' }])
      expect(result.rows).toEqual([{ a: 'hello' }])
    })

    it('dedup은 중복 행을 제거한다', () => {
      const rows = [{ a: 1, b: 2 }, { a: 1, b: 2 }, { a: 3, b: 4 }]
      const result = applyRules(rows, [{ type: 'dedup', keys: ['a'] }])
      expect(result.rows).toHaveLength(2)
    })

    it('codemap은 값을 치환한다', () => {
      const rows = [{ a: '1' }]
      const result = applyRules(rows, [{ type: 'codemap', column: 'a', map: { '1': 'one' } }])
      expect(result.rows).toEqual([{ a: 'one' }])
    })

    it('aggregate는 그룹별 합계를 계산한다', () => {
      const rows = [
        { g: 'A', v: 10 },
        { g: 'A', v: 20 },
        { g: 'B', v: 5 },
      ]
      const result = applyRules(rows, [{ type: 'aggregate', groupBy: ['g'], column: 'v', agg: 'sum', target: 'total' }])
      expect(result.rows).toEqual(expect.arrayContaining([
        { g: 'A', total: 30 },
        { g: 'B', total: 5 },
      ]))
    })
  })
})
