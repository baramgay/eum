# E2E 테스트 문서 — 공급자 워크플로우

## 테스트 스위트 개요

| 구분 | 파일 | 케이스 수 |
|------|------|-----------|
| pytest 단위·통합 | `tests/test_evaluation.py` | 11 |
| pytest 단위·통합 | `tests/test_planning.py` | 2 |
| pytest 단위·통합 | `tests/test_quality_generic.py` | 5 |
| pytest 단위·통합 | `tests/test_submission.py` | 10 |
| pytest 단위·통합 | `tests/test_ontology.py` | 7 |
| **소계** | | **35** |
| Playwright 수동 E2E | 아래 시나리오 참고 | 6개 시나리오 |

---

## pytest 테스트 케이스 목록

### `tests/test_evaluation.py` — 11케이스

`app/evaluation.py`의 `compute_submission_contribution` 및 `compute_ai_ready_checklist` 함수를 검증한다.

**compute_submission_contribution (6케이스)**

| 케이스명 | 검증 내용 |
|----------|-----------|
| `test_returns_five_areas_with_required_keys` | 반환 결과가 5개 영역이고 각 항목에 `key`/`name`/`contributes`/`note` 키가 있는지 |
| `test_submitted_row_only_quality_contributes` | submitted 상태 행에서 quality 영역만 기여(`contributes=True`)인지 |
| `test_approved_row_with_full_data_contributes_to_all_areas` | approved + 품질통과 + 120행 + 코멘트 + 결정메모 행에서 5개 영역 모두 기여인지 |
| `test_quality_failed_summary_is_not_treated_as_passed` | "미통과"가 "통과"로 오판정되지 않는지 (`endswith("통과") and not endswith("미통과")` 처리 검증) |
| `test_analysis_requires_approved_status_and_minimum_rows` | 분석·활용은 approved + 50행 이상 동시 충족 필요 (49행이거나 submitted이면 미기여) |
| `test_mgmt_requires_decision_status_and_nonblank_note` | 관리체계는 approved/rejected + 공백이 아닌 결정메모 동시 필요 |

**compute_ai_ready_checklist (5케이스)**

| 케이스명 | 검증 내용 |
|----------|-----------|
| `test_ai_ready_checklist_all_pass` | 모든 조건 충족 행 → `ai_ready=True`, 5개 항목 모두 `passed=True` |
| `test_ai_ready_checklist_quality_fail` | 품질 미통과 → `ai_ready=False`, "품질진단 통과" 항목 `passed=False` |
| `test_ai_ready_checklist_rows_too_few` | rows < 30 → `ai_ready=False`, "충분한 데이터 규모 (30행 이상)" 항목 `passed=False` |
| `test_ai_ready_checklist_description_too_short` | description < 20자 → `ai_ready=False`, "메타데이터 충실 (제목·설명·주제·키워드)" 항목 `passed=False` |
| `test_ai_ready_checklist_non_machine_readable_format` | 형식 `hwp` → `ai_ready=False`, "기계가독 형식 (CSV/JSON/Parquet 등)" 항목 `passed=False` |

---

### `tests/test_planning.py` — 2케이스

`app/planning.py`의 `draft_open_plan` 및 `draft_quality_plan` 함수를 검증한다.
각 케이스 실행 전 `_seed_submissions` 헬퍼가 승인 1건 / 검토대기 1건 / 반려 1건을 삽입한다.

| 케이스명 | 검증 내용 |
|----------|-----------|
| `test_draft_open_plan_counts_status_by_tenant` | 개방계획 초안이 "공공데이터 개방계획" 텍스트를 포함하고 개방 1건 / 보류 1건 / 검토대기 1건 건수를 정확히 표시하는지 |
| `test_draft_quality_plan_lists_failed_submissions` | 품질개선계획 초안이 반려된 제출 제목과 오류율(7.5%)을 언급하는지 |

---

### `tests/test_quality_generic.py` — 5케이스

`app/quality.py`의 `RULES_GENERIC`, `run_quality_generic`, `generate_quality_recommendations` 함수를 검증한다.
`_make_test_table` 헬퍼가 NULL·중복행·음수 이상치를 포함한 테스트 테이블을 생성한다.

| 케이스명 | 검증 내용 |
|----------|-----------|
| `test_generic_rules_returns_rule_sql_threshold_dicts` | `generic_rules(table)` 반환값 각 항목이 `rule`/`sql`/`threshold` 키를 가지고, sql에 table명이 포함되는지 |
| `test_run_quality_generic_reports_detected_issues` | NULL·중복·음수가 있는 테이블에서 `errors > 0`, `checked > 0`, `detail` 길이가 `rule_count`와 일치하는지 |
| `test_recommendations_empty_when_passed` | `passed=True` 진단 결과 → 빈 권고 목록 반환 |
| `test_recommendations_no_data_message` | `checked=0` 진단 결과 → "데이터 행이 없습니다" 권고 메시지 반환 |
| `test_recommendations_includes_rule_name_and_violations` | 특정 rule에 위반이 있는 결과 → 해당 rule 이름·위반 건수를 담은 텍스트 반환, 위반 없는 rule은 미포함 |

