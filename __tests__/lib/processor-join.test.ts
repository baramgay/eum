import { applyRules, type Rule } from '@/lib/processor'

describe('processor join 규칙', () => {
  const left: Record<string, unknown>[] = [
    { id: 1, name: 'A' },
    { id: 2, name: 'B' },
    { id: 3, name: 'C' },
  ]
  const right: Record<string, unknown>[] = [
    { id: 1, value: 100 },
    { id: 2, value: 200 },
    { id: 4, value: 400 },
  ]

  it('left join은 왼쪽의 모든 행을 유지하고 매칭되는 오른쪽 컬럼을 붙인다', () => {
    const rule: Rule = { type: 'join', datasetId: 'right', on: 'id', how: 'left' }
    const result = applyRules(left, [rule], { right })
    expect(result.rows).toHaveLength(3)
    expect(result.rows[0]).toMatchObject({ id: 1, name: 'A', right_value: 100 })
    expect(result.rows[2]).toMatchObject({ id: 3, name: 'C', right_value: null })
  })

  it('inner join은 매칭되는 행만 남긴다', () => {
    const rule: Rule = { type: 'join', datasetId: 'right', on: 'id', how: 'inner' }
    const result = applyRules(left, [rule], { right })
    expect(result.rows).toHaveLength(2)
    expect(result.rows.map(r => r.id)).toEqual([1, 2])
  })

  it('right join은 오른쪽의 모든 행을 유지한다', () => {
    const rule: Rule = { type: 'join', datasetId: 'right', on: 'id', how: 'right' }
    const result = applyRules(left, [rule], { right })
    expect(result.rows).toHaveLength(3)
    expect(result.rows.map(r => r.id)).toContain(4)
  })

  it('join 대상이 없으면 원본을 그대로 반환한다', () => {
    const rule: Rule = { type: 'join', datasetId: 'missing', on: 'id', how: 'left' }
    const result = applyRules(left, [rule], {})
    expect(result.rows).toEqual(left)
  })

  it('join 후 select와 조합할 수 있다', () => {
    const rules: Rule[] = [
      { type: 'join', datasetId: 'right', on: 'id', how: 'left' },
      { type: 'select', mode: 'include', columns: ['id', 'right_value'] },
    ]
    const result = applyRules(left, rules, { right })
    expect(result.rows).toHaveLength(3)
    expect(result.rows[0]).toEqual({ id: 1, right_value: 100 })
  })

  it('join 키 컬럼은 접두어 없이 유지된다', () => {
    const rule: Rule = { type: 'join', datasetId: 'right', on: 'id', how: 'left' }
    const result = applyRules(left, [rule], { right })
    expect(result.rows[0]).toHaveProperty('id')
    expect(result.rows[0]).toHaveProperty('right_value')
  })
})
