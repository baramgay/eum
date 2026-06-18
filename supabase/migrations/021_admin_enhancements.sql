-- 021_admin_enhancements.sql — 관리자탭 고도화: 기관 승인 워크플로우 메모 컬럼 추가
ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS reject_reason TEXT,
ADD COLUMN IF NOT EXISTS notes TEXT;

COMMENT ON COLUMN tenants.reject_reason IS '기관 승인 반려 사유';
COMMENT ON COLUMN tenants.notes IS '기관 관리용 비고';
