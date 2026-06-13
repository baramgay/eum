-- 014_search.sql — 카탈로그 풀텍스트 검색 인덱스

-- tsvector 컬럼 추가 (한국어: simple 딕셔너리)
ALTER TABLE catalog ADD COLUMN IF NOT EXISTS search_vector tsvector;

UPDATE catalog SET search_vector = to_tsvector('simple',
  coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || coalesce(theme, '')
);

CREATE INDEX IF NOT EXISTS idx_catalog_search ON catalog USING GIN(search_vector);

-- 자동 업데이트 트리거
CREATE OR REPLACE FUNCTION update_catalog_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := to_tsvector('simple',
    coalesce(NEW.title, '') || ' ' || coalesce(NEW.description, '') || ' ' || coalesce(NEW.theme, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS catalog_search_vector_update ON catalog;
CREATE TRIGGER catalog_search_vector_update
  BEFORE INSERT OR UPDATE ON catalog
  FOR EACH ROW EXECUTE FUNCTION update_catalog_search_vector();

-- 테마 목록 조회용 인덱스
CREATE INDEX IF NOT EXISTS idx_catalog_theme ON catalog(theme);
CREATE INDEX IF NOT EXISTS idx_catalog_is_open ON catalog(is_open);
