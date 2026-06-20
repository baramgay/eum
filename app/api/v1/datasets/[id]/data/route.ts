export const runtime = 'nodejs'

import { withApiKey, scopeAllows, toCsv } from '@/lib/openapi'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  return withApiKey(req, async ({ sb, auth }) => {
    // 카탈로그에서 table_name 조회
    const { data: cat, error: catErr } = await sb
      .from('catalog')
      .select('table_name, format, title')
      .eq('dataset_id', id)
      .eq('is_open', true)
      .maybeSingle()

    if (catErr) {
      return Response.json({ error: '데이터셋 조회 실패' }, { status: 500 })
    }
    if (!cat) {
      return Response.json({ error: '데이터셋을 찾을 수 없습니다' }, { status: 404 })
    }
    if (!scopeAllows(auth.scope!, id)) {
      return Response.json({ error: '이 데이터셋에 대한 접근 권한이 없습니다' }, { status: 403 })
    }

    const url = new URL(req.url)
    const format  = (url.searchParams.get('format') ?? cat.format ?? 'json').toLowerCase()
    const limit   = Math.min(10000, Math.max(1, parseInt(url.searchParams.get('limit') ?? '1000', 10)))
    const offset  = Math.max(0, parseInt(url.searchParams.get('offset') ?? '0', 10))

    // 동적 테이블 조회
    const { data: rows, error: rowErr } = await sb
      .from(cat.table_name)
      .select('*')
      .range(offset, offset + limit - 1)

    if (rowErr) {
      return Response.json({ error: '데이터 조회 실패', detail: rowErr.message }, { status: 500 })
    }

    const safeRows = (rows ?? []) as Record<string, unknown>[]

    if (format === 'csv') {
      return new Response(toCsv(safeRows), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${id}.csv"`,
        },
      })
    }

    return Response.json({
      dataset_id: id,
      title: cat.title,
      count: safeRows.length,
      offset,
      data: safeRows,
    })
  })
}
