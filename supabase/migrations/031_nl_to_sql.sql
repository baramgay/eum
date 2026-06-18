-- 027_nl_to_sql.sql — NL-to-SQL 에이전트용 안전한 SELECT 실행 함수

CREATE OR REPLACE FUNCTION run_select_sql(p_sql text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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

  -- 세미콜론 제거 후 JSON 배열로 집계
  v_sql := regexp_replace(p_sql, ';+\s*$', '');
  EXECUTE format('SELECT jsonb_agg(t) FROM (%s) t', v_sql) INTO v_result;

  RETURN COALESCE(v_result, '[]'::jsonb);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', SQLERRM);
END;
$$;
