import pandas as pd
from app.submission import infer_schema


def test_infer_schema_detects_basic_types():
    df = pd.DataFrame({
        "지역명": ["창원시", "진주시"],
        "연도": [2024, 2025],
        "비율": [12.5, 8.3],
    })
    schema = infer_schema(df)
    assert schema == [
        ("지역명", "VARCHAR"),
        ("연도", "BIGINT"),
        ("비율", "DOUBLE"),
    ]


import io

from app import database as db
from app.submission import load_csv_to_table


def test_load_csv_to_table_creates_table_and_returns_preview():
    db.init_schema()
    csv_bytes = (
        "지역명,연도,비율\n"
        "창원시,2024,12.5\n"
        "진주시,2025,8.3\n"
    ).encode("utf-8")

    result = load_csv_to_table(io.BytesIO(csv_bytes), table_name="upload_test_001")

    assert result["table_name"] == "upload_test_001"
    assert result["rows"] == 2
    assert result["schema"] == [
        ("지역명", "VARCHAR"),
        ("연도", "BIGINT"),
        ("비율", "DOUBLE"),
    ]
    assert len(result["preview"]) == 2
    assert result["preview"][0]["지역명"] == "창원시"

    # 실제로 테이블이 만들어졌는지 DuckDB에서 직접 확인
    rows = db.query("SELECT count(*) c FROM upload_test_001")
    assert rows[0]["c"] == 2

    db.execute("DROP TABLE upload_test_001")


def test_submissions_tables_exist_after_init_schema():
    db.init_schema()
    cols = db.query("PRAGMA table_info('submissions')")
    col_names = {c["name"] for c in cols}
    assert col_names == {
        "submission_id", "tenant_id", "title", "description", "theme",
        "keywords", "license", "format", "table_name", "rows", "status",
        "quality_summary", "decision_note", "submitted_at", "decided_at",
    }

    cols2 = db.query("PRAGMA table_info('consultant_comments')")
    col_names2 = {c["name"] for c in cols2}
    assert col_names2 == {"comment_id", "submission_id", "comment", "created_at"}


from app.submission import create_submission, record_decision, add_comment, get_submission


def _sample_meta():
    return {
        "tenant_id": "48121",
        "title": "창원시 청년 인구 현황",
        "description": "2024년 기준 창원시 행정동별 청년 인구",
        "theme": "인구",
        "keywords": "청년,인구,창원",
        "license": "CC-BY",
        "format": "CSV",
    }


def test_create_submission_inserts_row_with_submitted_status():
    db.init_schema()
    table = "sub_48121_aaaaaaaa"
    db.execute(f"DROP TABLE IF EXISTS {table}")
    db.execute(f"CREATE TABLE {table} (지역명 VARCHAR, 인구수 BIGINT)")
    db.execute(f"INSERT INTO {table} VALUES ('창원시', 100)")

    sub_id = create_submission(_sample_meta(), table_name=table, rows=1,
                               quality_summary="규칙 4종 / 오류 0건 / 통과")

    row = db.query("SELECT * FROM submissions WHERE submission_id = ?", [sub_id])[0]
    assert row["status"] == "submitted"
    assert row["tenant_id"] == "48121"
    assert row["table_name"] == table
    assert row["rows"] == 1
    assert row["submitted_at"] is not None
    assert row["decided_at"] is None

    db.execute(f"DROP TABLE {table}")


def test_record_decision_updates_status_and_decided_at():
    db.init_schema()
    table = "sub_48121_bbbbbbbb"
    db.execute(f"DROP TABLE IF EXISTS {table}")
    db.execute(f"CREATE TABLE {table} (x BIGINT)")
    sub_id = create_submission(_sample_meta(), table_name=table, rows=0,
                               quality_summary="규칙 4종 / 오류 0건 / 통과")

    record_decision(sub_id, status="approved", decision_note="이상 없음, 개방 승인")

    row = db.query("SELECT * FROM submissions WHERE submission_id = ?", [sub_id])[0]
    assert row["status"] == "approved"
    assert row["decision_note"] == "이상 없음, 개방 승인"
    assert row["decided_at"] is not None

    db.execute(f"DROP TABLE {table}")


def test_add_comment_and_get_submission_includes_comments():
    db.init_schema()
    table = "sub_48121_cccccccc"
    db.execute(f"DROP TABLE IF EXISTS {table}")
    db.execute(f"CREATE TABLE {table} (x BIGINT)")
    sub_id = create_submission(_sample_meta(), table_name=table, rows=0,
                               quality_summary="규칙 4종 / 오류 0건 / 통과")

    add_comment(sub_id, "메타데이터 키워드를 좀 더 구체화하면 좋겠습니다.")

    detail = get_submission(sub_id)
    assert detail["meta"]["submission_id"] == sub_id
    assert len(detail["comments"]) == 1
    assert "키워드" in detail["comments"][0]["comment"]

    db.execute(f"DROP TABLE {table}")
