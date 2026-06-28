import { createClient } from '@supabase/supabase-js'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!URL || !SERVICE_KEY) {
  console.error('필수 환경변수가 누락되었습니다: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const EVAL_QUESTIONS = [
  {
    question: '경남에서 청년 정착 잠재력이 높은 시군은 어디인가요?',
    expected_dataset_ids: ['ds-youth-settlement', 'gold_youth_population'],
    expected_answer_notes: '정착잠재지수 또는 청년인구 관련 데이터셋을 근거로 답변해야 함',
  },
  {
    question: '창원시의 청년 인구 유입 현황을 알려주세요.',
    expected_dataset_ids: ['gold_youth_population'],
    expected_answer_notes: '창원시(시군코드 48121) 청년인구 inflow/outflow 포함',
  },
  {
    question: '경남 지역별 소득 및 신용 현황 데이터는 어디에 있나요?',
    expected_dataset_ids: ['ds-income-credit'],
    expected_answer_notes: '소득·신용 주제의 카탈로그 데이터셋을 안내해야 함',
  },
  {
    question: '김해시 공공시설 위치 정보를 지도에 보여주세요.',
    expected_dataset_ids: ['gold_public_facility'],
    expected_answer_notes: '공공시설 테이블에서 김해시 시설 조회',
  },
  {
    question: '경남 제조업 사업체 수와 종사자 수를 비교해주세요.',
    expected_dataset_ids: ['gold_business'],
    expected_answer_notes: 'gold_business 테이블의 industry=제조업 기준 집계',
  },
  {
    question: '진주시의 청년센터는 몇 개인가요?',
    expected_dataset_ids: ['gold_public_facility', 'ds-youth-center'],
    expected_answer_notes: '진주시 청년센터 시설 개수 또는 관련 데이터셋 안내',
  },
  {
    question: '경남 데이터 포털에서 고등학교 위치 데이터를 찾아주세요.',
    expected_dataset_ids: ['gold_public_facility'],
    expected_answer_notes: '학교/교육시설 관련 데이터셋 또는 시설 정보 안내',
  },
  {
    question: '시군별 청년 인구 순이동 순위를 알려주세요.',
    expected_dataset_ids: ['gold_youth_population'],
    expected_answer_notes: 'inflow-outflow 기준 순이동 순위 계산',
  },
  {
    question: '거제시의 사업체 종사자 현황은 어떻게 되나요?',
    expected_dataset_ids: ['gold_business'],
    expected_answer_notes: '거제시 사업체 및 종사자 수 조회',
  },
  {
    question: '경남 지역 중 청년 정책 우선 지역을 추천해주세요.',
    expected_dataset_ids: ['gold_youth_population', 'gold_business', 'gold_public_facility'],
    expected_answer_notes: '온톨로지 액션 스코어링 또는 다양한 데이터셋 융합 안내',
  },
]

async function seed() {
  console.log('▶ RAG 평가 질문 시드 시작')

  const { data: existing } = await supabase
    .from('rag_evals')
    .select('question')

  const existingSet = new Set((existing ?? []).map((r) => r.question))
  const toInsert = EVAL_QUESTIONS.filter((q) => !existingSet.has(q.question))

  if (toInsert.length === 0) {
    console.log('  모든 평가 질문이 이미 존재합니다.')
    return
  }

  const { error } = await supabase.from('rag_evals').insert(toInsert)
  if (error) {
    console.error('  삽입 오류:', error.message)
    process.exit(1)
  }

  console.log(`  ${toInsert.length}개의 RAG 평가 질문을 추가했습니다.`)
}

seed().catch((e) => {
  console.error(e)
  process.exit(1)
})
