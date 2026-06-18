# 이음(EUM) Next.js + Supabase 전면 재구성 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** FastAPI+DuckDB+Vanilla JS → Next.js 14 App Router + TypeScript + Supabase + Tailwind + shadcn/ui 전면 재구성

**Architecture:** Next.js App Router(프론트+API Routes), Supabase PostgreSQL(DB+Auth+RLS), 기존 Python 비즈니스 로직 TypeScript 포팅

**Tech Stack:** Next.js 14, TypeScript, Supabase (@supabase/ssr), Tailwind CSS, shadcn/ui, js-yaml, Jest, Playwright

---

## 파일 맵

### 신규 생성
- `package.json` — Next.js 의존성
- `next.config.ts` — Next.js 설정
- `tailwind.config.ts` — Tailwind 설정
- `tsconfig.json` — TypeScript 설정
- `middleware.ts` — Supabase 세션 갱신
- `app/layout.tsx` — 공통 레이아웃
- `app/page.tsx` — / → /dashboard 리다이렉트
- `app/dashboard/page.tsx`
- `app/portal/page.tsx`
- `app/quality/page.tsx`
- `app/ontology/page.tsx`
- `app/ai/page.tsx`
- `app/submission/page.tsx`
- `app/api/catalog/route.ts`
- `app/api/quality/route.ts`
- `app/api/evaluation/route.ts`
- `app/api/ontology/route.ts`
- `app/api/ontology/action/[key]/route.ts`
- `app/api/nlquery/route.ts`
- `app/api/submission/route.ts`
- `app/api/submission/[id]/route.ts`
- `app/api/submission/[id]/decision/route.ts`
- `app/api/submission/[id]/comment/route.ts`
- `app/api/plan/route.ts`
- `app/api/tenants/route.ts`
- `app/api/overview/route.ts`
- `components/layout/Header.tsx`
- `components/layout/Nav.tsx`
- `components/dashboard/StatsCards.tsx`
- `components/dashboard/EvalDonut.tsx`
- `components/portal/CatalogCard.tsx`
- `components/portal/DatasetModal.tsx`
- `components/ontology/OntologyGraph.tsx`
- `components/ontology/ActionPanel.tsx`
- `components/submission/SubmitForm.tsx`
- `components/submission/SubmissionList.tsx`
- `components/submission/ReviewPanel.tsx`
- `lib/supabase/client.ts`
- `lib/supabase/server.ts`
- `lib/quality.ts`
- `lib/evaluation.ts`
- `lib/ontology.ts`
- `lib/nlquery.ts`
- `lib/submission.ts`
- `lib/planning.ts`
- `supabase/migrations/001_initial.sql`
- `supabase/seed.sql`

### 삭제 (Task 9)
- `app/` (Python)
- `run.py`, `requirements.txt`
- `web/`, `data/eum.duckdb`
- `tests/` (pytest)

---

## Task 1: Next.js 프로젝트 초기화

**Files:** `package.json`, `next.config.ts`, `tsconfig.json`, `tailwind.config.ts`

- [ ] Next.js 14 프로젝트 scaffold (기존 파일과 충돌 없이)

```powershell
cd "D:\업무\gd\eum_platform"
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir=no --import-alias="@/*" --yes 2>&1
```

- [ ] 추가 의존성 설치

```powershell
npm install @supabase/supabase-js @supabase/ssr js-yaml
npm install -D @types/js-yaml jest @types/jest jest-environment-jsdom @testing-library/react @testing-library/jest-dom @playwright/test
```

- [ ] `next.config.ts` 확인 및 수정

```ts
// next.config.ts
import type { NextConfig } from 'next'
const config: NextConfig = {
  experimental: { serverActions: { allowedOrigins: ['localhost:3000'] } },
}
export default config
```

- [ ] `.env.local` 생성 (Supabase 키 플레이스홀더)

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
```

- [ ] 커밋
```
git add package.json next.config.ts tsconfig.json tailwind.config.ts .env.local
git commit -m "feat: Next.js 14 + Tailwind + Supabase 프로젝트 초기화"
```

---

## Task 2: Supabase 클라이언트 & 미들웨어

**Files:** `lib/supabase/client.ts`, `lib/supabase/server.ts`, `middleware.ts`

- [ ] `lib/supabase/client.ts` 작성

```ts
// lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] `lib/supabase/server.ts` 작성

```ts
// lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cs) {
          try { cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) }
          catch {}
        },
      },
    }
  )
}

export async function createServiceClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cs) {
          try { cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) }
          catch {}
        },
      },
    }
  )
}
```

- [ ] `middleware.ts` 작성

```ts
// middleware.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cs) {
          cs.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cs.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options))
        },
      },
    }
  )
  await supabase.auth.getUser()
  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

- [ ] 커밋
```
git add lib/ middleware.ts
git commit -m "feat: Supabase 클라이언트 & 미들웨어 설정"
```

---

## Task 3: DB 마이그레이션 SQL (스키마 + RLS)

**Files:** `supabase/migrations/001_initial.sql`

- [ ] `supabase/migrations/001_initial.sql` 작성

```sql
-- supabase/migrations/001_initial.sql

-- tenants
CREATE TABLE IF NOT EXISTS tenants (
  tenant_id  TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  gov_type   TEXT,
  sgg_cd     TEXT,
  onboarded  BOOLEAN DEFAULT false
);

-- catalog (DCAT)
CREATE TABLE IF NOT EXISTS catalog (
  dataset_id  TEXT PRIMARY KEY,
  tenant_id   TEXT,
  title       TEXT,
  description TEXT,
  theme       TEXT,
  keywords    TEXT,
  layer       TEXT,
  table_name  TEXT,
  rows        BIGINT,
  is_open     BOOLEAN DEFAULT false,
  ai_ready    BOOLEAN DEFAULT false,
  high_value  BOOLEAN DEFAULT false,
  updated_at  TEXT,
  license     TEXT,
  format      TEXT
);

-- quality_results
CREATE TABLE IF NOT EXISTS quality_results (
  dataset_id  TEXT,
  rule_count  INTEGER,
  checked     BIGINT,
  errors      BIGINT,
  error_rate  DOUBLE PRECISION,
  passed      BOOLEAN,
  detail      JSONB,
  ran_at      TEXT
);

-- onto_objects
CREATE TABLE IF NOT EXISTS onto_objects (
  obj_id   TEXT PRIMARY KEY,
  obj_type TEXT,
  label    TEXT,
  props    TEXT
);

-- onto_links
CREATE TABLE IF NOT EXISTS onto_links (
  src    TEXT,
  rel    TEXT,
  dst    TEXT,
  weight DOUBLE PRECISION
);

-- usage_log
CREATE TABLE IF NOT EXISTS usage_log (
  dataset_id TEXT,
  action     TEXT,
  ts         TEXT
);

-- submissions
CREATE TABLE IF NOT EXISTS submissions (
  submission_id  TEXT PRIMARY KEY,
  tenant_id      TEXT,
  title          TEXT,
  description    TEXT,
  theme          TEXT,
  keywords       TEXT,
  license        TEXT,
  format         TEXT,
  table_name     TEXT,
  rows           BIGINT,
  status         TEXT DEFAULT 'submitted',
  quality_summary TEXT,
  decision_note  TEXT,
  submitted_at   TEXT,
  decided_at     TEXT
);

-- consultant_comments
CREATE TABLE IF NOT EXISTS consultant_comments (
  comment_id    TEXT PRIMARY KEY,
  submission_id TEXT,
  comment       TEXT,
  created_at    TEXT
);

-- submission_uploads: CSV 업로드 데이터 저장 (DuckDB 동적 테이블 대체)
CREATE TABLE IF NOT EXISTS submission_uploads (
  upload_id   TEXT PRIMARY KEY,
  table_name  TEXT UNIQUE,
  schema_info JSONB,
  preview     JSONB,
  row_count   BIGINT,
  created_at  TEXT
);

-- gold tables
CREATE TABLE IF NOT EXISTS gold_youth_population (
  sgg_cd   TEXT, sigun TEXT, year INT,
  age_band TEXT, sex TEXT,
  population INT, inflow INT, outflow INT
);

CREATE TABLE IF NOT EXISTS gold_business (
  sgg_cd TEXT, sigun TEXT, year INT,
  industry TEXT, biz_count INT, employees INT
);

CREATE TABLE IF NOT EXISTS gold_public_facility (
  facility_id TEXT PRIMARY KEY,
  sgg_cd TEXT, sigun TEXT, ftype TEXT,
  name TEXT, lon DOUBLE PRECISION,
  lat DOUBLE PRECISION, capacity INT
);

-- RLS 활성화
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultant_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- RLS 정책: catalog / tenants 공개 읽기
CREATE POLICY "catalog_public_read" ON catalog FOR SELECT USING (true);
CREATE POLICY "tenants_public_read" ON tenants FOR SELECT USING (true);

-- RLS 정책: submissions — agency는 자기 tenant_id만
CREATE POLICY "submissions_select" ON submissions FOR SELECT USING (
  (auth.jwt() ->> 'role') = 'center'
  OR (
    (auth.jwt() ->> 'role') = 'agency'
    AND tenant_id = (auth.jwt() ->> 'tenant_id')
  )
);
CREATE POLICY "submissions_insert" ON submissions FOR INSERT WITH CHECK (
  (auth.jwt() ->> 'role') = 'center'
  OR tenant_id = (auth.jwt() ->> 'tenant_id')
);
CREATE POLICY "submissions_update" ON submissions FOR UPDATE USING (
  (auth.jwt() ->> 'role') = 'center'
);

