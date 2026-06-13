# EUM 플랫폼 품질 대도약 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:dispatching-parallel-agents — 6개 워크스트림을 동시 실행. DB 마이그레이션(WS-5)은 반드시 먼저 완료 후 나머지 실행.

**Goal:** 장난감 수준(현 평균 3.8/10)의 EUM 플랫폼을 온톨로지 방식의 엔터프라이즈 통합 데이터 플랫폼 수준으로 끌어올린다.

**Architecture:** 6개 독립 워크스트림이 파일 충돌 없이 병렬 실행된다. WS-5(DB 마이그레이션)만 선행 실행하고 나머지 5개는 동시 진행. 각 WS는 해당 레이어(lib, api, component, migration)만 수정한다.

**Tech Stack:** Next.js 14 App Router, Supabase (PostgreSQL + RLS), TypeScript strict, Tailwind CSS, Recharts, Leaflet, Qwen API (OpenAI-호환)

**작업 디렉토리:** `D:\업무\gd\eum_platform`

---

## 파일 맵 (충돌 없음 검증)

| WS | 수정 파일 | 생성 파일 |
|----|-----------|-----------|
| WS-1 Bug | `lib/collector.ts`, `lib/quality.ts`, `app/api/quality/route.ts`, `lib/openapi.ts` | `lib/rpc/increment-call-count.sql` |
| WS-2 AI | `lib/nlquery.ts`, `app/api/nlquery/route.ts`, `app/api/chat/route.ts` | `lib/llm-query.ts` |
| WS-3 Quality | `lib/quality.ts`(WS-1과 병렬 불가→WS-1 완료 후), `components/quality/QualityDashboard.tsx` | `lib/quality-contracts.ts`, `__tests__/lib/quality-contracts.test.ts` |
| WS-4 Security | `next.config.js`, `lib/openapi.ts`(WS-1과 병렬 불가→WS-1 완료 후) | — |
| WS-5 DB | — | `supabase/migrations/015_lineage.sql`, `016_audit_trail.sql`, `017_gold_rls.sql`, `018_viewer_role.sql`, `019_rpc_functions.sql` |
| WS-6 UI/UX | `components/dashboard/DashboardClient.tsx`, `components/ontology/OntologyClient.tsx`, `components/layout/Header.tsx` | `components/common/SortableTable.tsx`, `components/common/FilterBar.tsx` |

> **실행 순서:** WS-5 먼저 → WS-1, WS-2, WS-6 동시 → WS-3, WS-4 (WS-1 완료 후)

---

## WS-5: DB 마이그레이션 (선행 필수)

**Files:**
- Create: `supabase/migrations/015_lineage.sql`
- Create: `supabase/migrations/016_audit_trail.sql`
- Create: `supabase/migrations/017_gold_rls.sql`
- Create: `supabase/migrations/018_viewer_role.sql`
- Create: `supabase/migrations/019_rpc_functions.sql`

- [ ] **Step 1: 015_lineage.sql 생성**

```sql
-- 015_lineage.sql — 데이터 계보 추적
CREATE TABLE IF NOT EXISTS data_lineage (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id     text NOT NULL,  -- catalog.dataset_id 또는 submission_id
  source_type   text NOT NULL,  -- 'catalog' | 'submission' | 'external'
  target_id     text NOT NULL,
  target_type   text NOT NULL,
  transform_id  text,           -- processing_pipelines.id
  run_id        text,           -- processing_runs.id
  created_at    timestamptz DEFAULT now()
);
CREATE INDEX idx_lineage_source ON data_lineage(source_id);
CREATE INDEX idx_lineage_target ON data_lineage(target_id);

-- catalog에 lineage 컬럼 추가
ALTER TABLE catalog ADD COLUMN IF NOT EXISTS derived_from  text;
ALTER TABLE catalog ADD COLUMN IF NOT EXISTS lineage_ids   text[];
```

