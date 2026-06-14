---
name: eum-platform-backend
description: "이음(EUM) 플랫폼 백엔드/API 개발 가이드. Next.js 14 App Router Route Handler + Supabase SSR/service_role 클라이언트, RLS, 미인증 API 보호, 데이터 수집/가공/품질진단/온톨로지/공개API 엔드포인트 작업 시 적용."
metadata:
  author: agents-system
  version: "0.1.0"
  project: C:/업무/eum_platform
---

# 이음(EUM) 백엔드/API 개발 가이드

## 아키텍처

- **프레임워크**: Next.js 14 App Router Route Handler (`app/api/**/route.ts`)
- **인증**: Supabase Auth + `@supabase/ssr` 서버 클라이언트
- **권한**: JWT `user_metadata.role` (center/agency/viewer) + `user_metadata.tenant_id`
- **DB 접근**: `lib/supabase/server.ts` (SSR) 또는 `lib/supabase/service_role.ts` (관리자/배치)

## 미들웨어와 공개 API 주의

`middleware.ts`:

```typescript
const PUBLIC_PREFIXES = ['/login', '/api/']
```

- `/api/` 전체가 미인증으로 접근 가능하므로 **각 Route Handler에서 반드시 인증·인가를 재검증**해야 한다.
- `/api/v1/datasets/*`, `/api/dcat` 같은 공개 API는 API 키 인증(`openapi.ts`)을 거친다.
- `/api/admin/*`, `/api/analytics/*`, `/api/process/*`, `/api/quality/*` 등은 `supabase.auth.getUser()` 후 `user_metadata.role === 'center'` 등으로 제한.

## Route Handler 표준 패턴

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() } } }
  )

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    return NextResponse.json({ error: '인증되지 않았습니다' }, { status: 401 })
  }

  const role = user.user_metadata?.role
  if (role !== 'center') {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  }

  // ... 비즈니스 로직
}
```

## 서비스 롤 사용 제한

- `service_role` 클라이언트는 관리자 API, 배치 작업, RLS 우회가 필요한 경우에만 사용.
- 일반 사용자 요청 처리 시 service_role 사용 금지.
- service_role 키는 서버에서만 사용. 브라우저 클라이언트(`lib/supabase/client.ts`)에는 `NEXT_PUBLIC_SUPABASE_ANON_KEY`만 노출.

## 주요 라이브러리 규칙

### `lib/collector.ts`

- `COLLECTION_SECRET` 환경변수 미설정 시 즉시 오류 발생.
- AES-256-CBC 인증값 암호화. 키는 `rawSecret.padEnd(32, '!').slice(0, 32)`로 32바이트 정규화.
- 수집 ID는 `randomHex` 기반 (`coll_` prefix). 하드코딩된 기본값 금지.

### `lib/processor.ts`

- 테이블명: `processing_pipelines`, `processing_runs` (복수형).
- ID prefix: `prun_`, `proc_` + `randomHex(4)`.
- 가공 규칙은 JSON으로 저장. 실행 결과는 `processing_runs`에 기록.

### `lib/quality.ts`

- 연산자 화이트리스트: `lt`, `lte`, `gt`, `gte`, `eq`, `neq`만 허용.
- 외부에서 전달된 연산자는 반드시 `ALLOWED_OPS.includes()`로 검증.
- 품질진단 기준: gold 테이블 대상, 0.001% 허용 오차.

### `lib/openapi.ts`

- API 키 인증은 SHA-256 해시 비교.
- DCAT JSON-LD 빌더 포함.
- 공개 엔드포인트는 `/api/v1/datasets/*`.

## 보안 체크리스트

- [ ] 모든 Route Handler에서 `getUser()`로 인증 확인
- [ ] 관리자/민감 작업에서 role 검증
- [ ] 외부 입력값 화이트리스트 검증
- [ ] 서비스 롤 사용 사유 문서화
- [ ] 환경변수 하드코딩 없음
- [ ] 에러 응답에 민감정보(스택트레이스, DB 상세) 미포함

## 테스트

- API 단위 테스트는 `__tests__/`에 추가.
- 테스트 실행: `npm test`
- Route Handler 테스트 시 `node-mocks-http` 또는 `@testing-library/react` 대신 별도 핸들러 래퍼 권장.

## 롤백

- `lib/collector.ts`, `lib/processor.ts`, `lib/quality.ts` 변경 시 `kimi.html` 기준 롤백 명령 참조.
- 마이그레이션 롤백은 `supabase/migrations/`에서 해당 파일 삭제 또는 down 스크립트 실행.
