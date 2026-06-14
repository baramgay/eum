---
name: eum-platform-quality
description: "이음(EUM) 플랫폼 데이터 품질·가공·평가 가이드. lib/quality.ts, lib/processor.ts, lib/evaluation.ts, lib/submission.ts 및 관련 DB 마이그레이션 작업 시 적용."
metadata:
  author: agents-system
  version: "0.1.0"
  project: C:/업무/eum_platform
---

# 이음(EUM) 데이터 품질·가공·평가 가이드

## 개요

- **품질진단**: `lib/quality.ts` — gold 테이블 기반 규칙기반 진단
- **데이터 가공**: `lib/processor.ts` — 규칙 기반 처리 파이프라인
- **평가편람**: `lib/evaluation.ts` — 5영역 지표 자동산출
- **데이터 제출**: `lib/submission.ts` — 기관 CSV 업로드 + 자동 품질진단

## 품질진단 (`lib/quality.ts`)

### 연산자 화이트리스트

```typescript
type CountOp = 'lt' | 'lte' | 'gt' | 'gte' | 'eq' | 'neq'
const ALLOWED_OPS: CountOp[] = ['lt', 'lte', 'gt', 'gte', 'eq', 'neq']

if (!ALLOWED_OPS.includes(op as CountOp)) {
  throw new Error(`지원하지 않는 품질진단 연산자: ${op}`)
}
```

- 외부 입력 연산자는 반드시 위 화이트리스트를 통과해야 한다.
- 새 연산자 추가 시 `CountOp` 타입, `ALLOWED_OPS` 배열, 테스트 케이스를 함께 수정.

### 품질진단 체인

1. gold 테이블 선택
2. 진단 규칙(컬럼, 연산자, 기준값) 검증
3. RPC 또는 서버사이드 쿼리로 위반 건수 산출
4. 결과를 `quality_diagnoses` 테이블에 저장
5. 허용 오차 0.001% 기준으로 pass/fail 판정

## 데이터 가공 (`lib/processor.ts`)

### 테이블 및 ID 규칙

| 개체 | 테이블 | ID prefix | 생성 함수 |
|------|--------|-----------|-----------|
| 파이프라인 | `processing_pipelines` | `proc_` | `randomHex(4)` |
| 실행 이력 | `processing_runs` | `prun_` | `randomHex(4)` |

- `randomHex`는 `crypto.getRandomValues` 기반 (`lib/utils.ts`).
- 하드코딩된 기본 ID 또는 timestamp 기반 ID 사용 금지.

### 가공 규칙 JSON

- 규칙은 프론트엔드 RuleEditor에서 JSON으로 편집.
- 백엔드에서는 스키마 검증 후 실행.
- 실패한 규칙은 `processing_runs.error_log`에 기록.

## 평가편람 (`lib/evaluation.ts`)

### 체크리스트

`computeAiReadyChecklist`는 8개 항목을 반환한다.

```typescript
it('체크리스트가 8개 항목', () => {
  const { checklist } = computeAiReadyChecklist({})
  expect(checklist).toHaveLength(8)
})
```

- 새 항목 추가 시 테스트도 함께 추가.
- 각 항목은 `name`과 `pass` 프로퍼티를 가진다.

### 5영역 지표

- 데이터셋 등록/품질/활용/접근성/만족도 등으로 구성.
- 점수 산출 로직 변경 시 `__tests__/lib/evaluation.test.ts`와 동기화.

## 데이터 제출 (`lib/submission.ts`)

- CSV 업로드 후 자동 품질진단 실행.
- `agency` 역할은 자신의 `tenant_id` 데이터만 조회/제출.
- `center` 역할은 전체 기관 데이터 조회 및 승인/반려.

## 테스트

```powershell
npm test -- __tests__/lib/quality.test.ts
npm test -- __tests__/lib/evaluation.test.ts
npm test -- __tests__/lib/processor.test.ts
```

## 마이그레이션 관련

- 품질/가공/평가 관련 테이블 변경 시 `supabase/migrations/`에 새 파일 추가.
- 관련 마이그레이션:
  - `003_quality_rpc.sql`
  - `010_collection.sql`
  - `011_processing.sql`
  - `015_evaluation_enhancements.sql`
  - `017_qualitative_inputs.sql`
  - `019_analysis_runs.sql`

## 롤백

- `lib/quality.ts` 변경 롤백: `git checkout -- lib/quality.ts`
- `lib/processor.ts` 변경 롤백: `git checkout -- lib/processor.ts`
- `lib/evaluation.ts` 변경 롤백: `git checkout -- lib/evaluation.ts __tests__/lib/evaluation.test.ts`
