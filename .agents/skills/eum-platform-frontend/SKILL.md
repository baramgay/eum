---
name: eum-platform-frontend
description: "이음(EUM) 플랫폼 프론트엔드 개발 가이드. Next.js 14 App Router page.tsx + React 18 + Tailwind CSS + 공용 UI 컴포넌트 + Leaflet/Recharts/D3 시각화 작업 시 적용."
metadata:
  author: agents-system
  version: "0.1.0"
  project: C:/업무/eum_platform
---

# 이음(EUM) 프론트엔드 개발 가이드

## 기술 스택

- **프레임워크**: Next.js 14 App Router (`app/**/page.tsx`)
- **UI 라이브러리**: React 18
- **스타일**: Tailwind CSS 3.4.1
- **아이콘**: lucide-react
- **차트**: Recharts
- **지도**: Leaflet + leaflet.markercluster (동적 임포트)
- **온톨로지 그래프**: D3
- **상태/토스트**: react-hot-toast
- **접근성**: 공공기관 웹 접근성 기준 준수

## 페이지 구조

```
app/
  page.tsx           # 대시보드 (평가편람 5영역 지표)
  login/page.tsx     # 로그인
  portal/page.tsx    # 개방포털
  submission/page.tsx# 데이터 제출
  quality/page.tsx   # 품질진단
  process/page.tsx   # 데이터 가공
  ontology/page.tsx  # 온톨로지
  nlquery/page.tsx   # 자연어 질의
  ai/page.tsx        # AI 채팅
  collect/page.tsx   # 데이터 수집
  openapi/page.tsx   # 공개 API 관리
  analytics/page.tsx # 분석 대시보드
  report/page.tsx    # 보고서
  map/page.tsx       # 공공시설 지도
  manual/page.tsx    # 매뉴얼
  admin/page.tsx     # 관리자
```

## 공용 UI 컴포넌트 (`components/ui/`)

- `Btn.tsx` — 버튼
- `Card.tsx` — 카드
- `Badge.tsx` — 배지
- `EmptyState.tsx` — 빈 상태
- `PageHeader.tsx` — 페이지 헤더
- `StatCard.tsx` — 통계 카드
- `Toast.tsx` — 토스트

신규 컴포넌트 추가 시 `components/ui/index.ts`에 export 등록.

## 클라이언트 컴포넌트 규칙

- `'use client'`는 필요한 최상단에서만 선언.
- 서버 데이터 fetch가 필요한 page.tsx는 기본적으로 Server Component 유지.
- 상호작용이 필요한 부분만 Client Component로 분리 (`components/*/*Client.tsx` 패턴).

## 데이터 페칭

- 서버 컴포넌트: `lib/supabase/server.ts` 사용
- 클라이언트: `lib/supabase/client.ts` 사용
- 권한 체크는 middleware + RLS로 이중화. 프론트에서도 role 기반 UI 분기.

## 보안

- `dangerouslySetInnerHTML` 사용 금지.
- 사용자 입력은 텍스트 바인딩으로 렌더링.
- `.env.local`의 `NEXT_PUBLIC_*` 변수는 브라우저에 노출됨. 민감 키는 `NEXT_PUBLIC_` prefix 없이 서버 전용으로 관리.

## 지도 컴포넌트

- Leaflet은 `next/dynamic`으로 동적 임포트.
- `FacilityMap.tsx`, `MapInner.tsx` 참조.
- 카카오맠 사용 시 `NEXT_PUBLIC_KAKAO_MAP_KEY` 필요.

## 차트/온톨로지

- Recharts는 클라이언트 컴포넌트에서만 사용.
- D3 온톨로지 그래프는 `components/ontology/OntologyGraph.tsx` 참조.

## 테스트

- 컴포넌트 테스트: `@testing-library/react` + `@testing-library/jest-dom`
- 실행: `npm test`
- E2E: Playwright (`@playwright/test` 설치됨)

## 검증

```powershell
npm run lint
npx tsc --noEmit
npm test
npm run build
```

## 롤백

- UI 컴포넌트 변경: `git checkout -- components/ui/[파일].tsx`
- 페이지 변경: `git checkout -- app/[경로]/page.tsx`
