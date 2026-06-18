-- 029_notifications.sql — 운영 알림 및 접근 로그 강화

-- 사용자별 알림 테이블
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  type        TEXT NOT NULL,
  title       TEXT NOT NULL,
  message     TEXT,
  link        TEXT,
  read        BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read
  ON notifications (user_id, read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_created_at
  ON notifications (created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- 본인 알림만 조회/수정
CREATE POLICY "notifications_owner_select"
  ON notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "notifications_owner_update"
  ON notifications FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- api_access_logs에 사용자 및 오류 플래그 추가
ALTER TABLE api_access_logs
  ADD COLUMN IF NOT EXISTS user_id UUID,
  ADD COLUMN IF NOT EXISTS error BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_access_logs_user
  ON api_access_logs (user_id, ts DESC);

CREATE INDEX IF NOT EXISTS idx_access_logs_error
  ON api_access_logs (error, ts DESC);
