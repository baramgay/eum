import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { jsonError, jsonOk } from '@/lib/api'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return jsonError('인증이 필요합니다', 401)
  }

  const { searchParams } = new URL(req.url)
  const label = searchParams.get('label') ?? ''
  const type = searchParams.get('type') ?? ''

  if (!label && !type) {
    return jsonOk([])
  }

  const filters: string[] = []
  if (label) {
    filters.push(`title.ilike.%${label}%`)
    filters.push(`keywords.ilike.%${label}%`)
  }
  if (type) {
    filters.push(`theme.ilike.%${type}%`)
    filters.push(`keywords.ilike.%${type}%`)
  }

  const { data, error } = await supabase
    .from('catalog')
    .select('dataset_id,title,theme,rows,updated_at,is_open,ai_ready')
    .or(filters.join(','))
    .order('updated_at', { ascending: false })
    .limit(10)

  if (error) {
    return jsonError(error.message, 500)
  }

  return jsonOk(data ?? [])
}
