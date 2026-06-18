import type { RetrievedSource } from './retriever'

function formatSources(sources: RetrievedSource[]): string {
  if (sources.length === 0) return '\n\n[검색된 컨텍스트 없음]'
  return (
    '\n\n[검색된 컨텍스트]\n' +
    sources
      .map((s, i) => `${i + 1}. [${s.source}] ${s.title}: ${s.snippet}`)
      .join('\n')
  )
}

/**
 * RAG 컨텍스트를 포함한 시스템 프롬프트를 생성한다.
 */
export function buildSystemPrompt(context: RetrievedSource[]): string {
  return (
    '당신은 경남 공공데이터 플랫폼 "이음(EUM)"의 AI 어시스턴트입니다. ' +
    '사용자의 질문에 대해 아래 제공된 컨텍스트(카탈로그/온톨로지 검색 결과)에 근거해 답변해야 합니다.\n' +
    '- 컨텍스트에 포함된 정보만 사용하고, 없는 사실을 지어내지 마세요.\n' +
    '- 답변할 근거가 불충분하거나 불확실하면, 사용자에게 구체적인 질문으로 재확인하세요.\n' +
    '- 수치나 출처를 언급할 때는 컨텍스트의 내용을 우선합니다.\n' +
    '- 가능하면 한국어로 간결하고 명확하게 답변하세요.' +
    formatSources(context)
  )
}
