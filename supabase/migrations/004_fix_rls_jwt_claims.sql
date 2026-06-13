-- 002_fix_rls_jwt_claims.sql
-- auth.jwt() ->> 'role' 은 Supabase 내장 'authenticated' 를 반환.
-- 커스텀 역할/tenant_id 는 user_metadata 에 있으므로 경로를 수정.

-- submissions 기존 정책 교체
DROP POLICY IF EXISTS "submissions_select" ON submissions;
DROP POLICY IF EXISTS "submissions_insert" ON submissions;
DROP POLICY IF EXISTS "submissions_update" ON submissions;

CREATE POLICY "submissions_select" ON submissions FOR SELECT USING (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'center'
  OR (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'agency'
    AND tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')
  )
);

CREATE POLICY "submissions_insert" ON submissions FOR INSERT WITH CHECK (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'center'
  OR tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')
);

CREATE POLICY "submissions_update" ON submissions FOR UPDATE USING (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'center'
);

-- comments 기존 정책 교체
DROP POLICY IF EXISTS "comments_insert" ON consultant_comments;

CREATE POLICY "comments_insert" ON consultant_comments FOR INSERT WITH CHECK (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'center'
);
