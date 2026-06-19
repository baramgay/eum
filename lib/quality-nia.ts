/**
 * NIA AI 데이터 품질관리 가이드라인 v4.0 기반 품질 특성 정의
 * 9대 품질 특성 + 1-Cycle 자가점검 + 4단계 데이터 생애주기
 */

// ─── 9대 NIA 품질 특성 ─────────────────────────────────────────────────────

export type NIACharacteristic =
  | 'readiness'           // 준비성 — 데이터 수집 계획·기준 준비
  | 'completeness'        // 완전성 — 필수 값 누락 없음
  | 'usefulness'          // 유용성 — 목적 부합, 활용 가능성
  | 'standardConformance' // 기준 적합성 — 표준·규정 준수
  | 'diversity'           // 다양성 — 클래스·분포·수집 환경 다양성
  | 'semanticAccuracy'    // 의미 정확성 — 레이블·값의 의미 정확도
  | 'syntacticAccuracy'   // 구문 정확성 — 형식·범위·타입 정확도
  | 'algorithmicAdequacy' // 알고리즘 적정성 — 학습 알고리즘 적합성
  | 'validity'            // 유효성 — 전체 품질 종합 유효성

export interface NIACharacteristicMeta {
  label: string
  shortLabel: string
  color: string
  description: string
  stage: DataLifecycleStage[]    // 해당 생애주기 단계
  legacyArea?: string            // 기존 5영역 대응
  checkPoints: string[]          // 검사 항목 예시
}

export const NIA_CHARACTERISTICS: Record<NIACharacteristic, NIACharacteristicMeta> = {
  readiness: {
    label: '준비성',
    shortLabel: '준비',
    color: '#64748b',
    description: '데이터 수집 계획·기준·수집 환경이 사전에 충분히 준비되었는가',
    stage: ['acquisition'],
    checkPoints: [
      '수집 계획서 및 기준 문서 존재 여부',
      '수집 환경 적합성 검토 완료',
      '수집 인력·장비 준비 여부',
      '개인정보 처리 동의 절차 완료',
    ],
  },
  completeness: {
    label: '완전성',
    shortLabel: '완전',
    color: '#3b82f6',
    description: '필수 데이터 항목에 결측치·누락이 없는가',
    stage: ['acquisition', 'cleansing'],
    legacyArea: 'completeness',
    checkPoints: [
      'NULL/결측 비율 0.1% 미만',
      '필수 컬럼 전체 존재 여부',
      '레코드 수 목표치 달성 여부',
      '수집 구간 연속성 (시계열 누락 없음)',
    ],
  },
  usefulness: {
    label: '유용성',
    shortLabel: '유용',
    color: '#10b981',
    description: '데이터가 목적에 부합하고 실제 활용 가능한가',
    stage: ['acquisition', 'annotation'],
    checkPoints: [
      '목적 적합성 평가 완료',
      '활용 가능 포맷·해상도 충족',
      '중복 데이터 최소화',
      '활용 범위 문서화',
    ],
  },
  standardConformance: {
    label: '기준 적합성',
    shortLabel: '기준',
    color: '#8b5cf6',
    description: '국가 표준·법령·가이드라인 등 기준을 준수하는가',
    stage: ['cleansing', 'annotation'],
    legacyArea: 'metadata',
    checkPoints: [
      '표준 코드·용어 적용 여부',
      '메타데이터 작성 기준 준수',
      '저작권·라이선스 적합성',
      '개인정보 비식별화 완료',
    ],
  },
  diversity: {
    label: '다양성',
    shortLabel: '다양',
    color: '#f59e0b',
    description: '클래스·속성·수집 환경 등 다양성이 충분히 확보되었는가',
    stage: ['acquisition', 'cleansing'],
    checkPoints: [
      '클래스 불균형 비율(5:1 이하)',
      '수집 환경 다양성 (조명·날씨·장소 등)',
      '인구통계 대표성 확보',
      '도메인 변이 커버리지',
    ],
  },
  semanticAccuracy: {
    label: '의미 정확성',
    shortLabel: '의미',
    color: '#ec4899',
    description: '레이블·태그·값이 실제 의미를 정확히 반영하는가',
    stage: ['annotation'],
    legacyArea: 'accuracy',
    checkPoints: [
      '어노테이션 정확도(IAA ≥ 0.8)',
      '레이블 정의 일관성 유지',
      '전문가 검수 통과율',
      '오레이블 수정 이력 관리',
    ],
  },
  syntacticAccuracy: {
    label: '구문 정확성',
    shortLabel: '구문',
    color: '#06b6d4',
    description: '데이터 형식·범위·타입 등 구조적 정확성이 충족되는가',
    stage: ['cleansing', 'annotation'],
    legacyArea: 'accuracy',
    checkPoints: [
      '값 범위·부호 유효성 검사',
      '데이터 타입 일관성',
      '날짜·시간 포맷 표준화',
      '인코딩 오류 없음',
    ],
  },
  algorithmicAdequacy: {
    label: '알고리즘 적정성',
    shortLabel: '알고리즘',
    color: '#f97316',
    description: '학습 알고리즘과 데이터 특성 간 적합성이 검증되었는가',
    stage: ['validation'],
    checkPoints: [
      '훈련/검증/테스트 분할 적정성',
      '클래스 불균형 처리 여부',
      '데이터 증강 적정성',
      '학습 곡선 안정성 확인',
    ],
  },
  validity: {
    label: '유효성',
    shortLabel: '유효',
    color: '#84cc16',
    description: '데이터 전체가 목적에 맞게 유효하고 신뢰할 수 있는가',
    stage: ['validation'],
    legacyArea: 'consistency',
    checkPoints: [
      '종합 품질 점수 기준치 충족',
      '교차 검증 통과',
      '이상값 처리 완료',
      '최종 품질 승인 완료',
    ],
  },
}

