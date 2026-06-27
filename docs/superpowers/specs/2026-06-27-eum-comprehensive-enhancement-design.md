# EUM 플랫폼 3-Wave 균형 고도화 설계

**작성일**: 2026-06-27  
**범위**: 전체 플랫폼 A(파이프라인) + B(AI/LLM) + C(온톨로지) + D(공공기관 UX) 동시 고도화  
**전략**: 3-Wave 내부 병렬 — Wave마다 독립 배포 가능, Wave 간 의존성 순서 준수  
**품질 게이트**: 각 Wave 완료 후 `/code-review ultra` 코드 리뷰 실시 → 지적 사항 반영 후 다음 Wave 진입

---

## 1. 전체 아키텍처

```
Wave 1 (1~2주)  파이프라인 완성 + 평가편람 UX 기반
  ├─ Track-A   수집(SSE·XML·미리보기) + 가공(3규칙추가·체이닝) + 분석(2종추가·히스토리)
  └─ Track-D1  평가편람 지표 보완 + 대시보드 현황 위젯
  └─ [GATE] code-review · npm test · build 통과 후 Wave 2 진입

Wave 2 (1~2주)  AI 레이어 + 온톨로지 강화
  ├─ Track-B   NL-to-SQL강화 + AI인용 + 품질갭자동탐지 + Qwen해설
  └─ Track-C1  온톨로지-데이터셋연결 + 텍스트검색 + 관계필터
  └─ [GATE] code-review · npm test · build 통과 후 Wave 3 진입

Wave 3 (1주)    계보 추적 + 증빙 자동화 + 거버넌스
  ├─ Track-C2  데이터 계보 DAG + 멀티테넌트 지식그래프
  └─ Track-D2  증빙 자동생성(PDF) + 가이드 챗봇 + 전기관 모니터링
  └─ [GATE] 최종 code-review · E2E · 배포
```

---

## 2. Wave 1 상세 설계

### Track-A1: 수집(Collect) 개선

| 기능 | 구현 방법 | 파일 |
|------|----------|------|
| SSE 실시간 진행률 | `route.ts`에서 `ReadableStream` SSE 반환, `CollectClient`에서 `EventSource` 구독 | `app/api/collect/[sourceId]/run/route.ts`, `CollectClient.tsx` |
| XML 파싱 지원 | `fast-xml-parser` 패키지, `resp_format: 'xml'` 분기 처리 | `lib/collector.ts` |
| 수집 실패 알림 | 스케줄 실패 시 `collection_logs.error_msg` 저장 + Toast | `app/api/cron/collect/route.ts` |
| N행 미리보기 버튼 | `collection_logs`에 `sample_rows jsonb` 컬럼 추가(마이그레이션 032), 클릭 시 테이블 모달 | `CollectClient.tsx`, 마이그레이션 032 |

**마이그레이션 032**: `ALTER TABLE collection_logs ADD COLUMN sample_rows jsonb;`

### Track-A2: 가공(Process) 개선

| 기능 | 구현 방법 | 파일 |
|------|----------|------|
| aggregate 규칙 | `groupBy[]`, `agg: {col: fn}` — pandas `groupby().agg()` | `lib/processor.ts`, `RuleEditor.tsx` |
| join 규칙 | `target_dataset_id`, `on: {left, right}` — 카탈로그 ID로 데이터 로드 후 merge | `lib/processor.ts`, `RuleEditor.tsx` |
| pivot 규칙 | `index`, `columns`, `values` — pandas `pivot_table()` | `lib/processor.ts`, `RuleEditor.tsx` |
| 오류 행 뷰어 | `process_runs.error_rows jsonb` 저장, 클릭 시 모달 | `ProcessClient.tsx`, `app/api/process/[id]/run/route.ts` |
| 파이프라인 체이닝 | `process_pipelines.input_pipeline_id uuid` FK 추가(마이그레이션 033), UI에 이전 파이프라인 선택 드롭다운 | `ProcessClient.tsx`, 마이그레이션 033 |

**마이그레이션 033**:
```sql
ALTER TABLE process_pipelines ADD COLUMN input_pipeline_id uuid REFERENCES process_pipelines(id);
ALTER TABLE process_runs ADD COLUMN error_rows jsonb DEFAULT '[]';
```