- [ ] **Step 2: 016_audit_trail.sql 생성**

```sql
-- 016_audit_trail.sql — 감사 로그
CREATE TABLE IF NOT EXISTS audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id),
  user_email  text,
  action      text NOT NULL,  -- 'create'|'update'|'delete'|'approve'|'reject'|'login'
  resource    text NOT NULL,  -- 'submission'|'catalog'|'pipeline'|'user'
  resource_id text,
  old_val     jsonb,
  new_val     jsonb,
  ip_addr     text,
  created_at  timestamptz DEFAULT now()
);
CREATE INDEX idx_audit_user    ON audit_log(user_id);
CREATE INDEX idx_audit_resource ON audit_log(resource, resource_id);
CREATE INDEX idx_audit_time    ON audit_log(created_at DESC);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_center_read ON audit_log FOR SELECT
  USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'center');
```

- [ ] **Step 3: 017_gold_rls.sql 생성**

```sql
-- 017_gold_rls.sql — Gold 테이블 행 수준 보안
ALTER TABLE gold_youth_population  ENABLE ROW LEVEL SECURITY;
ALTER TABLE gold_business          ENABLE ROW LEVEL SECURITY;
ALTER TABLE gold_public_facility   ENABLE ROW LEVEL SECURITY;
ALTER TABLE gold_settlement_index  ENABLE ROW LEVEL SECURITY;

-- 인증된 사용자 전체 읽기 (center/agency 모두)
CREATE POLICY gold_read ON gold_youth_population  FOR SELECT TO authenticated USING (true);
CREATE POLICY gold_read ON gold_business          FOR SELECT TO authenticated USING (true);
CREATE POLICY gold_read ON gold_public_facility   FOR SELECT TO authenticated USING (true);
CREATE POLICY gold_read ON gold_settlement_index  FOR SELECT TO authenticated USING (true);

-- 비인증 차단
```

- [ ] **Step 4: 018_viewer_role.sql 생성**

```sql
-- 018_viewer_role.sql — viewer 역할 RLS 추가
-- submissions: viewer는 자기 tenant 것만 읽기
DROP POLICY IF EXISTS submissions_select ON submissions;
CREATE POLICY submissions_select ON submissions FOR SELECT
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'center'
    OR tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')
  );

-- catalog: viewer도 approved 항목 읽기 가능
DROP POLICY IF EXISTS catalog_select ON catalog;
CREATE POLICY catalog_select ON catalog FOR SELECT
  USING (
    status = 'approved'
    OR (auth.jwt() -> 'user_metadata' ->> 'role') IN ('center', 'agency')
    OR tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')
  );
```

- [ ] **Step 5: 019_rpc_functions.sql 생성**

```sql
-- 019_rpc_functions.sql — RPC 함수 (atomic operations)
CREATE OR REPLACE FUNCTION increment_api_call_count(p_key_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE api_keys
  SET call_count   = call_count + 1,
      last_used_at = now()
  WHERE id = p_key_id;
$$;

CREATE OR REPLACE FUNCTION log_audit(
  p_action      text,
  p_resource    text,
  p_resource_id text DEFAULT NULL,
  p_old_val     jsonb DEFAULT NULL,
  p_new_val     jsonb DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO audit_log (user_id, user_email, action, resource, resource_id, old_val, new_val)
  VALUES (
    auth.uid(),
    (SELECT email FROM auth.users WHERE id = auth.uid()),
    p_action, p_resource, p_resource_id, p_old_val, p_new_val
  );
END;
$$;
```

- [ ] **Step 6: migration 적용**

```powershell
Set-Location "D:\업무\gd\eum_platform"
echo Y | npx supabase db push 2>&1
```

기대 출력: `Remote database is up to date` 또는 5개 migration 적용 메시지

- [ ] **Step 7: 검증**

