# 이음(EUM) — 경남 공공데이터 개방 플랫폼

> 데이터를 잇고, 가치를 연다 · 경남빅데이터센터

**Next.js 14 App Router + Supabase** 기반 멀티테넌트 공공데이터 개방 플랫폼.

## 기술 스택

| 분류 | 기술 |
|------|------|
| 프레임워크 | Next.js 14.2.29 (App Router, TypeScript 5) |
| 스타일 | Tailwind CSS 3.4.1 |
| 데이터베이스 | Supabase (PostgreSQL + Row Level Security) |
| 인증 | Supabase Auth + JWT `user_metadata` 클레임 |
| 지도 | Leaflet + leaflet.markercluster (동적 임포트) |
| 차트 | Recharts |
| 온톨로지 | D3-based 그래프 시각화 |
| 테스트 | Jest 29 + ts-jest + Testing Library |
| 코드 품질 | ESLint (next/core-web-vitals) |

## 개발 환경 설정

```powershell
cd C:\업무\eum_platform
npm install
```

`.env.local` 파일을 프로젝트 루트에 생성한다:

```env
NEXT_PUBLIC_SUPABASE_URL=<Supabase 프로젝트 URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<Supabase anon key>
SUPABASE_SERVICE_ROLE_KEY=<Supabase service role key>
COLLECTION_SECRET=<32바이트 이상 AES-256 암호화 키>
NEXT_PUBLIC_APP_URL=http://localhost:3001
QWEN_API_KEY=<Alibaba Cloud MaaS API key>
QWEN_BASE_URL=<Qwen 엔드포인트>
QWEN_MODEL=qwen-turbo
NEXT_PUBLIC_KAKAO_MAP_KEY=<카카오 JavaScript 키>
RESEND_API_KEY=<Resend API key>
RESEND_FROM_EMAIL=<발신 이메일>
CENTER_NOTIFICATION_EMAIL=<센터 알림 수신 메일>
CRON_SECRET=<Vercel Cron 보호용 시크릿>

# 테스트 계정 생성 시 필요
TEST_CENTER_PASSWORD=<center 테스트 계정 비밀번호>
TEST_AGENCY_PASSWORD=<agency 테스트 계정 비밀번호>
TEST_USER_PASSWORD=<Python 스크립트용 테스트 계정 공통 비밀번호>
```

> ⚠️ **보안 주의**: `COLLECTION_SECRET`과 테스트 계정 비밀번호는 `.env.local`에만 저장하고, 절대 소스 코드나 Git에 커밋하지 않는다.

## 실행

```powershell
npm run dev
# http://localhost:3001
```

## 검증

```powershell
npx tsc --noEmit   # TypeScript 타입 검사
npm run lint       # ESLint
npm test           # Jest 단위 테스트
npm run build      # 프로덕션 빌드
```

## 데이터베이스 마이그레이션

`supabase/migrations/` 디렉터리에 총 19개의 SQL 마이그레이션이 있다.
주요 파일은 다음과 같다:

```
supabase/migrations/
├── 001_initial.sql              # 기본 스키마 (tenants, catalog, submissions, ...)
├── 002_rpc.sql                  # 집계 RPC
├── 003_quality_rpc.sql          # 품질진단 RPC
├── 004_fix_rls_jwt_claims.sql   # RLS JWT 클레임 경로 수정
├── 005_seed_gold_data.sql
├── 006_real_data_and_perf.sql
├── 007_fix_migration_calc.sql
├── 008_gold_business.sql
├── 009_real_facilities.sql
├── 010_collection.sql           # 데이터 수집 관련 테이블
├── 011_processing.sql           # 데이터 가공 파이프라인
├── 012_openapi.sql              # 공개 API 키/로그 테이블
├── 013_access_logs_response_ms.sql
├── 014_search.sql
├── 015_evaluation_enhancements.sql
├── 016_audit_log.sql
├── 017_qualitative_inputs.sql
├── 018_collection_pagination.sql
└── 019_analysis_runs.sql
```

Supabase 대시보드 SQL 에디터에서 파일 번호 순서대로 실행하거나, Supabase CLI `supabase db push`를 사용한다.

> 참고: 일부 초기 마이그레이션(예: `001_initial.sql`)의 RLS 정책은 `auth.jwt() ->> 'role'` 형식을 사용하지만, 최신 정책과 middleware는 `auth.jwt() -> 'user_metadata' ->> 'role'`을 사용한다. 권한 이상 발생 시 RLS 정책을 최신 패턴으로 점검한다.

## 주요 기능 및 경로

