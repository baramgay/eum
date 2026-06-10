# 이음(EUM) 플랫폼 — 페이즈별 백로그

> 작성일: 2026-06-09 / 최종 업데이트: 2026-06-10  
> 기준 브랜치: `master`  
> **Phase 1(FastAPI+DuckDB+Vanilla JS) 전체 완료**  
> **Phase 2(Next.js 14+TypeScript+Supabase 전환) 2026-06-10 완료**

---

## Phase 1 잔여 (✅ 2026-06-10 전체 완료)

### ✅ 테스트 격리 (pytest 공유 DB 문제) — 완료

- **완료 커밋**: `b408d74` — "test: pytest 격리 설정 추가"
- **완료 내용**: `tests/conftest.py` 신규 생성 (scope="session" 임시 DuckDB 픽스처), `center_auth_header`·`agency_48121_auth_header` 픽스처 포함. 59/59 테스트 통과, 운영 DB 오염 없음.

---

### ✅ 인증 레이어 추가 (데모 JWT) — 완료

- **완료 커밋**: `a98c9b3` — "feat(auth): demo JWT 인증 레이어 추가"
- **완료 내용**: `app/auth.py` 신규 (HS256 JWT, 8시간 TTL, 데모 계정 3종), `POST /api/login`, 6개 보호 라우트에 `Depends(auth.get_current_user)`/`Depends(auth.require_center)` 의존성 주입, `components/ontology/OntologyClient.tsx`에 로그인/로그아웃 UI + `getAuthHeaders()`, `web/index.html`에 로그인 모달. 미인증 → 401, 브라우저 E2E 검증 완료.
- **운영 전 후속**: `EUM_JWT_SECRET` 환경변수 교체, 경남도 SSO(외부 IdP) 연동 필요.

---

### ✅ 멀티테넌트 데이터 격리 강화 — 완료

- **완료 커밋**: `cd28c51` — "feat(auth): 멀티테넌트 격리 완성 및 require_center 의존성 수정"
- **완료 내용**: `GET /api/submission` 인증 필수·agency는 자기 tenant_id만 조회, `GET /api/submission/all` 센터 전용 격리. `require_center` `Depends(get_current_user)` 명시 (None 버그 수정). 멀티테넌트 격리 테스트 5개 추가, 59/59 통과.

---

### ✅ esc() 속성 컨텍스트 확장 (`"` 이스케이프) — 완료

- **완료 커밋**: `8bead78` (잔여 보간 지점 esc 적용), `3d61aef` (테스트 정렬)
- **완료 내용**: `esc()` 함수에 `"` → `&quot;` 치환 추가(4종 완전 적용), `tests/test_xss.py`에 `esc('"')`·`esc(0)`·`esc(None)` 케이스 3개 추가.

---

### ✅ FastAPI lifespan 마이그레이션 (`on_event` deprecated 경고 제거) — 완료

- **완료 커밋**: `2cf00ec` — (lifespan 컨텍스트 매니저 전환 포함)
- **완료 내용**: `@app.on_event("startup")` → `@asynccontextmanager lifespan` 전환. on_event 관련 DeprecationWarning 제거.

---

### ✅ quality_results.detail DB 저장 형식 JSON 전환 — 완료

- **완료 커밋**: `f991bf6` — "fix(ui,db): hide empty plan-draft block, add favicon, JSON-ify quality detail"
- **완료 내용**: `app/quality.py`에서 `str(detail)` → `json.dumps(detail, ensure_ascii=False)`, `app/api/*/route.ts`에 `_parse_detail()` 헬퍼(json.loads 우선·ast.literal_eval 레거시 폴백). 59/59 통과.

---

### ✅ 코드 리뷰 보안 수정 (database/submission/ontology/evaluation/nlquery/seed) — 완료

- **완료 커밋**: `e075661`, `436382b`, `6a17615`, `e7b1c16`
- **완료 내용**: DB RLock 경쟁 조건 수정, table_name SQL injection 방지, `get_submission` 404 처리, submission_decision status 검증, CSV 업로드 락, ontology None 가드, `_is_quality_passed` 헬퍼 추출, nlquery 행정명 suffix 안전 처리, seed_data 배치 INSERT 전환.

---

## Phase 2 완료 항목 (2026-06-10)

### ✅ Next.js 14 App Router + TypeScript 전환 — 완료

- **설계문서**: `docs/superpowers/specs/2026-06-10-nextjs-supabase-migration-design.md`
- **구현계획**: `docs/superpowers/plans/2026-06-10-nextjs-supabase-migration.md`
- **완료 내용**: 15개 태스크 전체 완료.
  - TypeScript 코어 6모듈(quality/evaluation/ontology/nlquery/submission/planning)
  - Supabase PostgreSQL + RLS 멀티테넌트 격리 (supabase/migrations/ 3개)
  - Supabase Auth + @supabase/ssr SSR 클라이언트
  - Next.js API Routes 14개 (app/api/)
  - 6개 탭 페이지 (App Router, Tailwind CSS)
  - Jest 단위 테스트 3파일
  - 구 Python/DuckDB/HTML 파일 전체 삭제

