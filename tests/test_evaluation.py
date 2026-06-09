from app.evaluation import compute_submission_contribution, compute_ai_ready_checklist, AREAS


_AREA_KEYS = [a["key"] for a in AREAS]


def _by_key(contribution):
    return {c["key"]: c for c in contribution}


def test_returns_five_areas_with_required_keys():
    row = {
        "status": "submitted",
        "quality_summary": "규칙 4종 / 오류 0건 / 오류율 0.0% / 통과",
        "rows": 10,
        "comment_count": 0,
        "decision_note": None,
    }
    contribution = compute_submission_contribution(row)

    assert len(contribution) == 5
    assert {c["key"] for c in contribution} == set(_AREA_KEYS)
    for c in contribution:
        assert set(c.keys()) >= {"key", "name", "contributes", "note"}


def test_submitted_row_only_quality_contributes():
    row = {
        "status": "submitted",
        "quality_summary": "규칙 4종 / 오류 0건 / 오류율 0.0% / 통과",
        "rows": 10,
        "comment_count": 0,
        "decision_note": None,
    }
    by_key = _by_key(compute_submission_contribution(row))

    assert by_key["quality"]["contributes"] is True
    assert by_key["open"]["contributes"] is False
    assert by_key["analysis"]["contributes"] is False
    assert by_key["share"]["contributes"] is False
    assert by_key["mgmt"]["contributes"] is False


def test_approved_row_with_full_data_contributes_to_all_areas():
    row = {
        "status": "approved",
        "quality_summary": "규칙 4종 / 오류 0건 / 오류율 0.0% / 통과",
        "rows": 120,
        "comment_count": 2,
        "decision_note": "확인 완료",
    }
    by_key = _by_key(compute_submission_contribution(row))

    assert by_key["open"]["contributes"] is True
    assert by_key["quality"]["contributes"] is True
    assert by_key["analysis"]["contributes"] is True
    assert by_key["share"]["contributes"] is True
    assert by_key["mgmt"]["contributes"] is True


def test_quality_failed_summary_is_not_treated_as_passed():
    row = {
        "status": "submitted",
        "quality_summary": "규칙 4종 / 오류 12건 / 오류율 3.0% / 미통과",
        "rows": 10,
        "comment_count": 0,
        "decision_note": None,
    }
    by_key = _by_key(compute_submission_contribution(row))

    assert by_key["quality"]["contributes"] is False
    assert "미통과" not in by_key["quality"]["note"] or by_key["quality"]["note"].startswith("자동 진단 결과")


def test_analysis_requires_approved_status_and_minimum_rows():
    approved_small = compute_submission_contribution({
        "status": "approved", "quality_summary": "... / 통과",
        "rows": 49, "comment_count": 0, "decision_note": None,
    })
    submitted_large = compute_submission_contribution({
        "status": "submitted", "quality_summary": "... / 통과",
        "rows": 500, "comment_count": 0, "decision_note": None,
    })

    assert _by_key(approved_small)["analysis"]["contributes"] is False
    assert _by_key(submitted_large)["analysis"]["contributes"] is False


def test_mgmt_requires_decision_status_and_nonblank_note():
    approved_no_note = compute_submission_contribution({
        "status": "approved", "quality_summary": "... / 통과",
        "rows": 10, "comment_count": 0, "decision_note": "   ",
    })
    rejected_with_note = compute_submission_contribution({
        "status": "rejected", "quality_summary": "... / 미통과",
        "rows": 10, "comment_count": 0, "decision_note": "보완 필요",
    })

    assert _by_key(approved_no_note)["mgmt"]["contributes"] is False
    assert _by_key(rejected_with_note)["mgmt"]["contributes"] is True


# ---- compute_ai_ready_checklist 테스트 ----

def _cl_by_item(checklist):
    """체크리스트 항목명을 키로 하는 딕셔너리 반환."""
    return {c["item"]: c for c in checklist}