| 기능 | 경로 | 설명 |
|------|------|------|
| 대시보드 | `/` | 평가편람 5영역 지표, 현황 요약 |
| 로그인 | `/login` | Supabase Auth 기반 로그인 |
| 개방포털 | `/portal` | DCAT 카탈로그, 데이터셋 상세·다운로드 |
| 데이터 제출 | `/submission` | 기관별 CSV 업로드 + 자동 품질진단 |
| 품질진단 | `/quality` | 규칙기반 gold 테이블 진단 (0.001% 기준) |
| 데이터 가공 | `/process` | 규칙 기반 가공 파이프라인 |
| 온톨로지 | `/ontology` | 시맨틱 그래프 + 정착잠재지수 분석 |
| 자연어 질의 | `/nlquery` | 룰 기반 의도 매핑 |
| AI 채팅 | `/ai` | Qwen AI 연계 |
| 데이터 수집 | `/collect` | 외부 API/CSV 자동 수집 스케줄러 |
| 공개 API 관리 | `/openapi` | API 키 발급·통계 |
| 공개 API | `/api/v1/datasets/*` | API 키 인증 공개 엔드포인트 |
| DCAT | `/api/dcat` | DCAT 카탈로그(JSON-LD) |
| 관리자 | `/admin` | 사용자/테넌트 관리 |
| 분석 대시보드 | `/analytics` | 분석 이력 및 위젯 |
| 보고서 | `/report` | 평가편람 보고서 |
| 지도 | `/map` | 공공시설 지도 |
| 매뉴얼 | `/manual` | 사용자 매뉴얼 |

## 역할 체계 (Supabase RLS)

| 역할 | 권한 |
|------|------|
| `center` | 전체 조회, 제출 승인/반려, 품질진단 실행, 관리자 기능 |
| `agency` | 자신의 기관 데이터만 제출·조회 |
| `viewer` | 읽기 전용(선택적) |

JWT `user_metadata.role` 및 `user_metadata.tenant_id` 클레임으로 RLS를 제어한다.

## 구조

```
app/
  api/           # Next.js API Routes
  */page.tsx     # App Router 페이지
docs/            # 설계 문서, 매뉴얼, 스크린샷
components/      # 공용 UI 컴포넌트
lib/
  collector.ts   # 외부 API/CSV 수집 + AES-256-CBC 인증값 암호화
  processor.ts   # 규칙 기반 데이터 가공 엔진
  evaluation.ts  # 평가편람 5영역 지표 자동산출
  quality.ts     # 규칙기반 품질진단 엔진
  submission.ts  # 기관 데이터 제출 처리
  openapi.ts     # 공개 API 게이트웨이 (SHA-256 키 인증, DCAT 빌더)
  ontology.ts    # YAML 온톨로지 파서 및 그래프
  nlquery.ts     # 자연어 의도 매핑
  utils.ts       # 공용 유틸리티 (cn, randomHex)
  supabase/      # 브라우저/SSR/서비스롤 클라이언트
supabase/
  migrations/    # SQL 마이그레이션 파일
scripts/         # Python/Node 시드 및 분석 스크립트
__tests__/       # Jest 단위 테스트
```

## Python 분석 의존성

`scripts/analyze.py`는 다음 Python 패키지를 필요로 한다. 별도 Python 환경에서 실행하거나, 배포 환경에 미리 설치해야 한다.

```text
pandas
scipy
statsmodels
lifelines
```

로컬 개발 시:

```powershell
pip install pandas scipy statsmodels lifelines
```

## 샘플 데이터

`data/samples/` 디렉터리에는 공공기관(지자체·교육청·도로교통·환경·보건 등)에서 수집·가공·개방할 만한 샘플 데이터가 포함되어 있다. `scripts/generate-seed-data.ts`를 실행하면 CSV/JSON 파일이 재생성된다.

| 파일명 | 주제 | 행 수 | 주요 컬럼 | 활용 예시 |
|--------|------|-------|-----------|-----------|
| `traffic_accidents.csv/json` | 교통사고 | 452 | `year`, `month`, `accident_type`, `fatalities`, `injuries`, `property_damage`, `lon`, `lat` | 교차분석, 상관분석, 지도 시각화 |
| `commercial_area.csv/json` | 상권 | 216 | `year`, `industry`, `store_count`, `sales_amount`, `employee_count`, `opening_count`, `closure_count` | 업종별 비교, 회귀분석 |
| `air_quality.csv/json` | 대기질 | 184 | `year`, `month`, `pm10`, `pm25`, `no2`, `o3`, `co`, `so2` | 시계열 분해, 기술통계 |
| `public_hospital.csv/json` | 공공의료 | 27 | `hospital_type`, `dept`, `doctors`, `nurses`, `beds`, `lon`, `lat` | 빈도분석, 시설 분포 |
| `school_population.csv/json` | 학교/교육 | 144 | `year`, `school_level`, `school_count`, `students`, `teachers`, `classrooms` | ANOVA, 기술통계 |