---

## Phase 3 (온톨로지·LLM 고도화 — 중기)

### 실제 LLM 연동 (text-to-SQL)

- **목적**: 현재 `lib/nlquery.ts`는 규칙 기반 키워드 매칭과 폴백 SQL만 사용한다. Claude API(또는 공공망 배포 가능 LLM)를 연동해 자연어 질의 정확도와 범위를 높인다.
- **예상 변경 파일**: `lib/nlquery.ts`(LLM 호출 레이어 추가, 기존 규칙 기반 폴백 유지), `app/api/*/route.ts`(API 키 설정·타임아웃 처리), `package.json`(SDK 추가)
- **위험도**: 높음 (공공망 LLM 가용성, 응답 지연, 생성 SQL의 안전성 검증 필요)
- **선행 조건**: 공공망 LLM 또는 VPN 경유 API 사용 정책 결정, SQL 샌드박스(읽기 전용 DuckDB 연결 또는 화이트리스트 테이블 제한) 구현
- **완료 기준**: 청년·사업체·시설 관련 임의 한국어 질문 → 90%+ 의도 매칭, 생성 SQL이 읽기 전용 경계 내에서만 실행됨을 자동 검증

---

### 온톨로지 자동 업데이트 (CDC 연동)

- **목적**: 현재 골드 데이터 변경 시 `/api/ontology/build`를 수동 호출해야 온톨로지가 갱신된다. 데이터 변경을 감지해 자동 재빌드함으로써 온톨로지 최신성을 보장한다.
- **예상 변경 파일**: `lib/ontology.ts`(변경 감지 로직 추가), 스케줄러 설정(APScheduler 또는 Celery Beat 등), `app/api/*/route.ts`(스케줄러 시작·종료 라이프사이클 연동)
- **위험도**: 보통
- **선행 조건**: 실 DB·CDC(변경 데이터 캡처) 연동 또는 폴링 기반 변경 감지 방식 결정
- **완료 기준**: 데이터 변경 후 5분 이내 온톨로지 자동 갱신, 수동 빌드 API 호출 없이도 최신 상태 유지

---

### 온톨로지 스키마 외부화 (OWL/RDF 또는 설정 파일)

- **목적**: 현재 `build_ontology()` 내에 경남 18개 시군 코드·엔티티 타입·관계가 하드코딩되어 타 지역 적용이 불가하다. 설정 파일로 외부화하면 다른 도·시 단위에도 동일 코드베이스를 재사용할 수 있다.
- **예상 변경 파일**: `lib/ontology.ts`(하드코딩 상수 설정 파일 참조로 교체), `config/ontology-schema.yaml`(신규 — 엔티티 타입·관계·시군코드 정의)
- **위험도**: 낮음
- **선행 조건**: 없음
- **완료 기준**: `config/ontology-schema.yaml`만 수정해 타 지역 시군 코드로 온톨로지 빌드 가능, 경남 기존 동작 회귀 없음

---

### 온톨로지 후보 추천 NLP 강화

- **목적**: 현재 `recommend_ontology_candidates()`(Stretch E)는 단순 `in` 부분 문자열 매칭을 사용한다. 형태소 분석(KoNLPy) 또는 임베딩 유사도를 적용해 "청년정책", "취업지원" 등 간접 표현에서도 올바른 후보를 추천하도록 정확도를 높인다.
- **예상 변경 파일**: `lib/ontology.ts`(추천 로직 교체), `package.json`(KoNLPy 또는 `sentence-transformers` 등 추가)
- **위험도**: 낮음
- **선행 조건**: 선택 라이브러리의 공공망 설치 가능 여부 확인
- **완료 기준**: "청년정책" 입력 → 청년인구 타입 추천, "취업지원" → 사업체 타입 추천, 기존 직접 키워드 매칭 정확도 회귀 없음

---

### 팔란티어형 액션(Action) 확장

- **목적**: 현재 온톨로지 탭의 액션은 "청년 정착지원 우선지역 선정" 1종만 존재한다. 주거지원 우선지역, 산업단지 후보 선정 등 정책 목적별 복수 액션을 추가해 실제 의사결정 지원 범위를 넓힌다.
- **예상 변경 파일**: `lib/ontology.ts`(액션 함수 추가), `app/api/*/route.ts`(액션 API 라우트 추가 또는 파라미터화), `components/ontology/OntologyClient.tsx`(액션 선택 UI 추가)
- **위험도**: 낮음
- **선행 조건**: 경남도 정책 우선순위 및 추가할 액션 목록 확정
- **완료 기준**: 2종 이상 액션이 API로 제공되고 UI에서 선택·실행 가능, 기존 액션 동작 회귀 없음

