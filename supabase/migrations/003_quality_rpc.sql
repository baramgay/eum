-- 003_quality_rpc.sql — 품질진단 보조 RPC (Supabase 필터로 표현 불가한 조건)

-- 종사자수 < 사업체수 위반 건수
CREATE OR REPLACE FUNCTION count_emp_lt_biz()
RETURNS bigint LANGUAGE sql STABLE AS $$
  SELECT count(*)::bigint FROM gold_business WHERE employees < biz_count;
$$;

-- 경도 범위 이탈 건수 (경남: 127.5 ~ 129.5)
CREATE OR REPLACE FUNCTION count_lon_out_of_range()
RETURNS bigint LANGUAGE sql STABLE AS $$
  SELECT count(*)::bigint
  FROM gold_public_facility
  WHERE lon IS NOT NULL AND (lon < 127.5 OR lon > 129.5);
$$;

-- 위도 범위 이탈 건수 (경남: 34.5 ~ 36.0)
CREATE OR REPLACE FUNCTION count_lat_out_of_range()
RETURNS bigint LANGUAGE sql STABLE AS $$
  SELECT count(*)::bigint
  FROM gold_public_facility
  WHERE lat IS NOT NULL AND (lat < 34.5 OR lat > 36.0);
$$;