### Track-A3: 분석(Analytics) 개선

| 기능 | 구현 방법 | 파일 |
|------|----------|------|
| 생존분석 | `lifelines.KaplanMeierFitter`, duration + event 컬럼 지정, 생존곡선 Recharts LineChart | `scripts/analyze.py`, `AnalyticsClient.tsx` |
| 시계열 분해 | `statsmodels.tsa.seasonal.seasonal_decompose`, 추세/계절성/잔차 3-panel Recharts | `scripts/analyze.py`, `AnalyticsClient.tsx` |
| 히스토리 재실행 | `analysis_runs` 테이블(기존) 활용, 이력 목록 클릭 → 동일 파라미터로 재실행 | `AnalyticsClient.tsx` |
| 보고서 연동 버튼 | 분석 결과 JSON → `/report?source=analytics&run_id=xxx` 쿼리 파라미터, `ReportClient`에서 수신 | `AnalyticsClient.tsx`, `ReportClient.tsx` |

### Track-D1: 평가편람 지표 보완

| 기능 | 구현 방법 | 파일 |
|------|----------|------|
| AI-Ready 7항목 | 기존 5개 + "메타데이터 표준화 충족" + "데이터 라이선스 명시" | `lib/evaluation.ts` `AI_READY_CHECKLIST` |
| 가점 5점 지표 | `data_catalog`에 `is_pseudonymized bool`, `is_synthetic bool` 추가(마이그레이션 034), AREAS에 bonus 영역 추가 | `lib/evaluation.ts`, 마이그레이션 034 |
| 품질 하위지표 세분화 | `buildDimSignals()` 체계/값관리/조치 3개 추가 — `quality_checks` 테이블 기반 | `lib/quality.ts` |
| 대시보드 파이프라인 위젯 | `/api/dashboard/pipeline-status` 신규 엔드포인트, 수집 N개·가공 현황·오늘 수집행수 표시 | `DashboardClient.tsx`, `app/api/dashboard/pipeline-status/route.ts` |

**마이그레이션 034**:
```sql
ALTER TABLE data_catalog ADD COLUMN is_pseudonymized boolean DEFAULT false;
ALTER TABLE data_catalog ADD COLUMN is_synthetic boolean DEFAULT false;
```

### Wave 1 품질 게이트

- `npm test` 전체 통과 (신규 기능 단위 테스트 포함)
- `npx tsc --noEmit` 통과
- `npm run lint` 통과 (ESLint 0건)
- `npm run build` 통과
- `/code-review ultra` 코드 리뷰 실시 → Critical/High 지적 사항 반영
- 통과 후 GitHub push + Wave 2 진입

---

## 3. Wave 2 상세 설계

### Track-B1: NL-to-SQL UI 강화

마이그레이션 `031_nl_to_sql.sql` 적용이 전제. 자연어 입력 → SQL 미리보기(읽기 전용) → 사용자 확인 → 실행 2단계 UX로 변경. SQL은 코드 블록으로 표시하고 "실행" 버튼 클릭 후에만 DB 조회 수행.

**파일**: `AiQueryClient.tsx`, `app/api/nlquery/route.ts`

### Track-B2: AI 출처 인용 강화

`/api/chat` 응답에 `sources: [{dataset_id, dataset_name, column, row_count}]` 배열 포함. `AiQueryClient`에서 답변 하단에 배지 형태로 렌더링. 배지 클릭 시 `/portal?dataset=<id>` 이동. Qwen API의 function calling 또는 system prompt 출처 지시 패턴 활용.

**파일**: `AiQueryClient.tsx`, `app/api/chat/route.ts`

### Track-B3: 품질 갭 자동 탐지 (196개 지표 완전 대응)

5영역을 데이터셋 단위로 자동 진단하고 신호등(green/amber/red)으로 표시. 각 영역의 점수 미달 시 "개선 권고사항" 텍스트를 자동 생성. Qwen에 영역별 진단 결과를 넘겨 1-2줄 권고 생성.

| 영역 | 측정 방법 |
|------|----------|
| 완전성 | null률, 필수 필드 존재 여부 |
| 정확성 | 형식 오류율, 범위 이탈 건수 |
| 일관성 | 중복 행, 코드표 불일치 |
| 최신성 | `updated_at` vs 수집 주기 |
| 메타데이터 | 제목/설명/키워드/라이선스 공백 여부 |

