import { createClient } from '@/lib/supabase/server'
import { resolveSourceKind, toCSV } from '@/lib/utilization'
import { readFile } from 'fs/promises'
import { join } from 'path'

const CHUNK = 1000

// 카탈로그에 등록된 샘플 데이터셋은 DB에 preview가 없을 수 있으므로
// 로컬 data/samples/ 파일을 폴백한다. (로컬 개발/데모용)
const SAMPLE_FILE_MAP: Record<string, string> = {
  'ds-traffic-accident': 'data/samples/traffic_accidents.csv',
  'ds-commercial-area': 'data/samples/commercial_area.csv',
  'ds-air-quality': 'data/samples/air_quality.csv',
  'ds-public-hospital': 'data/samples/public_hospital.csv',
  'ds-school-population': 'data/samples/school_population.csv',
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = []
  let i = 0
  let cur = ''
  let inQuote = false
  while (i < line.length) {
    const ch = line[i]
    if (inQuote) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i += 2
          continue
        }
        inQuote = false
      } else {
        cur += ch
      }
    } else {
      if (ch === '"') {
        inQuote = true
      } else if (ch === ',') {
        cells.push(cur)
        cur = ''
      } else {
        cur += ch
      }
    }
    i++
  }
  cells.push(cur)
  return cells
}

async function loadSampleRows(id: string): Promise<Record<string, unknown>[] | null> {
  const relPath = SAMPLE_FILE_MAP[id]
  if (!relPath) return null
  try {
    const fullPath = join(process.cwd(), relPath)
    const text = await readFile(fullPath, 'utf-8')
    const lines = text.split(/\r?\n/).filter(l => l.trim() !== '')
    if (lines.length < 2) return null
    const headers = parseCsvLine(lines[0])
    const rows: Record<string, unknown>[] = []
    for (let idx = 1; idx < lines.length; idx++) {
      const cells = parseCsvLine(lines[idx])
      if (cells.length < headers.length) continue
      const row: Record<string, unknown> = {}
      headers.forEach((h, i) => { row[h] = cells[i] ?? '' })
      rows.push(row)
    }
    return rows
  } catch {
    return null
  }
}

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
    // 1) DB에 preview가 있는 경우 우선 사용
    let rows: Record<string, unknown>[] = []
    if (tableName) {
      const { data: upload, error: upErr } = await supabase
        .from('submission_uploads')
        .select('preview')
        .eq('table_name', tableName)
        .maybeSingle()
      if (upErr) return new Response(JSON.stringify({ error: upErr.message }), { status: 500 })
      rows = ((upload?.preview ?? []) as unknown[]).filter(
        (r): r is Record<string, unknown> => typeof r === 'object' && r !== null,
      )
    }
    // 2) preview가 없거나 table_name이 없으면 로컬 샘플 파일 폴백
    if (rows.length === 0) {
      const sampleRows = await loadSampleRows(id)
      if (sampleRows) rows = sampleRows
    }
    if (rows.length === 0) {
      return new Response(JSON.stringify({ error: '데이터를 불러올 수 없습니다. 업로드된 preview 또는 샘플 파일이 없습니다.' }), { status: 404 })
    }
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
