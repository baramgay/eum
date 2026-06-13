-- 011_processing.sql — 데이터 가공 파이프라인 모듈

CREATE TABLE IF NOT EXISTS processing_pipelines (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL,
  name              TEXT NOT NULL,
  description       TEXT,
  source_kind       TEXT NOT NULL,
  source_dataset_id TEXT NOT NULL,
  rules             JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at        TEXT DEFAULT (to_char(now(),'YYYY-MM-DD"T"HH24:MI:SS')),
  updated_at        TEXT DEFAULT (to_char(now(),'YYYY-MM-DD"T"HH24:MI:SS'))
);

CREATE TABLE IF NOT EXISTS processing_runs (
  id                TEXT PRIMARY KEY,
  pipeline_id       TEXT NOT NULL REFERENCES processing_pipelines(id) ON DELETE CASCADE,
  tenant_id         TEXT NOT NULL,
  status            TEXT DEFAULT 'running',
  input_rows        BIGINT DEFAULT 0,
  output_rows       BIGINT DEFAULT 0,
  error_rows        BIGINT DEFAULT 0,
  result_dataset_id TEXT,
  error_log         JSONB DEFAULT '[]'::jsonb,
  started_at        TEXT DEFAULT (to_char(now(),'YYYY-MM-DD"T"HH24:MI:SS')),
  finished_at       TEXT
);

ALTER TABLE processing_pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE processing_runs      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pp_select" ON processing_pipelines FOR SELECT USING (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'center'
  OR tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')
);
CREATE POLICY "pp_insert" ON processing_pipelines FOR INSERT WITH CHECK (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'center'
  OR tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')
);
CREATE POLICY "pp_update" ON processing_pipelines FOR UPDATE USING (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'center'
  OR tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')
);
CREATE POLICY "pp_delete" ON processing_pipelines FOR DELETE USING (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'center'
  OR tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')
);
CREATE POLICY "pr_select" ON processing_runs FOR SELECT USING (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'center'
  OR tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')
);
CREATE POLICY "pr_insert" ON processing_runs FOR INSERT WITH CHECK (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'center'
  OR tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')
);
CREATE POLICY "pr_update" ON processing_runs FOR UPDATE USING (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'center'
  OR tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')
);

CREATE INDEX IF NOT EXISTS idx_pp_tenant   ON processing_pipelines(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pr_pipeline ON processing_runs(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_pr_tenant   ON processing_runs(tenant_id);
