import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  computeColumnStat,
  correlationMatrix,
  detectDateColumn,
  resolveSourceKind,
  type DatasetStats,
} from '@/lib/utilization'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()

  // 카탈로그 조회
  const { data: catalog, error: catErr } = await supabase
    .from('catalog')
    .select('table_name, layer, rows')
    .eq('dataset_id', id)
    .maybeSingle()

  if (catErr || !catalog) {
    return NextResponse.json({ error: '데이터셋을 찾을 수 없습니다.' }, { status: 404 })
  }

  const { table_name: tableName, rows: catalogRows } = catalog
  const kind = resolveSourceKind(tableName)

  let rawRows: Record<string, unknown>[] = []
  let sampled = false
  let colDefs: { column_name: string; data_type: string }[] = []

  if (kind === 'gold') {
    // 컬럼 정보 조회
    const { data: cols } = await supabase.rpc('get_table_columns', { tbl_name: tableName })
    colDefs = (cols ?? []) as { column_name: string; data_type: string }[]

    // 데이터 로드
    const rowCount = catalogRows ?? 0
    if (rowCount > 50000) {
      const { data } = await supabase.from(tableName as string).select('*').range(0, 49999)
      rawRows = (data ?? []) as Record<string, unknown>[]
      sampled = true
    } else {
      const { data } = await supabase.from(tableName as string).select('*')
      rawRows = (data ?? []) as Record<string, unknown>[]
    }
  } else {
    // upload: submission_uploads.preview + schema_info
    const { data: upload } = await supabase
      .from('submission_uploads')
      .select('preview, schema_info')
      .eq('table_name', tableName)
      .maybeSingle()

    const preview = ((upload?.preview ?? []) as unknown[]).filter(
      (r): r is Record<string, unknown> => typeof r === 'object' && r !== null,
    )
    rawRows = preview

    const schemaInfo = upload?.schema_info
    if (Array.isArray(schemaInfo)) {
      colDefs = (schemaInfo as { column_name: string; data_type: string }[])
    }
  }

  // 컬럼 목록 결정 (RPC 결과 또는 데이터 키)
  const columnNames =
    colDefs.length > 0
      ? colDefs.map(c => c.column_name)
      : rawRows.length > 0
        ? Object.keys(rawRows[0])
        : []

  // 각 컬럼 통계 계산
  const columns = columnNames.map(colName => {
    const values = rawRows.map(r => r[colName])
    return computeColumnStat(colName, values)
  })

  // 날짜 컬럼 감지
  const dateColumn = detectDateColumn(columns, rawRows)

  // 시계열 생성
  let timeseries: DatasetStats['timeseries']
  if (dateColumn) {
    const tsMap = new Map<string, number>()
    for (const r of rawRows) {
      const val = r[dateColumn]
      if (val == null) continue
      const key = String(val).slice(0, 7) // YYYY-MM 단위
      tsMap.set(key, (tsMap.get(key) ?? 0) + 1)
    }
    timeseries = Array.from(tsMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([t, count]) => ({ t, count }))
  }

  // 상관 행렬 (숫자 컬럼 <= 10개일 때만)
  let correlation: DatasetStats['correlation']
  const numCols = columns.filter(c => c.type === 'number')
  if (numCols.length >= 2 && numCols.length <= 10) {
    const colVecs = numCols.map(col => ({
      name: col.name,
      values: rawRows.map(r => Number(r[col.name])).filter(n => !isNaN(n)),
    }))
    correlation = {
      cols: colVecs.map(c => c.name),
      matrix: correlationMatrix(colVecs),
    }
  }

  const result: DatasetStats = {
    datasetId: id,
    source: kind === 'gold' ? 'gold' : 'upload',
    rowCount: rawRows.length,
    sampled,
    columns,
    dateColumn,
    timeseries,
    correlation,
  }

  return NextResponse.json(result, {
    headers: { 'Cache-Control': 's-maxage=300' },
  })
}