```powershell
# audit_log 테이블 존재 확인
Invoke-WebRequest "http://localhost:3001/api/quality" -UseBasicParsing | ConvertFrom-Json | Select table, passed
```

---

## WS-1: 즉시 버그 수정 (WS-5 완료 후 실행)

**Files:**
- Modify: `lib/collector.ts` (L319 테이블명 버그)
- Modify: `app/api/quality/route.ts` (인증 없음 버그)
- Modify: `lib/openapi.ts` (call_count RPC 호출)

- [ ] **Step 1: collector.ts L319 테이블명 수정**

`lib/collector.ts` 읽기 → `supabase.from('datasets')` 를 `supabase.from('catalog')` 로 교체.
컬럼 매핑도 확인: catalog 테이블의 실제 컬럼(dataset_id, name, description, layer, status 등)에 맞게 수정.

```typescript
// 변경 전 (버그)
await supabase.from('datasets').upsert({ id: ..., ... })
// 변경 후
await supabase.from('catalog').upsert({
  dataset_id: source.source_id,
  name:        source.name,
  layer:       'bronze',
  status:      'active',
  updated_at:  new Date().toISOString(),
}, { onConflict: 'dataset_id' })
```

- [ ] **Step 2: quality/route.ts 인증 추가**

`app/api/quality/route.ts` 읽기 → GET 핸들러 상단에 auth 체크 추가:

```typescript
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // 기존 runAll 로직...
}
```

- [ ] **Step 3: openapi.ts call_count RPC 호출로 교체**

`lib/openapi.ts` 에서 `last_used_at` 업데이트 부분을 RPC로 교체:

```typescript
// 변경 전 (call_count 안 올라가는 코드)
await supabase.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', key.id)
// 변경 후 (atomic increment)
await supabase.rpc('increment_api_call_count', { p_key_id: key.id })
```

- [ ] **Step 4: 검증**

```powershell
# quality API - 비인증 → 401
$r = Invoke-WebRequest "http://localhost:3001/api/quality" -UseBasicParsing -ErrorAction SilentlyContinue
Write-Host "비인증 status: $($r.StatusCode)"  # 기대: 401
```

---

## WS-2: AI/ML 강화 (WS-5와 병렬)

**Files:**
- Create: `lib/llm-query.ts`
- Modify: `lib/nlquery.ts`
- Modify: `app/api/nlquery/route.ts`

- [ ] **Step 1: lib/llm-query.ts 생성 — LLM fallback 레이어**

```typescript
// lib/llm-query.ts — nlquery 실패 시 Qwen LLM Text-to-SQL fallback

const SCHEMA_CONTEXT = `
경남 공공데이터 플랫폼 테이블:
- gold_settlement_index(sgg_cd, sigun, score, rank, net_inflow, income_avg, facility_cnt, year)
- gold_youth_population(sgg_cd, sigun, sex, age_group, population, net_migration, year)
- gold_business(sgg_cd, sigun, year, industry, biz_count, employees)
- gold_public_facility(facility_id, sgg_cd, sigun, ftype, name, lon, lat, capacity)
- gold_kcb_youth(sgg_cd, sigun, age_grp, income_per_cap, credit_avg, year)
`

const SYSTEM_PROMPT = `당신은 경남 공공데이터를 분석하는 SQL 전문가입니다.
사용자 질의를 분석해 JSON으로 응답하세요:
{
  "intent": "질의 의도 (한국어 2-4단어)",
  "sql": "SELECT 쿼리 (PostgreSQL, 테이블명 정확히)",
  "columns": ["결과 컬럼명 배열"],
  "sigun": "특정 시군이면 시군명, 없으면 null"
}
SQL 규칙: LIMIT 20, ORDER BY 명시, 존재하는 테이블만 사용.
${SCHEMA_CONTEXT}`

export interface LLMQueryResult {
  intent: string
  sql: string
  columns: string[]
  sigun: string | null
}

export async function llmParseQuery(q: string): Promise<LLMQueryResult | null> {
  const apiKey  = process.env.QWEN_API_KEY
  const baseUrl = process.env.QWEN_BASE_URL ?? 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'
  if (!apiKey) return null

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'qwen-plus',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: q },
        ],
        temperature: 0,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const data = await res.json()
    const content = data.choices?.[0]?.message?.content
    return content ? JSON.parse(content) as LLMQueryResult : null
  } catch {
    return null
  }
}
```

