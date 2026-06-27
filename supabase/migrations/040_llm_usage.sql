-- 037_llm_usage.sql — LLM 사용량 할당량 추적

CREATE TABLE IF NOT EXISTS llm_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  month TEXT NOT NULL DEFAULT to_char(CURRENT_DATE, 'YYYY-MM'),
  calls INTEGER NOT NULL DEFAULT 0,
  tokens INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE llm_usage ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS idx_llm_usage_user_date
  ON llm_usage(user_id, date);

CREATE INDEX IF NOT EXISTS idx_llm_usage_user_month
  ON llm_usage(user_id, month);

-- 사용자는 자신의 사용량만 조회 가능
CREATE POLICY "users_read_own_llm_usage"
  ON llm_usage FOR SELECT
  USING (user_id = auth.uid());