def test_ai_ready_checklist_all_pass():
    """모든 조건 충족 행 → ai_ready True, 5개 항목 모두 passed True."""
    row = {
        "quality_summary": "규칙 4종 / 오류 0건 / 오류율 0.0% / 통과",
        "rows": 100,
        "description": "경남 청년 인구 통계 데이터셋입니다. 시군구별 연령대별 집계.",
        "title": "경남 청년 인구 통계",
        "theme": "인구",
        "keywords": "청년,인구,경남",
        "license": "CC BY 4.0",
        "format": "csv",
    }
    result = compute_ai_ready_checklist(row)
    assert result["ai_ready"] is True
    assert len(result["checklist"]) == 5
    for c in result["checklist"]:
        assert c["passed"] is True, f"항목 '{c['item']}' 실패 — {c['detail']}"


def test_ai_ready_checklist_quality_fail():
    """품질 미통과 행 → ai_ready False, 품질 항목 passed False."""
    row = {
        "quality_summary": "규칙 4종 / 오류 12건 / 오류율 3.0% / 미통과",
        "rows": 100,
        "description": "경남 청년 인구 통계 데이터셋입니다. 시군구별 연령대별 집계.",
        "title": "경남 청년 인구 통계",
        "theme": "인구",
        "keywords": "청년,인구,경남",
        "license": "CC BY 4.0",
        "format": "csv",
    }
    result = compute_ai_ready_checklist(row)
    assert result["ai_ready"] is False
    cl = _cl_by_item(result["checklist"])
    assert cl["품질진단 통과"]["passed"] is False


def test_ai_ready_checklist_rows_too_few():
    """rows < 30 행 → ai_ready False, 규모 항목 passed False."""
    row = {
        "quality_summary": "규칙 4종 / 오류 0건 / 오류율 0.0% / 통과",
        "rows": 10,
        "description": "경남 청년 인구 통계 데이터셋입니다. 시군구별 연령대별 집계.",
        "title": "경남 청년 인구 통계",
        "theme": "인구",
        "keywords": "청년,인구,경남",
        "license": "CC BY 4.0",
        "format": "csv",
    }
    result = compute_ai_ready_checklist(row)
    assert result["ai_ready"] is False
    cl = _cl_by_item(result["checklist"])
    assert cl["충분한 데이터 규모 (30행 이상)"]["passed"] is False


def test_ai_ready_checklist_description_too_short():
    """description < 20자 행 → ai_ready False, 메타데이터 항목 passed False."""
    row = {
        "quality_summary": "규칙 4종 / 오류 0건 / 오류율 0.0% / 통과",
        "rows": 100,
        "description": "짧은설명",
        "title": "경남 청년 인구 통계",
        "theme": "인구",
        "keywords": "청년,인구,경남",
        "license": "CC BY 4.0",
        "format": "csv",
    }
    result = compute_ai_ready_checklist(row)
    assert result["ai_ready"] is False
    cl = _cl_by_item(result["checklist"])
    assert cl["메타데이터 충실 (제목·설명·주제·키워드)"]["passed"] is False


def test_ai_ready_checklist_non_machine_readable_format():
    """비기계가독 형식(HWP) 행 → ai_ready False, 형식 항목 passed False."""
    row = {
        "quality_summary": "규칙 4종 / 오류 0건 / 오류율 0.0% / 통과",
        "rows": 100,
        "description": "경남 청년 인구 통계 데이터셋입니다. 시군구별 연령대별 집계.",
        "title": "경남 청년 인구 통계",
        "theme": "인구",
        "keywords": "청년,인구,경남",
        "license": "CC BY 4.0",
        "format": "hwp",
    }
    result = compute_ai_ready_checklist(row)
    assert result["ai_ready"] is False
    cl = _cl_by_item(result["checklist"])
    assert cl["기계가독 형식 (CSV/JSON/Parquet 등)"]["passed"] is False
