# 이음(EUM) 플랫폼 — Next.js + Supabase 전면 재구성 설계

> 작성일: 2026-06-10  
> 승인: 사용자 승인 완료  
> 기준: Phase 1 완료 상태 (FastAPI + DuckDB + Vanilla JS) → Next.js 14 + Supabase 전환

---

## 1. 목표 및 배경

현재 이음(EUM) 플랫폼은 FastAPI(Python) + DuckDB + 순수 HTML/CSS/JS로 구성된 로컬 프로토타입이다.  
Supabase 연동 계획에 따라 Next.js 14 (App Router) + Supabase로 전면 재구성하여 운영 배포 가능한 구조로 전환한다.

### 핵심 결정 사항

- **완전 포팅(Option A) 채택**: Python 비즈니스 로직 7개 모듈을 TypeScript로 재작성. DuckDB 제거.
- **이유**: 현재 로직이 수학·SQL 위주(~1,500줄)로 포팅 가능한 규모; Supabase Auth+RLS가 인증·멀티테넌트를 DB 레벨에서 처리; Vercel+Supabase 단일 배포 단위 확보.

---

## 2. 기술 스택

| 역할 | 기존 | 신규 |
|------|------|------|
| 프론트엔드 | Vanilla HTML/JS | Next.js 14 App Router + TypeScript |
| UI 컴포넌트 | 직접 CSS | Tailwind CSS + shadcn/ui |
| 백엔드 API | FastAPI (Python) | Next.js Route Handlers (TypeScript) |
| 데이터베이스 | DuckDB (단일 파일) | Supabase PostgreSQL |
| 인증 | 데모 JWT (python-jose) | Supabase Auth |
| 멀티테넌트 격리 | 코드 레벨 검사 | Supabase RLS 정책 |
| 배포 | localhost:5959 | Vercel + Supabase Cloud |
| 테스트 | pytest (61개) | Jest (단위) + Playwright (E2E) |

---

## 3. 디렉터리 구조

```
eum_platform/
├── app/                               # Next.js App Router
│   ├── layout.tsx                     # 공통 레이아웃 (헤더·네비·Auth Provider)
│   ├── page.tsx                       # / → /dashboard 리다이렉트
│   ├── dashboard/page.tsx
│   ├── portal/page.tsx
│   ├── quality/page.tsx
│   ├── ontology/page.tsx
│   ├── ai/page.tsx
│   ├── submission/page.tsx
│   └── api/
│       ├── catalog/route.ts
│       ├── quality/route.ts
│       ├── evaluation/route.ts
│       ├── ontology/route.ts
│       ├── ontology/action/[key]/route.ts
│       ├── nlquery/route.ts
│       ├── submission/route.ts
│       ├── submission/[id]/
│       │   ├── route.ts
│       │   ├── decision/route.ts
│       │   └── comment/route.ts
│       └── plan/route.ts
├── components/
│   ├── ui/                            # shadcn/ui 자동생성
│   ├── layout/                        # Header, Nav, AuthStatus
│   ├── dashboard/                     # StatsCards, EvalDonut, TenantList
│   ├── portal/                        # CatalogCard, SearchBar, DatasetDetail
│   ├── quality/                       # QualityTable, QualityBadge
│   ├── ontology/                      # OntologyGraph, ActionPanel, ActionChips
│   ├── ai/                            # NLQueryBox, NLResult
│   └── submission/                    # SubmitForm, SubmissionList, ReviewPanel
├── lib/
│   ├── supabase/
│   │   ├── client.ts                  # 브라우저 클라이언트
│   │   └── server.ts                  # 서버 컴포넌트·Route Handler용
│   ├── quality.ts                     # app/quality.py 포팅
│   ├── evaluation.ts                  # app/evaluation.py 포팅
│   ├── ontology.ts                    # app/ontology.py 포팅
│   ├── nlquery.ts                     # app/nlquery.py 포팅
│   ├── submission.ts                  # app/submission.py 포팅
│   └── planning.ts                    # app/planning.py 포팅
├── config/
│   └── ontology-schema.yaml           # 기존 그대로 유지
├── supabase/
│   ├── migrations/
│   │   └── 001_initial.sql            # 전체 스키마 + RLS 정책
│   └── seed.sql                       # 시드 데이터 (18개 시군 + 골드 데이터)
├── middleware.ts                      # Supabase Auth 세션 갱신
├── docs/                              # 기존 문서 그대로 유지
├── public/
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## 4. 데이터베이스 스키마 (DuckDB → PostgreSQL)

### 테이블 매핑

| DuckDB | PostgreSQL | 변경 사항 |
|--------|-----------|---------|
| `tenants` | `tenants` | 동일 구조 |
| `catalog` | `catalog` | 동일 구조 |
| `submissions` | `submissions` | `user_id uuid` 컬럼 추가 |
| `consultant_comments` | `consultant_comments` | 동일 구조 |
| `quality_results` | `quality_results` | `detail text` → `detail jsonb` |
| `onto_objects` | `onto_objects` | 동일 구조 |
| `onto_links` | `onto_links` | 동일 구조 |
| `gold_youth_population` | `gold_youth_population` | 동일 구조 |
| `gold_business` | `gold_business` | 동일 구조 |
| `gold_public_facility` | `gold_public_facility` | 동일 구조 |
| `usage_log` | `usage_log` | 동일 구조 |

### RLS 정책 요약

```sql
-- catalog, tenants: 전체 공개 읽기
CREATE POLICY "catalog_public_read" ON catalog FOR SELECT USING (true);