---

## Phase 3 (운영앱 — 장기)

### 공공클라우드 배포 (NCP 또는 G-클라우드)

- **목적**: 현재 localhost:5959 프로토타입을 실제 운영 환경에 배포해 외부 접근 및 다중 이용자 사용이 가능하도록 한다.
- **예상 변경 파일**: `Dockerfile`(신규), `docker-compose.yml`(신규), CI/CD 파이프라인 설정(신규), `app/api/*/route.ts`(HTTPS 종단 처리 또는 역방향 프록시 연동), CSP/HSTS 헤더 설정
- **위험도**: 높음 (네트워크 보안 심의, 개인정보 처리 방침, 공공클라우드 심사 절차 필요)
- **선행 조건**: 인증 레이어 완료, 법률 검토(개인정보보호법·공공데이터법), 클라우드 계약 완료
- **완료 기준**: 외부 URL HTTPS 접근 가능, CSP 헤더 설정, 초기 부하 테스트 통과

---

### 실 DuckDB → PostgreSQL 또는 공공 데이터 레이크 연동

- **목적**: 단일 파일 DuckDB는 동시 쓰기·대용량·실시간 수집에 한계가 있다. 운영 RDBMS(PostgreSQL 등) 또는 실시간 데이터 파이프라인과 연동해 경남 행정 데이터를 자동 수집·갱신한다.
- **예상 변경 파일**: `app/database.py`(연결 추상화 레이어 도입), `app/submission.py`, `app/quality.py`, `app/planning.py`, `app/evaluation.py`, `lib/ontology.ts`, `lib/nlquery.ts`(SQL 호환성 전수 검토 및 수정)
- **위험도**: 높음 (전체 데이터 레이어 재구성, 기존 DuckDB 전용 문법 의존성 제거 필요)
- **선행 조건**: 공공클라우드 배포 완료, 경남도 데이터 거버넌스 정책 확정
- **완료 기준**: 실시간 경남 행정 데이터 자동 수집·갱신, 기존 API 응답 구조 회귀 없음

---

### 모바일·접근성 최적화

- **목적**: 현재 데스크톱 전용 CSS로 모바일 기기에서 레이아웃이 깨진다. 반응형 레이아웃과 웹 접근성(WCAG 2.1 AA) 준수를 통해 모든 기기·보조 기술에서 사용 가능하게 한다.
- **예상 변경 파일**: `web/style.css`(미디어 쿼리 전면 추가), `web/index.html`(ARIA 속성·역할 추가, 키보드 내비게이션 보장)
- **위험도**: 낮음
- **선행 조건**: 운영 배포 완료 (배포 환경 확정 후 실기기 검증 가능)
- **완료 기준**: 모바일 기기(320px~)에서 5개 탭 전 기능 사용 가능, WCAG 2.1 AA 자동 검사 도구 기준 위반 0건

---

### 감사 로그(Audit Log) 시스템

- **목적**: 기관 담당자·센터 직원의 모든 조작 이력(제출 생성, 상태 변경, 코멘트 추가 등)을 보관해 보안 감사 및 규정 준수 요건을 충족한다.
- **예상 변경 파일**: `app/database.py`(`audit_log` 테이블 스키마 추가), `app/api/*/route.ts`(모든 상태 변경 API 핸들러에 로그 삽입), `app/submission.py`(로그 기록 헬퍼 추가)
- **위험도**: 낮음
- **선행 조건**: 인증 레이어 완료 (로그에 기록할 사용자 신원이 있어야 함)
- **완료 기준**: 모든 submission 상태 변경(생성·승인·반려·코멘트)이 `audit_log` 테이블에 타임스탬프·사용자·내용과 함께 기록됨

---

### 다국어 지원 (영문 메타데이터 병행 입력)

- **목적**: 경남 데이터를 국제 기관 또는 외국인 연구자와 공유하기 위해 데이터셋 영문 제목·설명을 병행 제공한다.
- **예상 변경 파일**: `app/database.py`(`catalog` 및 `submissions` 테이블에 `title_en`, `description_en` 컬럼 추가), `web/index.html`(언어 토글 버튼), `components/ontology/OntologyClient.tsx`(개방포털 카드 및 제출 폼 영문 필드 추가), `app/api/*/route.ts`(API 응답에 영문 필드 포함)
- **위험도**: 낮음
- **선행 조건**: 운영 배포 완료
- **완료 기준**: 개방포털 탭에서 언어 토글 버튼 → 영문 `title`/`description` 표시, 기관 담당자 등록 폼에서 영문 필드 선택 입력 가능