---

### `tests/test_submission.py` — 10케이스

`app/submission.py`의 핵심 함수들과 comment_count SQL 서브쿼리를 검증한다.

| 케이스명 | 검증 내용 |
|----------|-----------|
| `test_infer_schema_detects_basic_types` | `infer_schema(df)` 가 VARCHAR / BIGINT / DOUBLE 3종 dtype을 정확히 추론하는지 |
| `test_load_csv_to_table_creates_table_and_returns_preview` | CSV 바이트 → DuckDB 테이블 생성 + 미리보기 반환 + 실제 테이블 존재 여부 직접 확인 |
| `test_submissions_tables_exist_after_init_schema` | `init_schema()` 후 `submissions`(15컬럼)·`consultant_comments`(4컬럼) 테이블이 정확한 컬럼셋으로 존재하는지 |
| `test_create_submission_inserts_row_with_submitted_status` | `create_submission()` 호출 후 status=submitted, tenant_id, table_name, rows, submitted_at 검증 |
| `test_record_decision_updates_status_and_decided_at` | `record_decision()` 후 status·decision_note·decided_at 갱신 확인 |
| `test_add_comment_and_get_submission_includes_comments` | `add_comment()` + `get_submission()` 라운드트립으로 코멘트 내용이 상세 응답에 포함되는지 |
| `test_summarize_quality_formats_pass_and_fail` | `summarize_quality()` 가 "통과" / "미통과" 양쪽에서 규칙 수·오류 건수·오류율을 정확히 포매팅하는지 |
| `test_submission_list_sql_includes_comment_count` | `/api/submission` 라우트가 사용하는 SQL이 코멘트 2건 있는 제출에서 `comment_count=2`를 반환하는지 |
| `test_submission_list_all_sql_includes_comment_count_and_zero_for_no_comments` | `/api/submission/all` 라우트 SQL이 코멘트 있는 제출에서 1, 없는 제출에서 0을 반환하는지 |
| `test_evaluation_submissions_aggregation_counts_contributing_rows` | 승인/품질통과/120행/코멘트1/메모 있음 행과 submitted/미통과/5행 행을 섞었을 때 5개 영역 기여 건수가 각각 1건씩인지 |

---

### `tests/test_ontology.py` — 7케이스

`app/ontology.py`의 `recommend_ontology_candidates` 함수를 검증한다.

| 케이스명 | 검증 내용 |
|----------|-----------|
| `test_empty_meta_returns_empty_list` | 빈 메타데이터 입력 → 빈 결과 반환 |
| `test_youth_keywords_recommends_youth_type` | "청년" 관련 제목/키워드 → `청년인구` 유형 포함 |
| `test_business_keywords_recommends_business_type` | "기업/종사자/고용" 키워드 → `사업체` 유형 포함 |
| `test_facility_theme_recommends_infra_type` | 주제 "공공시설" + "청년센터" 키워드 → `청년인프라` 유형 포함 |
| `test_admin_area_title_recommends_sigun_type` | "시군구 행정구역" 제목 → `시군` 유형 포함 |
| `test_combined_keywords_returns_multiple_types` | 청년+사업체 복합 키워드 → 2개 이상 유형 반환 |
| `test_result_item_has_required_keys` | 결과 항목이 `obj_type`/`matched_keywords`/`reason` 키를 가지고, `matched_keywords`가 리스트이며 1개 이상인지 |

---

## 실행 명령

```bash
cd D:\업무\gd\eum_platform\.worktrees\공급자-워크플로우-impl
python -m pytest tests/ -v
```

**예상 출력 (Stretch G 완료 기준, 35케이스 전부 통과)**:

