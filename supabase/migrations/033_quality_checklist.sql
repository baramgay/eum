-- 1-Cycle 자가점검 체크리스트 상태 영속화
CREATE TABLE IF NOT EXISTS quality_checklist_state (
  dataset_id   text        NOT NULL,
  checked_ids  text[]      NOT NULL DEFAULT '{}',
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (dataset_id)
);

ALTER TABLE quality_checklist_state ENABLE ROW LEVEL SECURITY;

-- authenticated 사용자: 자신의 데이터만 읽기/쓰기 (공유 데이터이므로 모두 허용)
CREATE POLICY "checklist_all" ON quality_checklist_state
  FOR ALL USING (true) WITH CHECK (true);
