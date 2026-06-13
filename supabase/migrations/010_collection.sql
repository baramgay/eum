-- 010_collection.sql — 데이터 수집(Collection) 모듈

CREATE TABLE IF NOT EXISTS collection_sources (
  source_id    TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT,
  url          TEXT NOT NULL,
  method       TEXT NOT NULL DEFAULT 'GET',
  auth_type    TEXT NOT NULL DEFAULT 'none',
  auth_key     TEXT,
  auth_value   TEXT,
  query_params JSONB DEFAULT '{}'::jsonb,
  resp_format  TEXT NOT NULL DEFAULT 'json',
  json_path    TEXT,
  theme        TEXT,
  keywords     TEXT,
  license      TEXT DEFAULT '공공누리 1유형',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS collection_jobs (
  job_id        TEXT PRIMARY KEY,
  source_id     TEXT NOT NULL REFERENCES collection_sources(source_id) ON DELETE CASCADE,
  tenant_id     TEXT NOT NULL,
  schedule_type TEXT NOT NULL DEFAULT 'manual',
  status        TEXT NOT NULL DEFAULT 'idle',
  enabled       BOOLEAN NOT NULL DEFAULT true,
  last_run_at   TIMESTAMPTZ,
  next_run_at   TIMESTAMPTZ,
  last_log_id   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS collection_logs (
  log_id       TEXT PRIMARY KEY,
  job_id       TEXT NOT NULL REFERENCES collection_jobs(job_id) ON DELETE CASCADE,
  source_id    TEXT NOT NULL,
  tenant_id    TEXT NOT NULL,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at  TIMESTAMPTZ,
  duration_ms  INTEGER,
  status       TEXT NOT NULL DEFAULT 'running',
  rows_fetched INTEGER DEFAULT 0,
  rows_new     INTEGER DEFAULT 0,
  rows_changed INTEGER DEFAULT 0,
  rows_deleted INTEGER DEFAULT 0,
  error_msg    TEXT,
  table_name   TEXT
);

CREATE INDEX IF NOT EXISTS idx_csrc_tenant ON collection_sources(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cjob_tenant ON collection_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cjob_due    ON collection_jobs(enabled, next_run_at) WHERE schedule_type <> 'manual';
CREATE INDEX IF NOT EXISTS idx_clog_job    ON collection_logs(job_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_clog_tenant ON collection_logs(tenant_id);

ALTER TABLE collection_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_jobs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_logs    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "csrc_select" ON collection_sources FOR SELECT USING (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'center'
  OR tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')
);
CREATE POLICY "csrc_write" ON collection_sources FOR ALL USING (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'center'
  OR tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')
) WITH CHECK (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'center'
  OR tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')
);
CREATE POLICY "cjob_select" ON collection_jobs FOR SELECT USING (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'center'
  OR tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')
);
CREATE POLICY "cjob_write" ON collection_jobs FOR ALL USING (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'center'
  OR tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')
) WITH CHECK (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'center'
  OR tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')
);
CREATE POLICY "clog_select" ON collection_logs FOR SELECT USING (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'center'
  OR tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')
);
CREATE POLICY "clog_write" ON collection_logs FOR ALL USING (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'center'
  OR tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')
) WITH CHECK (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'center'
  OR tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')
);
