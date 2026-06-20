-- 포털 데이터셋 구독 테이블
CREATE TABLE IF NOT EXISTS catalog_subscriptions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dataset_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, dataset_id)
);

ALTER TABLE catalog_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sub_select_own" ON catalog_subscriptions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "sub_insert_own" ON catalog_subscriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "sub_delete_own" ON catalog_subscriptions
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS catalog_subscriptions_user_idx    ON catalog_subscriptions (user_id);
CREATE INDEX IF NOT EXISTS catalog_subscriptions_dataset_idx ON catalog_subscriptions (dataset_id);
