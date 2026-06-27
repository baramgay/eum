-- 037_rag_evals.sql — RAG 평가 및 피드백 테이블

CREATE TABLE IF NOT EXISTS rag_evals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  expected_dataset_ids TEXT[] DEFAULT '{}',
  expected_answer_notes TEXT
);

CREATE TABLE IF NOT EXISTS rag_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  sources_used JSONB,
  helpful BOOLEAN,
  comment TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE rag_evals ENABLE ROW LEVEL SECURITY;
ALTER TABLE rag_feedback ENABLE ROW LEVEL SECURITY;

-- 인증된 사용자는 평가 세트를 읽을 수 있다.
CREATE POLICY IF NOT EXISTS "rag_evals_select_authenticated"
  ON rag_evals FOR SELECT TO authenticated USING (true);

-- 인증된 사용자는 피드백을 남길 수 있다.
CREATE POLICY IF NOT EXISTS "rag_feedback_insert_authenticated"
  ON rag_feedback FOR INSERT TO authenticated WITH CHECK (true);

-- 사용자는 자신의 피드백을 읽을 수 있다.
CREATE POLICY IF NOT EXISTS "rag_feedback_select_own"
  ON rag_feedback FOR SELECT TO authenticated
  USING (created_by = auth.uid());

-- 센터는 모든 피드백을 읽을 수 있다.
CREATE POLICY IF NOT EXISTS "rag_feedback_select_center"
  ON rag_feedback FOR SELECT TO authenticated
  USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'center');

CREATE INDEX IF NOT EXISTS idx_rag_feedback_created_by ON rag_feedback(created_by);
CREATE INDEX IF NOT EXISTS idx_rag_feedback_created_at ON rag_feedback(created_at DESC);
