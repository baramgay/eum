-- 041_nl_to_sql_safe.sql — NL-to-SQL 안전 실행 함수 강화

-- 기존 SECURITY DEFINER 함수 제거
DROP FUNCTION IF EXISTS run_select_sql(text);

-- 안전 버전: SECURITY INVOKER + 고정 search_path + 결과 제한
CREATE OR REPLACE FUNCTION run_select_sql_safe(p_sql text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_sql text;
  v_result jsonb;
BEGIN
  v_sql := lower(trim(p_sql));

  -- SELECT만 허용
  IF v_sql !~ '^select\s' THEN
    RETURN jsonb_build_object('error', 'SELECT 문만 실행할 수 있습니다');
  END IF;

  -- DML/DDL 키워드 차단
  IF v_sql ~ '\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|execute|exec|load)\b' THEN
    RETURN jsonb_build_object('error', 'DML/DDL 키워드가 포함되어 있습니다');
  END IF;

  -- 세미콜론 제거 후 최대 1000행으로 제한하여 JSON 배열로 집계
  v_sql := regexp_replace(p_sql, ';+\s*$', '');
  EXECUTE format('SELECT jsonb_agg(t) FROM (%s LIMIT 1000) t', v_sql) INTO v_result;

  RETURN COALESCE(v_result, '[]'::jsonb);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', SQLERRM);
END;
$$;

-- 하위호환: 기존 run_select_sql 호출부가 깨지지 않도록 안전 함수로 위임
CREATE OR REPLACE FUNCTION run_select_sql(p_sql text)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT run_select_sql_safe(p_sql);
$$;
