---
name: eum-platform
description: "이음(EUM) 경남 공공데이터 개방 플랫폼 전용 가이드. Next.js 14 App Router + Supabase 기반 멀티테넌트 공공데이터 플랫폼 작업 시 적용. Triggers: eum_platform, 이음, 공공데이터 개방, 데이터 수집/가공/품질진단/온톨로지/보고서/관리자 기능, Supabase RLS, Next.js API Routes."
metadata:
  author: agents-system
  version: "0.1.0"
  project: C:/업무/eum_platform
---

# 이음(EUM) 플랫폼 — 개발 가이드

## 프로젝트 개요

- **이름**: 이음(EUM) — 경남 공공데이터 개방 플랫폼
- **경로**: `C:/업무/eum_platform`
- **기술 스택**: Next.js 14.2.29 (App Router) + TypeScript 5 + Tailwind CSS 3 + Supabase (PostgreSQL + RLS)
- **버전**: 0.2.0
- **역할 체계**: `center` / `agency` / `viewer` — JWT `user_metadata.role` 및 `user_metadata.tenant_id`로 RLS 제어

## 에이전트 시스템 연동

이 프로젝트는 `C:/업무/agents` 멀티 에이전트 시스템과 연결된다.

### 작업 의무
- **시작**: `python C:/업무/agents/scripts/update_status.py [agent_id] working "[내용]"`
- **완료**: `python C:/업무/agents/scripts/update_status.py [agent_id] done "[내용]"`
- eum_platform 작업 시 사용할 agent_id: `backend`, `frontend`, `dba`, `security`, `tester-unit`, `tester-qa`

### 위키 루프
- 작업 전: `python C:/업무/agents/wiki/_tools/wiki_read.py 이음플랫폼`
- 작업 후: 새로 얻은 지식(버그·결정·패턴)은 `C:/업무/agents/wiki/_tools/wiki_write.py`로 원자적 노트 저장
- MoC: `C:/업무/agents/wiki/MoC/이음플랫폼.md`

## 검증 필수 명령

모든 코드 변경 후 아래를 실행하고 통과해야 한다.

```powershell
npx tsc --noEmit   # TypeScript 타입 검사
npm run lint       # ESLint
npm test           # Jest 단위 테스트
```

배포 전 추가:

```powershell
npm run build      # 프로덕션 빌드
```

## 핵심 보안 규칙

1. **RLS 활성화**: `public` 스키마 모든 테이블은 RLS ON. 정책은 `auth.jwt() -> 'user_metadata' ->> 'role'` 및 `tenant_id` 기반.
2. **비밀정보 환경변수**: `COLLECTION_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, API 키 등은 `.env.local`에만. 소스 코드 하드코딩 금지.
3. **미인증 API 점검**: `middleware.ts`의 `PUBLIC_PREFIXES`에 `/api/` 전체가 공개되어 있어 각 API Route에서 별도 인증 검증 필요. `/api/admin/*`, `/api/analytics/*`, `/api/process/*`, `/api/quality/*` 등은 반드시 `createServerClient` + `getUser()`로 권한 재확인.
4. **입력 검증**: 모든 외부 입력은 Zod 또는 수동 화이트리스트 검증. SQL 인젝션 방지를 위해 Supabase 클라이언트만 사용. raw SQL 문자열 결합 금지.
5. **XSS 방지**: React 기본 이스케이프 유지. `dangerouslySetInnerHTML` 사용 금지. 사용자 입력을 HTML로 렌더링하지 않는다.

## 중요 파일 구조

```
app/
  api/              # Next.js API Routes (Route Handler)
  */page.tsx        # App Router 페이지
components/         # UI 컴포넌트 (ui/ 공용, 기능별 폰더)
lib/
  collector.ts      # 외부 API/CSV 수집 + AES-256-CBC 인증값 암호화
  processor.ts      # 규칙 기반 데이터 가공 엔진
  evaluation.ts     # 평가편람 5영역 지표 자동산출
  quality.ts        # 규칙기반 품질진단 엔진
  submission.ts     # 기관 데이터 제출 처리
  openapi.ts        # 공개 API 게이트웨이 (SHA-256 키 인증)
  ontology.ts       # YAML 온톨로지 파서 및 그래프
  nlquery.ts        # 자연어 의도 매핑
  utils.ts          # 공용 유틸리티 (cn, randomHex)
  supabase/         # browser/server/service_role 클라이언트
supabase/migrations/# SQL 마이그레이션 (001 ~ 019)
scripts/            # Python/Node 시드 및 분석 스크립트
__tests__/          # Jest 단위 테스트
```

## 데이터베이스 마이그레이션

- 모든 스키마 변경은 `supabase/migrations/NNN_설명.sql`로 버전 관리.
- 기존 번호 사이에 삽입 금지. 새 마이그레이션은 `020_*.sql` 다음 번호 사용.
- RLS 정책은 최신 패턴 사용: `auth.jwt() -> 'user_metadata' ->> 'role'`.
- 마이그레이션 적용 후 `npm test` 및 `npx tsc --noEmit` 재실행.

## 롤백 정책

- 대규모 변경 전 `git stash` 또는 별도 브랜치 생성.
- 모든 변경은 `kimi.html`의 "변경 이력 및 롤백" 섹션에 기록.
- 개별 파일 롤백:
  - `git checkout -- lib/processor.ts lib/collector.ts lib/quality.ts __tests__/lib/evaluation.test.ts README.md`
- 복구 불가능한 DB 변경은 반드시 백업 후 적용.

## 언어 규칙

- 모든 텍스트, 코드 주석, 파일명은 순수 한글. 한자/일본어 절대 금지.
- Write tool로 파일 저장 시 한국어 입력이 한자로 변환될 수 있음 → 스크립트에서 `chr(0xC11D)` 또는 `'석'` 명시 사용.

## 활용 스킬

- `supabase` — Supabase Auth/RLS/Postgres 작업
- `supabase-postgres-best-practices` — 쿼리 최적화 및 보안
- `eum-platform-backend` — 이음 API Route 및 백엔드 규칙
- `eum-platform-quality` — 품질진단·가공·평가 규칙
- `eum-platform-frontend` — 이음 프론트엔드 규칙
