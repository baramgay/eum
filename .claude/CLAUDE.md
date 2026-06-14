# 이음(EUM) 플랫폼 — Claude Code 프로젝트 가이드

> 경남 공공데이터 개방 플랫폼. Next.js 14 App Router + Supabase.

## 1. 프로젝트 신원

- **경로**: `C:/업무/eum_platform`
- **버전**: 0.2.0
- **주요 스택**: Next.js 14.2.29, TypeScript 5, Tailwind CSS 3.4.1, Supabase (PostgreSQL + RLS), Jest 29
- **역할 체계**: `center` / `agency` / `viewer` — JWT `user_metadata.role` + `tenant_id`로 RLS 제어

## 2. 에이전트 시스템 연동 (필수)

이 프로젝트는 `C:/업무/agents` 멀티 에이전트 시스템에 연결되어 있다.

### 상태 업데이트

모든 실질적 작업의 시작과 완료 시 반드시 아래를 실행한다.

```powershell
# 시작
python C:/업무/agents/scripts/update_status.py backend working "[작업 내용]"

# 완료
python C:/업무/agents/scripts/update_status.py backend done "[완료 내용]"
```

사용 agent_id 예시: `backend`, `frontend`, `dba`, `security`, `tester-unit`, `tester-qa`

### 위키 루프

- 작업 전: `python C:/업무/agents/wiki/_tools/wiki_read.py 이음플랫폼`
- 작업 후: 새 지식은 `C:/업무/agents/wiki/_tools/wiki_write.py`로 원자적 노트 저장
- MoC: `C:/업무/agents/wiki/MoC/이음플랫폼.md`

## 3. 검증 필수

모든 코드 변경 후 실행하고 통과해야 한다.

```powershell
npx tsc --noEmit
npm run lint
npm test
```

배포 전 추가:

```powershell
npm run build
```

## 4. 보안 필수

1. **RLS**: `public` 스키마 모든 테이블 RLS ON.
2. **미들웨어 허점**: `middleware.ts`가 `/api/` 전체를 공개로 처리하므로, 각 Route Handler에서 `supabase.auth.getUser()` + role 검증을 반드시 수행.
3. **비밀정보**: `COLLECTION_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, API 키 등은 `.env.local` 전용. 소스코드 하드코딩 금지.
4. **입력 검증**: 외부 입력은 화이트리스트. SQL 인젝션 방지를 위해 Supabase 클라이언트만 사용.
5. **XSS**: `dangerouslySetInnerHTML` 금지.

## 5. 핵심 파일

- `lib/collector.ts` — 외부 수집 + AES 암호화
- `lib/processor.ts` — 데이터 가공 파이프라인
- `lib/quality.ts` — 품질진단 엔진
- `lib/evaluation.ts` — 평가편람 5영역
- `lib/openapi.ts` — 공개 API 게이트웨이
- `lib/supabase/server.ts` — SSR 클라이언트
- `middleware.ts` — 인증 미들웨어

## 6. 마이그레이션

- 모든 스키마 변경은 `supabase/migrations/NNN_설명.sql`로 추가.
- 새 마이그레이션은 `020_*.sql`부터 시작.
- RLS 정책은 `auth.jwt() -> 'user_metadata' ->> 'role'` 패턴 사용.

## 7. 언어 규칙

- 모든 텍스트, 코드 주석, 파일명은 순수 한글.
- 한자/일본어 절대 금지.

## 8. 롤백

- 대규모 변경 전 `git stash` 또는 별도 브랜치.
- 개별 파일 롤백은 `kimi.html` "변경 이력 및 롤백" 참조.
