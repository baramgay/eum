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
