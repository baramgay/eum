/**
 * AI 안전 레이어: 민감정보 마스킹, 프롬프트 인젝션 탐지, 유해 출력 검사.
 */

const RRN_PATTERN = /\b\d{6}[-]?\d{7}\b/g
const CARD_PATTERN = /\b(?:\d{4}[-\s]?){3}\d{4}\b/g
const ACCOUNT_PATTERN = /\b\d{10,16}\b/g
const PASSWORD_PATTERN = /\b(?:password|passwd|비밀번호)[:\s]*[^\s]{4,}\b/gi
const API_KEY_PATTERN = /\b(?:api[_-]?key|secret[_-]?key|private[_-]?key|access[_-]?token)[:\s]*[a-zA-Z0-9_\-]{8,}\b/gi

const INJECTION_SIGNATURES = [
  /ignore\s+(?:previous|earlier|above|the\s+above)/i,
  /ignore\s+all\s+(?:previous|prior|above)/i,
  /system\s+(?:override|prompt|instruction)/i,
  /\bDAN\b/i,
  /do\s+anything\s+now/i,
  /you\s+are\s+(?:now\s+)?(?:free|unrestricted)/i,
  /forget\s+(?:previous|prior|everything)/i,
  /disregard\s+(?:previous|instructions)/i,
  /(?:다음|이전)\s+(?:지시|명령|프롬프트)\s*(?:무시|잊어)/i,
  /시스템\s*(?:프롬프트|명령|지시)\s*(?:무시|덮어쓰기|변경)/i,
  /\b jailbreak \b/i,
  /\b bypass \b/i,
]

const TOXIC_WORDS = new Set([
  '씨발', '좆', '개새끼', '개소리', '병신', '지랄', '염병', '미친', '씹', '좆같', '꺼져', '뒤져', '씨팔', '개같', '좆까', '시발', '씨바',
  'fuck', 'shit', 'bitch', 'damn', 'asshole', 'bastard', 'cunt', 'dick',
])

/**
 * 텍스트에 포함된 민감정보를 마스킹한다.
 */
export function redactSensitive(text: string): string {
  return text
    .replace(RRN_PATTERN, '[RRN_REDACTED]')
    .replace(CARD_PATTERN, '[CARD_REDACTED]')
    .replace(ACCOUNT_PATTERN, '[ACCOUNT_REDACTED]')
    .replace(PASSWORD_PATTERN, '[PASSWORD_REDACTED]')
    .replace(API_KEY_PATTERN, '[APIKEY_REDACTED]')
}

/**
 * 프롬프트 인젝션 시그니처가 포함되어 있는지 검사한다.
 */
export function detectPromptInjection(text: string): boolean {
  return INJECTION_SIGNATURES.some((p) => p.test(text))
}

/**
 * 한국어/영어 욕설 등 유해 출력이 포함되어 있는지 검사한다.
 * 단어 경계(\b)가 한글에서 제대로 동작하지 않으므로 토큰화 후 집합 비교 및 부분 문자열 일치를 사용한다.
 */
export function containsToxicOutput(text: string): boolean {
  const tokens = text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  const toxicList = Array.from(TOXIC_WORDS)
  return tokens.some((t) => TOXIC_WORDS.has(t) || toxicList.some((w) => t.includes(w)))
}

/**
 * LLM 입력 전처리: 민감정보 마스킹 + 인젝션 플래그.
 */
export function sanitizeForLlm(input: string): { sanitized: string; injection: boolean } {
  const sanitized = redactSensitive(input)
  const injection = detectPromptInjection(sanitized)
  return { sanitized, injection }
}

/**
 * LLM 출력 후처리: 민감정보 마스킹 + 유해 내용 플래그.
 */
export function sanitizeOutput(output: string): { sanitized: string; toxic: boolean } {
  const sanitized = redactSensitive(output)
  const toxic = containsToxicOutput(sanitized)
  return { sanitized, toxic }
}
