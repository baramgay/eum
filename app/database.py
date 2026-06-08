"""
이음(EUM) 플랫폼 - 데이터 저장/질의 계층 (L2 레이크하우스 대응)
DuckDB를 분석용 질의 엔진 겸 메타 저장소로 사용한다.
Bronze/Silver/Gold 개념을 스키마(prefix)로 표현한다.
"""
import duckdb
import os
import threading

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "data", "eum.duckdb")

_lock = threading.Lock()
_conn = None


def get_conn():
    """단일 DuckDB 커넥션을 반환(스레드 안전 래핑)."""
    global _conn
    if _conn is None:
        with _lock:
            if _conn is None:
                _conn = duckdb.connect(DB_PATH)
    return _conn


def query(sql, params=None):
    """SELECT 질의 -> dict 리스트."""
    with _lock:
        cur = get_conn().execute(sql, params or [])
        cols = [c[0] for c in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]


def execute(sql, params=None):
    with _lock:
        return get_conn().execute(sql, params or [])


def init_schema():
    """플랫폼 메타 스키마 생성 (멱등)."""
    con = get_conn()
    con.execute("""
    CREATE TABLE IF NOT EXISTS tenants (
        tenant_id   VARCHAR PRIMARY KEY,
        name        VARCHAR,
        gov_type    VARCHAR,      -- 시 / 군
        sgg_cd      VARCHAR,
        onboarded   BOOLEAN
    );
    """)
    # DCAT 메타데이터 카탈로그 (L3)
    con.execute("""
    CREATE TABLE IF NOT EXISTS catalog (
        dataset_id  VARCHAR PRIMARY KEY,
        tenant_id   VARCHAR,
        title       VARCHAR,
        description VARCHAR,
        theme       VARCHAR,      -- DCAT theme
        keywords    VARCHAR,
        layer       VARCHAR,      -- bronze/silver/gold
        table_name  VARCHAR,
        rows        BIGINT,
        is_open     BOOLEAN,      -- 개방 여부
        ai_ready    BOOLEAN,      -- AI-Ready 여부
        high_value  BOOLEAN,      -- 고가치 여부
        updated_at  VARCHAR,
        license     VARCHAR,
        format      VARCHAR
    );
    """)
    # 품질 진단 결과 (L3)
    con.execute("""
    CREATE TABLE IF NOT EXISTS quality_results (
        dataset_id  VARCHAR,
        rule_count  INTEGER,
        checked     BIGINT,
        errors      BIGINT,
        error_rate  DOUBLE,
        passed      BOOLEAN,
        detail      VARCHAR,
        ran_at      VARCHAR
    );
    """)
    # 온톨로지 객체/관계 (L4)
    con.execute("""
    CREATE TABLE IF NOT EXISTS onto_objects (
        obj_id      VARCHAR PRIMARY KEY,
        obj_type    VARCHAR,
        label       VARCHAR,
        props       VARCHAR
    );
    """)
    con.execute("""
    CREATE TABLE IF NOT EXISTS onto_links (
        src         VARCHAR,
        rel         VARCHAR,
        dst         VARCHAR,
        weight      DOUBLE
    );
    """)
    # 개방데이터 활용 로그 (평가 '활용도' 지표 산출용)
    con.execute("""
    CREATE TABLE IF NOT EXISTS usage_log (
        dataset_id  VARCHAR,
        action      VARCHAR,      -- view / download / api
        ts          VARCHAR
    );
    """)
