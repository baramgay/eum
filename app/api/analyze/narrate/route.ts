import { createClient } from '@/lib/supabase/server'
import { jsonError, jsonOk } from '@/lib/api'
import { chatCompletion } from '@/lib/ai/provider'

export const runtime = 'nodejs'

const TYPE_LABELS: Record<string, string> = {
  descriptive:     '기술통계',
  frequency:       '빈도분석',
  cross:           '교차분석',
  ttest:           't-검정',
  paired_ttest:    '대응 t-검정',
  anova:           '일원분산분석(ANOVA)',
  regression:      '다중회귀분석',
  logistic:        '로지스틱 회귀',
  correlation:     '상관분석',
  pca:             '주성분분석(PCA)',
  cluster:         'K-Means 군집분석',
  timeseries:      '시계열 분해(STL)',
  survival:        '생존분석',
  chi2:            '카이제곱 검정',
  kruskal:         '크러스칼-왈리스 검정',
  manova:          '다변량분산분석(MANOVA)',
  factor:          '요인분석',
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return jsonError('인증이 필요합니다', 401)

  if (!process.env.QWEN_API_KEY) {
    return jsonError('AI 해설 기능이 비활성화되어 있습니다 (QWEN_API_KEY 미설정)', 503)
  }

  const body = await req.json() as {
    analysis_type?: string
    dataset_title?: string
    summary_data?: Record<string, unknown>
  }

  const { analysis_type, dataset_title, summary_data } = body
  if (!analysis_type || !summary_data) {
    return jsonError('analysis_type, summary_data 필드가 필요합니다', 400)
  }

  const typeLabel = TYPE_LABELS[analysis_type] ?? analysis_type
  const datasetContext = dataset_title ? `데이터셋: "${dataset_title}"` : ''

  const prompt = `당신은 공공데이터 통계분석 전문가입니다. 아래 분석 결과를 비전문가도 이해할 수 있게 한국어로 2~3문장으로 설명해주세요.
분석 유형: ${typeLabel}
${datasetContext}
분석 결과 요약:
${JSON.stringify(summary_data, null, 2)}

핵심 수치와 패턴을 포함하고, "이 분석에 따르면" 또는 "분석 결과" 등으로 시작하세요. JSON이나 코드 블록 없이 순수 한국어 문단으로만 답하세요.`

  try {
    const llmResult = await chatCompletion({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 300,
      temperature: 0.4,
      userId: user.id,
    })

    const narration = llmResult.content.trim()
    return jsonOk({ narration })
  } catch (e) {
    return jsonError(`AI 해설 생성 실패: ${e instanceof Error ? e.message : String(e)}`, 502)
  }
}
