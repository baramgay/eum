"""
이음(EUM) 플랫폼 - 공급자 워크플로우 (L1 적재 확장)
기관 담당자가 업로드한 CSV를 파싱·스키마 추론하여 DuckDB 테이블로
적재하고, 제출(submission) 상태를 관리한다.
"""
import datetime
import uuid

import pandas as pd

from . import database as db

_DTYPE_MAP = {
    "int64": "BIGINT",
    "float64": "DOUBLE",
    "bool": "BOOLEAN",
    "object": "VARCHAR",
    "datetime64[ns]": "TIMESTAMP",
}


def infer_schema(df: pd.DataFrame) -> list[tuple[str, str]]:
    """판다스 DataFrame의 컬럼명·dtype을 DuckDB 컬럼 정의로 변환한다."""
    schema = []
    for col in df.columns:
        duck_type = _DTYPE_MAP.get(str(df[col].dtype), "VARCHAR")
        schema.append((col, duck_type))
    return schema
