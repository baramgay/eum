import { env } from '@/lib/env'

export interface EmbeddingOptions {
  model?: string
}

/**
 * OpenAI/Qwen 호환 임베딩 API를 호출한다.
 *
 * - EMBEDDING_API_KEY가 없으면 null을 반환하고 키워드 검색 폭로드를 탄다.
 * - API 오류 시에도 null을 반환해 폭로한다.
 */
export async function getEmbedding(
  text: string,
  options: EmbeddingOptions = {},
): Promise<number[] | null> {
  const apiKey = env.EMBEDDING_API_KEY
  const baseUrl = env.EMBEDDING_BASE_URL ?? env.QWEN_BASE_URL
  const model = options.model ?? env.EMBEDDING_MODEL ?? 'text-embedding-v3'

  if (!apiKey || !baseUrl) {
    return null
  }

  const input = text.trim()
  if (!input) return null

  try {
    const res = await fetch(`${baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        input,
        model,
        encoding_format: 'float',
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      // eslint-disable-next-line no-console
      console.error('[embeddings] API 오류:', err)
      return null
    }

    const data = await res.json()
    const vec = data.data?.[0]?.embedding
    if (!Array.isArray(vec) || vec.length === 0) return null
    return vec as number[]
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[embeddings] 예외:', e instanceof Error ? e.message : String(e))
    return null
  }
}
