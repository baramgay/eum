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


def _now() -> str:
    return datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def create_submission(meta: dict, table_name: str, rows: int, quality_summary: str) -> str:
    """메타정보 + 적재 결과 + 진단 요약으로 제출 레코드를 생성한다 (status=submitted)."""
    submission_id = uuid.uuid4().hex
    db.execute(
        "INSERT INTO submissions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [
            submission_id, meta["tenant_id"], meta["title"], meta["description"],
            meta["theme"], meta["keywords"], meta["license"], meta["format"],
            table_name, rows, "submitted", quality_summary, None,
            _now(), None,
        ],
    )
    return submission_id


def record_decision(submission_id: str, status: str, decision_note: str = "") -> None:
    """담당자의 승인/반려 결정을 기록한다 (status: approved | rejected)."""
    db.execute(
        "UPDATE submissions SET status = ?, decision_note = ?, decided_at = ? "
        "WHERE submission_id = ?",
        [status, decision_note, _now(), submission_id],
    )


def add_comment(submission_id: str, comment: str) -> str:
    """센터(컨설팅)의 코멘트를 추가한다."""
    comment_id = uuid.uuid4().hex
    db.execute(
        "INSERT INTO consultant_comments VALUES (?,?,?,?)",
        [comment_id, submission_id, comment, _now()],
    )
    return comment_id


def get_submission(submission_id: str) -> dict:
    """제출 상세(메타 + 미리보기 + 코멘트 이력)를 반환한다."""
    meta = db.query("SELECT * FROM submissions WHERE submission_id = ?", [submission_id])[0]
    preview = db.query(f"SELECT * FROM {meta['table_name']} LIMIT {PREVIEW_LIMIT}")
    comments = db.query(
        "SELECT * FROM consultant_comments WHERE submission_id = ? ORDER BY created_at",
        [submission_id],
    )
    return {"meta": meta, "preview": preview, "comments": comments}


def summarize_quality(result: dict) -> str:
    """품질진단 결과를 제출 레코드에 저장할 짧은 요약 문자열로 변환한다."""
    verdict = "통과" if result["passed"] else "미통과"
    return (
        f"규칙 {result['rule_count']}종 / 오류 {result['errors']}건 "
        f"/ 오류율 {result['error_rate']}% / {verdict}"
    )
