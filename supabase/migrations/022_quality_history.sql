-- 022_quality_history.sql — 품질진단 이력 저장 및 비교

CREATE TABLE IF NOT EXISTS quality_history (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id  text NOT NULL,
  table_name  text,
  rule_count  integer,
  checked     bigint,
  errors      bigint,
  error_rate  double precision,
  passed      boolean,
  detail      jsonb,
  ran_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quality_history_dataset ON quality_history(dataset_id);
CREATE INDEX IF NOT EXISTS idx_quality_history_ran_at  ON quality_history(ran_at DESC);

ALTER TABLE quality_history ENABLE ROW LEVEL SECURITY;

-- 인증된 사용자는 이력을 읽을 수 있음(센터·기관·조회자 모두 품질 현황 조회 필요)
CREATE POLICY quality_history_select ON quality_history FOR SELECT
  TO authenticated USING (true);

-- 삽입은 서비스 롤 또는 트리거/함수 경유만 허용(애플리케이션은 service_role 사용)
CREATE POLICY quality_history_insert ON quality_history FOR INSERT
  TO authenticated WITH CHECK (false);
