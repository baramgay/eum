-- 001_initial.sql — 이음(EUM) 플랫폼 초기 스키마 + RLS

CREATE TABLE IF NOT EXISTS tenants (
  tenant_id  TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  gov_type   TEXT,
  sgg_cd     TEXT,
  onboarded  BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS catalog (
  dataset_id  TEXT PRIMARY KEY,
  tenant_id   TEXT,
  title       TEXT,
  description TEXT,
  theme       TEXT,
  keywords    TEXT,
  layer       TEXT,
  table_name  TEXT,
  rows        BIGINT,
  is_open     BOOLEAN DEFAULT false,
  ai_ready    BOOLEAN DEFAULT false,
  high_value  BOOLEAN DEFAULT false,
  updated_at  TEXT,
  license     TEXT,
  format      TEXT
);

CREATE TABLE IF NOT EXISTS quality_results (
  dataset_id  TEXT,
  rule_count  INTEGER,
  checked     BIGINT,
  errors      BIGINT,
  error_rate  DOUBLE PRECISION,
  passed      BOOLEAN,
  detail      JSONB,
  ran_at      TEXT
);

CREATE TABLE IF NOT EXISTS onto_objects (
  obj_id   TEXT PRIMARY KEY,
  obj_type TEXT,
  label    TEXT,
  props    TEXT
);

CREATE TABLE IF NOT EXISTS onto_links (
  src    TEXT,
  rel    TEXT,
  dst    TEXT,
  weight DOUBLE PRECISION
);

CREATE TABLE IF NOT EXISTS usage_log (
  dataset_id TEXT,
  action     TEXT,
  ts         TEXT
);

CREATE TABLE IF NOT EXISTS submissions (
  submission_id   TEXT PRIMARY KEY,
  tenant_id       TEXT,
  title           TEXT,
  description     TEXT,
  theme           TEXT,
  keywords        TEXT,
  license         TEXT,
  format          TEXT,
  table_name      TEXT,
  rows            BIGINT,
  status          TEXT DEFAULT 'submitted',
  quality_summary TEXT,
  decision_note   TEXT,
  submitted_at    TEXT,
  decided_at      TEXT
);

CREATE TABLE IF NOT EXISTS consultant_comments (
  comment_id    TEXT PRIMARY KEY,
  submission_id TEXT,
  comment       TEXT,
  created_at    TEXT
);

-- CSV 업로드 데이터 저장 (DuckDB 동적 테이블 대체)
CREATE TABLE IF NOT EXISTS submission_uploads (
  upload_id   TEXT PRIMARY KEY,
  table_name  TEXT UNIQUE,
  schema_info JSONB,
  preview     JSONB,
  row_count   BIGINT,
  created_at  TEXT
);

-- Gold 테이블
CREATE TABLE IF NOT EXISTS gold_youth_population (
  sgg_cd     TEXT,
  sigun      TEXT,
  year       INT,
  age_band   TEXT,
  sex        TEXT,
  population INT,
  inflow     INT,
  outflow    INT
);

CREATE TABLE IF NOT EXISTS gold_business (
  sgg_cd    TEXT,
  sigun     TEXT,
  year      INT,
  industry  TEXT,
  biz_count INT,
  employees INT
);

CREATE TABLE IF NOT EXISTS gold_public_facility (
  facility_id TEXT PRIMARY KEY,
  sgg_cd      TEXT,
  sigun       TEXT,
  ftype       TEXT,
  name        TEXT,
  lon         DOUBLE PRECISION,
  lat         DOUBLE PRECISION,
  capacity    INT
);

-- RLS 활성화
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultant_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- catalog / tenants: 전체 공개 읽기
CREATE POLICY "catalog_public_read" ON catalog FOR SELECT USING (true);
CREATE POLICY "tenants_public_read" ON tenants FOR SELECT USING (true);

-- submissions: agency는 자기 tenant_id만, center는 전체
CREATE POLICY "submissions_select" ON submissions FOR SELECT USING (
  (auth.jwt() ->> 'role') = 'center'
  OR (
    (auth.jwt() ->> 'role') = 'agency'
    AND tenant_id = (auth.jwt() ->> 'tenant_id')
  )
);
CREATE POLICY "submissions_insert" ON submissions FOR INSERT WITH CHECK (
  (auth.jwt() ->> 'role') = 'center'
  OR tenant_id = (auth.jwt() ->> 'tenant_id')
);
CREATE POLICY "submissions_update" ON submissions FOR UPDATE USING (
  (auth.jwt() ->> 'role') = 'center'
);

-- comments: 전체 읽기, center만 insert
CREATE POLICY "comments_select" ON consultant_comments FOR SELECT USING (true);
CREATE POLICY "comments_insert" ON consultant_comments FOR INSERT WITH CHECK (
  (auth.jwt() ->> 'role') = 'center'
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_submissions_tenant  ON submissions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_gyp_year_sgg        ON gold_youth_population(year, sgg_cd);
CREATE INDEX IF NOT EXISTS idx_gb_year_sgg         ON gold_business(year, sgg_cd);
CREATE INDEX IF NOT EXISTS idx_gpf_ftype_sgg       ON gold_public_facility(ftype, sgg_cd);
