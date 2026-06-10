"""
pytest 세션 격리 설정 — 테스트 실행이 운영 DB를 변경하지 않도록 임시 DuckDB 파일 사용.
"""
import os
import pytest
from app import database as db
from app import auth as auth_mod


@pytest.fixture(scope="session", autouse=True)
def isolated_db(tmp_path_factory):
    """테스트 전용 DuckDB 파일 사용 — 세션 전체에 걸쳐 운영 DB 보호."""
    tmp_dir = tmp_path_factory.mktemp("testdb")
    test_db_path = str(tmp_dir / "test_eum.duckdb")

    # 원본 상태 보존
    original_path = db.DB_PATH
    original_conn = db._conn

    # 테스트 DB로 교체
    db.DB_PATH = test_db_path
    if db._conn is not None:
        try:
            db._conn.close()
        except Exception:
            pass
    db._conn = None  # 다음 get_conn() 호출 시 test_db_path로 재연결

    # 테스트용 시드 데이터 로드
    from app import seed_data, quality, ontology
    db.init_schema()
    seed_data.run_seed()
    quality.run_all()
    ontology.build_ontology()

    yield

    # 원상 복구
    if db._conn is not None:
        try:
            db._conn.close()
        except Exception:
            pass
    db._conn = original_conn
    db.DB_PATH = original_path


@pytest.fixture(scope="session")
def center_auth_header():
    """센터 역할 JWT 토큰 헤더 — 보호된 라우트 테스트용."""
    token = auth_mod.create_token("center")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session")
def agency_48121_auth_header():
    """48121 기관 역할 JWT 토큰 헤더 — 기관 라우트 테스트용."""
    token = auth_mod.create_token("48121")
    return {"Authorization": f"Bearer {token}"}
