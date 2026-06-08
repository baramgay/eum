from app import database as db
from app.submission import create_submission, record_decision
from app.planning import draft_open_plan, draft_quality_plan


TENANT = "48121"


def _seed_submissions():
    db.init_schema()
    db.execute("DELETE FROM submissions WHERE tenant_id = ?", [TENANT])

    for i, (status, summary) in enumerate([
        ("approved", "규칙 4종 / 오류 0건 / 오류율 0.0% / 통과"),
        ("submitted", "규칙 4종 / 오류 9건 / 오류율 4.5% / 통과"),
        ("rejected", "규칙 4종 / 오류 30건 / 오류율 7.5% / 미통과"),
    ]):
        table = f"plan_test_{TENANT}_{i}"
        db.execute(f"DROP TABLE IF EXISTS {table}")
        db.execute(f"CREATE TABLE {table} (x BIGINT)")
        meta = {
            "tenant_id": TENANT, "title": f"테스트 데이터셋 {i}",
            "description": "설명", "theme": "행정", "keywords": "테스트",
            "license": "CC-BY", "format": "CSV",
        }
        sub_id = create_submission(meta, table_name=table, rows=10, quality_summary=summary)
        if status != "submitted":
            record_decision(sub_id, status=status, decision_note="검토 완료")


def test_draft_open_plan_counts_status_by_tenant():
    _seed_submissions()
    text = draft_open_plan(TENANT)

    assert "공공데이터 개방계획" in text
    assert "개방 1건" in text or "개방: 1건" in text
    assert "보류 1건" in text or "보류: 1건" in text
    assert "검토대기 1건" in text or "검토대기: 1건" in text


def test_draft_quality_plan_lists_failed_submissions():
    _seed_submissions()
    text = draft_quality_plan(TENANT)

    assert "품질개선계획" in text
    assert "테스트 데이터셋 2" in text   # 미통과(rejected) 건이 개선과제로 언급돼야 함
    assert "7.5%" in text
