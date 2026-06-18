-- collection_sources에 외부 시스템 커넥터 설정 저장 컬럼 추가

ALTER TABLE collection_sources
  ADD COLUMN IF NOT EXISTS connector_config JSONB DEFAULT NULL;

COMMENT ON COLUMN collection_sources.connector_config IS
  'postgres/sftp/api 등 외부 실데이터 커넥터 설정 (lib/connectors/types.ts 참고)';