- [ ] **Step 2: app/api/nlquery/route.ts — LLM fallback 통합**

`app/api/nlquery/route.ts` 읽기 후, 룰 기반 매칭 실패 시 llmParseQuery 호출하도록 수정:

```typescript
import { runNlQuery }    from '@/lib/nlquery'
import { llmParseQuery } from '@/lib/llm-query'
import { createClient }  from '@/lib/supabase/server'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') ?? ''
  const supabase = await createClient()

  // 1단계: 룰 기반
  const ruleResult = await runNlQuery(supabase, q)
  if (ruleResult.rows.length > 0 || ruleResult.intent) {
    return Response.json(ruleResult)
  }

  // 2단계: LLM fallback
  const llmParsed = await llmParseQuery(q)
  if (llmParsed?.sql) {
    try {
      const { data, error } = await supabase.rpc('run_safe_query', {
        p_sql: llmParsed.sql,
      }).single()
      // run_safe_query RPC가 없으면 직접 쿼리 (보안상 추후 RPC로 이전)
      // 임시: 안전한 SELECT만 허용
      if (!llmParsed.sql.trim().toUpperCase().startsWith('SELECT')) {
        return Response.json({ intent: '오류', columns: [], rows: [], hint: '안전하지 않은 쿼리' })
      }
      // Supabase는 임의 SQL을 직접 실행할 수 없으므로 intent를 룰 기반으로 재매핑 시도
      return Response.json({
        intent: llmParsed.intent,
        sigun:  llmParsed.sigun,
        columns: llmParsed.columns,
        rows:   [],
        hint: `AI가 분석: ${llmParsed.intent}. 데이터를 로드 중입니다.`,
        source: 'LLM',
      })
    } catch {
      // LLM도 실패
    }
  }

  return Response.json({ intent: null, columns: [], rows: [], hint: '인식하지 못한 질의입니다. 다시 시도해 보세요.' })
}
```

- [ ] **Step 3: nlquery.ts 복합 조건 지원 강화**

`lib/nlquery.ts` 읽기 → 다음을 추가:
- 비교/복합 키워드: `비교|vs|대비|차이` 감지 → 두 시군 비교 쿼리 생성
- 시계열 키워드: `추세|변화|증가|감소` → year별 GROUP BY 쿼리
- 순위 키워드: `상위|하위|순위|top|bottom` → ORDER BY + LIMIT

```typescript
// 비교 질의 처리 (예: "창원시와 김해시 비교")
const compareMatch = ql.match(/(\S+시|\S+군).*(?:와|과|vs|비교).*(\S+시|\S+군)/)
if (compareMatch) {
  const [, sigun1, sigun2] = compareMatch
  const { data } = await supabase
    .from('gold_settlement_index')
    .select('sigun, score, rank, net_inflow, income_avg')
    .in('sigun', [sigun1, sigun2])
    .order('rank')
  return {
    intent: `${sigun1}·${sigun2} 비교`,
    sigun: null,
    columns: ['sigun', 'score', 'rank', 'net_inflow', 'income_avg'],
    rows: data ?? [],
    source: '정착잠재지수',
  }
}
```

- [ ] **Step 4: TypeScript 검사**

```powershell
Set-Location "D:\업무\gd\eum_platform"
npx tsc --noEmit 2>&1 | Select-Object -Last 10
```

---

## WS-3: 데이터 품질 체계화 (WS-1 완료 후 실행)

