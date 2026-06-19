-- 032_quality_duplicate_rpc.sql — 중복 레코드 감지 RPC (다양성/유용성 NIA 특성 측정)

-- 지정 테이블의 완전 중복 행 개수 반환
-- 유용성(usefulness) 측정 — 중복 레코드는 ML 학습 편향 유발
CREATE OR REPLACE FUNCTION count_duplicate_rows(p_table text)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
DECLARE
  result bigint;
BEGIN
  EXECUTE format(
    'SELECT COALESCE(SUM(cnt - 1), 0)
     FROM (
       SELECT count(*) AS cnt
       FROM %I
       GROUP BY %I.*
       HAVING count(*) > 1
     ) sub',
    p_table, p_table
  ) INTO result;
  RETURN COALESCE(result, 0);
END;
$$;

COMMENT ON FUNCTION count_duplicate_rows(text) IS
  'NIA 유용성(usefulness) 측정: 지정 테이블에서 완전 중복 행(extra copies)의 건수를 반환한다.';
