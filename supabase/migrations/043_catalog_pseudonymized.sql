-- 043: catalog 및 submissions에 가명정보·합성데이터 여부 컬럼 추가
-- 평가편람 ⑤ 가명정보·합성데이터 개방 실적 연동 (per-dataset 플래그)

ALTER TABLE catalog
  ADD COLUMN IF NOT EXISTS is_pseudonymized BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_synthetic     BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS is_pseudonymized BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_synthetic     BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN catalog.is_pseudonymized IS '가명처리 데이터셋 여부 (평가편람 ⑤ 가점 산정에 활용)';
COMMENT ON COLUMN catalog.is_synthetic     IS '합성데이터셋 여부 (평가편람 ⑤ 가점 산정에 활용)';
