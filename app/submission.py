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


PREVIEW_LIMIT = 20


def load_csv_to_table(file_obj, table_name: str) -> dict:
    """CSV를 읽어 스키마를 추론하고 DuckDB 테이블로 적재한 뒤 미리보기를 반환한다."""
    df = pd.read_csv(file_obj)
    schema = infer_schema(df)

    conn = db.get_conn()
    conn.execute(f"DROP TABLE IF EXISTS {table_name}")
    conn.register("_upload_df", df)
    conn.execute(f"CREATE TABLE {table_name} AS SELECT * FROM _upload_df")
    conn.unregister("_upload_df")

    preview = db.query(f"SELECT * FROM {table_name} LIMIT {PREVIEW_LIMIT}")
    return {
        "table_name": table_name,
        "rows": len(df),
        "schema": schema,
        "preview": preview,
    }


def new_table_name(tenant_id: str) -> str:
    """제출용 테이블명을 생성한다 (tenant_id + 짧은 uuid로 충돌 방지)."""
    suffix = uuid.uuid4().hex[:8]
    return f"sub_{tenant_id}_{suffix}"
