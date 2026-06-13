import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const q        = req.nextUrl.searchParams.get('q') ?? ''
  const theme    = req.nextUrl.searchParams.get('theme') ?? ''
  const isOpen   = req.nextUrl.searchParams.get('open')
  const aiReady  = req.nextUrl.searchParams.get('ai_ready')
  const page     = parseInt(req.nextUrl.searchParams.get('page') ?? '1', 10)
  const pageSize = 20

  let query = supabase
    .from('catalog')
    .select('*', { count: 'exact' })
    .order('updated_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1)

  if (q.trim()) {
    query = query.textSearch('search_vector', q.trim().split(/\s+/).join(' & '), {
      type: 'plain',
      config: 'simple',
    }) as typeof query
  }
  if (theme)              query = query.eq('theme', theme) as typeof query
  if (isOpen === 'true')  query = query.eq('is_open', true) as typeof query
  if (aiReady === 'true') query = query.eq('ai_ready', true) as typeof query

  const { data, count, error } = await query

  if (error) {
    // search_vector 컬럼이 아직 없는 경우 ilike 폴백
    const { data: fallback } = await supabase
      .from('catalog')
      .select('*')
      .ilike('title', `%${q}%`)
      .order('updated_at', { ascending: false })
      .limit(pageSize)
    return NextResponse.json({
      items: fallback ?? [],
      total: fallback?.length ?? 0,
      page,
      pageSize,
    })
  }

  // 테마 목록 (클라이언트 필터 탭용)
  const { data: themeRows } = await supabase
    .from('catalog')
    .select('theme')
    .not('theme', 'is', null)
  const uniqueThemes = Array.from(
    new Set(
      (themeRows ?? [])
        .map((t: { theme: string | null }) => t.theme)
        .filter((v): v is string => Boolean(v))
    )
  )

  return NextResponse.json({
    items: data ?? [],
    total: count ?? 0,
    page,
    pageSize,
    themes: uniqueThemes,
  })
}
