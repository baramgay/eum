-- 034_ai_safety_and_conversations.sql — 임베딩 작업 큐 및 서버 측 대화 저장

-- 임베딩 작업 큐
CREATE TABLE IF NOT EXISTS embedding_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id TEXT NOT NULL REFERENCES catalog(dataset_id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'done', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_embedding_jobs_status ON embedding_jobs(status);
CREATE INDEX IF NOT EXISTS idx_embedding_jobs_dataset_id ON embedding_jobs(dataset_id);

-- 서버 측 대화
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at DESC);

CREATE TABLE IF NOT EXISTS conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant', 'tool')),
  content TEXT,
  tool_calls JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversation_messages_conversation_id ON conversation_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_messages_created_at ON conversation_messages(created_at);

-- RLS
ALTER TABLE embedding_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;

-- 센터만 embedding_jobs 관리
CREATE POLICY "center_manage_embedding_jobs"
  ON embedding_jobs FOR ALL
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'center'
  )
  WITH CHECK (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'center'
  );

-- 본인 대화만 조회/수정
CREATE POLICY "user_own_conversations"
  ON conversations FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_own_conversation_messages"
  ON conversation_messages FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_messages.conversation_id
        AND c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_messages.conversation_id
        AND c.user_id = auth.uid()
    )
  );

-- llm_calls: 센터는 전체 조회, 일반 사용자는 본인 호출만 조회
DROP POLICY IF EXISTS "center_read_llm_calls" ON llm_calls;

CREATE POLICY "center_all_llm_calls"
  ON llm_calls FOR ALL
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'center'
  )
  WITH CHECK (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'center'
  );

CREATE POLICY "user_read_own_llm_calls"
  ON llm_calls FOR SELECT
  USING (user_id = auth.uid());
