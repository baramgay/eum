-- 035_catalog_fts.sql
-- search_vector 트리거를 keywords 포함하도록 교체
-- fts 컬럼은 search_vector 별칭으로 추가 (하위 호환 유지)

CREATE OR REPLACE FUNCTION update_catalog_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := to_tsvector('simple',
    coalesce(NEW.title, '') || ' ' ||
    coalesce(NEW.description, '') || ' ' ||
    coalesce(NEW.theme, '') || ' ' ||
    coalesce(replace(NEW.keywords::text, ',', ' '), '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

UPDATE catalog SET search_vector = to_tsvector('simple',
  coalesce(title, '') || ' ' ||
  coalesce(description, '') || ' ' ||
  coalesce(theme, '') || ' ' ||
  coalesce(replace(keywords::text, ',', ' '), '')
);