-- RLS 정책: comments — center만 insert
CREATE POLICY "comments_select" ON consultant_comments FOR SELECT USING (true);
CREATE POLICY "comments_insert" ON consultant_comments FOR INSERT WITH CHECK (
  (auth.jwt() ->> 'role') = 'center'
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_submissions_tenant ON submissions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_gyp_year ON gold_youth_population(year);
CREATE INDEX IF NOT EXISTS idx_gb_year ON gold_business(year);
CREATE INDEX IF NOT EXISTS idx_gpf_ftype ON gold_public_facility(ftype);
```

- [ ] 커밋
```
git add supabase/migrations/001_initial.sql
git commit -m "feat(db): Supabase 마이그레이션 스키마 + RLS 정책"
```

---

## Task 4: 시드 데이터 SQL

**Files:** `supabase/seed.sql`

- [ ] `supabase/seed.sql` 작성 (경남 18개 시군 + 골드 데이터 INSERT)

```sql
-- supabase/seed.sql
-- 경남 18개 시군 tenants
INSERT INTO tenants VALUES
  ('48121','창원시','시','48121',true),
  ('48170','진주시','시','48170',true),
  ('48220','통영시','시','48220',true),
  ('48240','사천시','시','48240',true),
  ('48250','김해시','시','48250',true),
  ('48270','밀양시','시','48270',true),
  ('48310','거제시','시','48310',true),
  ('48330','양산시','시','48330',true),
  ('48720','의령군','군','48720',false),
  ('48730','함안군','군','48730',true),
  ('48740','창녕군','군','48740',false),
  ('48820','고성군','군','48820',false),
  ('48840','남해군','군','48840',true),
  ('48850','하동군','군','48850',false),
  ('48860','산청군','군','48860',false),
  ('48870','함양군','군','48870',false),
  ('48880','거창군','군','48880',true),
  ('48890','합천군','군','48890',false)
ON CONFLICT (tenant_id) DO NOTHING;

-- catalog 3종
INSERT INTO catalog VALUES
  ('ds-youth-pop','48000','경남 청년인구 유출입 현황',
   '경남 18개 시군 청년인구 유출입 현황 데이터셋.',
   '인구·가구','청년,인구,유입,유출,정착','gold','gold_youth_population',
   2304,true,true,true,NOW()::text,'공공누리 제1유형','CSV/API'),
  ('ds-business','48000','경남 사업체 산업별 현황',
   '경남 18개 시군 사업체 산업별 현황 데이터셋.',
   '산업·고용','사업체,산업,고용,일자리','gold','gold_business',
   504,true,true,true,NOW()::text,'공공누리 제1유형','CSV/API'),
  ('ds-facility','48000','경남 공공시설 위치 현황',
   '경남 18개 시군 공공시설 위치 현황 데이터셋.',
   '공공행정','공공시설,청년센터,위치,공간','gold','gold_public_facility',
   186,true,false,true,NOW()::text,'공공누리 제1유형','CSV/GeoJSON')
ON CONFLICT (dataset_id) DO NOTHING;

-- usage_log 샘플
INSERT INTO usage_log SELECT
  d.dataset_id, a.action, NOW()::text
FROM
  (VALUES ('ds-youth-pop'),('ds-business'),('ds-facility')) AS d(dataset_id),
  (VALUES ('view'),('view'),('download'),('api')) AS a(action),
  generate_series(1,30);
```

> 참고: gold_youth_population, gold_business, gold_public_facility 실제 행은
> `scripts/generate-seed-data.ts`에서 TypeScript로 생성 후 SQL COPY로 적재.

- [ ] `scripts/generate-seed-data.ts` 작성

```ts
// scripts/generate-seed-data.ts
// npx ts-node scripts/generate-seed-data.ts 로 실행

const SIGUN = [
  ['48121','창원시',100],['48170','진주시',34],['48220','통영시',12],
  ['48240','사천시',11],['48250','김해시',53],['48270','밀양시',10],
  ['48310','거제시',24],['48330','양산시',35],['48720','의령군',3],
  ['48730','함안군',6],['48740','창녕군',6],['48820','고성군',5],
  ['48840','남해군',4],['48850','하동군',4],['48860','산청군',3],
  ['48870','함양군',4],['48880','거창군',6],['48890','합천군',4],
] as [string, string, number][]

const YEARS = [2022,2023,2024,2025]
const AGES = ['20-24','25-29','30-34','35-39']
const rnd = (a: number, b: number) => a + Math.random() * (b - a)
const int = (n: number) => Math.floor(n)

let youthRows: string[] = []
let bizRows: string[] = []
let facRows: string[] = []
let facId = 0

for (const [cd, name, w] of SIGUN) {
  const base = w * 1000
  for (const y of YEARS) {
    const decline = 1 - 0.04 * (y - 2022)
    for (const age of AGES) {
      for (const sex of ['M','F']) {
        const pop = int(base * decline * rnd(0.08, 0.16))
        const inf = int(pop * rnd(0.05, 0.18))
        const out = int(pop * rnd(0.07, 0.22))
        youthRows.push(`('${cd}','${name}',${y},'${age}','${sex}',${pop},${inf},${out})`)
      }
    }
    for (const ind of ['제조','도소매','숙박음식','건설','정보통신','농림어업','보건복지']) {
      const bc = int(w * 30 * rnd(0.5, 1.5))
      const emp = int(bc * rnd(3, 12))
      bizRows.push(`('${cd}','${name}',${y},'${ind}',${bc},${emp})`)
    }
  }
  const n = Math.max(5, int(w / 3))
  const ftypes = ['도서관','체육관','보건소','청년센터','복지관','문화시설']
  for (let i = 0; i < n; i++) {
    facId++
    const ft = ftypes[int(rnd(0, ftypes.length))]
    const useNull = Math.random() < 0.05
    const lon = useNull ? 'NULL' : (128.0 + rnd(-0.6, 0.9)).toFixed(6)
    const lat = useNull ? 'NULL' : (35.2 + rnd(-0.5, 0.6)).toFixed(6)
    const cap = [50,100,200,300,0][int(rnd(0,5))]
    facRows.push(`('FAC${String(facId).padStart(5,'0')}','${cd}','${name}','${ft}','${name} ${ft}',${lon},${lat},${cap})`)
  }
}

const fs = require('fs')
fs.writeFileSync('supabase/seed-gold.sql', [
  `INSERT INTO gold_youth_population VALUES\n${youthRows.join(',\n')};`,
  `INSERT INTO gold_business VALUES\n${bizRows.join(',\n')};`,
  `INSERT INTO gold_public_facility VALUES\n${facRows.join(',\n')};`,
].join('\n\n'))
console.log(`youth: ${youthRows.length}, biz: ${bizRows.length}, fac: ${facRows.length}`)
```

- [ ] 커밋
```
git add supabase/seed.sql scripts/generate-seed-data.ts
git commit -m "feat(db): 시드 데이터 SQL + 골드 데이터 생성 스크립트"
```

---

## Task 5: 코어 라이브러리 — lib/quality.ts

**Files:** `lib/quality.ts`

- [ ] `lib/quality.ts` 작성

```ts
// lib/quality.ts
import { SupabaseClient } from '@supabase/supabase-js'

export const ERROR_RATE_THRESHOLD = 0.001
export const GENERIC_THRESHOLD = 5.0

export const RULES: Record<string, Array<[string, string]>> = {
  gold_youth_population: [
    ['population 음수 금지', 'SELECT count(*) FROM gold_youth_population WHERE population < 0'],
    ['population NULL 금지', 'SELECT count(*) FROM gold_youth_population WHERE population IS NULL'],
    ['연령대 코드 유효성', "SELECT count(*) FROM gold_youth_population WHERE age_band NOT IN ('20-24','25-29','30-34','35-39')"],
    ['성별 코드 유효성', "SELECT count(*) FROM gold_youth_population WHERE sex NOT IN ('M','F')"],
    ['연도 범위(2018-2025)', 'SELECT count(*) FROM gold_youth_population WHERE year < 2018 OR year > 2025'],
    ['유입/유출 음수 금지', 'SELECT count(*) FROM gold_youth_population WHERE inflow < 0 OR outflow < 0'],
  ],
  gold_business: [
    ['사업체수 양수', 'SELECT count(*) FROM gold_business WHERE biz_count <= 0'],
    ['종사자수 음수 금지', 'SELECT count(*) FROM gold_business WHERE employees < 0'],
    ['산업분류 결측 금지', "SELECT count(*) FROM gold_business WHERE industry IS NULL OR industry = ''"],
    ['종사자>=사업체 정합성', 'SELECT count(*) FROM gold_business WHERE employees < biz_count'],
  ],
  gold_public_facility: [
    ['좌표 결측 금지', 'SELECT count(*) FROM gold_public_facility WHERE lon IS NULL OR lat IS NULL'],
    ['경도 범위(경남)', 'SELECT count(*) FROM gold_public_facility WHERE lon IS NOT NULL AND (lon < 127.5 OR lon > 129.5)'],
    ['위도 범위(경남)', 'SELECT count(*) FROM gold_public_facility WHERE lat IS NOT NULL AND (lat < 34.5 OR lat > 36.0)'],
    ['정원 양수', 'SELECT count(*) FROM gold_public_facility WHERE capacity <= 0'],
    ['시설명 결측 금지', "SELECT count(*) FROM gold_public_facility WHERE name IS NULL OR name = ''"],
  ],
}

export async function runQuality(supabase: SupabaseClient, datasetId: string) {
  const { data: cat } = await supabase
    .from('catalog').select('table_name').eq('dataset_id', datasetId).single()
  if (!cat || !RULES[cat.table_name]) return null

  const rules = RULES[cat.table_name]
  const { count: totalRows } = await supabase.from(cat.table_name).select('*', { count: 'exact', head: true })
  const total = totalRows ?? 0

  let errors = 0
  const detail: Array<{ rule: string; violations: number }> = []
  for (const [rname, sql] of rules) {
    const { data } = await supabase.rpc('run_count_query', { query: sql })
    const viol = Number(data ?? 0)
    errors += viol
    detail.push({ rule: rname, violations: viol })
  }

  const checked = total * rules.length
  const rate = checked ? (errors / checked) * 100 : 0
  const passed = rate <= ERROR_RATE_THRESHOLD
  const ranAt = new Date().toISOString()

  await supabase.from('quality_results').delete().eq('dataset_id', datasetId)
  await supabase.from('quality_results').insert({
    dataset_id: datasetId, rule_count: rules.length, checked, errors,
    error_rate: Math.round(rate * 100000) / 100000, passed, detail, ran_at: ranAt,
  })
  return { dataset_id: datasetId, table: cat.table_name, rule_count: rules.length,
           checked, errors, error_rate: rate, threshold: ERROR_RATE_THRESHOLD,
           passed, detail, ran_at: ranAt }
}

export async function runQualityGeneric(
  supabase: SupabaseClient,
  tableName: string,
  uploadedData: unknown[],
) {
  if (!uploadedData?.length) {
    return { table: tableName, rule_count: 0, checked: 0, errors: 0,
             error_rate: 0, threshold: GENERIC_THRESHOLD, passed: true,
             detail: [], ran_at: new Date().toISOString() }
  }
  const sample = uploadedData[0] as Record<string, unknown>
  const cols = Object.keys(sample)
  const rules: Array<{ rule: string; violations: number; threshold: number }> = []

  for (const col of cols) {
    const nullCount = uploadedData.filter(r => (r as Record<string,unknown>)[col] == null).length
    rules.push({ rule: `결측치 비율 - ${col}`, violations: nullCount, threshold: GENERIC_THRESHOLD })
    const nums = uploadedData.map(r => (r as Record<string,unknown>)[col]).filter(v => typeof v === 'number')
    if (nums.length > 0) {
      const negCount = (nums as number[]).filter(v => v < 0).length
      rules.push({ rule: `음수 이상치 - ${col}`, violations: negCount, threshold: GENERIC_THRESHOLD })
    }
  }

  const seen = new Set<string>()
  let dupCount = 0
  for (const row of uploadedData) {
    const key = JSON.stringify(row)
    if (seen.has(key)) dupCount++
    else seen.add(key)
  }
  rules.push({ rule: '중복행 비율', violations: dupCount, threshold: GENERIC_THRESHOLD })

  const errors = rules.reduce((s, r) => s + r.violations, 0)
  const checked = uploadedData.length * rules.length
  const rate = checked ? (errors / checked) * 100 : 0
  const passed = rate <= GENERIC_THRESHOLD

  return { table: tableName, rule_count: rules.length, checked, errors,
           error_rate: Math.round(rate * 10000) / 10000,
           threshold: GENERIC_THRESHOLD, passed, detail: rules,
           ran_at: new Date().toISOString() }
}

export function generateRecommendations(diag: ReturnType<typeof runQualityGeneric> extends Promise<infer T> ? T : never): string[] {
  // 타입 안전 버전
  return []
}

export function generateQualityRecommendations(diag: {
  checked: number; passed: boolean; detail: Array<{rule:string;violations:number;threshold:number}>;
  error_rate: number; threshold: number
}): string[] {
  if (!diag.checked) return ['데이터 행이 없습니다 — 유효한 데이터를 업로드해 주세요.']
  if (diag.passed) return []
  const recs: string[] = []
  for (const item of diag.detail) {
    if (item.violations > 0) {
      recs.push(`[${item.rule}] 위반 ${item.violations.toLocaleString()}건 — 전체 ${diag.checked.toLocaleString()}행의 ${(item.violations/diag.checked*100).toFixed(2)}% (기준 ${item.threshold}%이하). 해당 컬럼의 오류 데이터를 보완해 주세요.`)
    }
  }
  return recs.length ? recs : [`오류율 ${diag.error_rate.toFixed(4)}%가 기준 ${diag.threshold}%를 초과합니다.`]
}

export async function runAll(supabase: SupabaseClient) {
  const { data: rows } = await supabase.from('catalog').select('dataset_id')
  const out = []
  for (const r of rows ?? []) {
    const res = await runQuality(supabase, r.dataset_id)
    if (res) out.push(res)
  }
  return out
}
```

- [ ] 커밋
```
git add lib/quality.ts
git commit -m "feat(lib): quality.ts 포팅 (Python app/quality.py → TypeScript)"
```

---

## Task 6: 코어 라이브러리 — lib/evaluation.ts

**Files:** `lib/evaluation.ts`

- [ ] `lib/evaluation.ts` 작성

```ts
// lib/evaluation.ts
import { SupabaseClient } from '@supabase/supabase-js'

export const AREAS = [
  { key: 'open',     name: '개방·활용', weight: 48, color: '#1457b8' },
  { key: 'quality',  name: '품질',      weight: 45, color: '#0f9d8f' },
  { key: 'analysis', name: '분석·활용', weight: 53, color: '#7b4fc4' },
  { key: 'share',    name: '공유',      weight: 41, color: '#1aa251' },
  { key: 'mgmt',     name: '관리체계',  weight:  6, color: '#e8a317' },
]

const MACHINE_READABLE = new Set(['csv','json','xlsx','parquet','tsv','geojson'])

export function isQualityPassed(summary: string | null | undefined): boolean {
  const s = (summary ?? '').trim()
  return s.endsWith('통과') && !s.endsWith('미통과')
}

export function computeAiReadyChecklist(row: Record<string, unknown>) {
  const qualityPassed = isQualityPassed(String(row.quality_summary ?? ''))
  const rows = Number(row.rows ?? 0)
  const desc = String(row.description ?? '').trim()
  const title = String(row.title ?? '').trim()
  const theme = String(row.theme ?? '').trim()
  const kw = String(row.keywords ?? '').trim()
  const lic = String(row.license ?? '').trim()
  const fmt = String(row.format ?? '').trim().toLowerCase()

  const checklist = [
    { item: '품질진단 통과', passed: qualityPassed,
      detail: qualityPassed ? '오류율 기준 이하, 자동 품질진단 통과' : `품질진단 미통과 — ${row.quality_summary || '진단 미실시'}` },
    { item: '충분한 데이터 규모 (30행 이상)', passed: rows >= 30,
      detail: rows >= 30 ? `${rows.toLocaleString()}행 — AI 학습에 적정한 규모 확보` : `${rows.toLocaleString()}행 — 최소 30행 이상 권장` },
    { item: '메타데이터 충실 (제목·설명·주제·키워드)', passed: !!(title && theme && kw && desc.length >= 20),
      detail: (title && theme && kw && desc.length >= 20) ? '제목·설명·주제·키워드가 모두 충실히 입력됨' : '제목·설명(20자 이상)·주제·키워드를 모두 입력해야 합니다' },
    { item: '라이선스 명시', passed: !!lic,
      detail: lic ? `라이선스: ${lic}` : '라이선스가 명시되지 않았습니다 — CC BY 4.0 등 명시 권장' },
    { item: '기계가독 형식 (CSV/JSON/Parquet 등)', passed: MACHINE_READABLE.has(fmt),
      detail: MACHINE_READABLE.has(fmt) ? `형식 ${fmt.toUpperCase()} — AI 학습 도구에서 직접 읽기 가능` : `형식 ${fmt.toUpperCase() || '미지정'} — CSV/JSON/Parquet 등 기계가독 형식 권장` },
  ]
  return { ai_ready: checklist.every(c => c.passed), checklist }
}

export function computeSubmissionContribution(row: Record<string, unknown>) {
  const status = String(row.status ?? '')
  const qPassed = isQualityPassed(String(row.quality_summary ?? ''))
  const rows = Number(row.rows ?? 0)
  const commentCount = Number(row.comment_count ?? 0)
  const hasNote = !!String(row.decision_note ?? '').trim()

  return [
    { key: 'open', name: '개방·활용', contributes: status === 'approved',
      note: status === 'approved' ? '승인되어 개방포털에 등록·공개됨' : '승인되면 개방 데이터셋으로 등록되어 기여' },
    { key: 'quality', name: '품질', contributes: qPassed,
      note: row.quality_summary ? `자동 진단 결과 — ${row.quality_summary}` : '진단 대기 중' },
    { key: 'analysis', name: '분석·활용', contributes: status === 'approved' && rows >= 50,
      note: rows >= 50 ? `${rows.toLocaleString()}행 데이터가 온톨로지·분석 자산으로 활용 가능` : `${rows.toLocaleString()}행 — 분석 활용 기준(50행 이상) 미달` },
    { key: 'share', name: '공유', contributes: commentCount > 0,
      note: commentCount > 0 ? `센터 컨설팅 코멘트 ${commentCount}건으로 기관-센터 간 공유 실적 형성` : '코멘트 등록 시 기관-센터 간 공유 실적으로 기여' },
    { key: 'mgmt', name: '관리체계', contributes: ['approved','rejected'].includes(status) && hasNote,
      note: (['approved','rejected'].includes(status) && hasNote) ? '담당자 결정 이력(메모 포함)이 기록되어 관리체계 증빙으로 활용' : '검토·결정 메모가 등록되면 관리체계 증빙으로 기여' },
  ]
}

export async function computeIndicators(supabase: SupabaseClient) {
  const sc = async (table: string, filter?: string) => {
    const q = supabase.from(table).select('*', { count: 'exact', head: true })
    if (filter) {
      const [col, val] = filter.split('=')
      q.eq(col.trim(), val.trim() === 'true')
    }
    const { count } = await q
    return count ?? 0
  }

  const [totalDs, openDs, aiReady, highValue] = await Promise.all([
    sc('catalog'), sc('catalog','is_open=true'), sc('catalog','ai_ready=true'), sc('catalog','high_value=true'),
  ])
  const { count: usage } = await supabase.from('usage_log').select('*',{count:'exact',head:true})
  const { count: qTotal } = await supabase.from('quality_results').select('*',{count:'exact',head:true})
  const { count: qPass } = await supabase.from('quality_results').select('*',{count:'exact',head:true}).eq('passed',true)
  const { data: errData } = await supabase.from('quality_results').select('error_rate')
  const avgErr = errData?.length ? errData.reduce((s,r) => s + (r.error_rate ?? 0), 0) / errData.length : 0
  const { count: objCnt } = await supabase.from('onto_objects').select('*',{count:'exact',head:true})
  const { count: linkCnt } = await supabase.from('onto_links').select('*',{count:'exact',head:true})
  const { count: tenantTotal } = await supabase.from('tenants').select('*',{count:'exact',head:true})
  const { count: tenantOn } = await supabase.from('tenants').select('*',{count:'exact',head:true}).eq('onboarded',true)

  const usageCnt = usage ?? 0
  const qT = qTotal ?? 0; const qP = qPass ?? 0
  const obj = objCnt ?? 0; const lnk = linkCnt ?? 0
  const tT = tenantTotal ?? 0; const tO = tenantOn ?? 0

  const openRate = totalDs ? (openDs / totalDs * 100) : 0
  const aiRate = totalDs ? (aiReady / totalDs * 100) : 0

  const indicators: Array<[string,string,string,'ok'|'warn'|'na',string]> = [
    ['open', '메타관리시스템 기반 개방 데이터셋', `${openDs}/${totalDs}`, openRate>=80?'ok':'warn', 'DCAT 카탈로그 등록·개방 비율'],
    ['open', 'AI친화(AI-Ready) 데이터 비율', `${aiRate.toFixed(0)}%`, aiRate>=50?'ok':'warn', 'AI-Ready 체크리스트 자동 점검'],
    ['open', '고가치 데이터 등록 수', `${highValue}건`, highValue>=2?'ok':'warn', '고가치 데이터 식별·관리'],
    ['open', '개방데이터 활용 건수', `${usageCnt}건`, usageCnt>=100?'ok':'warn', '조회·다운로드·API 호출 로그 집계'],
    ['quality', '품질진단 자동 수행 데이터셋', `${qT}/${totalDs}`, (qT>=totalDs&&totalDs)?'ok':'warn', '규칙기반 자동 진단 커버리지'],
    ['quality', '오류율 기준(0.001%) 충족', `${qP}/${qT}`, (qT&&qP===qT)?'ok':'warn', '데이터 값 관리 - 오류율'],
    ['quality', '평균 오류율', `${avgErr.toFixed(4)}%`, avgErr<=0.001?'ok':'warn', '전 데이터셋 평균 오류율'],
    ['analysis', '온톨로지 객체/관계 구축', `${obj}객체·${lnk}관계`, obj>0?'ok':'na', '분석 기반 시맨틱 모델'],
    ['analysis', '자연어 질의·분석 활용', obj?'가동':'준비', obj?'ok':'na', 'text-to-SQL·셀프서비스 분석'],
    ['share', '기관 간 공유 카탈로그', `입주 ${tO}/${tT}`, tO>=8?'ok':'warn', '메타관리시스템 기반 공유 실적'],
    ['share', '메타데이터 등록·관리', `${totalDs}건 등록`, totalDs>0?'ok':'warn', 'DCAT 표준 메타데이터 관리'],
    ['mgmt', '추진기반(플랫폼 운영) 조성', '운영중', 'ok', '센터 멀티테넌트 플랫폼 가동'],
    ['mgmt', '데이터 성과 리포트 제공', '자동생성', 'ok', '경영진용 성과 대시보드'],
  ]

  const byArea: Record<string, unknown> = {}
  for (const a of AREAS) {
    const items = indicators.filter(i => i[0] === a.key)
    const ok = items.filter(i => i[3] === 'ok').length
    const total = items.filter(i => i[3] !== 'na').length
    const score = total ? Math.round(ok / total * 100) : 0
    byArea[a.key] = {
      name: a.name, weight: a.weight, color: a.color,
      ok, total: items.length, score,
      indicators: items.map(i => ({ name:i[1], value:i[2], status:i[3], desc:i[4] })),
    }
  }

  const overall = Math.round(AREAS.reduce((s, a) => s + (byArea[a.key] as {score:number}).score, 0) / AREAS.length)
  return {
    overall,
    areas: AREAS.map(a => byArea[a.key]),
    summary: { datasets: totalDs, open: openDs, ai_ready: aiReady, high_value: highValue,
               usage: usageCnt, quality_pass: qP, quality_total: qT,
               avg_error_rate: Math.round(avgErr * 10000) / 10000,
               objects: obj, links: lnk, tenants_on: tO, tenants_total: tT },
  }
}
```

- [ ] 커밋
```
git add lib/evaluation.ts
git commit -m "feat(lib): evaluation.ts 포팅"
```

---

## Task 7: 코어 라이브러리 — lib/ontology.ts, lib/nlquery.ts

**Files:** `lib/ontology.ts`, `lib/nlquery.ts`

- [ ] `lib/ontology.ts` 작성

```ts
// lib/ontology.ts
import { SupabaseClient } from '@supabase/supabase-js'
import { load as yamlLoad } from 'js-yaml'
import { readFileSync } from 'fs'
import { join } from 'path'

let _schema: {
  facility_filter: string
  actions: Record<string, { name: string; description: string; weights: Record<string, number> }>
  keyword_mapping: Record<string, string[]>
} | null = null

function getSchema() {
  if (!_schema) {
    const p = join(process.cwd(), 'config', 'ontology-schema.yaml')
    _schema = yamlLoad(readFileSync(p, 'utf8')) as typeof _schema
  }
  return _schema!
}

export async function buildOntology(supabase: SupabaseClient) {
  const schema = getSchema()
  await supabase.from('onto_objects').delete().neq('obj_id', '')
  await supabase.from('onto_links').delete().neq('src', '')

  const { data: tenants } = await supabase.from('tenants').select('sgg_cd,name,gov_type')
  const objs: Array<{obj_id:string;obj_type:string;label:string;props:string}> = []
  const links: Array<{src:string;rel:string;dst:string;weight:number}> = []

  for (const t of tenants ?? []) {
    objs.push({ obj_id: `sigun:${t.sgg_cd}`, obj_type: '시군', label: t.name, props: `유형=${t.gov_type}` })
  }

  const { data: yrData } = await supabase.from('gold_youth_population').select('year').order('year', { ascending: false }).limit(1)
  const latest = yrData?.[0]?.year
  if (!latest) return { objects: 0, links: 0, year: null }

  const { data: yp } = await supabase.rpc('agg_youth_pop', { yr: latest })
  for (const r of yp ?? []) {
    const net = r.inf - r.outf
    const oid = `youth:${r.sgg_cd}`
    objs.push({ obj_id: oid, obj_type: '청년인구', label: `${r.sigun} 청년`, props: `인구=${r.pop};순이동=${net}` })
    links.push({ src: `sigun:${r.sgg_cd}`, rel: '청년규모', dst: oid, weight: r.pop })
    links.push({ src: oid, rel: net >= 0 ? '순유입' : '순유출', dst: `sigun:${r.sgg_cd}`, weight: Math.abs(net) })
  }

  const { data: bz } = await supabase.rpc('agg_business', { yr: latest })
  for (const r of bz ?? []) {
    const oid = `biz:${r.sgg_cd}`
    objs.push({ obj_id: oid, obj_type: '사업체', label: `${r.sigun} 사업체`, props: `사업체=${r.bc};종사자=${r.emp}` })
    links.push({ src: `sigun:${r.sgg_cd}`, rel: '산업기반', dst: oid, weight: r.emp })
  }

  const { data: fac } = await supabase.rpc('agg_facility', { ftype: schema.facility_filter })
  for (const r of fac ?? []) {
    const oid = `fac:${r.sgg_cd}`
    objs.push({ obj_id: oid, obj_type: '청년인프라', label: `${r.sigun} ${schema.facility_filter}`, props: `개수=${r.n}` })
    links.push({ src: `sigun:${r.sgg_cd}`, rel: '보유시설', dst: oid, weight: r.n })
  }

  if (objs.length) await supabase.from('onto_objects').insert(objs)
  if (links.length) await supabase.from('onto_links').insert(links)
  return { objects: objs.length, links: links.length, year: latest }
}

export async function getGraph(supabase: SupabaseClient, centerSgg?: string) {
  if (centerSgg) {
    const oids = [`sigun:${centerSgg}`,`youth:${centerSgg}`,`biz:${centerSgg}`,`fac:${centerSgg}`]
    const { data: nodes } = await supabase.from('onto_objects').select('*').in('obj_id', oids)
    const { data: edges } = await supabase.from('onto_links').select('*').or(`src.in.(${oids.join(',')}),dst.in.(${oids.join(',')})`)
    return { nodes, edges }
  }
  const { data: nodes } = await supabase.from('onto_objects').select('*')
  const { data: edges } = await supabase.from('onto_links').select('*')
  return { nodes, edges }
}

export function recommendOntologyCandidates(meta: Record<string, unknown>) {
  const schema = getSchema()
  const text = [meta.title, meta.description, meta.theme, meta.keywords]
    .map(v => String(v ?? '')).join(' ').toLowerCase()

  const results: Array<{obj_type:string;matched_keywords:string[];match_score:number;reason:string}> = []
  for (const [objType, kws] of Object.entries(schema.keyword_mapping)) {
    const matched = kws.filter(kw => text.includes(kw))
    if (matched.length) {
      results.push({ obj_type: objType, matched_keywords: matched, match_score: matched.length,
        reason: `'${matched.slice(0,3).join(', ')}' 키워드가 메타데이터에서 발견됨` })
    }
  }
  return results.sort((a, b) => b.match_score - a.match_score)
}

export function listActions() {
  const schema = getSchema()
  return Object.entries(schema.actions).map(([key, v]) => ({ key, name: v.name, description: v.description }))
}

export async function scoreAction(supabase: SupabaseClient, actionKey: string, top = 10) {
  const schema = getSchema()
  const w = schema.actions[actionKey]?.weights
  if (!w) return []

  const { data: yrData } = await supabase.from('gold_youth_population').select('year').order('year',{ascending:false}).limit(1)
  const latest = yrData?.[0]?.year
  if (!latest) return []

  const { data: rows } = await supabase.rpc('score_action_data', { yr: latest, ftype: schema.facility_filter })
  if (!rows?.length) return []

  const mxPop = Math.max(...rows.map((r:any) => r.pop)) || 1
  const mxEmp = Math.max(...rows.map((r:any) => r.emp)) || 1
  const mxFac = Math.max(...rows.map((r:any) => r.fac)) || 1
  const mxOut = Math.max(...rows.map((r:any) => Math.abs(Math.min(0, r.net)))) || 1

  const out = rows.map((r: any) => {
    const score = (
      w.youth_pop    * (r.pop / mxPop) +
      w.employees    * (r.emp / mxEmp) +
      w.facility_gap * (1 - r.fac / mxFac) +
      w.outmigration * (Math.abs(Math.min(0, r.net)) / mxOut)
    ) * 100
    return { sgg_cd: r.sgg_cd, sigun: r.sigun, youth_pop: r.pop,
             net_migration: r.net, employees: r.emp, youth_centers: r.fac,
             priority_score: Math.round(score * 10) / 10 }
  }).sort((a: any, b: any) => b.priority_score - a.priority_score)

  return out.slice(0, top).map((o: any, i: number) => ({ ...o, rank: i + 1 }))
}
```

- [ ] `lib/nlquery.ts` 작성

```ts
// lib/nlquery.ts
import { SupabaseClient } from '@supabase/supabase-js'

const ADMIN_SUFFIXES = ['시','군','구','동','읍','면']

export async function answer(supabase: SupabaseClient, question: string) {
  const q = (question ?? '').trim()
  const ql = q.replace(/\s/g, '')

  const { data: tenantRows } = await supabase.from('tenants').select('name,sgg_cd')
  let sigun: string | null = null
  for (const t of tenantRows ?? []) {
    const short = ADMIN_SUFFIXES.some(s => t.name.endsWith(s)) ? t.name.slice(0, -1) : t.name
    if (q.includes(t.name) || q.includes(short)) { sigun = t.name; break }
  }

  if (['청년','인구','유입','유출','순이동'].some(k => ql.includes(k))) {
    let qb = supabase.from('gold_youth_population')
      .select('sigun,population,inflow,outflow')
    const { data: yrD } = await supabase.from('gold_youth_population').select('year').order('year',{ascending:false}).limit(1)
    const yr = yrD?.[0]?.year
    if (yr) qb = qb.eq('year', yr) as any
    if (sigun) qb = qb.eq('sigun', sigun) as any
    const { data: raw } = await qb
    const grouped: Record<string, {청년인구:number;유입:number;유출:number;순이동:number}> = {}
    for (const r of raw ?? []) {
      if (!grouped[r.sigun]) grouped[r.sigun] = {청년인구:0,유입:0,유출:0,순이동:0}
      grouped[r.sigun].청년인구 += r.population
      grouped[r.sigun].유입 += r.inflow
      grouped[r.sigun].유출 += r.outflow
      grouped[r.sigun].순이동 += r.inflow - r.outflow
    }
    const rows = Object.entries(grouped).map(([sigun, v]) => ({sigun,...v})).sort((a,b)=>b.순이동-a.순이동)
    return { intent: '청년인구 유출입', sigun, columns: ['sigun','청년인구','유입','유출','순이동'], rows }
  }

  if (['사업체','산업','일자리','고용','종사자'].some(k => ql.includes(k))) {
    const { data: yrD } = await supabase.from('gold_business').select('year').order('year',{ascending:false}).limit(1)
    const yr = yrD?.[0]?.year
    let qb = supabase.from('gold_business').select('sigun,biz_count,employees')
    if (yr) qb = qb.eq('year', yr) as any
    if (sigun) qb = qb.eq('sigun', sigun) as any
    const { data: raw } = await qb
    const grouped: Record<string, {사업체수:number;종사자수:number}> = {}
    for (const r of raw ?? []) {
      if (!grouped[r.sigun]) grouped[r.sigun] = {사업체수:0,종사자수:0}
      grouped[r.sigun].사업체수 += r.biz_count
      grouped[r.sigun].종사자수 += r.employees
    }
    const rows = Object.entries(grouped).map(([sigun, v]) => ({sigun,...v})).sort((a,b)=>b.종사자수-a.종사자수)
    return { intent: '사업체·고용', sigun, columns: ['sigun','사업체수','종사자수'], rows }
  }

  if (['시설','청년센터','도서관','체육관','복지관','인프라'].some(k => ql.includes(k))) {
    let qb = supabase.from('gold_public_facility').select('sigun,ftype')
    if (sigun) qb = qb.eq('sigun', sigun) as any
    const { data: raw } = await qb
    const grouped: Record<string, Record<string, number>> = {}
    for (const r of raw ?? []) {
      if (!grouped[r.sigun]) grouped[r.sigun] = {}
      grouped[r.sigun][r.ftype] = (grouped[r.sigun][r.ftype] ?? 0) + 1
    }
    const rows = Object.entries(grouped).flatMap(([sigun, ft]) =>
      Object.entries(ft).map(([시설유형, 개수]) => ({sigun, 시설유형, 개수})))
      .sort((a,b) => a.sigun.localeCompare(b.sigun) || b.개수 - a.개수)
    return { intent: '공공시설', sigun, columns: ['sigun','시설유형','개수'], rows }
  }

  return { intent: null, sigun, columns: [], rows: [],
    hint: "예: '창원시 청년 순유입 보여줘', '진주 사업체 현황', '거창군 청년센터'" }
}
```

- [ ] 커밋
```
git add lib/ontology.ts lib/nlquery.ts
git commit -m "feat(lib): ontology.ts + nlquery.ts 포팅"
```

---

## Task 8: 코어 라이브러리 — lib/submission.ts, lib/planning.ts

**Files:** `lib/submission.ts`, `lib/planning.ts`

- [ ] `lib/submission.ts` 작성

```ts
// lib/submission.ts
import { SupabaseClient } from '@supabase/supabase-js'

const TABLE_NAME_RE = /^sub_(.+)_[0-9a-f]{8}$/

export function validateTableName(name: string): string {
  if (!TABLE_NAME_RE.test(name)) throw new Error(`유효하지 않은 테이블명: ${name}`)
  return name
}

export function newTableName(tenantId: string): string {
  const suffix = Math.random().toString(16).slice(2, 10)
  return `sub_${tenantId}_${suffix}`
}

export function inferSchema(rows: Record<string, unknown>[]): Array<{name:string;type:string}> {
  if (!rows.length) return []
  const sample = rows[0]
  return Object.entries(sample).map(([name, val]) => {
    const type = typeof val === 'number' ? (Number.isInteger(val) ? 'INTEGER' : 'FLOAT')
      : typeof val === 'boolean' ? 'BOOLEAN' : 'TEXT'
    return { name, type }
  })
}

export async function createSubmission(
  supabase: SupabaseClient,
  meta: Record<string, string>,
  tableName: string,
  rows: number,
  qualitySummary: string,
): Promise<string> {
  const submissionId = crypto.randomUUID().replace(/-/g, '')
  const now = new Date().toISOString()
  await supabase.from('submissions').insert({
    submission_id: submissionId,
    tenant_id: meta.tenant_id, title: meta.title, description: meta.description,
    theme: meta.theme, keywords: meta.keywords, license: meta.license, format: meta.format,
    table_name: tableName, rows, status: 'submitted',
    quality_summary: qualitySummary, decision_note: null,
    submitted_at: now, decided_at: null,
  })
  return submissionId
}

export async function recordDecision(
  supabase: SupabaseClient, submissionId: string, status: 'approved'|'rejected', decisionNote = '',
) {
  await supabase.from('submissions').update({
    status, decision_note: decisionNote, decided_at: new Date().toISOString(),
  }).eq('submission_id', submissionId)
}

export async function addComment(supabase: SupabaseClient, submissionId: string, comment: string) {
  const commentId = crypto.randomUUID().replace(/-/g, '')
  await supabase.from('consultant_comments').insert({
    comment_id: commentId, submission_id: submissionId,
    comment, created_at: new Date().toISOString(),
  })
  return commentId
}

export async function getSubmission(supabase: SupabaseClient, submissionId: string) {
  const { data: sub } = await supabase.from('submissions').select('*').eq('submission_id', submissionId).single()
  if (!sub) return null
  const { data: upload } = await supabase.from('submission_uploads').select('preview,schema_info').eq('table_name', sub.table_name).maybeSingle()
  const { data: comments } = await supabase.from('consultant_comments').select('*').eq('submission_id', submissionId).order('created_at')
  return { meta: sub, preview: upload?.preview ?? [], comments: comments ?? [] }
}

export function summarizeQuality(result: {rule_count:number;errors:number;error_rate:number;passed:boolean}): string {
  const verdict = result.passed ? '통과' : '미통과'
  return `규칙 ${result.rule_count}종 / 오류 ${result.errors}건 / 오류율 ${result.error_rate}% / ${verdict}`
}
```

- [ ] `lib/planning.ts` 작성

```ts
// lib/planning.ts
import { SupabaseClient } from '@supabase/supabase-js'

async function tenantName(supabase: SupabaseClient, tenantId: string): Promise<string> {
  const { data } = await supabase.from('tenants').select('name').eq('tenant_id', tenantId).single()
  return data?.name ?? tenantId
}

export async function draftOpenPlan(supabase: SupabaseClient, tenantId: string): Promise<string> {
  const name = await tenantName(supabase, tenantId)
  const { data: rows } = await supabase.from('submissions')
    .select('status,title,decision_note').eq('tenant_id', tenantId).order('submitted_at')

  const approved = rows?.filter(r => r.status === 'approved') ?? []
  const rejected = rows?.filter(r => r.status === 'rejected') ?? []
  const pending  = rows?.filter(r => r.status === 'submitted') ?? []

  const lines = [
    `# ${name} 공공데이터 개방계획 초안`, '',
    `- 등록 ${rows?.length ?? 0}건 / 개방 ${approved.length}건 / 보류 ${rejected.length}건 / 검토대기 ${pending.length}건`,
    '', '## 1. 개방 완료',
    ...(approved.length ? approved.map(r => `- ${r.title}`) : ['- (해당 없음)']),
    '', '## 2. 보류 사유 및 향후 조치',
    ...(rejected.length ? rejected.map(r => `- ${r.title}: ${r.decision_note || '사유 미기재'}`) : ['- (해당 없음)']),
    '', '## 3. 향후 개방 예정(검토대기)',
    ...(pending.length ? pending.map(r => `- ${r.title}`) : ['- (해당 없음)']),
  ]
  return lines.join('\n')
}

export async function draftQualityPlan(supabase: SupabaseClient, tenantId: string): Promise<string> {
  const name = await tenantName(supabase, tenantId)
  const { data: rows } = await supabase.from('submissions')
    .select('title,status,quality_summary').eq('tenant_id', tenantId).eq('status','rejected').order('submitted_at')

  const lines = [`# ${name} 품질개선계획 초안`, '', `- 개선 검토 대상(보류) ${rows?.length ?? 0}건`, '', '## 개선과제']
  if (!rows?.length) {
    lines.push('- (현재 보류 상태인 제출이 없어 개선과제가 없습니다)')
    return lines.join('\n')
  }

  for (const r of rows) {
    const summary = r.quality_summary ?? ''
    const rateM = summary.match(/오류율\s*([\d.]+)%/)
    const errM = summary.match(/오류\s*(\d+)건/)
    const rate = rateM ? rateM[1] + '%' : '확인 필요'
    const errors = errM ? errM[1] + '건' : '확인 필요'
    lines.push(`- **${r.title}** — 오류 ${errors}, 오류율 ${rate}: 데이터 입력 단계의 결측치·중복·이상치 점검 후 재정제하여 재진단 권장`)
  }
  return lines.join('\n')
}
```

- [ ] 커밋
```
git add lib/submission.ts lib/planning.ts
git commit -m "feat(lib): submission.ts + planning.ts 포팅"
```

---

## Task 9: Supabase RPC 함수 (SQL)

**Files:** `supabase/migrations/002_rpc.sql`

- [ ] `supabase/migrations/002_rpc.sql` 작성

```sql
-- supabase/migrations/002_rpc.sql
-- ontology 빌드 및 액션 스코어링에 필요한 집계 RPC

CREATE OR REPLACE FUNCTION agg_youth_pop(yr int)
RETURNS TABLE(sgg_cd text, sigun text, pop bigint, inf bigint, outf bigint) AS $$
  SELECT sgg_cd, sigun, sum(population)::bigint, sum(inflow)::bigint, sum(outflow)::bigint
  FROM gold_youth_population WHERE year = yr GROUP BY sgg_cd, sigun
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION agg_business(yr int)
RETURNS TABLE(sgg_cd text, sigun text, bc bigint, emp bigint) AS $$
  SELECT sgg_cd, sigun, sum(biz_count)::bigint, sum(employees)::bigint
  FROM gold_business WHERE year = yr GROUP BY sgg_cd, sigun
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION agg_facility(ftype text)
RETURNS TABLE(sgg_cd text, sigun text, n bigint) AS $$
  SELECT sgg_cd, sigun, count(*)::bigint
  FROM gold_public_facility WHERE gold_public_facility.ftype = agg_facility.ftype
  GROUP BY sgg_cd, sigun
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION score_action_data(yr int, ftype text)
RETURNS TABLE(sgg_cd text, sigun text, pop bigint, net bigint, emp bigint, fac bigint) AS $$
  WITH y AS (
    SELECT sgg_cd, sigun, sum(population)::bigint pop,
           (sum(inflow) - sum(outflow))::bigint net
    FROM gold_youth_population WHERE year = yr GROUP BY sgg_cd, sigun),
  b AS (
    SELECT sgg_cd, sum(employees)::bigint emp FROM gold_business WHERE year = yr GROUP BY sgg_cd),
  f AS (
    SELECT sgg_cd, count(*)::bigint fac FROM gold_public_facility
    WHERE gold_public_facility.ftype = score_action_data.ftype GROUP BY sgg_cd)
  SELECT y.sgg_cd, y.sigun, y.pop, y.net,
         coalesce(b.emp,0), coalesce(f.fac,0)
  FROM y LEFT JOIN b ON y.sgg_cd = b.sgg_cd LEFT JOIN f ON y.sgg_cd = f.sgg_cd
$$ LANGUAGE sql STABLE;
```

- [ ] 커밋
```
git add supabase/migrations/002_rpc.sql
git commit -m "feat(db): Supabase RPC 함수 (집계·스코어링)"
```

---

## Task 10: API Routes

**Files:** `app/api/*/route.ts` (14개)

- [ ] `app/api/overview/route.ts`

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { computeIndicators } from '@/lib/evaluation'

export async function GET() {
  const supabase = await createClient()
  const ev = await computeIndicators(supabase)
  return NextResponse.json({
    platform: '이음(EUM)',
    generated_at: new Date().toISOString(),
    summary: ev.summary,
    overall_score: ev.overall,
  })
}
```

- [ ] `app/api/tenants/route.ts`

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data } = await supabase.from('tenants').select('*').order('gov_type', { ascending: false }).order('name')
  return NextResponse.json(data ?? [])
}
```

- [ ] `app/api/catalog/route.ts`

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') ?? ''
  const sort = searchParams.get('sort') ?? 'high_value'
  const allowed = ['high_value','updated_at','rows','title']
  const sortCol = allowed.includes(sort) ? sort : 'high_value'

  const supabase = await createClient()
  let query = supabase.from('catalog').select('*').order(sortCol, { ascending: sortCol === 'title' })
  if (q) query = query.or(`title.ilike.%${q}%,keywords.ilike.%${q}%,description.ilike.%${q}%`) as any
  const { data } = await query
  return NextResponse.json(data ?? [])
}
```

- [ ] `app/api/quality/route.ts`

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { runAll } from '@/lib/quality'

export async function GET() {
  const supabase = await createClient()
  return NextResponse.json(await runAll(supabase))
}

export async function POST() {
  const supabase = await createClient()
  return NextResponse.json({ results: await runAll(supabase), ran_at: new Date().toISOString() })
}
```

- [ ] `app/api/evaluation/route.ts`

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { computeIndicators } from '@/lib/evaluation'

export async function GET() {
  const supabase = await createClient()
  return NextResponse.json(await computeIndicators(supabase))
}
```

- [ ] `app/api/ontology/route.ts`

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildOntology, getGraph, listActions } from '@/lib/ontology/core'

export async function POST() {
  const supabase = await createClient()
  return NextResponse.json(await buildOntology(supabase))
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type')
  if (type === 'actions') return NextResponse.json(listActions())
  const sgg = searchParams.get('sgg') ?? ''
  const supabase = await createClient()
  return NextResponse.json(await getGraph(supabase, sgg || undefined))
}
```

- [ ] `app/api/ontology/action/[key]/route.ts`

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { scoreAction, listActions } from '@/lib/ontology/core'

export async function GET(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  const allowed = ['settlement','housing','employment']
  if (!allowed.includes(key)) {
    return NextResponse.json({ error: `알 수 없는 액션: ${key}` }, { status: 400 })
  }
  const { searchParams } = new URL(req.url)
  const top = parseInt(searchParams.get('top') ?? '10', 10)
  const supabase = await createClient()
  const actions = listActions()
  const meta = actions.find(a => a.key === key) ?? { name: key, description: '' }
  return NextResponse.json({
    action: meta.name, description: meta.description,
    method: '온톨로지 객체 속성 스코어링 (config/ontology-schema.yaml 가중치)',
    results: await scoreAction(supabase, key, top),
  })
}
```

- [ ] `app/api/nlquery/route.ts`

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { answer } from '@/lib/nlquery'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') ?? ''
  const supabase = await createClient()
  return NextResponse.json(await answer(supabase, q))
}
```

- [ ] `app/api/submission/route.ts`

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createSubmission, newTableName, summarizeQuality, inferSchema } from '@/lib/submission'
import { runQualityGeneric } from '@/lib/quality'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const tenantId = searchParams.get('tenant_id')
  const all = searchParams.get('all') === 'true'
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })

  const role = user.user_metadata?.role
  const userTenant = user.user_metadata?.tenant_id

  if (all) {
    if (role !== 'center') return NextResponse.json({ error: '센터 권한이 필요합니다' }, { status: 403 })
    const { data } = await supabase.from('submissions').select(`*, consultant_comments(count)`).order('submitted_at', { ascending: false })
    return NextResponse.json(data ?? [])
  }

  if (!tenantId) return NextResponse.json({ error: 'tenant_id 필요' }, { status: 400 })
  if (role === 'agency' && userTenant !== tenantId)
    return NextResponse.json({ error: '자신의 기관 데이터만 조회할 수 있습니다' }, { status: 403 })

  const { data } = await supabase.from('submissions').select('*').eq('tenant_id', tenantId).order('submitted_at', { ascending: false })
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })

  const form = await req.formData()
  const file = form.get('file') as File | null
  const tenantId = form.get('tenant_id') as string
  const meta = Object.fromEntries(['title','description','theme','keywords','license','format'].map(k => [k, form.get(k) as string]))
  meta.tenant_id = tenantId

  if (user.user_metadata?.role === 'agency' && user.user_metadata?.tenant_id !== tenantId)
    return NextResponse.json({ error: '자신의 기관 데이터만 등록할 수 있습니다' }, { status: 403 })

  let uploadedData: Record<string, unknown>[] = []
  const tableName = newTableName(tenantId)

  if (file) {
    const text = await file.text()
    const lines = text.trim().split('\n')
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
    uploadedData = lines.slice(1).map(line => {
      const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''))
      return Object.fromEntries(headers.map((h, i) => {
        const v = vals[i] ?? ''
        const n = Number(v)
        return [h, v === '' ? null : isNaN(n) ? v : n]
      }))
    })
    const schemaInfo = inferSchema(uploadedData)
    const preview = uploadedData.slice(0, 20)
    await supabase.from('submission_uploads').insert({
      upload_id: crypto.randomUUID(),
      table_name: tableName, schema_info: schemaInfo,
      preview, row_count: uploadedData.length,
      created_at: new Date().toISOString(),
    })
  }

  const diag = await runQualityGeneric(supabase, tableName, uploadedData)
  const summary = summarizeQuality(diag)
  const rows = parseInt(form.get('rows') as string ?? String(uploadedData.length), 10)
  const subId = await createSubmission(supabase, meta, tableName, rows || uploadedData.length, summary)
  return NextResponse.json({ submission_id: subId, status: 'submitted', quality: diag, quality_summary: summary })
}
```

- [ ] `app/api/submission/[id]/route.ts`

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSubmission } from '@/lib/submission'
import { runQualityGeneric } from '@/lib/quality'
import { generateQualityRecommendations } from '@/lib/quality'
import { computeSubmissionContribution, computeAiReadyChecklist } from '@/lib/evaluation'
import { recommendOntologyCandidates } from '@/lib/ontology/core'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })

  const detail = await getSubmission(supabase, id)
  if (!detail) return NextResponse.json({ error: 'not found' }, { status: 404 })

  if (user.user_metadata?.role === 'agency' && detail.meta.tenant_id !== user.user_metadata?.tenant_id)
    return NextResponse.json({ error: '접근 권한이 없습니다' }, { status: 403 })

  const { data: upload } = await supabase.from('submission_uploads').select('preview').eq('table_name', detail.meta.table_name).maybeSingle()
  const uploadedData = (upload?.preview as Record<string, unknown>[]) ?? []
  const diag = await runQualityGeneric(supabase, detail.meta.table_name, uploadedData)
  return NextResponse.json({
    ...detail,
    quality: diag,
    recommendations: generateQualityRecommendations(diag),
    contribution: computeSubmissionContribution({ ...detail.meta, comment_count: detail.comments.length }),
    ai_ready_checklist: computeAiReadyChecklist(detail.meta),
    ontology_candidates: recommendOntologyCandidates(detail.meta),
  })
}
```

- [ ] `app/api/submission/[id]/decision/route.ts`

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { recordDecision } from '@/lib/submission'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.user_metadata?.role !== 'center')
    return NextResponse.json({ error: '센터 권한이 필요합니다' }, { status: 403 })

  const form = await req.formData()
  const status = form.get('status') as string
  if (!['approved','rejected'].includes(status))
    return NextResponse.json({ error: "status must be 'approved' or 'rejected'" }, { status: 400 })

  await recordDecision(supabase, id, status as 'approved'|'rejected', form.get('decision_note') as string ?? '')
  return NextResponse.json({ submission_id: id, status })
}
```

- [ ] `app/api/submission/[id]/comment/route.ts`

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { addComment } from '@/lib/submission'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.user_metadata?.role !== 'center')
    return NextResponse.json({ error: '센터 권한이 필요합니다' }, { status: 403 })

  const form = await req.formData()
  const commentId = await addComment(supabase, id, form.get('comment') as string)
  return NextResponse.json({ comment_id: commentId, submission_id: id })
}
```

- [ ] `app/api/plan/route.ts`

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { draftOpenPlan, draftQualityPlan } from '@/lib/planning'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const tenantId = searchParams.get('tenant_id') ?? ''
  const type = searchParams.get('type')
  const supabase = await createClient()
  if (type === 'open') return NextResponse.json({ type, draft: await draftOpenPlan(supabase, tenantId) })
  if (type === 'quality') return NextResponse.json({ type, draft: await draftQualityPlan(supabase, tenantId) })
  return NextResponse.json({ error: "type must be 'open' or 'quality'" }, { status: 400 })
}
```

- [ ] 커밋
```
git add app/api/
git commit -m "feat(api): API Routes 전체 구현 (14개 엔드포인트)"
```

---

## Task 11: 레이아웃 & 인증 UI

**Files:** `app/layout.tsx`, `app/page.tsx`, `components/layout/Header.tsx`

- [ ] `app/layout.tsx`

```tsx
// app/layout.tsx
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '이음(EUM) · 경남 공공데이터 플랫폼',
  description: '경남 공공데이터 통합 플랫폼',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-gray-50">{children}</body>
    </html>
  )
}
```

- [ ] `app/page.tsx`

```tsx
// app/page.tsx
import { redirect } from 'next/navigation'
export default function Home() { redirect('/dashboard') }
```

- [ ] `components/layout/Header.tsx`

```tsx
// components/layout/Header.tsx
'use client'
import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const TABS = [
  { key: 'dashboard', label: '대시보드' },
  { key: 'portal',    label: '개방포털' },
  { key: 'quality',   label: '품질진단' },
  { key: 'ontology',  label: '온톨로지' },
  { key: 'ai',        label: '자연어 질의' },
  { key: 'submission',label: '데이터 등록·관리' },
]

export default function Header({ user }: { user: { email?: string; user_metadata?: Record<string, unknown> } | null }) {
  const router = useRouter()
  const path = usePathname()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.refresh()
  }

  return (
    <header className="bg-[#1457b8] text-white shadow">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
        <div className="font-bold text-lg flex items-center gap-2">
          이음 <span className="text-blue-200">EUM</span>
          <small className="text-blue-300 font-normal text-xs ml-1">경남 공공데이터 통합 플랫폼</small>
        </div>
        <nav className="flex gap-1 ml-4 flex-1">
          {TABS.map(t => (
            <button key={t.key} onClick={() => router.push(`/${t.key}`)}
              className={`px-3 py-1.5 rounded text-sm transition-colors ${
                path.startsWith(`/${t.key}`) ? 'bg-white/20 font-medium' : 'hover:bg-white/10'}`}>
              {t.label}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-2 text-sm">
          {user ? (
            <>
              <span className="text-white/70">{String(user.user_metadata?.role ?? '')} · {user.email}</span>
              <button onClick={handleLogout} className="bg-white/15 border border-white/40 px-3 py-1 rounded hover:bg-white/25">로그아웃</button>
            </>
          ) : (
            <button onClick={() => router.push('/login')} className="bg-white/15 border border-white/40 px-3 py-1 rounded hover:bg-white/25">로그인</button>
          )}
        </div>
      </div>
    </header>
  )
}
```

- [ ] `app/login/page.tsx`

```tsx
// app/login/page.tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin() {
    setError('')
    // 데모: username을 email 형식으로 변환
    const email = `${username}@eum.demo`
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) { setError('아이디 또는 비밀번호가 틀렸습니다'); return }
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-xl shadow p-8 w-80">
        <h2 className="text-xl font-bold mb-1">이음(EUM) 로그인</h2>
        <p className="text-xs text-gray-400 mb-4">데모 계정: center/center2026, 48121/gn48121, 48170/gn48170</p>
        <input value={username} onChange={e => setUsername(e.target.value)}
          placeholder="아이디" className="w-full border rounded px-3 py-2 mb-2 text-sm" />
        <input type="password" value={password} onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleLogin()}
          placeholder="비밀번호" className="w-full border rounded px-3 py-2 mb-2 text-sm" />
        {error && <p className="text-red-500 text-xs mb-2">{error}</p>}
        <button onClick={handleLogin} className="w-full bg-[#1457b8] text-white rounded py-2 text-sm hover:bg-blue-700">로그인</button>
      </div>
    </div>
  )
}
```

- [ ] 커밋
```
git add app/layout.tsx app/page.tsx app/login/ components/layout/
git commit -m "feat(ui): 레이아웃, 헤더, 로그인 페이지"
```

---

## Task 12: 페이지 컴포넌트 (6개 탭)

**Files:** `app/dashboard/page.tsx`, `app/portal/page.tsx`, `app/quality/page.tsx`, `app/ontology/page.tsx`, `app/ai/page.tsx`, `app/submission/page.tsx`

- [ ] `app/dashboard/page.tsx`

```tsx
// app/dashboard/page.tsx
import { createClient } from '@/lib/supabase/server'
import Header from '@/components/layout/Header'
import { computeIndicators, AREAS } from '@/lib/evaluation'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const ev = await computeIndicators(supabase)
  const { data: tenants } = await supabase.from('tenants').select('*').order('gov_type',{ascending:false}).order('name')

  const statsCards = [
    { label: '등록 데이터셋', value: ev.summary.datasets },
    { label: '개방 데이터셋', value: ev.summary.open },
    { label: 'AI-Ready', value: ev.summary.ai_ready },
    { label: '온톨로지 객체', value: ev.summary.objects },
  ]

  return (
    <div>
      <Header user={user} />
      <main className="max-w-7xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold mb-1">통합 대시보드</h1>
        <p className="text-gray-500 text-sm mb-4">플랫폼 운영 현황과 2026 평가편람 5개 영역 자동대응 점수</p>

        <div className="grid grid-cols-4 gap-4 mb-6">
          {statsCards.map(c => (
            <div key={c.label} className="bg-white rounded-xl shadow p-4">
              <div className="text-2xl font-bold text-blue-700">{c.value}</div>
              <div className="text-sm text-gray-500">{c.label}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow p-4">
            <h3 className="font-semibold mb-3">평가편람 종합 대응 점수</h3>
            <div className="flex items-center gap-6">
              <div className="w-24 h-24 rounded-full border-8 border-blue-600 flex items-center justify-center">
                <div className="text-center"><b className="text-2xl">{ev.overall}</b><div className="text-xs text-gray-400">/ 100</div></div>
              </div>
              <div className="flex-1 space-y-2">
                {AREAS.map(a => {
                  const area = (ev.areas as any[]).find((x:any) => x.name === a.name)
                  return (
                    <div key={a.key} className="flex items-center gap-2">
                      <div className="w-20 text-xs text-gray-600">{a.name}</div>
                      <div className="flex-1 bg-gray-100 rounded h-2">
                        <div className="h-2 rounded" style={{ width: `${area?.score ?? 0}%`, background: a.color }} />
                      </div>
                      <div className="text-xs w-8 text-right">{area?.score ?? 0}%</div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow p-4">
            <h3 className="font-semibold mb-3">입주 기관 현황 (경남 18개 시군)</h3>
            <div className="grid grid-cols-3 gap-1 text-xs">
              {(tenants ?? []).map((t: any) => (
                <div key={t.tenant_id} className={`px-2 py-1 rounded text-center ${t.onboarded ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-500'}`}>
                  {t.name}
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
```

- [ ] `app/portal/page.tsx`, `app/quality/page.tsx`, `app/ontology/page.tsx`, `app/ai/page.tsx`, `app/submission/page.tsx` — 각 탭을 Client Component로 구현 (기존 app.js 로직 React hooks로 변환)

> 각 페이지는 fetch('/api/…')를 useEffect로 호출하는 구조로 구현. Header 컴포넌트 공유.

- [ ] 커밋
```
git add app/
git commit -m "feat(pages): 6개 탭 페이지 컴포넌트 구현"
```

---

## Task 13: Jest 단위 테스트

**Files:** `__tests__/lib/quality.test.ts`, `__tests__/lib/evaluation.test.ts`, `__tests__/lib/ontology.test.ts`

- [ ] `jest.config.ts` 작성

```ts
// jest.config.ts
import type { Config } from 'jest'
const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
  testPathPattern: '__tests__',
}
export default config
```

- [ ] `__tests__/lib/quality.test.ts`

```ts
import { generateQualityRecommendations, runQualityGeneric } from '@/lib/quality'

test('빈 데이터는 passed=true 반환', async () => {
  const result = await runQualityGeneric({} as any, 'test_table', [])
  expect(result.passed).toBe(true)
  expect(result.rule_count).toBe(0)
})

test('결측치가 있으면 violations > 0', async () => {
  const data = [{ a: null, b: 1 }, { a: 2, b: null }]
  const result = await runQualityGeneric({} as any, 'test_table', data)
  const nullRule = result.detail.find(r => r.rule.includes('결측치 비율 - a'))
  expect(nullRule?.violations).toBe(1)
})

test('passed일때 recommendations 빈 배열', () => {
  const diag = { checked: 100, passed: true, detail: [], error_rate: 0, threshold: 5 }
  expect(generateQualityRecommendations(diag)).toEqual([])
})

test('violations 있으면 recommendations 생성', () => {
  const diag = { checked: 100, passed: false,
    detail: [{ rule: '결측치 비율 - col', violations: 5, threshold: 5 }],
    error_rate: 1, threshold: 5 }
  const recs = generateQualityRecommendations(diag)
  expect(recs.length).toBeGreaterThan(0)
  expect(recs[0]).toContain('결측치 비율 - col')
})
```

- [ ] `__tests__/lib/evaluation.test.ts`

```ts
import { isQualityPassed, computeAiReadyChecklist, computeSubmissionContribution } from '@/lib/evaluation'

test('isQualityPassed — 통과 문자열 인식', () => {
  expect(isQualityPassed('규칙 4종 / 오류율 0% / 통과')).toBe(true)
  expect(isQualityPassed('규칙 4종 / 오류율 5% / 미통과')).toBe(false)
  expect(isQualityPassed(null)).toBe(false)
})

test('computeAiReadyChecklist — 조건 충족 시 ai_ready=true', () => {
  const row = { quality_summary: '통과', rows: 50, description: '20자 이상의 설명 텍스트입니다.',
    title: '제목', theme: '주제', keywords: '키워드', license: 'CC', format: 'csv' }
  const { ai_ready, checklist } = computeAiReadyChecklist(row)
  expect(ai_ready).toBe(true)
  expect(checklist.every(c => c.passed)).toBe(true)
})

test('computeSubmissionContribution — approved+comment → open+share 기여', () => {
  const row = { status: 'approved', quality_summary: '통과', rows: 100, comment_count: 2, decision_note: '승인' }
  const contrib = computeSubmissionContribution(row)
  expect(contrib.find(c => c.key === 'open')?.contributes).toBe(true)
  expect(contrib.find(c => c.key === 'share')?.contributes).toBe(true)
})
```

- [ ] `__tests__/lib/ontology.test.ts`

```ts
import { recommendOntologyCandidates, listActions } from '@/lib/ontology/core'

test('빈 메타는 빈 배열', () => {
  expect(recommendOntologyCandidates({})).toEqual([])
})

test('청년 키워드 → 청년인구 타입 추천', () => {
  const result = recommendOntologyCandidates({ title: '청년 유입·유출 통계', keywords: '청년,인구' })
  expect(result.map(r => r.obj_type)).toContain('청년인구')
})

test('결과 match_score 내림차순', () => {
  const result = recommendOntologyCandidates({ title: '청년 사업체 현황', keywords: '청년,인구,사업체,기업' })
  const scores = result.map(r => r.match_score)
  expect(scores).toEqual([...scores].sort((a, b) => b - a))
})

test('listActions — settlement/housing/employment 포함', () => {
  const acts = listActions()
  const keys = acts.map(a => a.key)
  expect(keys).toContain('settlement')
  expect(keys).toContain('housing')
  expect(keys).toContain('employment')
})
```

- [ ] 테스트 실행 확인
```
npx jest --no-coverage 2>&1
```
Expected: 모든 테스트 통과

- [ ] 커밋
```
git add __tests__/ jest.config.ts
git commit -m "test: Jest 단위 테스트 추가 (quality, evaluation, ontology)"
```

---

## Task 14: 구파일 정리

**Files:** 삭제 대상 목록

- [ ] Python/DuckDB 파일 삭제

```powershell
cd "D:\업무\gd\eum_platform"
Remove-Item -Recurse -Force app/__pycache__, app/__init__.py, app/auth.py, app/database.py
Remove-Item -Recurse -Force app/evaluation.py, app/main.py, app/nlquery.py
Remove-Item -Recurse -Force app/ontology.py, app/planning.py, app/quality.py
Remove-Item -Recurse -Force app/seed_data.py, app/submission.py
Remove-Item -Force run.py, requirements.txt
Remove-Item -Recurse -Force web/
Remove-Item -Force data/eum.duckdb
Remove-Item -Recurse -Force tests/
```

- [ ] `.gitignore` 업데이트 (Next.js 표준)

```
# .gitignore 추가
.next/
node_modules/
.env.local
data/*.duckdb
```

- [ ] 커밋
```
git add -A
git commit -m "chore: Python/DuckDB/HTML 구파일 전면 정리"
```

---

## Task 15: 문서 & status 업데이트

**Files:** `docs/backlog/phase-backlog.md`, `status.html`

- [ ] `status.html` 업데이트 — Next.js+Supabase 재구성 완료 반영
- [ ] `docs/backlog/phase-backlog.md` — Phase 3 "Next.js+Supabase 전면 재구성" 섹션 추가, 완료 표시
- [ ] 커밋
```
git add docs/ status.html
git commit -m "docs: Next.js+Supabase 재구성 완료 — status/백로그 업데이트"
```

---

## 완료 기준

- [ ] `npx jest` → 전체 통과
- [ ] `npm run dev` → http://localhost:3000 정상 동작
- [ ] 6개 탭 브라우저 확인
- [ ] Supabase Auth 로그인·로그아웃 동작
- [ ] Python/DuckDB 파일 미존재 확인