// ─── 4단계 데이터 생애주기 ────────────────────────────────────────────────

export type DataLifecycleStage = 'acquisition' | 'cleansing' | 'annotation' | 'validation'

export interface DataLifecycleStageMeta {
  label: string
  description: string
  color: string
  icon: string
  activities: string[]
}

export const DATA_LIFECYCLE_STAGES: Record<DataLifecycleStage, DataLifecycleStageMeta> = {
  acquisition: {
    label: '데이터 획득·수집',
    description: '원천 데이터 수집 계획 수립 및 실행',
    color: '#3b82f6',
    icon: '📥',
    activities: ['수집 계획 수립', '원천 데이터 확보', '초기 형식 변환', '수집 완료 확인'],
  },
  cleansing: {
    label: '데이터 정제',
    description: '결측치 처리, 오류 수정, 표준화',
    color: '#10b981',
    icon: '🔧',
    activities: ['결측치·이상치 제거', '형식 표준화', '중복 제거', '정제 품질 검증'],
  },
  annotation: {
    label: '데이터 가공·어노테이션',
    description: '레이블링, 태깅, 가공 처리',
    color: '#f59e0b',
    icon: '🏷️',
    activities: ['어노테이션 지침 수립', '레이블링 작업', '검수·수정', '가공 품질 확인'],
  },
  validation: {
    label: '학습 데이터 검증',
    description: '최종 품질 검증 및 승인',
    color: '#8b5cf6',
    icon: '✅',
    activities: ['통계적 품질 검사', '알고리즘 적합성 검증', '최종 승인', '데이터셋 배포'],
  },
}

// ─── 1-Cycle 자가점검 ──────────────────────────────────────────────────────

export type CyclePhase = 'sample' | 'initial' | 'midterm' | 'supplement' | 'final'

export interface CycleCheckpoint {
  phase: CyclePhase
  label: string
  progress: string   // 수집 진행률
  description: string
  items: CycleCheckItem[]
}

export interface CycleCheckItem {
  id: string
  characteristic: NIACharacteristic
  text: string
  required: boolean
}

