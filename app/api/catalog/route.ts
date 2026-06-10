import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const ALLOWED_SORTS = new Set(['high_value', 'updated_at', 'rows', 'title'])

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q    = searchParams.get('q') ?? ''
  const sort = searchParams.get('sort') ?? 'high_value'
  const sortCol = ALLOWED_SORTS.has(sort) ? sort : 'high_value'

  const supabase = await createClient()
  let query = supabase.from('catalog').select('*')
    .order(sortCol, { ascending: sortCol === 'title' })

  if (q) {
    query = query.or(
      `title.ilike.%${q}%,keywords.ilike.%${q}%,description.ilike.%${q}%`
    ) as typeof query
  }
  const { data } = await query
  return NextResponse.json(data ?? [])
}
