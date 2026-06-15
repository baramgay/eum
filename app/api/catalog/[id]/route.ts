import { createClient } from '@/lib/supabase/server'
import { jsonError, jsonOk } from '@/lib/api'

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