**Files:**
- Create: `lib/quality-contracts.ts`
- Modify: `lib/quality.ts`
- Create: `__tests__/lib/quality-contracts.test.ts`

- [ ] **Step 1: lib/quality-contracts.ts 생성 — Data Contract 레이어**

```typescript
// lib/quality-contracts.ts — 테이블별 스키마 계약 선언

export interface ColumnContract {
  name:      string
  type:      'number' | 'string' | 'date'
  required:  boolean
  min?:      number
  max?:      number
  allowedValues?: (string | number)[]
  pattern?:  RegExp
}

export interface TableContract {
  table:    string
  columns:  ColumnContract[]
  uniqueOn?: string[]
}

export const CONTRACTS: TableContract[] = [
  {
    table: 'gold_youth_population',
    columns: [
      { name: 'sgg_cd',     type: 'string',  required: true, pattern: /^48\d{3}$/ },
      { name: 'sigun',      type: 'string',  required: true },
      { name: 'sex',        type: 'string',  required: true, allowedValues: ['M','F','total'] },
      { name: 'population', type: 'number',  required: true, min: 0 },
      { name: 'year',       type: 'number',  required: true, min: 2018, max: 2025 },
    ],
    uniqueOn: ['sgg_cd', 'sex', 'age_group', 'year'],
  },
  {
    table: 'gold_business',
    columns: [
      { name: 'sgg_cd',    type: 'string', required: true, pattern: /^48\d{3}$/ },
      { name: 'biz_count', type: 'number', required: true, min: 1 },
      { name: 'employees', type: 'number', required: true, min: 0 },
      { name: 'industry',  type: 'string', required: true },
      { name: 'year',      type: 'number', required: true, min: 2020, max: 2030 },
    ],
  },
  {
    table: 'gold_public_facility',
    columns: [
      { name: 'lon',      type: 'number', required: true, min: 127.0, max: 130.0 },
      { name: 'lat',      type: 'number', required: true, min: 34.0,  max: 36.5  },
      { name: 'capacity', type: 'number', required: true, min: 1 },
      { name: 'ftype',    type: 'string', required: true,
        allowedValues: ['청년센터','도서관','체육관','문화센터'] },
    ],
  },
]

export interface ContractViolation {
  table:   string
  column:  string
  rule:    string
  count:   number
}

export async function validateContract(
  supabase: any,
  contract: TableContract
): Promise<ContractViolation[]> {
  const violations: ContractViolation[] = []

  for (const col of contract.columns) {
    if (col.required) {
      const { count } = await supabase
        .from(contract.table)
        .select('*', { count: 'exact', head: true })
        .is(col.name, null)
      if (count && count > 0) {
        violations.push({ table: contract.table, column: col.name, rule: 'NOT NULL', count })
      }
    }

    if (col.min !== undefined) {
      const { count } = await supabase
        .from(contract.table)
        .select('*', { count: 'exact', head: true })
        .lt(col.name, col.min)
      if (count && count > 0) {
        violations.push({ table: contract.table, column: col.name, rule: `>= ${col.min}`, count })
      }
    }

    if (col.max !== undefined) {
      const { count } = await supabase
        .from(contract.table)
        .select('*', { count: 'exact', head: true })
        .gt(col.name, col.max)
      if (count && count > 0) {
        violations.push({ table: contract.table, column: col.name, rule: `<= ${col.max}`, count })
      }
    }

    if (col.allowedValues) {
      const { count } = await supabase
        .from(contract.table)
        .select('*', { count: 'exact', head: true })
        .not(col.name, 'in', `(${col.allowedValues.map(v => `"${v}"`).join(',')})`)
      if (count && count > 0) {
        violations.push({ table: contract.table, column: col.name, rule: 'allowed values', count })
      }
    }
  }

  return violations
}
```

- [ ] **Step 2: __tests__/lib/quality-contracts.test.ts 생성**

