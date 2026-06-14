#!/usr/bin/env node
/**
 * 샘플 CSV 데이터를 supabase submission_uploads.preview(JSONB)에 적재하고
 * catalog.table_name을 연결한다.
 *
 * 사용법:
 *   node scripts/load-samples-to-catalog.mjs
 *
 * 필요 환경변수:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from '@supabase/supabase-js'
import { readFile, readdir } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!URL || !SERVICE_KEY) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.')
  process.exit(1)
}

const SAMPLES_DIR = join(process.cwd(), 'data', 'samples')

const DATASET_MAP = {
  'traffic_accidents.csv': 'ds-traffic-accident',
  'commercial_area.csv': 'ds-commercial-area',
  'air_quality.csv': 'ds-air-quality',
  'public_hospital.csv': 'ds-public-hospital',
  'school_population.csv': 'ds-school-population',
}

function parseCsvLine(line) {
  const cells = []
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

async function parseCsv(filePath) {
  const text = await readFile(filePath, 'utf-8')
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '')
  if (lines.length < 2) return { headers: [], rows: [] }
  const headers = parseCsvLine(lines[0])
  const rows = []
  for (let idx = 1; idx < lines.length; idx++) {
    const cells = parseCsvLine(lines[idx])
    if (cells.length < headers.length) continue
    const row = {}
    headers.forEach((h, i) => { row[h] = cells[i] ?? '' })
    rows.push(row)
  }
  return { headers, rows }
}

const supabase = createClient(URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function loadFile(fileName) {
  const datasetId = DATASET_MAP[fileName]
  if (!datasetId) {
    console.log(`  ℹ skip: ${fileName} (연결된 dataset_id 없음)`)
    return
  }

  const filePath = join(SAMPLES_DIR, fileName)
  const { headers, rows } = await parseCsv(filePath)
  if (rows.length === 0) {
    console.log(`  ⚠ ${fileName}: 파싱된 행이 없습니다.`)
    return
  }

  const tableName = datasetId
  const schemaInfo = {
    columns: headers.map(name => ({ name, type: 'TEXT' })),
    source: 'sample',
  }

  const uploadId = `upload-${datasetId}`
  const createdAt = new Date().toISOString()

  // submission_uploads 적재
  const { error: upErr } = await supabase
    .from('submission_uploads')
    .upsert({
      upload_id: uploadId,
      table_name: tableName,
      schema_info: schemaInfo,
      preview: rows,
      row_count: rows.length,
      created_at: createdAt,
    }, { onConflict: 'upload_id' })

  if (upErr) {
    console.error(`  ❌ ${fileName} submission_uploads 오류:`, upErr.message)
    return
  }

  // catalog.table_name 연결
  const { error: catErr } = await supabase
    .from('catalog')
    .update({ table_name: tableName, updated_at: createdAt })
    .eq('dataset_id', datasetId)

  if (catErr) {
    console.error(`  ❌ ${fileName} catalog 업데이트 오류:`, catErr.message)
    return
  }

  console.log(`  ✓ ${fileName} → ${datasetId} (${rows.length}행, preview ${rows.length}행)`)
}

async function main() {
  console.log('▶ 샘플 데이터를 catalog/submission_uploads에 적재합니다...')
  const files = (await readdir(SAMPLES_DIR)).filter(f => f.endsWith('.csv'))
  for (const file of files) {
    await loadFile(file)
  }
  console.log('\n✅ 완료!')
}

main().catch(e => {
  console.error('오류:', e)
  process.exit(1)
})
