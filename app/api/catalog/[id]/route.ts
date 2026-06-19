import { createClient } from '@/lib/supabase/server'
import { jsonError, jsonOk } from '@/lib/api'
import { isQualityContract } from '@/lib/quality-contract'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return jsonError('Unauthorized', 401)
  }

  const { data, error } = await supabase
    .from('catalog')
    .select('*')
    .eq('dataset_id', id)
    .maybeSingle()

  if (error) {
    return jsonError(error.message, 500)
  }
  if (!data) {
    return jsonError('데이터셋을 찾을 수 없습니다', 404)
  }

  return jsonOk(data)
}

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return jsonError('Unauthorized', 401)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return jsonError('요청 본문이 없습니다', 400)

  const updates: Record<string, unknown> = {}

  if ('quality_contract' in body) {
    if (body.quality_contract !== null && !isQualityContract(body.quality_contract)) {
      return jsonError('quality_contract 형식이 올바르지 않습니다', 400)
    }
    updates.quality_contract = body.quality_contract
  }

  if ('title' in body && typeof body.title === 'string' && body.title.trim()) {
    updates.title = body.title.trim()
  }
  if ('description' in body && (typeof body.description === 'string' || body.description === null)) {
    updates.description = body.description
  }
  if ('keywords' in body && (typeof body.keywords === 'string' || body.keywords === null)) {
    updates.keywords = body.keywords
  }
  if ('theme' in body && (typeof body.theme === 'string' || body.theme === null)) {
    updates.theme = body.theme
  }

  if (Object.keys(updates).length === 0) return jsonError('업데이트할 필드가 없습니다', 400)

  const { data, error } = await supabase
    .from('catalog')
    .update(updates)
    .eq('dataset_id', id)
    .select()
    .maybeSingle()

  if (error) return jsonError(error.message, 500)
  if (!data) return jsonError('데이터셋을 찾을 수 없습니다', 404)

  return jsonOk(data)
}
