-- 028_llm_calls.sql — LLM 호출 관측용 테이블

CREATE TABLE IF NOT EXISTS llm_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  model TEXT,
  messages JSONB,
  response TEXT,
  tool_calls JSONB,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE llm_calls ENABLE ROW LEVEL SECURITY;

-- 센터만 전체 조회
CREATE POLICY "center_read_llm_calls"
  ON llm_calls FOR SELECT
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'center'
  );

CREATE INDEX IF NOT EXISTS idx_llm_calls_user_id ON llm_calls(user_id);
CREATE INDEX IF NOT EXISTS idx_llm_calls_created_at ON llm_calls(created_at DESC);