### 샘플 데이터 재생성

```powershell
npx ts-node --project tsconfig.json scripts/generate-seed-data.ts
```

### Python 분석 엔진으로 샘플 확인

```powershell
python scripts/analyze.py
# stdin 예시: {"action":"parse","session_id":"demo","file_path":"data/samples/air_quality.csv"}
```

### 샘플 데이터 로드 및 분석 테스트

분석 탭의 "카탈로그에서 불러오기" 기능은 `catalog` 테이블의 `dataset_id`를 통해 데이터를 조회한다.
샘플 데이터셋은 `catalog`에 등록되어 있지만, 실제 데이터는 `data/samples/`의 CSV 파일 또는 `submission_uploads.preview`(JSONB)에 있어야 한다.

#### 1) Supabase에 샘플 데이터 적재 (운영/공유 환경)

`.env.local`의 Supabase URL과 Service Role Key를 사용해 샘플 CSV를 `submission_uploads.preview`에 적재하고 `catalog.table_name`을 연결한다.

```powershell
# PowerShell
$env:NEXT_PUBLIC_SUPABASE_URL = "https://..."
$env:SUPABASE_SERVICE_ROLE_KEY = "..."
node scripts/load-samples-to-catalog.mjs
```

실행 후 각 샘플 CSV가 `submission_uploads`에 저장되고, `catalog`의 해당 `dataset_id` 행에 `table_name`이 채워진다.

#### 2) 로컬 개발 시 파일 폴백

Supabase에 preview를 적재하지 않아도, `app/api/catalog/[id]/download/route.ts`가 `dataset_id`를 인식하여
`data/samples/`의 CSV 파일을 직접 반환한다. 다음 `dataset_id`가 지원된다:

- `ds-traffic-accident` → `data/samples/traffic_accidents.csv`
- `ds-commercial-area` → `data/samples/commercial_area.csv`
- `ds-air-quality` → `data/samples/air_quality.csv`
- `ds-public-hospital` → `data/samples/public_hospital.csv`
- `ds-school-population` → `data/samples/school_population.csv`

#### 3) end-to-end 분석 테스트

1. 애플리케이션을 실행한다: `npm run dev`
2. `/analytics`로 이동 후 "카탈로그 로드" 클릭
3. 목록에서 "경남 교통사고 현황" 등 샘플 데이터셋 선택
4. 변수 타입을 확인/조정 (예: `fatalities`, `injuries` → 연속; `accident_type` → 명목)
5. 원하는 분석 선택 후 "분석 실행"
6. 결과 확인 및 "CSV 내보내기"로 저장

생성된 샘플은 `/portal` 데이터셋 카탈로그(`ds-traffic-accident`, `ds-commercial-area`, `ds-air-quality`, `ds-public-hospital`, `ds-school-population`)에도 등록된다.

## 시드 데이터 및 테스트 계정 생성

```powershell
# Supabase 시드 데이터 + 테스트 사용자 생성
node run_seed_and_user.mjs

# Python 기반 테스트 계정 생성
set TEST_USER_PASSWORD=<비밀번호>
python scripts/create_test_users.py
```

테스트 계정 비밀번호는 반드시 환경변수로 전달한다. 소스 코드에 평문 비밀번호가 포함되어 있지 않다.

## 보안 변경 사항

- `COLLECTION_SECRET`이 설정되지 않으면 애플리케이션이 즉시 오류를 발생시킨다. 평문 기본값은 제거되었다.
- 수집/가공 ID 생성에는 `crypto.getRandomValues` 기반 `randomHex`를 사용한다.
- 테스트 계정 생성 스크립트의 평문 비밀번호가 환경변수로 대첐되었다.

## Claude Code / 에이전트 연동

- `.claude/CLAUDE.md` — Claude Code 프로젝트 가이드
- `.agents/skills/eum-platform/` — 플랫폼 전체 스킬
- `.agents/skills/eum-platform-backend/` — 백엔드/API 스킬
- `.agents/skills/eum-platform-quality/` — 품질·가공·평가 스킬
- `.agents/skills/eum-platform-frontend/` — 프론트엔드 스킬
- `scripts/agent-status.py` — agents 시스템 상태 업데이트 브릿지

## 참고 문서

- `docs/specs/` — 설계 문서 및 계획
- `docs/user-guide/` — 사용자 매뉴얼
- `docs/security/` — 보안 검토
- `kimi.html` — 플랫폼 분석 및 개선 보고서
