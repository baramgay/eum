-- 015_evaluation_enhancements.sql
-- 2026 평가편람 대응: catalog 컬럼 추가 + 가명정보·합성데이터 실적 테이블

-- catalog 테이블에 API 제공 여부 컬럼 추가
ALTER TABLE catalog ADD COLUMN IF NOT EXISTS api_enabled BOOLEAN DEFAULT false;

-- 가명정보 제공 및 합성데이터 개방 실적 (가점 ⑤, 1건당 1점, 최대 5점)
CREATE TABLE IF NOT EXISTS anonymous_data_cases (
  case_id       TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL,
  case_type     TEXT NOT NULL CHECK (case_type IN ('synthetic', 'anonymized')),
  title         TEXT NOT NULL,
  dataset_id    TEXT,              -- 연관 catalog 항목
  portal_url    TEXT,              -- 공공데이터포털 공개 URL
  opened_at     TEXT NOT NULL,     -- 개방/제공 일자 (YYYY-MM-DD)
  created_at    TEXT NOT NULL,
  CONSTRAINT fk_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
);

-- 데이터 분석·활용 실적 추적 (분석·활용 영역 ① 지표)
CREATE TABLE IF NOT EXISTS analysis_records (
  record_id     TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL,
  title         TEXT NOT NULL,
  purpose       TEXT,             -- 분석 목적 (정책활용·서비스개선·사회문제해결)
  datasets_used TEXT[],           -- 활용 데이터셋 목록
  result_summary TEXT,
  policy_applied BOOLEAN DEFAULT false,  -- 정책에 반영됐는지
  performed_at  TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  CONSTRAINT fk_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
);

-- 기관별 평가 목표 설정 (목표 대비 현황 비교용)
CREATE TABLE IF NOT EXISTS evaluation_targets (
  tenant_id        TEXT PRIMARY KEY,
  target_year      INTEGER DEFAULT 2026,
  open_rate_goal   NUMERIC(5,1) DEFAULT 80.0,  -- 개방 목표율 (%)
  ai_ready_goal    NUMERIC(5,1) DEFAULT 50.0,  -- AI-Ready 목표율 (%)
  quality_pass_goal NUMERIC(5,1) DEFAULT 100.0, -- 품질진단 통과 목표율 (%)
  synthetic_goal   INTEGER DEFAULT 2,           -- 가명정보·합성데이터 개방 목표건수
  analysis_goal    INTEGER DEFAULT 5,           -- 데이터 분석·활용 목표건수
  updated_at       TEXT,
  CONSTRAINT fk_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_anonymous_tenant ON anonymous_data_cases(tenant_id);
CREATE INDEX IF NOT EXISTS idx_analysis_tenant  ON analysis_records(tenant_id);
