"""
이음(EUM) 플랫폼 - 5개 탭 핵심 API 회귀 테스트 (FastAPI TestClient 기반)

startup 이벤트가 실행되어 seed_data·품질진단·온톨로지 빌드가 자동 수행된다.
data/eum.duckdb가 이미 있으면(catalog 행 > 0) 재적재를 건너뛴다.
각 테스트는 독립적으로 with TestClient(app) 블록을 사용해
DB 중복 초기화 문제를 방지한다.
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app


# startup 이벤트를 한 번만 실행하기 위해 모듈 수준 픽스처를 사용한다.
@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


# ---------- 1. 대시보드 ----------

def test_overview_returns_platform_key(client):
    """/api/overview → 200, 'platform' 키 포함."""
    r = client.get("/api/overview")
    assert r.status_code == 200
    body = r.json()
    assert "platform" in body
    assert body["platform"] == "이음(EUM)"


# ---------- 2. 평가편람 ----------

def test_evaluation_returns_overall_and_five_areas(client):
    """/api/evaluation → 200, 'overall' 키·'areas' 길이 5 포함."""
    r = client.get("/api/evaluation")
    assert r.status_code == 200
    body = r.json()
    assert "overall" in body
    assert "areas" in body
    assert len(body["areas"]) == 5


# ---------- 3. 개방포털(카탈로그) ----------

def test_catalog_returns_list(client):
    """/api/catalog → 200, 결과가 리스트."""
    r = client.get("/api/catalog")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# ---------- 4. 품질진단 ----------

def test_quality_returns_list(client):
    """/api/quality → 200, 결과가 리스트."""
    r = client.get("/api/quality")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# ---------- 5. 온톨로지 ----------

def test_ontology_graph_returns_nodes_and_edges(client):
    """/api/ontology/graph → 200, 'nodes'/'edges' 키 포함."""
    r = client.get("/api/ontology/graph")
    assert r.status_code == 200
    body = r.json()
    assert "nodes" in body
    assert "edges" in body


# ---------- 6. 공급자 워크플로우 ----------

def test_submission_all_returns_list(client, center_auth_header):
    """/api/submission/all 센터 인증 → 200, 결과가 리스트."""
    r = client.get("/api/submission/all", headers=center_auth_header)
    assert r.status_code == 200
    assert isinstance(r.json(), list)
