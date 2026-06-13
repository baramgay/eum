-- 감사 로그 테이블
CREATE TABLE IF NOT EXISTS audit_logs (
  id             BIGSERIAL PRIMARY KEY,
  actor_id       UUID,
  actor_email    TEXT,
  action         TEXT NOT NULL,
  resource_type  TEXT,
  resource_id    TEXT,
  old_value      JSONB,
  new_value      JSONB,
  ip_address     TEXT,
  user_agent     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS 활성화
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- 센터 전체 조회
CREATE POLICY "center_read_all_audit"
  ON audit_logs FOR SELECT
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'center'
  );

-- 기관 자신 관련 로그 조회 (actor 이거나 resource_id 매칭)
CREATE POLICY "agency_read_own_audit"
  ON audit_logs FOR SELECT
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'agency'
    AND actor_id = auth.uid()
  );

-- 서비스 롤만 INSERT 가능 (RLS 우회)
-- 실제 삽입은 서버 측 service role key로 처리

-- 인덱스
CREATE INDEX IF NOT EXISTS audit_logs_actor_id_idx      ON audit_logs (actor_id);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx        ON audit_logs (action);
CREATE INDEX IF NOT EXISTS audit_logs_resource_idx      ON audit_logs (resource_type, resource_id);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx    ON audit_logs (created_at DESC);
