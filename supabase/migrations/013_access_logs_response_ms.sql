-- api_access_logs 테이블에 응답시간(ms) 컬럼 추가
ALTER TABLE api_access_logs
  ADD COLUMN IF NOT EXISTS response_ms INTEGER;