```
tests/test_evaluation.py::test_returns_five_areas_with_required_keys PASSED
tests/test_evaluation.py::test_submitted_row_only_quality_contributes PASSED
tests/test_evaluation.py::test_approved_row_with_full_data_contributes_to_all_areas PASSED
tests/test_evaluation.py::test_quality_failed_summary_is_not_treated_as_passed PASSED
tests/test_evaluation.py::test_analysis_requires_approved_status_and_minimum_rows PASSED
tests/test_evaluation.py::test_mgmt_requires_decision_status_and_nonblank_note PASSED
tests/test_evaluation.py::test_ai_ready_checklist_all_pass PASSED
tests/test_evaluation.py::test_ai_ready_checklist_quality_fail PASSED
tests/test_evaluation.py::test_ai_ready_checklist_rows_too_few PASSED
tests/test_evaluation.py::test_ai_ready_checklist_description_too_short PASSED
tests/test_evaluation.py::test_ai_ready_checklist_non_machine_readable_format PASSED
tests/test_planning.py::test_draft_open_plan_counts_status_by_tenant PASSED
tests/test_planning.py::test_draft_quality_plan_lists_failed_submissions PASSED
tests/test_quality_generic.py::test_generic_rules_returns_rule_sql_threshold_dicts PASSED
tests/test_quality_generic.py::test_run_quality_generic_reports_detected_issues PASSED
tests/test_quality_generic.py::test_recommendations_empty_when_passed PASSED
tests/test_quality_generic.py::test_recommendations_no_data_message PASSED
tests/test_quality_generic.py::test_recommendations_includes_rule_name_and_violations PASSED
tests/test_submission.py::test_infer_schema_detects_basic_types PASSED
tests/test_submission.py::test_load_csv_to_table_creates_table_and_returns_preview PASSED
tests/test_submission.py::test_submissions_tables_exist_after_init_schema PASSED
tests/test_submission.py::test_create_submission_inserts_row_with_submitted_status PASSED
tests/test_submission.py::test_record_decision_updates_status_and_decided_at PASSED
tests/test_submission.py::test_add_comment_and_get_submission_includes_comments PASSED
tests/test_submission.py::test_summarize_quality_formats_pass_and_fail PASSED
tests/test_submission.py::test_submission_list_sql_includes_comment_count PASSED
tests/test_submission.py::test_submission_list_all_sql_includes_comment_count_and_zero_for_no_comments PASSED
tests/test_submission.py::test_evaluation_submissions_aggregation_counts_contributing_rows PASSED
tests/test_ontology.py::test_empty_meta_returns_empty_list PASSED
tests/test_ontology.py::test_youth_keywords_recommends_youth_type PASSED
tests/test_ontology.py::test_business_keywords_recommends_business_type PASSED
tests/test_ontology.py::test_facility_theme_recommends_infra_type PASSED
tests/test_ontology.py::test_admin_area_title_recommends_sigun_type PASSED
tests/test_ontology.py::test_combined_keywords_returns_multiple_types PASSED
tests/test_ontology.py::test_result_item_has_required_keys PASSED

============================== 35 passed in ...s ==============================
```

---

## E2E 시나리오 (수동 검증 절차)

서버를 기동한 뒤 브라우저(`http://localhost:5959`)에서 아래 시나리오를 순서대로 수행한다.

### 시나리오 1 — 기관 담당자 정상 플로우 (CSV 업로드 → 자동진단 → 승인)

1. "데이터 등록·관리" 탭 클릭 → 기관 담당자 모드 선택
2. CSV 파일 선택 → "업로드 & 미리보기" 클릭
3. **확인**: "스키마 추론 완료: N행, 컬럼 M개" 안내 메시지가 나타나고 메타폼이 표시되는지
4. 메타정보(제목·설명·주제·키워드·라이선스·형식) 입력 → "등록(자동 진단 실행)" 클릭
5. **확인**: "등록 완료 — 자동 진단 결과: 규칙 4종 / 오류 N건 / 오류율 N% / 통과·미통과" 메시지
6. "내 제출 현황"에 submitted 배지로 항목 등장 확인
7. 항목 클릭 → 모달에서 승인/반려 버튼 표시 확인 → **승인(개방)** 클릭
8. **확인**: 모달 닫힘 + 배지가 approved로 전환되는지

---

### 시나리오 2 — 반려 플로우

시나리오 1과 동일하되 7번 단계에서 **반려(보류)** 버튼을 클릭한다.

**확인**: 배지가 rejected로 전환되고, 계획서 초안에 해당 항목이 "보류" 건으로 집계되는지

---

### 시나리오 3 — 센터 모드 코멘트 작성 및 양방향 표시 확인

1. 기관 담당자 모드에서 데이터 1건을 등록한다 (시나리오 1 기준).
2. "센터(컨설팅) 모드" 버튼 클릭
3. 검토 대기 목록에서 방금 등록한 항목 클릭
4. 코멘트 textarea에 테스트 의견 입력 → **코멘트 등록** 클릭
5. **확인**: 코멘트가 모달 내 "컨설팅 코멘트" 섹션에 즉시 표시되는지
6. **확인**: 전체 현황 "컨설팅 코멘트 누적" 카드 수치가 증가하는지
7. 기관 담당자 모드로 전환 → 동일 제출 상세 열기
8. **확인**: "센터 코멘트" 섹션에 3번에서 작성한 코멘트가 표시되는지 (양방향 연동)

