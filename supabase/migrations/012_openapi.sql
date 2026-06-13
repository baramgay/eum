-- 012_openapi.sql — 데이터 연계·개방 API 게이트웨이

CREATE TABLE IF NOT EXISTS api_keys (
  key_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    TEXT NOT NULL,
  key_hash     TEXT NOT NULL UNIQUE,
  key_prefix   TEXT NOT NULL,
  name         TEXT NOT NULL,
  description  TEXT,
  scope        JSONB NOT NULL DEFAULT '{"type":"all"}'::jsonb,
  expires_at   TIMESTAMPTZ,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  call_count   BIGINT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON api_keys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash   ON api_keys(key_hash);

CREATE TABLE IF NOT EXISTS api_access_logs (
  log_id      BIGSERIAL PRIMARY KEY,
  key_id      UUID REFERENCES api_keys(key_id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL,
  method      TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  ts          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_access_logs_key ON api_access_logs(key_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_access_logs_ts  ON api_access_logs(ts);

CREATE TABLE IF NOT EXISTS webhooks (
  webhook_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  TEXT NOT NULL,
  url        TEXT NOT NULL,
  events     TEXT[] NOT NULL DEFAULT '{}',
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_webhooks_tenant ON webhooks(tenant_id);

CREATE TABLE IF NOT EXISTS webhook_logs (
  log_id      BIGSERIAL PRIMARY KEY,
  webhook_id  UUID REFERENCES webhooks(webhook_id) ON DELETE CASCADE,
  event       TEXT NOT NULL,
  payload     JSONB NOT NULL,
  status_code INTEGER,
  attempt     INTEGER NOT NULL DEFAULT 1,
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_wh ON webhook_logs(webhook_id, sent_at DESC);

ALTER TABLE api_keys        ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_access_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhooks        ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_logs    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "api_keys_rw" ON api_keys FOR ALL USING (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'center'
  OR tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')
) WITH CHECK (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'center'
  OR tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')
);

CREATE POLICY "webhooks_rw" ON webhooks FOR ALL USING (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'center'
  OR tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')
) WITH CHECK (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'center'
  OR tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')
);

-- access_logs / webhook_logs: center만 SELECT (service-role로 기록)
CREATE POLICY "access_logs_center" ON api_access_logs FOR SELECT USING (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'center'
);

CREATE POLICY "webhook_logs_center" ON webhook_logs FOR SELECT USING (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'center'
);
