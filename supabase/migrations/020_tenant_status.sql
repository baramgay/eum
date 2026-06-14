-- 020_tenant_status.sql — 기관 승인/반려 워크플로우용 상태 컬럼 추가
ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending'
  CHECK (status IN ('pending', 'approved', 'rejected'));

-- 기존 데이터: onboarded=true 면 approved, 아니면 pending
UPDATE tenants
SET status = CASE WHEN onboarded THEN 'approved' ELSE 'pending' END
WHERE status IS NULL;
