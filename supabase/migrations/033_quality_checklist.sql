-- 1-Cycle 자가점검 체크리스트 상태 영속화
CREATE TABLE IF NOT EXISTS quality_checklist_state (
  dataset_id   text        NOT NULL,
  checked_ids  text[]      NOT NULL DEFAULT '{}',
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (dataset_id)
);

ALTER TABLE quality_checklist_state ENABLE ROW LEVEL SECURITY;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='quality_checklist_state' and policyname='checklist_all') then
    CREATE POLICY "checklist_all" ON quality_checklist_state FOR ALL USING (true) WITH CHECK (true);
  end if;
end $$;
