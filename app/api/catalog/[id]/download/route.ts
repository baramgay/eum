import { createClient } from '@/lib/supabase/server'
import { resolveSourceKind, toCSV } from '@/lib/utilization'

const CHUNK = 1000

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const { searchParams } = new URL(req.url)
  const format = searchParams.get('format') === 'json' ? 'json' : 'csv'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response(JSON.stringify({ error: '인증이 필요합니다.' }), { status: 401 })

  const { data: catalog, error: catErr } = await supabase
    .from('catalog')
    .select('table_name, title, is_open')
    .eq('dataset_id', id)
    .maybeSingle()

  if (catErr || !catalog) {
    return new Response(JSON.stringify({ error: '데이터셋을 찾을 수 없습니다.' }), { status: 404 })
  }

  const { table_name: tableName, title } = catalog
  const kind = resolveSourceKind(tableName)
  const safeTitle = title.replace(/[^\w가-힣\s-]/g, '_').slice(0, 50)

  void supabase.from('usage_log').insert({
    dataset_id: id,
    action: 'download',
    ts: new Date().toISOString(),
  })

  if (kind !== 'gold') {
    // upload: preview JSONB (already bounded, no streaming needed)
    const { data: upload, error: upErr } = await supabase
      .from('submission_uploads')
      .select('preview')
      .eq('table_name', tableName)
      .maybeSingle()
    if (upErr) return new Response(JSON.stringify({ error: upErr.message }), { status: 500 })
    const rows = ((upload?.preview ?? []) as unknown[]).filter(
      (r): r is Record<string, unknown> => typeof r === 'object' && r !== null,
    )
    if (format === 'json') {
      return new Response(JSON.stringify(rows, null, 2), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="${encodeURIComponent(safeTitle)}.json"`,
        },
      })
    }
    const columns = rows.length > 0 ? Object.keys(rows[0]) : []
    return new Response(toCSV(rows, columns), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(safeTitle)}.csv"`,
      },
    })
  }

  // gold table — ReadableStream chunked fetch
  const encoder = new TextEncoder()
  let columns: string[] | null = null
  let offset = 0
  let firstChunk = true

  const stream = new ReadableStream({
    async pull(controller) {
      const { data, error } = await supabase
        .from(tableName as string)
        .select('*')
        .range(offset, offset + CHUNK - 1)

      if (error) {
        controller.error(error)
        return
      }

      const rows = (data ?? []) as Record<string, unknown>[]

      if (format === 'csv') {
        if (firstChunk) {
          columns = rows.length > 0 ? Object.keys(rows[0]) : []
          controller.enqueue(encoder.encode(columns.join(',') + '\r\n'))
          firstChunk = false
        }
        if (rows.length > 0 && columns) {
          const body = rows
            .map(row => columns!.map(c => {
              const v = row[c]
              if (v == null) return ''
              const s = String(v)
              return s.includes(',') || s.includes('"') || s.includes('\n')
                ? `"${s.replace(/"/g, '""')}"`
                : s
            }).join(','))
            .join('\r\n')
          controller.enqueue(encoder.encode(body + '\r\n'))
        }
      } else {
        // NDJSON streaming for JSON
        for (const row of rows) {
          controller.enqueue(encoder.encode(JSON.stringify(row) + '\n'))
        }
      }

      if (rows.length < CHUNK) {
        controller.close()
        return
      }
      offset += CHUNK
    },
  })

  const contentType = format === 'json'
    ? 'application/x-ndjson; charset=utf-8'
    : 'text/csv; charset=utf-8'
  const ext = format === 'json' ? 'ndjson' : 'csv'

  return new Response(stream, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(safeTitle)}.${ext}"`,
      'Transfer-Encoding': 'chunked',
    },
  })
}
