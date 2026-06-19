import { createClient } from '@/lib/supabase/server'
import { jsonError, jsonOk } from '@/lib/api'
import { chatCompletion } from '@/lib/ai/provider'

type Params = { params: Promise<{ id: string }> }

interface SuggestMetaResponse {
  title: string
  description: string
  category: string
  keywords: string[]
}

function extractJson(raw: string): SuggestMetaResponse {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  const text = fenced ? fenced[1] : raw
  const parsed = JSON.parse(text.trim())
  if (
    typeof parsed.title !== 'string' ||
    typeof parsed.description !== 'string' ||
    typeof parsed.category !== 'string' ||
    !Array.isArray(parsed.keywords)
  ) {
    throw new Error('응답 JSON 구조가 올바르지 않습니다')
  }
  return {
    title: parsed.title,
    description: parsed.description,
    category: parsed.category,
    keywords: (parsed.keywords as unknown[]).map(k => String(k)),
  }
}

export async function POST(_req: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return jsonError('Unauthorized', 401)

  const { data: catalog, error: catErr } = await supabase
    .from('catalog')
    .select('table_name, title')
    .eq('dataset_id', id)
    .maybeSingle()

  if (catErr || !catalog) return jsonError('데이터셋을 찾을 수 없습니다', 404)

  const tableName: string | null = catalog.table_name ?? null

  let columns: string[] = []
  let sample: Record<string, unknown>[] = []

  if (tableName) {
    const { data: rows, error: rowErr } = await supabase
      .from(tableName)
      .select('*')
      .limit(3)

    if (!rowErr && rows && rows.length > 0) {
      columns = Object.keys(rows[0])
      sample = rows as Record<string, unknown>[]
    }
  }

  if (columns.length === 0) {
    const { data: upload } = await supabase
      .from('submission_uploads')
      .select('preview')
      .eq('table_name', tableName ?? '')
      .maybeSingle()

    const preview = ((upload?.preview ?? []) as unknown[]).filter(
      (r): r is Record<string, unknown> => typeof r === 'object' && r !== null,
    )

    if (preview.length > 0) {
      columns = Object.keys(preview[0])
      sample = preview.slice(0, 3)
    }
  }

  if (columns.length === 0) {
    return jsonError('미리보기 데이터가 없어 메타데이터를 제안할 수 없습니다', 422)
  }

  const sampleText = sample
    .map((row, i) => `행${i + 1}: ${JSON.stringify(row)}`)
    .join('\n')

  const prompt = `다음 데이터셋의 컬럼과 샘플을 보고 title, description(2문장), category, keywords(3개)를 한국어로 제안해줘.
컬럼: ${columns.join(', ')}
샘플:
${sampleText}
JSON 형식으로만 응답. 예시: {"title":"...","description":"...","category":"...","keywords":["...","...","..."]}`

  let result: SuggestMetaResponse
  try {
    const llmResult = await chatCompletion({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 512,
      temperature: 0.3,
      userId: user.id,
    })
    result = extractJson(llmResult.content)
  } catch (e) {
    return jsonError(`AI 제안 실패: ${e instanceof Error ? e.message : String(e)}`, 502)
  }

  return jsonOk(result)
}
