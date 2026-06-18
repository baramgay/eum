-- 024_quality_schedule.sql — 품질진단 데이터 계약 및 스케줄

-- 카탈로그에 데이터 품질 계약(JSONB) 저장
ALTER TABLE catalog ADD COLUMN IF NOT EXISTS quality_contract JSONB;

-- 품질진단 스케줄
CREATE TABLE IF NOT EXISTS quality_schedules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id    TEXT NOT NULL REFERENCES catalog(dataset_id) ON DELETE CASCADE,
  cron          TEXT NOT NULL,
  active        BOOLEAN DEFAULT true,
  last_run_at   TIMESTAMPTZ,
  next_run_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quality_schedules_dataset   ON quality_schedules(dataset_id);
CREATE INDEX IF NOT EXISTS idx_quality_schedules_next_run  ON quality_schedules(next_run_at) WHERE active = true;

ALTER TABLE quality_schedules ENABLE ROW LEVEL SECURITY;

-- 스케줄 조회는 누구나 가능
CREATE POLICY IF NOT EXISTS quality_schedules_select ON quality_schedules FOR SELECT
  TO authenticated USING (true);

-- 스케줄 생성/수정/삭제는 센터(admin) 권한만 허용
CREATE POLICY IF NOT EXISTS quality_schedules_insert ON quality_schedules FOR INSERT
  TO authenticated WITH CHECK (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'center'
  );
CREATE POLICY IF NOT EXISTS quality_schedules_update ON quality_schedules FOR UPDATE
  TO authenticated USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'center'
  );
CREATE POLICY IF NOT EXISTS quality_schedules_delete ON quality_schedules FOR DELETE
  TO authenticated USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'center'
  );
