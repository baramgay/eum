export const runtime = 'nodejs'

import { withApiKey } from '@/lib/openapi'

export async function GET(req: Request) {
  return withApiKey(req, async ({ sb }) => {
    const url = new URL(req.url)
    const page    = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10))
    const perPage = Math.min(100, Math.max(1, parseInt(url.searchParams.get('per_page') ?? '20', 10)))
    const from = (page - 1) * perPage
    const to   = from + perPage - 1

    const { data, count, error } = await sb
      .from('catalog')
      .select('dataset_id, tenant_id, title, description, theme, keywords, license, format, rows, updated_at, layer', { count: 'exact' })
      .eq('is_open', true)
      .order('updated_at', { ascending: false })
      .range(from, to)

    if (error) {
      return Response.json({ error: '데이터셋 목록 조회 실패' }, { status: 500 })
    }

    return Response.json({
      data: data ?? [],
      meta: {
        page,
        per_page: perPage,
        total: count ?? 0,
        total_pages: Math.ceil((count ?? 0) / perPage),
      },
    })
  })
}
