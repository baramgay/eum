"""온톨로지 후보 추천 함수 테스트 — recommend_ontology_candidates."""
from app.ontology import recommend_ontology_candidates


def test_empty_meta_returns_empty_list():
    result = recommend_ontology_candidates({})
    assert result == []


def test_youth_keywords_recommends_youth_type():
    meta = {"title": "청년 유입·유출 통계", "keywords": "청년,인구,이동"}
    result = recommend_ontology_candidates(meta)
    obj_types = [r["obj_type"] for r in result]
    assert "청년인구" in obj_types


def test_business_keywords_recommends_business_type():
    meta = {"title": "창원시 사업체 현황", "keywords": "기업,종사자,고용"}
    result = recommend_ontology_candidates(meta)
    obj_types = [r["obj_type"] for r in result]
    assert "사업체" in obj_types


def test_facility_theme_recommends_infra_type():
    meta = {"theme": "공공시설", "keywords": "청년센터,인프라"}
    result = recommend_ontology_candidates(meta)
    obj_types = [r["obj_type"] for r in result]
    assert "청년인프라" in obj_types


def test_admin_area_title_recommends_sigun_type():
    meta = {"title": "경남 시군구 행정구역"}
    result = recommend_ontology_candidates(meta)
    obj_types = [r["obj_type"] for r in result]
    assert "시군" in obj_types


def test_combined_keywords_returns_multiple_types():
    meta = {
        "title": "청년 사업체 현황",
        "keywords": "청년,인구,사업체,기업",
    }
    result = recommend_ontology_candidates(meta)
    assert len(result) >= 2
    obj_types = [r["obj_type"] for r in result]
    assert "청년인구" in obj_types
    assert "사업체" in obj_types


def test_result_item_has_required_keys():
    meta = {"title": "청년 인구 현황", "keywords": "청년"}
    result = recommend_ontology_candidates(meta)
    assert len(result) >= 1
    item = result[0]
    assert "obj_type" in item
    assert "matched_keywords" in item
    assert "reason" in item
    assert isinstance(item["matched_keywords"], list)
    assert len(item["matched_keywords"]) >= 1
