/**
 * AI 멀티턴 대화 문맥 상속
 *
 * 이전 사용자 질문과 어시스턴트 응답에서 지역, 의도, 키워드를 상속해
 * 후속 질문(short/ambiguous)이 단일 턴 정보 없이도 의도를 유추합니다.
 */

export type ConversationRole = 'user' | 'assistant'

export interface ConversationTurn {
  role: ConversationRole
  /** 사용자 질문 또는 어시스턴트 요약/응답 텍스트 */
  text?: string
  /** 어시스턴트 응답 의도 (role === 'assistant'일 때) */
  intent?: string | null
  /** 어시스턴트 응답 시군 */
  sigun?: string | null
  /** 적용된 TOP-N */
  topN?: number
  /** 적용된 필터 설명 */
  filterDescription?: string
}

interface SigunMatch {
  name: string
  sgg_cd?: string
}

function normalize(q: string): string {
  return q.replace(/\s/g, '').toLowerCase()
}

function getRecentTexts(context: ConversationTurn[], limit = 2): string {
  return context
    .slice(-limit)
    .map((t) => t.text ?? '')
    .join(' ')
}

/** 현재 질문에 의도 키워드가 명시적으로 있는지 확인 */
export function hasExplicitIntent(q: string): boolean {
  const ql = normalize(q)
  return ['청년', '사업체', '시설', '소득', '정착', '인구', '제조업'].some((k) => ql.includes(k))
}

/**
 * 문맥에서 시군을 역순으로 탐색해 상속합니다.
 * 가장 최근 턴의 시군을 우선합니다.
 */
export function extractInheritedSigun(
  context: ConversationTurn[],
  extractSigun: (q: string) => SigunMatch | null,
): SigunMatch | null {
  for (let i = context.length - 1; i >= 0; i--) {
    const text = context[i].text ?? ''
    const match = extractSigun(text)
    if (match) return match
  }
  return null
}

/**
 * 문맥에서 의도를 상속합니다.
 * 어시스턴트 응답에 명시된 intent가 있으면 우선,
 * 없으면 null을 반환합니다.
 */
export function inferInheritedIntent(context: ConversationTurn[]): string | null {
  for (let i = context.length - 1; i >= 0; i--) {
    const turn = context[i]
    if (turn.role === 'assistant' && turn.intent && turn.intent !== '데이터안내') {
      return turn.intent
    }
  }
  return null
}

/**
 * 의도 키워드가 부족한 후속 질문에 대해,
 * 최근 대화에서 주제 키워드를 추출해 보강합니다.
 *
 * - 어시스턴트 응답의 intent 필드를 우선 반영합니다.
 * - 최근 2턴의 텍스트에서 키워드를 추가로 추출합니다.
 */
export function inferContextualKeywords(q: string, context: ConversationTurn[]): string[] {
  if (context.length === 0 || hasExplicitIntent(q)) return []

  const recent = context.slice(-2)
  const recentText = normalize(getRecentTexts(recent, 2))
  const recentIntents = recent
    .filter((t) => t.role === 'assistant' && t.intent && t.intent !== '데이터안내')
    .map((t) => t.intent as string)

  const extra: string[] = []
  const push = (keyword: string) => {
    if (!extra.includes(keyword)) extra.push(keyword)
  }

  // 의도 필드 기반
  for (const intent of recentIntents) {
    if (intent.includes('사업체') || intent.includes('제조업')) push('사업체')
    if (intent.includes('청년') || intent.includes('인구')) push('청년')
    if (intent.includes('시설')) push('시설')
    if (intent.includes('소득') || intent.includes('신용')) push('소득')
    if (intent.includes('정착')) push('정착')
  }

  // 텍스트 기반
  if (recentText.includes('사업체') || recentText.includes('제조업') || recentText.includes('업체')) push('사업체')
  if (recentText.includes('청년') || recentText.includes('인구') || recentText.includes('유입') || recentText.includes('유출')) {
    push('청년')
  }
  if (recentText.includes('시설') || recentText.includes('청년센터') || recentText.includes('도서관')) push('시설')
  if (recentText.includes('소득') || recentText.includes('신용') || recentText.includes('카드')) push('소득')
  if (recentText.includes('정착') || recentText.includes('잠재')) push('정착')

  return extra
}

/**
 * 현재 질문에 문맥을 적용해 실제로 의도 매칭에 사용할 질문을 만듭니다.
 */
export function buildEffectiveQuestion(
  question: string,
  context: ConversationTurn[],
): { text: string; inheritedIntent: string | null; keywords: string[] } {
  const keywords = inferContextualKeywords(question, context)
  const inheritedIntent = hasExplicitIntent(question) ? null : inferInheritedIntent(context)
  const text = keywords.length > 0 ? `${keywords.join(' ')} ${question}` : question
  return { text, inheritedIntent, keywords }
}

/**
 * 안전하게 문맥 배열을 ConversationTurn[]으로 정규화합니다.
 * 문자열 배열(기존 API)도 하위 호환됩니다.
 */
export function normalizeContext(context: unknown): ConversationTurn[] {
  if (!Array.isArray(context)) return []
  return context
    .map((item): ConversationTurn => {
      if (typeof item === 'string') {
        return { role: 'user', text: item }
      }
      if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>
        return {
          role: obj.role === 'assistant' ? 'assistant' : 'user',
          text: typeof obj.text === 'string' ? obj.text : undefined,
          intent: typeof obj.intent === 'string' || obj.intent === null ? obj.intent : undefined,
          sigun: typeof obj.sigun === 'string' || obj.sigun === null ? obj.sigun : undefined,
          topN: typeof obj.topN === 'number' ? obj.topN : undefined,
          filterDescription: typeof obj.filterDescription === 'string' ? obj.filterDescription : undefined,
        }
      }
      return { role: 'user' }
    })
    .filter((t) => t.text || t.intent || t.sigun)
}