---

### 시나리오 4 — XSS 교차검증

1. 기관 담당자 모드에서 다음 입력값으로 데이터를 등록한다:
   - 제목: `<script>alert(1)</script>XSS제목테스트`
   - 설명: `<img src=x onerror=alert('xss')>XSS설명테스트입니다충분히길게작성`
2. "내 제출 현황" 목록에서 해당 항목 확인
3. **확인**: 목록의 제목이 `&lt;script&gt;alert(1)&lt;/script&gt;...` 형태로 이스케이프되어 리터럴 텍스트로 표시되는지
4. 항목 클릭 → 상세 모달 확인
5. **확인**: 모달 제목·설명 모두 이스케이프 렌더링되는지, 브라우저 알럿이 발생하지 않는지
6. 센터 모드로 전환 → 동일 항목 상세 확인
7. **확인**: 센터 모드에서도 동일하게 이스케이프 렌더링되는지 (기관→센터 방향 차단)
8. 센터 모드에서 코멘트 textarea에 `<script>alert('comment-xss')</script>코멘트XSS검증<img src=x onerror=alert(2)>` 입력 → 등록
9. 기관 담당자 모드 상세의 "센터 코멘트"에서 동일한 이스케이프 확인 (센터→기관 방향 차단)

---

### 시나리오 5 — 계획서 초안 생성

1. 기관 담당자 모드에서 승인 1건, 반려 1건 이상을 등록·결정한다.
2. "계획서 초안 생성" 카드에서 **공공데이터 개방계획 초안** 버튼 클릭
3. **확인**: `<pre>` 영역에 "# {기관명} 공공데이터 개방계획 초안" 으로 시작하는 텍스트가 출력되는지, 승인/보류/검토대기 건수가 실제 DB 현황과 일치하는지
4. **품질개선계획 초안** 버튼 클릭
5. **확인**: 반려된 항목의 제목과 오류율이 초안 텍스트에 포함되는지

---

### 시나리오 6 — AI-Ready / 온톨로지 후보 / 평가 기여도 표시 확인

1. 기관 담당자 모드에서 품질 통과 + 30행 이상 + 설명 20자 이상인 CSV를 등록한다.
2. "내 제출 현황"에서 해당 항목 클릭
3. **확인**: 모달 상단의 "AI-Ready 체크리스트" 섹션에서 5개 항목 모두 "충족" 배지가 표시되는지
4. **확인**: "온톨로지 연계 후보" 섹션에 메타데이터 키워드 기반 후보가 표시되는지
5. **확인**: "평가 기여도" 섹션에서 품질 영역이 "기여"로, 분석·활용은 50행 이상일 때만 "기여"로 표시되는지
6. 센터 모드 상세 모달에서 동일한 항목 확인
7. **확인**: 백엔드 단일 진실 공급원이므로 기관/센터 양쪽 모달에서 동일한 기여도 텍스트가 나타나는지

---

## 알려진 테스트 제약

### pytest가 운영 DB를 직접 사용 (테스트 격리 미완료)

pytest와 `python run.py`(개발 서버)가 동일한 `data/eum.duckdb` 파일을 공유한다.
테스트가 `create_submission` 등을 호출해 `submissions`/`consultant_comments` 테이블에
더미 행을 남기면, 서버 실행 중 해당 행을 클릭 시 가리키는 테이블이 삭제된 상태이므로
`CatalogException: Table with name sub_... does not exist` 500 오류가 발생할 수 있다.

현재 테스트 코드(`tests/test_submission.py`)의 cleanup 단계는
`DELETE FROM consultant_comments` → `DELETE FROM submissions` → `DROP TABLE` 순서로
정리하여 이 문제를 예방하고 있다. 그러나 테스트 실행이 중단(KeyboardInterrupt 등)되어
cleanup이 실행되지 않으면 더미 행이 잔류한다.

**장기 개선 사항**: `conftest.py`에서 별도 테스트 DB 파일을 사용하거나, 각 테스트 후
트랜잭션 롤백을 적용하는 격리 메커니즘을 도입해야 한다.

### FastAPI TestClient 패턴 미사용

이 저장소에는 `FastAPI.testclient` 기반의 HTTP 레벨 테스트가 없다.
라우트 핸들러의 SQL과 동일한 SQL을 `db.query()`로 직접 재현해 검증하는 방식을 사용한다.
이 방식은 라우트 SQL이 변경될 경우 테스트 내 SQL 상수도 함께 수정해야 한다는 drift 위험이 있다.

**장기 개선 사항**: `TestClient` 또는 `httpx.AsyncClient` 기반 통합 테스트 도입을 검토해야 한다.
