# 이음(EUM) — 경남 공공데이터 개방 플랫폼

> 데이터를 잇고, 가치를 연다 · 경남빅데이터센터

**Next.js 14 App Router + Supabase** 기반 멀티테넌트 공공데이터 개방 플랫폼.

## 기술 스택

| 분류 | 기술 |
|------|------|
| 프레임워크 | Next.js 14 (App Router, TypeScript) |
| 스타일 | Tailwind CSS |
| 데이터베이스 | Supabase (PostgreSQL + Row Level Security) |
| 인증 | Supabase Auth + JWT `user_metadata` 클레임 |
| 지도 | Leaflet + leaflet.markercluster (동적 임포트) |
| 차트 | Recharts |
| 온톨로지 | D3-based 그래프 시각화 |

## 개발 환경 설정

```powershell
cd C:\업무\eum_platform
npm install
```

`.env.local` 파일 확인:

```env
NEXT_PUBLIC_SUPABASE_URL=<Supabase 프로젝트 URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<Supabase anon key>
SUPABASE_SERVICE_ROLE_KEY=<Supabase service role key>
COLLECTION_SECRET=<32바이트 AES-256 암호화 키>
NEXT_PUBLIC_APP_URL=http://localhost:3000
QWEN_API_KEY=<Alibaba Cloud MaaS API key>
QWEN_BASE_URL=<Qwen 엔드포인트>
QWEN_MODEL=qwen-turbo
NEXT_PUBLIC_KAKAO_MAP_KEY=<카카오 JavaScript 키>
```

## 실행

```powershell
npm run dev
# http://localhost:3000
```

## 데이터베이스 마이그레이션

```
supabase/migrations/
├── 001_initial.sql          # 기본 스키마 (tenants, catalog, quality_results, ...)
├── 002_collection.sql       # 데이터 수집 관련 테이블
├── 003_openapi.sql          # 공개 API 키 테이블
└── 004_fix_rls_jwt_claims.sql  # RLS JWT 클레임 경로 수정
```

Supabase 대시보드 SQL 에디터에서 순서대로 실행한다.

## 주요 기능

| 기능 | 경로 | 설명 |
|------|------|------|
| 대시보드 | `/` | 평가편람 5영역 지표, 현황 요약 |
| 개방포털 | `/portal` | DCAT 카탈로그, 지도·차트 시각화 |
| 데이터 제출 | `/submit` | 기관별 CSV 업로드 + 자동 품질진단 |
| 품질진단 | `/quality` | 규칙기반 gold 테이블 진단 (0.001% 기준) |
| 온톨로지 | `/ontology` | 시맨틱 그래프 + 정착잠재지수 분석 |
| 자연어 질의 | `/nlquery` | 5개 인텐트 오프라인 매핑 |
| AI 채팅 | `/chat` | Qwen AI 연계 |
| 데이터 수집 | `/collect` | 외부 API/CSV 자동 수집 스케줄러 |
| 공개 API | `/api/open/...` | API 키 인증 공개 엔드포인트 |

## 역할 체계 (Supabase RLS)

| 역할 | 권한 |
|------|------|
| `center` | 전체 조회, 제출 승인/반려, 품질진단 실행 |
| `agency` | 자신의 기관 데이터만 제출·조회 |

JWT `user_metadata.role` 및 `user_metadata.tenant_id` 클레임으로 RLS 제어.

## 구조

```
app/
  api/          # Next.js API Routes
  (pages)/      # App Router 페이지
components/     # 공용 UI 컴포넌트
lib/
  collector.ts  # 외부 API/CSV 수집 + AES-256-CBC 인증값 암호화
  evaluation.ts # 평가편람 5영역 지표 자동산출 (가중 평균)
  quality.ts    # 규칙기반 품질진단 엔진
  submission.ts # 기관 데이터 제출 처리
  openapi.ts    # 공개 API 게이트웨이 (SHA-256 키 인증, DCAT 빌더)
  utils.ts      # 공용 유틸리티 (cn, randomHex)
supabase/
  migrations/   # SQL 마이그레이션 파일
```
