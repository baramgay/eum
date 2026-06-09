from app import database as db
from app.quality import generic_rules, run_quality_generic, generate_quality_recommendations


def _make_test_table():
    db.init_schema()
    table = "qg_test_table"
    db.execute(f"DROP TABLE IF EXISTS {table}")
    db.execute(f"""
        CREATE TABLE {table} (
            지역명 VARCHAR,
            인구수 BIGINT,
            비율   DOUBLE
        )
    """)
    db.execute(f"INSERT INTO {table} VALUES ('창원시', 100, 12.5)")
    db.execute(f"INSERT INTO {table} VALUES ('진주시', NULL, 8.3)")
    db.execute(f"INSERT INTO {table} VALUES ('진주시', NULL, 8.3)")  # 중복행
    db.execute(f"INSERT INTO {table} VALUES ('통영시', -5, 1.0)")    # 음수 이상치
    return table


def test_generic_rules_returns_rule_sql_threshold_dicts():
    table = _make_test_table()
    rules = generic_rules(table)

    assert len(rules) > 0
    for r in rules:
        assert set(r.keys()) == {"rule", "sql", "threshold"}
        assert table in r["sql"]

    db.execute(f"DROP TABLE {table}")


def test_run_quality_generic_reports_detected_issues():
    table = _make_test_table()
    result = run_quality_generic(table)

    assert result["table"] == table
    assert result["checked"] > 0
    assert result["errors"] > 0          # NULL·중복·음수가 섞여 있으므로 오류가 잡혀야 함
    assert 0 <= result["error_rate"] <= 100
    assert isinstance(result["passed"], bool)
    assert len(result["detail"]) == result["rule_count"]

    db.execute(f"DROP TABLE {table}")


# ---- generate_quality_recommendations 테스트 ----

def test_recommendations_empty_when_passed():
    """진단 통과(passed=True) 결과 → 빈 권고 목록 반환"""
    diag = {
        "checked": 100,
        "errors": 0,
        "error_rate": 0.0,
        "threshold": 5.0,
        "passed": True,
        "detail": [],
    }
    recs = generate_quality_recommendations(diag)
    assert recs == []


def test_recommendations_no_data_message():
    """빈 데이터(0건 체크) 결과 → '데이터 행이 없습니다' 권고 반환"""
    diag = {
        "checked": 0,
        "errors": 0,
        "error_rate": 0.0,
        "threshold": 5.0,
        "passed": True,
        "detail": [],
    }
    recs = generate_quality_recommendations(diag)
    assert len(recs) == 1
    assert "데이터 행이 없습니다" in recs[0]


def test_recommendations_includes_rule_name_and_violations():
    """특정 rule에 위반이 있는 결과 → 해당 rule 이름·위반수를 담은 권고 텍스트 반환"""
    diag = {
        "checked": 300,
        "errors": 3,
        "error_rate": 1.0,
        "threshold": 5.0,
        "passed": False,
        "detail": [
            {"rule": "NULL/빈값", "violations": 3, "threshold": 5.0},
            {"rule": "중복행 비율", "violations": 0, "threshold": 5.0},
        ],
    }
    recs = generate_quality_recommendations(diag)
    assert len(recs) >= 1
    # 위반이 있는 "NULL/빈값" 규칙이 포함되어야 함
    assert any("NULL/빈값" in r for r in recs)
    assert any("3" in r for r in recs)
    # 위반이 없는 "중복행 비율"은 포함되지 않아야 함
    assert not any("중복행 비율" in r for r in recs)
