from app import database as db
from app.quality import generic_rules, run_quality_generic


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