갭 리포트 PDF 내보내기: 기존 `html2canvas + jsPDF` 패턴(`eum-report-pdf-export` 노트) 재활용.

**파일**: `QualityClient.tsx`, `app/api/quality/route.ts`, `lib/quality.ts`

### Track-B4: Qwen 자연어 해설

`/api/nlquery` 2단계 처리: (1) SQL 실행 → 결과 테이블 (2) 결과 + 원래 질의를 Qwen에 넘겨 1-2문장 요약 생성. 해설은 결과 테이블 상단에 회색 박스로 표시.

**파일**: `app/api/nlquery/route.ts`

### Track-C1: 온톨로지 강화

**데이터셋 자동 매칭**: 노드 클릭 시 `obj_type`/`label`을 `data_catalog.category`, `keywords` 배열과 PostgreSQL `@@` 전문 검색으로 매칭. 결과를 `DetailPanel` 우측 "관련 데이터셋" 탭에 표시(이미 탭 구조 존재).

신규 엔드포인트: `GET /api/ontology/nodes/[id]/datasets` — 노드 정보 기반 카탈로그 매칭 반환.

**텍스트 검색**: `OntologyClient` 검색창에서 노드명/타입 실시간 필터 (현재 부분 구현 → 디바운스 + 하이라이트 강화).

**관계 유형 필터**: `OntologyGraph`에 엣지 `rel` 속성 체크박스 패널 추가. D3 그래프 필터 적용은 데이터 레벨에서 처리(re-render 없이 visibility 토글).

**파일**: `OntologyClient.tsx`, `OntologyGraph.tsx`, `DetailPanel.tsx`, `app/api/ontology/nodes/[id]/datasets/route.ts`

### Wave 2 품질 게이트

- Wave 1과 동일한 기준 적용
- `/code-review ultra` 코드 리뷰 — AI·온톨로지 로직 집중 검토
- NL-to-SQL SQL 인젝션 방어 검증 (ALLOWED_TABLES 화이트리스트 확인)
- 통과 후 Wave 3 진입

---

## 4. Wave 3 상세 설계

### Track-C2: 데이터 계보 + 멀티테넌트 지식그래프

**데이터 계보 DAG**: 원천 소스 → 수집 → 가공 → 카탈로그(공개) 단계를 노드-엣지로 시각화. D3 DAG 레이아웃(dagre 또는 d3-dag 라이브러리). `/ontology` 탭에 "계보" 서브탭으로 통합.

신규 테이블(마이그레이션 035):
```sql
CREATE TABLE data_lineage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL, -- 'collection_source' | 'process_pipeline' | 'data_catalog'
  source_id uuid NOT NULL,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  created_at timestamptz DEFAULT now()
);
```
수집 완료, 가공 완료, 카탈로그 등록 시 자동 `data_lineage` INSERT.

**멀티테넌트 지식그래프**: `center` role 사용자에게 기관 간 공통 데이터 노드를 레이어로 표시. 기존 온톨로지 그래프에 `tenant_id` 필터 토글 추가.

**파일**: `app/ontology/page.tsx`, `OntologyClient.tsx`, `app/api/lineage/route.ts`, 마이그레이션 035

### Track-D2: 증빙 자동화 + 가이드 챗봇 + 거버넌스

**증빙자료 자동 생성**: 평가편람 제출용 PDF 자동 생성. `/report` 탭 "평가 증빙 내보내기" 버튼 → 현재 기관의 지표 점수표 + 데이터셋 목록 + 품질 갭 리포트를 단일 PDF로 묶음. `html2canvas + jsPDF` 기존 패턴 활용.

**가이드 챗봇**: 평가편람 Q&A 기반 RAG-lite 챗봇. `knowledge/evaluation_guide.md` (평가편람 요약)를 컨텍스트로 주입. 기존 `app/api/chat/route.ts` 재활용, 글로벌 플로팅 버튼(우측 하단)으로 어느 페이지에서나 접근 가능.

**전기관 거버넌스 대시보드**: `center` role 전용 섹션. 기관별 평가 점수 분포 바 차트, 미충족 지표 Top 5, 전기관 수집 현황. `/api/dashboard/governance` 신규 엔드포인트.

