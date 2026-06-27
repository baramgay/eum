-- 042_quota_rls_and_atomic.sql — llm_usage RLS 보완 + 원자적 쿼터 함수

-- Critical #1: INSERT / UPDATE RLS 정책 추가 (auth client에서 자신의 row만 조작 허용)
CREATE POLICY "users_insert_own_llm_usage"
  ON llm_usage FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "users_update_own_llm_usage"
  ON llm_usage FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Critical #4: 원자적 쿼터 체크+증가 함수 (TOCTOU 경쟁 조건 방지)
-- FOR UPDATE 행 잠금으로 동일 사용자 동시 요청을 직렬화한다.
CREATE OR REPLACE FUNCTION increment_and_check_quota(
  p_user_id UUID,
  p_daily_limit INTEGER DEFAULT 100,
  p_monthly_limit INTEGER DEFAULT 2000
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date DATE := CURRENT_DATE;
  v_month TEXT := to_char(CURRENT_DATE, 'YYYY-MM');
  v_daily_calls INTEGER := 0;
  v_monthly_calls INTEGER := 0;
BEGIN
  -- 당일 row 없으면 생성 (idempotent)
  INSERT INTO llm_usage (user_id, date, month, calls, tokens)
  VALUES (p_user_id, v_date, v_month, 0, 0)
  ON CONFLICT (user_id, date) DO NOTHING;

  -- FOR UPDATE로 row 잠금 → 동시 요청 직렬화
  SELECT calls INTO v_daily_calls
  FROM llm_usage
  WHERE user_id = p_user_id AND date = v_date
  FOR UPDATE;

  IF v_daily_calls >= p_daily_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', format('일일 LLM 호출 한도(%s)를 초과했습니다', p_daily_limit)
    );
  END IF;

  -- 월간 집계 (당일 row 잠금 상태에서 읽으므로 안정적)
  SELECT COALESCE(SUM(calls), 0) INTO v_monthly_calls
  FROM llm_usage
  WHERE user_id = p_user_id AND month = v_month;

  IF v_monthly_calls >= p_monthly_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', format('월간 LLM 호출 한도(%s)를 초과했습니다', p_monthly_limit)
    );
  END IF;

  -- 한도 내 → 카운터 증가
  UPDATE llm_usage
  SET calls = calls + 1, updated_at = now()
  WHERE user_id = p_user_id AND date = v_date;

  RETURN jsonb_build_object('allowed', true);
END;
$$;