-- submissions: agency는 자기 tenant_id만, center는 전체
CREATE POLICY "submissions_agency_isolation" ON submissions
  FOR ALL USING (
    auth.jwt() ->> 'role' = 'center'
    OR (auth.jwt() ->> 'role' = 'agency'
        AND tenant_id = auth.jwt() ->> 'tenant_id')
  );
```

---

## 5. 인증 플로우

```
기존: POST /api/login → python-jose HS256 JWT (8h TTL) → Authorization: Bearer 헤더
신규: Supabase Auth signInWithPassword() → httpOnly 세션 쿠키 → middleware.ts 갱신
```

- **데모 계정 3종** (center/48121/48170) → Supabase Auth 사용자로 생성
- `role`·`tenant_id` → Supabase `user_metadata` 저장
- middleware.ts: 모든 요청에서 `supabase.auth.getSession()` 호출 → 토큰 자동 갱신

---

## 6. 비즈니스 로직 포팅 계획

| Python 모듈 | TypeScript 대상 | 포팅 복잡도 |
|-------------|----------------|-----------|
| `app/quality.py` | `lib/quality.ts` | 낮음 (SQL + 통계) |
| `app/evaluation.py` | `lib/evaluation.ts` | 낮음 (집계 계산) |
| `app/ontology.py` | `lib/ontology.ts` | 낮음 (수학 스코어링) |
| `app/nlquery.py` | `lib/nlquery.ts` | 중간 (키워드 매칭 + SQL 생성) |
| `app/submission.py` | `lib/submission.ts` | 낮음 (CRUD + 검증) |
| `app/planning.py` | `lib/planning.ts` | 낮음 (템플릿 생성) |
| `app/seed_data.py` | `supabase/seed.sql` | 낮음 (SQL INSERT) |
| `config/ontology-schema.yaml` | 그대로 유지 (js-yaml로 로드) | 없음 |

---

## 7. 구현 단계

1. **인프라 초기화** — Next.js 프로젝트 scaffold, Supabase 연결, Tailwind+shadcn 설정
2. **DB 마이그레이션** — `supabase/migrations/001_initial.sql` 작성 (스키마 + RLS + 인덱스)
3. **시드 데이터** — `supabase/seed.sql` 작성 (18개 시군 + 골드 데이터 + Auth 사용자)
4. **인증** — Supabase Auth 연동, middleware.ts, 로그인 페이지, 역할 관리
5. **코어 라이브러리 포팅** — 6개 Python 모듈 → TypeScript
6. **API Routes** — 기존 FastAPI 엔드포인트 1:1 매핑 (14개 라우트)
7. **페이지·컴포넌트** — 6개 탭 React 컴포넌트 재구성
8. **테스트** — Jest 단위 + Playwright E2E
9. **구파일 정리** — Python/HTML/DuckDB 파일 삭제
10. **문서 업데이트** — status.html, phase-backlog.md, progress 갱신

---

## 8. 구파일 정리 대상 (재구성 완료 후 삭제)

```
app/               # Python 모듈 전체
run.py
web/               # HTML/JS/CSS
requirements.txt
data/eum.duckdb
tests/             # pytest → Jest/Playwright 교체
```

**유지 대상**: `docs/`, `config/ontology-schema.yaml`, `.git/`

---

## 9. 완료 기준

- [ ] 기존 6개 탭(대시보드·포털·품질진단·온톨로지·자연어질의·데이터등록관리) 전 기능 동작
- [ ] Supabase Auth 로그인·로그아웃, 역할별 접근 제어
- [ ] RLS 멀티테넌트 격리 검증 (agency → 자기 tenant_id만)
- [ ] Jest 단위 테스트 통과
- [ ] Playwright E2E 기본 플로우 검증
- [ ] Python/DuckDB 파일 전면 제거
- [ ] Vercel 배포 가능 구조 확인
