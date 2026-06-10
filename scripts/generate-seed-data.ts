/**
 * 경남 18개 시군 골드 데이터 시드 SQL 생성기
 * 실행: npx ts-node --project tsconfig.json scripts/generate-seed-data.ts
 */
import { writeFileSync } from 'fs'

const SIGUN: [string, string, number][] = [
  ['48121','창원시',100], ['48170','진주시',34],  ['48220','통영시',12],
  ['48240','사천시',11],  ['48250','김해시',53],  ['48270','밀양시',10],
  ['48310','거제시',24],  ['48330','양산시',35],  ['48720','의령군',3],
  ['48730','함안군',6],   ['48740','창녕군',6],   ['48820','고성군',5],
  ['48840','남해군',4],   ['48850','하동군',4],   ['48860','산청군',3],
  ['48870','함양군',4],   ['48880','거창군',6],   ['48890','합천군',4],
]

const YEARS = [2022, 2023, 2024, 2025]
const AGES  = ['20-24', '25-29', '30-34', '35-39']
const INDUSTRIES = ['제조','도소매','숙박음식','건설','정보통신','농림어업','보건복지']
const FTYPES = ['도서관','체육관','보건소','청년센터','복지관','문화시설']

// 재현 가능한 의사난수 (seed=48)
let _seed = 48
function rng(): number {
  _seed = (_seed * 1664525 + 1013904223) & 0xffffffff
  return ((_seed >>> 0) / 0xffffffff)
}
function rnd(a: number, b: number) { return a + rng() * (b - a) }
function int(n: number) { return Math.floor(n) }

const youthRows: string[] = []
const bizRows: string[] = []
const facRows: string[] = []
let facId = 0

for (const [cd, name, w] of SIGUN) {
  const base = w * 1000
  for (const y of YEARS) {
    const decline = 1 - 0.04 * (y - 2022)
    for (const age of AGES) {
      for (const sex of ['M', 'F']) {
        const pop = int(base * decline * rnd(0.08, 0.16))
        const inf = int(pop * rnd(0.05, 0.18))
        const out = int(pop * rnd(0.07, 0.22))
        youthRows.push(`('${cd}','${name}',${y},'${age}','${sex}',${pop},${inf},${out})`)
      }
    }
    for (const ind of INDUSTRIES) {
      const bc  = int(w * 30 * rnd(0.5, 1.5))
      const emp = int(bc * rnd(3, 12))
      bizRows.push(`('${cd}','${name}',${y},'${ind}',${bc},${emp})`)
    }
  }
  const n = Math.max(5, int(w / 3))
  for (let i = 0; i < n; i++) {
    facId++
    const ft  = FTYPES[int(rnd(0, FTYPES.length))]
    const useNull = rng() < 0.05
    const lon = useNull ? 'NULL' : (128.0 + rnd(-0.6, 0.9)).toFixed(6)
    const lat = useNull ? 'NULL' : (35.2  + rnd(-0.5, 0.6)).toFixed(6)
    const cap = [50, 100, 200, 300, 0][int(rnd(0, 5))]
    facRows.push(`('FAC${String(facId).padStart(5,'0')}','${cd}','${name}','${ft}','${name} ${ft}',${lon},${lat},${cap})`)
  }
}

const CHUNK = 500
function chunked(rows: string[], table: string, cols: string): string {
  const parts: string[] = []
  for (let i = 0; i < rows.length; i += CHUNK) {
    parts.push(`INSERT INTO ${table} VALUES\n${rows.slice(i, i + CHUNK).join(',\n')};`)
  }
  return parts.join('\n')
}

const sql = [
  chunked(youthRows, 'gold_youth_population', ''),
  chunked(bizRows,   'gold_business', ''),
  chunked(facRows,   'gold_public_facility', ''),
].join('\n\n')

writeFileSync('supabase/seed-gold.sql', sql, 'utf8')
console.log(`생성 완료 — youth: ${youthRows.length}행, biz: ${bizRows.length}행, fac: ${facRows.length}행`)
console.log('출력: supabase/seed-gold.sql')
