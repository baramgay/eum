/**
 * 경남 시군 SSOT(Single Source of Truth)
 *
 * 각 컨슈머별로 필요한 형태의 파생 상수를 함께 제공합니다.
 *  - SGG_OPTIONS : 온톨로지 시군 선택 드롭다운용
 *  - SIGUN_LIST  : 자연어 질의에서 시군명 추출용
 *  - SEED_SIGUN  : scripts/generate-seed-data.ts용
 */
export interface Region {
  sggCd: string // 온톨로지/API에서 사용하는 시군구 코드
  seedCd: string // 시드 데이터 생성 시 사용하는 시군구 코드
  name: string // 시군명
  weight: number // 시드 데이터 가중치
}

export const REGIONS: Region[] = [
  { sggCd: '48120', seedCd: '48121', name: '창원시', weight: 100 },
  { sggCd: '48170', seedCd: '48170', name: '진주시', weight: 34 },
  { sggCd: '48220', seedCd: '48220', name: '통영시', weight: 12 },
  { sggCd: '48240', seedCd: '48240', name: '사천시', weight: 11 },
  { sggCd: '48250', seedCd: '48250', name: '김해시', weight: 53 },
  { sggCd: '48270', seedCd: '48270', name: '밀양시', weight: 10 },
  { sggCd: '48310', seedCd: '48310', name: '거제시', weight: 24 },
  { sggCd: '48330', seedCd: '48330', name: '양산시', weight: 35 },
  { sggCd: '48720', seedCd: '48720', name: '의령군', weight: 3 },
  { sggCd: '48740', seedCd: '48730', name: '함안군', weight: 6 },
  { sggCd: '48760', seedCd: '48740', name: '창녕군', weight: 6 },
  { sggCd: '48820', seedCd: '48820', name: '고성군', weight: 5 },
  { sggCd: '48840', seedCd: '48840', name: '남해군', weight: 4 },
  { sggCd: '48850', seedCd: '48850', name: '하동군', weight: 4 },
  { sggCd: '48860', seedCd: '48860', name: '산청군', weight: 3 },
  { sggCd: '48870', seedCd: '48870', name: '함양군', weight: 4 },
  { sggCd: '48890', seedCd: '48880', name: '거창군', weight: 6 },
  { sggCd: '48930', seedCd: '48890', name: '합천군', weight: 4 },
]

/** 온톨로지 시군 선택 옵션 */
export const SGG_OPTIONS: { code: string; name: string }[] = REGIONS.map((r) => ({
  code: r.sggCd,
  name: r.name,
}))

/** 자연어 질의용 시군명 목록 */
export const SIGUN_LIST: string[] = REGIONS.map((r) => r.name)

/** 시드 데이터 생성용 [시군구코드, 시군명, 가중치] 튜플 */
export const SEED_SIGUN: [string, string, number][] = REGIONS.map((r) => [
  r.seedCd,
  r.name,
  r.weight,
])