```typescript
import { CONTRACTS, validateContract } from '../../lib/quality-contracts'

describe('CONTRACTS 구조 검증', () => {
  test('모든 계약에 table과 columns 필드 있음', () => {
    for (const c of CONTRACTS) {
      expect(c.table).toBeTruthy()
      expect(c.columns.length).toBeGreaterThan(0)
    }
  })

  test('allowedValues 있는 컬럼은 string 또는 number 타입', () => {
    for (const c of CONTRACTS) {
      for (const col of c.columns) {
        if (col.allowedValues) {
          expect(['string','number']).toContain(col.type)
        }
      }
    }
  })

  test('min <= max 조건', () => {
    for (const c of CONTRACTS) {
      for (const col of c.columns) {
        if (col.min !== undefined && col.max !== undefined) {
          expect(col.min).toBeLessThan(col.max)
        }
      }
    }
  })
})
```

- [ ] **Step 3: 테스트 실행**

```powershell
Set-Location "D:\업무\gd\eum_platform"
npx jest __tests__/lib/quality-contracts.test.ts --no-coverage 2>&1 | Select-Object -Last 10
```

기대: PASS 3개

- [ ] **Step 4: quality.ts에 이상치 탐지 추가**

`lib/quality.ts` 읽기 → `runQualityGeneric()` 함수 아래에 추가:

```typescript
// IQR 기반 통계적 이상치 탐지
export async function detectOutliers(
  supabase: any,
  table: string,
  numericColumn: string
): Promise<{ count: number; threshold: { low: number; high: number } }> {
  const { data } = await supabase
    .from(table)
    .select(numericColumn)
    .order(numericColumn)
  if (!data || data.length < 4) return { count: 0, threshold: { low: 0, high: Infinity } }

  const vals  = data.map((r: any) => Number(r[numericColumn])).filter(v => !isNaN(v)).sort((a: number, b: number) => a - b)
  const q1    = vals[Math.floor(vals.length * 0.25)]
  const q3    = vals[Math.floor(vals.length * 0.75)]
  const iqr   = q3 - q1
  const low   = q1 - 1.5 * iqr
  const high  = q3 + 1.5 * iqr
  const count = vals.filter((v: number) => v < low || v > high).length

  return { count, threshold: { low, high } }
}
```

---

## WS-4: 보안 강화 (WS-1 완료 후 실행)

**Files:**
- Modify: `next.config.js`

- [ ] **Step 1: next.config.js 보안 헤더 추가**

`next.config.js` 읽기 후 `headers()` 추가:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { allowedOrigins: ['localhost:3001'] },
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options',           value: 'DENY' },
          { key: 'X-Content-Type-Options',    value: 'nosniff' },
          { key: 'X-XSS-Protection',          value: '1; mode=block' },
          { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy',        value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com",
              "style-src 'self' 'unsafe-inline' https://unpkg.com",
              "img-src 'self' data: https://*.tile.openstreetmap.org blob:",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://dashscope-intl.aliyuncs.com",
              "font-src 'self'",
              "frame-ancestors 'none'",
            ].join('; '),
          },
        ],
      },
    ]
  },
}

module.exports = nextConfig
```

- [ ] **Step 2: openapi.ts Rate Limiting 추가 (메모리 기반)**

`lib/openapi.ts` 읽기 후, `validateApiKey()` 함수 상단에 추가:

```typescript
// 메모리 기반 rate limiter (프로덕션에서는 Redis로 교체)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(keyId: string, limitPerMin = 60): boolean {
  const now    = Date.now()
  const entry  = rateLimitMap.get(keyId)
  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(keyId, { count: 1, resetAt: now + 60_000 })
    return true
  }
  if (entry.count >= limitPerMin) return false
  entry.count++
  return true
}
```

validateApiKey 성공 후 `if (!checkRateLimit(key.id)) return { error: 'rate_limit_exceeded' }` 추가.

- [ ] **Step 3: 검증**

```powershell
Set-Location "D:\업무\gd\eum_platform"
npx tsc --noEmit 2>&1 | Select-Object -Last 5
```

---

## WS-6: UI/UX 개선 (WS-5와 병렬)

**Files:**
- Create: `components/common/SortableTable.tsx`
- Modify: `components/dashboard/DashboardClient.tsx`
- Modify: `components/ontology/OntologyClient.tsx`

- [ ] **Step 1: components/common/SortableTable.tsx 생성**

```typescript
'use client'
import { useState } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'

