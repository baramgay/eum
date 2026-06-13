-- 019_analysis_runs.sql — 분석 자동 이력 (AnalyticsClient 실행 결과 저장)

CREATE TABLE IF NOT EXISTS analysis_runs (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL DEFAULT 'center',
  analysis_type  TEXT NOT NULL,
  dataset_label  TEXT NOT NULL,
  result_title   TEXT,
  result_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at     TEXT DEFAULT (to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS'))
);

ALTER TABLE analysis_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ar_select" ON analysis_runs FOR SELECT USING (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'center'
  OR tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')
);
CREATE POLICY "ar_insert" ON analysis_runs FOR INSERT WITH CHECK (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'center'
  OR tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')
);

CREATE INDEX IF NOT EXISTS idx_ar_tenant  ON analysis_runs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ar_created ON analysis_runs(created_at DESC);
