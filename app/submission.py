"""
이음(EUM) 플랫폼 - 공급자 워크플로우 (L1 적재 확장)
기관 담당자가 업로드한 CSV를 파싱·스키마 추론하여 DuckDB 테이블로
적재하고, 제출(submission) 상태를 관리한다.
"""
import datetime
import re
import uuid

import pandas as pd

from . import database as db

# 제출 테이블명 패턴: sub_{tenant_id}_{8자리hex}
# 이 정규식은 quality.py 등 다른 모듈에서도 재사용된다.
# TODO(Phase 2): connection pool 전환 시 app/utils.py로 이동 예정
_TABLE_NAME_RE = re.compile(r"^sub_(.+)_[0-9a-f]{8}$")


def _validate_table_name(name: str) -> str:
    """사용 시점에 table_name을 재검증한다. 패턴 불일치 시 ValueError 발생.

    SQL f-string 보간 전에 호출해 injection을 방지한다.
    허용 패턴: sub_{tenant_id}_{8자리 소문자 hex}
    """
    if not _TABLE_NAME_RE.match(name):
        raise ValueError(f"유효하지 않은 테이블명: {name!r}")
    return name

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
    _validate_table_name(table_name)  # SQL injection 방지 (그룹 A)
    df = pd.read_csv(file_obj)
    schema = infer_schema(df)

    # 그룹 C: 동시 요청 시 동일 테이블명 충돌을 막기 위해 _lock으로 감싼다.
    # TODO(Phase 2): connection pool 전환 시 재검토 — 락 범위를 DB write 단계만으로 축소 가능
    with db._lock:
        conn = db.get_conn()
        conn.execute(f"DROP TABLE IF EXISTS {table_name}")
        conn.register(f"_upload_{table_name}", df)
        conn.execute(f"CREATE TABLE {table_name} AS SELECT * FROM _upload_{table_name}")
        conn.unregister(f"_upload_{table_name}")

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


def get_submission(submission_id: str) -> dict | None:
    """제출 상세(메타 + 미리보기 + 코멘트 이력)를 반환한다.

    존재하지 않는 submission_id이면 None을 반환한다.
    호출자(main.py)에서 None 여부를 확인해 404를 반환해야 한다.
    """
    rows = db.query("SELECT * FROM submissions WHERE submission_id = ?", [submission_id])
    if not rows:
        return None
    meta = rows[0]
    _validate_table_name(meta["table_name"])  # SQL injection 방지 (그룹 A)
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
