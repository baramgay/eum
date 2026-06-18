import { readFileSync } from 'fs'
import { join } from 'path'
import { propsToJsonb } from '@/lib/ontology/props-jsonb'

describe('propsToJsonb', () => {
  it('빈 문자열은 빈 객체를 반환한다', () => {
    expect(propsToJsonb('')).toEqual({})
  })

  it('숫자 값은 number로 변환한다', () => {
    expect(propsToJsonb('인구=1000;순이동=-50')).toEqual({ 인구: 1000, 순이동: -50 })
  })

  it('실수 값도 number로 변환한다', () => {
    expect(propsToJsonb('lat=35.1234;lng=128.5678')).toEqual({ lat: 35.1234, lng: 128.5678 })
  })

  it('문자열 값은 문자열로 유지한다', () => {
    expect(propsToJsonb('유형=도시;year=2024')).toEqual({ 유형: '도시', year: 2024 })
  })

  it('등호가 없는 키는 빈 문자열 값으로 저장한다', () => {
    expect(propsToJsonb('플래그;키=값')).toEqual({ 플래그: '', 키: '값' })
  })
})

describe('025_ontology_schema_upgrade.sql', () => {
  const sql = readFileSync(join(process.cwd(), 'supabase', 'migrations', '025_ontology_schema_upgrade.sql'), 'utf8')

  it('onto_links 복합 PK 추가 구문을 포함한다', () => {
    expect(sql).toContain('onto_links_pkey')
    expect(sql).toContain('primary key (src, rel, dst)')
  })

  it('onto_objects FK 제약 조건을 포함한다', () => {
    expect(sql).toContain('onto_links_src_fk')
    expect(sql).toContain('onto_links_dst_fk')
    expect(sql).toContain('references public.onto_objects(obj_id)')
  })

  it('props_jsonb 컬럼과 GIN 인덱스를 포함한다', () => {
    expect(sql).toContain('props_jsonb')
    expect(sql).toContain('idx_onto_objects_props_jsonb_gin')
    expect(sql).toContain('using gin')
  })

  it('RLL 정책을 추가한다', () => {
    expect(sql).toContain('onto_objects_select_authenticated')
    expect(sql).toContain('onto_links_select_authenticated')
  })

  it('워크스페이스 공유 컬럼을 추가한다', () => {
    expect(sql).toContain('share_token')
    expect(sql).toContain('notes')
  })

  it('gold 테이블 updated_at 컬럼과 트리거를 추가한다', () => {
    expect(sql).toContain('gold_youth_population_updated_at')
    expect(sql).toContain('gold_business_updated_at')
    expect(sql).toContain('gold_public_facility_updated_at')
  })

  it('ontology_rebuild_state 테이블을 생성한다', () => {
    expect(sql).toContain('ontology_rebuild_state')
  })
})
