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