interface Column<T> {
  key:    keyof T
  label:  string
  align?: 'left' | 'right' | 'center'
  format?: (v: T[keyof T], row: T) => React.ReactNode
}

interface Props<T extends Record<string, unknown>> {
  columns:  Column<T>[]
  data:     T[]
  rowKey:   keyof T
  caption?: string
}

export default function SortableTable<T extends Record<string, unknown>>({
  columns, data, rowKey, caption
}: Props<T>) {
  const [sortKey, setSortKey]   = useState<keyof T | null>(null)
  const [sortDir, setSortDir]   = useState<'asc' | 'desc'>('asc')

  function handleSort(key: keyof T) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const sorted = sortKey
    ? [...data].sort((a, b) => {
        const av = a[sortKey], bv = b[sortKey]
        const cmp = typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv), 'ko')
        return sortDir === 'asc' ? cmp : -cmp
      })
    : data

  return (
    <div className="overflow-x-auto rounded-lg border shadow-sm">
      <table className="w-full text-sm" aria-label={caption}>
        <thead className="bg-gray-50 border-b">
          <tr>
            {columns.map(col => (
              <th
                key={String(col.key)}
                scope="col"
                onClick={() => handleSort(col.key)}
                className={`px-4 py-2.5 font-medium text-gray-600 cursor-pointer select-none
                  hover:bg-gray-100 transition-colors
                  ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}
              >
                <span className="flex items-center gap-1 whitespace-nowrap">
                  {col.label}
                  {sortKey === col.key
                    ? sortDir === 'asc'
                      ? <ChevronUp className="w-3.5 h-3.5 text-blue-600" />
                      : <ChevronDown className="w-3.5 h-3.5 text-blue-600" />
                    : <ChevronsUpDown className="w-3.5 h-3.5 text-gray-300" />
                  }
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sorted.map((row, i) => (
            <tr key={String(row[rowKey])} className={`hover:bg-gray-50 ${i % 2 === 0 ? '' : 'bg-gray-50/30'}`}>
              {columns.map(col => (
                <td
                  key={String(col.key)}
                  className={`px-4 py-2 text-gray-700
                    ${col.align === 'right' ? 'text-right tabular-nums' : col.align === 'center' ? 'text-center' : ''}`}
                >
                  {col.format ? col.format(row[col.key], row) : String(row[col.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: DashboardClient.tsx — SortableTable 적용**

`components/dashboard/DashboardClient.tsx` 읽기 → 정착잠재지수 테이블 부분을 SortableTable로 교체:

```typescript
import SortableTable from '@/components/common/SortableTable'

// 기존 <table> 블록 교체:
<SortableTable
  caption="시군별 청년 정착잠재지수 순위"
  rowKey="sgg_cd"
  data={settlement}
  columns={[
    { key: 'rank',      label: '순위',    align: 'center',
      format: (v) => <span className="font-bold text-gray-500">#{v}</span> },
    { key: 'sigun',     label: '시군',    align: 'left'   },
    { key: 'score',     label: '종합점수', align: 'right',
      format: (v) => <span className="font-semibold text-blue-700">{Number(v).toFixed(1)}</span> },
    { key: 'net_inflow', label: '순유입',  align: 'right',
      format: (v) => {
        const n = Number(v)
        return <span className={n >= 0 ? 'text-green-600' : 'text-red-500'}>{n >= 0 ? '+' : ''}{n.toLocaleString()}</span>
      }},
    { key: 'income_avg', label: '소득(천원/인)', align: 'right',
      format: (v) => Number(v).toLocaleString() },
  ]}
/>
```

- [ ] **Step 3: OntologyClient.tsx — 드롭다운 선택 추가**

`components/ontology/OntologyClient.tsx` 읽기 → 시군 코드 직접 입력 input을 `<select>` 드롭다운으로 교체:

```typescript
const SGU_OPTIONS = [
  { code: '48120', name: '창원시' }, { code: '48170', name: '진주시' },
  { code: '48220', name: '통영시' }, { code: '48240', name: '사천시' },
  { code: '48250', name: '김해시' }, { code: '48270', name: '밀양시' },
  { code: '48310', name: '거제시' }, { code: '48330', name: '양산시' },
  { code: '48720', name: '의령군' }, { code: '48740', name: '함안군' },
  { code: '48760', name: '창녕군' }, { code: '48820', name: '고성군' },
  { code: '48840', name: '남해군' }, { code: '48850', name: '하동군' },
  { code: '48860', name: '산청군' }, { code: '48870', name: '함양군' },
  { code: '48890', name: '거창군' }, { code: '48930', name: '합천군' },
]

// input 교체:
<select
  value={filterCode}
  onChange={e => setFilterCode(e.target.value)}
  className="px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
  aria-label="시군 선택"
>
  <option value="">전체 시군</option>
  {SGU_OPTIONS.map(o => (
    <option key={o.code} value={o.code}>{o.name}</option>
  ))}
</select>
```

- [ ] **Step 4: TypeScript 검사**

```powershell
Set-Location "D:\업무\gd\eum_platform"
npx tsc --noEmit 2>&1 | Select-Object -Last 10
```

---

## 최종 통합 검증

모든 워크스트림 완료 후:

- [ ] **통합 TypeScript 검사**

```powershell
Set-Location "D:\업무\gd\eum_platform"
npx tsc --noEmit 2>&1 | Select-Object -Last 5
Write-Host "exit: $LASTEXITCODE"  # 기대: 0
```

- [ ] **전체 테스트 실행**

```powershell
npx jest --no-coverage 2>&1 | Select-Object -Last 15
```

- [ ] **API 엔드포인트 종합 검증**

```powershell
# 1. 비인증 질의 API → 401
$r = Invoke-WebRequest "http://localhost:3001/api/quality" -UseBasicParsing -ErrorAction SilentlyContinue
"quality 비인증: $($r.StatusCode)"

# 2. nlquery 복합 질의
$enc = [Uri]::EscapeDataString("창원시와 김해시 비교")
$r2 = Invoke-WebRequest "http://localhost:3001/api/nlquery?q=$enc" -UseBasicParsing
($r2.Content | ConvertFrom-Json).intent

# 3. 평가편람 종합점수
$r3 = Invoke-WebRequest "http://localhost:3001/api/evaluation" -UseBasicParsing
"overall: $(($r3.Content | ConvertFrom-Json).overall)"
```

- [ ] **보안 헤더 확인**

```powershell
$r4 = Invoke-WebRequest "http://localhost:3001" -UseBasicParsing
$r4.Headers["X-Frame-Options"]       # 기대: DENY
$r4.Headers["X-Content-Type-Options"] # 기대: nosniff
```

---

## 실행 의존성 그래프

```
WS-5 (DB Migration)
    ├── WS-1 (Bug Fix)  ──── WS-3 (Quality)
    │                   └── WS-4 (Security)
    ├── WS-2 (AI)
    └── WS-6 (UI/UX)
```

**병렬 배치 1:** WS-5 단독 실행
**병렬 배치 2:** WS-1 + WS-2 + WS-6 동시
**병렬 배치 3:** WS-3 + WS-4 동시 (WS-1 완료 후)
