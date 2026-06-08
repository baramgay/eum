from app.evaluation import compute_submission_contribution, AREAS


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
