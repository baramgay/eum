"""
이음(EUM) 플랫폼 - API 경계 테스트 (FastAPI TestClient 기반)
startup 이벤트가 실행되어 seed_data가 로드된다.
기존 data/eum.duckdb가 있으면 중복 적재를 건너뛰므로 재사용해도 안전하다.
"""
import io

import pytest
from fastapi.testclient import TestClient

from app.main import app


# 스타트업 이벤트를 한 번만 실행하기 위해 모듈 수준에서 공유 클라이언트를 생성한다.
@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


# ---------- 1. catalog sort 화이트리스트 ----------

def test_catalog_sort_whitelist(client):
    """알 수 없는 sort 값은 기본 정렬(high_value DESC)로 폴백되어 200을 반환한다."""
    r = client.get("/api/catalog?sort=unknown_col")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# ---------- 2. submission upload — 알 수 없는 tenant_id ----------

def test_submission_upload_invalid_tenant(client, center_auth_header):
    """알 수 없는 tenant_id로 업로드 시도 → 400, 응답 JSON에 'tenant_id' 포함."""
    csv_bytes = b"col1,col2\n1,2\n3,4"
    r = client.post(
        "/api/submission/upload",
        headers=center_auth_header,
        data={"tenant_id": "NOT_EXIST"},
        files={"file": ("test.csv", io.BytesIO(csv_bytes), "text/csv")},
    )
    assert r.status_code == 400
    assert "tenant_id" in r.json().get("error", "")


# ---------- 3. submission create — 유효하지 않은 table_name (SQL injection 시도) ----------

def test_submission_create_invalid_table_name(client, agency_48121_auth_header):
    """SQL injection 시도 table_name → 400."""
    r = client.post(
        "/api/submission",
        headers=agency_48121_auth_header,
        data={
            "tenant_id": "48121",
            "title": "test",
            "description": "test description here",
            "theme": "test",
            "keywords": "test",
            "license": "CC",
            "format": "csv",
            "table_name": "sub_48121_abc; DROP TABLE submissions;--",
            "rows": "1",
        },
    )
    assert r.status_code == 400


# ---------- 4. nlquery — 인식 안 되는 질의 ----------

def test_nlquery_unknown_intent(client):
    """의도를 파악할 수 없는 질의 → 200, intent 키 값이 None."""
    r = client.get("/api/nlquery?q=오늘+날씨")
    assert r.status_code == 200
    assert r.json()["intent"] is None


# ---------- 5. plan/draft — 잘못된 type ----------

def test_plan_draft_invalid_type(client):
    """잘못된 type 파라미터 → 400."""
    r = client.get("/api/plan/draft?tenant_id=48121&type=invalid")
    assert r.status_code == 400
