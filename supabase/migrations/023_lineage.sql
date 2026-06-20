-- 023_lineage.sql — 데이터 가공 결과 영속화 및 계보(lineage) 추적

-- 파이프라인 실행 결과물이 저장된 실제 테이블명
ALTER TABLE processing_runs ADD COLUMN IF NOT EXISTS result_table TEXT;

-- 카탈로그에서 파생 데이터셋을 추적할 수 있도록 계보 컬럼 추가
ALTER TABLE catalog ADD COLUMN IF NOT EXISTS derived_from JSONB;
ALTER TABLE catalog ADD COLUMN IF NOT EXISTS lineage_ids JSONB;

-- 데이터 계보 테이블: 실행(run) 단위로 source → target 연결 기록
-- 기존 processing_runs.id 는 TEXT 이므로 run_id 를 TEXT 로 유지해 호환성 보장
CREATE TABLE IF NOT EXISTS data_lineage (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type      TEXT NOT NULL,
  run_id        TEXT NOT NULL,
  source_ids    JSONB,
  target_table  TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_data_lineage_run_id       ON data_lineage(run_id);
CREATE INDEX IF NOT EXISTS idx_data_lineage_target_table ON data_lineage(target_table);

ALTER TABLE data_lineage ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'data_lineage' AND policyname = 'data_lineage_select') THEN
    CREATE POLICY data_lineage_select ON data_lineage FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'data_lineage' AND policyname = 'data_lineage_insert') THEN
    CREATE POLICY data_lineage_insert ON data_lineage FOR INSERT TO authenticated WITH CHECK (false);
  END IF;
END $$;

-- 파생 테이블을 동적으로 생성하는 RPC.
-- SECURITY DEFINER 로 정의되어 있으므로 서비스 롤 호출 시 DDL 권한으로 실행된다.
CREATE OR REPLACE FUNCTION create_derived_table(
  p_table_name TEXT,
  p_columns    JSONB,
  p_rows       JSONB
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  col_defs     TEXT;
  keys         TEXT[];
  rec          JSONB;
  k            TEXT;
  v            JSONB;
  insert_cols  TEXT;
  insert_vals  TEXT;
BEGIN
  -- 컬럼 정의 구성. p_columns 가 비어 있으면 첫 행에서 추론한다.
  IF p_columns IS NULL OR jsonb_array_length(p_columns) = 0 THEN
    IF p_rows IS NULL OR jsonb_array_length(p_rows) = 0 THEN
      RAISE EXCEPTION 'p_columns 와 p_rows 둘 다 비어 있습니다';
    END IF;
    SELECT array_agg(k ORDER BY k) INTO keys FROM jsonb_object_keys(p_rows->0) AS k;
    SELECT string_agg(
      format('%I %s', k, CASE
        WHEN jsonb_typeof(p_rows->0->k) = 'number' THEN
          CASE WHEN (p_rows->0->>k)::numeric = (p_rows->0->>k)::integer
               THEN 'INTEGER' ELSE 'FLOAT' END
        WHEN jsonb_typeof(p_rows->0->k) = 'boolean' THEN 'BOOLEAN'
        ELSE 'TEXT'
      END),
      ', '
    )
    INTO col_defs
    FROM unnest(keys) AS k;
  ELSE
    SELECT array_agg(c->>'name' ORDER BY ordinality) INTO keys
    FROM jsonb_array_elements(p_columns) WITH ORDINALITY AS c(val, ordinality);
    SELECT string_agg(format('%I %s', c->>'name', c->>'type'), ', ')
    INTO col_defs
    FROM jsonb_array_elements(p_columns) AS c;
  END IF;

  -- 동적 테이블 생성
  EXECUTE format('DROP TABLE IF EXISTS %I', p_table_name);
  EXECUTE format('CREATE TABLE %I (%s)', p_table_name, col_defs);

  IF p_rows IS NULL OR jsonb_array_length(p_rows) = 0 THEN
    RETURN;
  END IF;

  -- 행 삽입. 키 순서를 p_columns/keys 기준으로 고정해 컬럼-값 정합성을 유지한다.
  FOR rec IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    insert_cols := array_to_string(ARRAY(SELECT quote_ident(k) FROM unnest(keys) AS k), ', ');
    insert_vals := '';
    FOREACH k IN ARRAY keys LOOP
      v := rec->k;
      IF insert_vals <> '' THEN insert_vals := insert_vals || ', '; END IF;
      IF v IS NULL OR jsonb_typeof(v) = 'null' THEN
        insert_vals := insert_vals || 'NULL';
      ELSIF jsonb_typeof(v) = 'number' THEN
        insert_vals := insert_vals || (v#>>'{}');
      ELSIF jsonb_typeof(v) = 'boolean' THEN
        insert_vals := insert_vals || (v#>>'{}');
      ELSE
        insert_vals := insert_vals || quote_literal(v#>>'{}');
      END IF;
    END LOOP;
    EXECUTE format('INSERT INTO %I (%s) VALUES (%s)', p_table_name, insert_cols, insert_vals);
  END LOOP;
END;
$$;