export const ONE_CYCLE_CHECKPOINTS: CycleCheckpoint[] = [
  {
    phase: 'sample',
    label: '샘플 점검',
    progress: '착수',
    description: '수집 착수 전 샘플 데이터로 품질 기준·수집 환경 적합성 확인',
    items: [
      { id: 'sc-1', characteristic: 'readiness', text: '수집 계획서 및 품질 기준 확정', required: true },
      { id: 'sc-2', characteristic: 'readiness', text: '수집 환경·장비 사전 점검', required: true },
      { id: 'sc-3', characteristic: 'diversity', text: '샘플 클래스 분포 적정성 확인', required: true },
      { id: 'sc-4', characteristic: 'syntacticAccuracy', text: '데이터 형식·타입 기준 적합성', required: false },
    ],
  },
  {
    phase: 'initial',
    label: '초기 점검',
    progress: '5~10%',
    description: '수집량 5~10% 시점에 조기 품질 이슈 발견 및 수집 방향 조정',
    items: [
      { id: 'ic-1', characteristic: 'completeness', text: '결측·누락 비율 기준 충족 여부', required: true },
      { id: 'ic-2', characteristic: 'diversity', text: '클래스 불균형 조기 감지', required: true },
      { id: 'ic-3', characteristic: 'syntacticAccuracy', text: '값 범위·부호 이상 여부', required: true },
      { id: 'ic-4', characteristic: 'standardConformance', text: '코드·용어 표준 준수 여부', required: false },
    ],
  },
  {
    phase: 'midterm',
    label: '중간 점검',
    progress: '30%',
    description: '수집량 30% 시점에 전반적 품질 현황 점검 및 보완 조치',
    items: [
      { id: 'mc-1', characteristic: 'completeness', text: '누적 결측 비율 허용 범위 이내', required: true },
      { id: 'mc-2', characteristic: 'semanticAccuracy', text: '어노테이션 정확도(IAA) 측정', required: true },
      { id: 'mc-3', characteristic: 'diversity', text: '수집 환경 다양성 현황 점검', required: true },
      { id: 'mc-4', characteristic: 'usefulness', text: '데이터 활용 적합성 재확인', required: false },
      { id: 'mc-5', characteristic: 'standardConformance', text: '메타데이터 기준 준수 여부', required: false },
    ],
  },
  {
    phase: 'supplement',
    label: '보완 점검',
    progress: '50%',
    description: '수집량 50% 시점, 중간 점검 지적 사항 보완 완료 확인',
    items: [
      { id: 'sp-1', characteristic: 'completeness', text: '중간 점검 결측 보완 완료', required: true },
      { id: 'sp-2', characteristic: 'semanticAccuracy', text: '오레이블 수정 및 재검수 완료', required: true },
      { id: 'sp-3', characteristic: 'diversity', text: '불균형 클래스 추가 수집 완료', required: false },
      { id: 'sp-4', characteristic: 'standardConformance', text: '코드·메타데이터 정비 완료', required: false },
    ],
  },
  {
    phase: 'final',
    label: '최종 점검',
    progress: '100%',
    description: '전체 데이터 최종 품질 검증 및 승인',
    items: [
      { id: 'fc-1', characteristic: 'completeness', text: '전체 결측 비율 최종 검증', required: true },
      { id: 'fc-2', characteristic: 'semanticAccuracy', text: '최종 어노테이션 정확도 확인', required: true },
      { id: 'fc-3', characteristic: 'validity', text: '종합 품질 점수 기준 충족', required: true },
      { id: 'fc-4', characteristic: 'algorithmicAdequacy', text: '학습 데이터 분할 적정성', required: true },
      { id: 'fc-5', characteristic: 'validity', text: '품질 검증 기관 최종 승인', required: true },
      { id: 'fc-6', characteristic: 'standardConformance', text: '최종 메타데이터 정합성 확인', required: false },
    ],
  },
]

// ─── NIA 특성 → 기존 영역 역매핑 ─────────────────────────────────────────

export function getCharacteristicsByLegacyArea(area: string): NIACharacteristic[] {
  return (Object.keys(NIA_CHARACTERISTICS) as NIACharacteristic[]).filter(
    k => NIA_CHARACTERISTICS[k].legacyArea === area
  )
}

export function getNIACharacteristicsForStage(stage: DataLifecycleStage): NIACharacteristic[] {
  return (Object.keys(NIA_CHARACTERISTICS) as NIACharacteristic[]).filter(
    k => NIA_CHARACTERISTICS[k].stage.includes(stage)
  )
}

export function getStakeholderRole(phase: CyclePhase): string {
  const roles: Record<CyclePhase, string> = {
    sample: '사업수행기관',
    initial: '사업수행기관',
    midterm: '사업수행기관 + 품질검증기관',
    supplement: '사업수행기관',
    final: '품질검증기관(제3자 검증)',
  }
  return roles[phase]
}
