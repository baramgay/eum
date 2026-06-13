-- 017_qualitative_inputs.sql
-- 2026 평가편람 정성지표 수기 입력 테이블
-- evaluation.ts에서 'na' 상태인 정성 지표에 대한 담당자 입력값을 저장한다.

CREATE TABLE IF NOT EXISTS qualitative_inputs (
  tenant_id      TEXT NOT NULL,
  indicator_key  TEXT NOT NULL,   -- 지표 슬러그 (evaluation.ts QUALITATIVE_KEYS 참조)
  status         TEXT NOT NULL DEFAULT 'na' CHECK (status IN ('ok', 'warn', 'na')),
  note           TEXT,            -- 실적 내용·증빙 요약
  updated_at     TEXT NOT NULL,
  PRIMARY KEY (tenant_id, indicator_key),
  CONSTRAINT fk_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_qualitative_tenant ON qualitative_inputs(tenant_id);