**파일**: `ReportClient.tsx`, `components/common/GuideChatbot.tsx` (신규), `DashboardClient.tsx`, `app/layout.tsx` (플로팅 버튼), `app/api/dashboard/governance/route.ts`

### Wave 3 품질 게이트

- `npm test` (E2E 포함) 전체 통과
- `npx tsc --noEmit` 통과
- `npm run build` 통과
- `/code-review ultra` 최종 코드 리뷰 — 전체 범위 검토
- Vercel 배포 URL 브라우저 검증
- GitHub push + 태그 `rollback/2026-06-27-wave3-complete`

---

## 5. 마이그레이션 계획 요약

| 번호 | 내용 | Wave |
|------|------|------|
| 031 | NL-to-SQL 테이블 (기존, 미적용) | Wave 2 시작 전 적용 |
| 032 | `collection_logs.sample_rows jsonb` | Wave 1 |
| 033 | `process_pipelines.input_pipeline_id`, `process_runs.error_rows` | Wave 1 |
| 034 | `data_catalog.is_pseudonymized`, `is_synthetic` | Wave 1 |
| 035 | `data_lineage` 계보 추적 테이블 | Wave 3 |

---

## 6. 파일별 변경 영향도

| 파일 | Wave | 변경 규모 |
|------|------|----------|
| `lib/collector.ts` | 1 | 중 (XML 분기, SSE) |
| `lib/processor.ts` | 1 | 중 (규칙 3종 추가) |
| `lib/evaluation.ts` | 1 | 소 (지표 보완) |
| `lib/quality.ts` | 1,2 | 중 (하위지표 + 196지표) |
| `scripts/analyze.py` | 1 | 소 (2종 추가) |
| `CollectClient.tsx` | 1 | 중 (SSE, 미리보기) |
| `ProcessClient.tsx` | 1 | 중 (체이닝, 오류뷰어) |
| `RuleEditor.tsx` | 1 | 소 (규칙 3종 UI) |
| `AnalyticsClient.tsx` | 1 | 중 (2종, 히스토리) |
| `DashboardClient.tsx` | 1,3 | 중 (위젯 2개) |
| `QualityClient.tsx` | 2 | 대 (갭 리포트 탭) |
| `AiQueryClient.tsx` | 2 | 중 (2단계 UX, 인용) |
| `app/api/chat/route.ts` | 2 | 소 (sources 배열) |
| `app/api/nlquery/route.ts` | 2 | 중 (2단계 처리) |
| `OntologyClient.tsx` | 2 | 중 (검색, 필터) |
| `OntologyGraph.tsx` | 2 | 소 (관계 필터) |
| `DetailPanel.tsx` | 2 | 소 (데이터셋 탭 활성화) |
| `ReportClient.tsx` | 3 | 소 (증빙 버튼) |
| `app/layout.tsx` | 3 | 소 (플로팅 챗봇) |

---

## 7. 에이전트 실행 계획

```
orchestrator  → lead-dev
lead-dev      → frontend (UI 구현: CollectClient, ProcessClient, AnalyticsClient, QualityClient, OntologyClient, DashboardClient)
lead-dev      → backend  (API 구현: collect/run SSE, process, analyze, quality, nlquery, lineage, dashboard)
lead-dev      → dba      (마이그레이션 032~035)
lead-dev      → tester   (단위 테스트 신규 작성)
lead-dev      → [code-review ultra 각 Wave 종료 후]
```

각 Wave 시작 시 담당 에이전트 `working` 선언 → 완료 시 `done` 선언 → code-review 통과 후 다음 Wave.

---

## 8. 제약 및 주의사항

- NL-to-SQL은 ALLOWED_TABLES 화이트리스트 외 테이블 접근 차단 유지 (기존 `lib/quality.ts` 패턴 동일 적용)
- Qwen API 키는 `.env.local` `QWEN_API_KEY` — 코드 하드코딩 절대 금지
- 계보 추적 `data_lineage` INSERT는 각 API route에서 fire-and-forget (실패해도 메인 플로우 중단 없음)
- `is_pseudonymized` / `is_synthetic` 는 기관 담당자 자기 신고 방식 (자동 탐지 아님)
- 글로벌 챗봇 플로팅 버튼은 `z-index: 9999`, 모바일 뷰포트 고려
