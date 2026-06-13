-- 018_collection_pagination.sql
-- collection_sources: 페이지네이션 설정 + POST request_body 컬럼 추가

ALTER TABLE collection_sources
  ADD COLUMN IF NOT EXISTS request_body        JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pagination_type     TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS pagination_page_param TEXT DEFAULT 'pageNo',
  ADD COLUMN IF NOT EXISTS pagination_size_param TEXT DEFAULT 'numOfRows',
  ADD COLUMN IF NOT EXISTS pagination_size     INTEGER DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS pagination_total_path TEXT DEFAULT '$.totalCount';

COMMENT ON COLUMN collection_sources.pagination_type IS 'none|page|offset|cursor';
COMMENT ON COLUMN collection_sources.pagination_page_param IS '페이지 번호 파라미터명 (page 방식) 또는 오프셋 파라미터명 (offset 방식)';
COMMENT ON COLUMN collection_sources.pagination_size_param IS '페이지당 행 수 파라미터명';
COMMENT ON COLUMN collection_sources.pagination_size IS '1회 요청당 최대 행 수';
COMMENT ON COLUMN collection_sources.pagination_total_path IS 'JSON Path for total count ($.totalCount 등)';
COMMENT ON COLUMN collection_sources.request_body IS 'POST 요청 시 전송할 JSON body';
