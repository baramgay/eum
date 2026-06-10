-- 002_rpc.sql — 온톨로지 빌드 및 액션 스코어링 RPC

CREATE OR REPLACE FUNCTION agg_youth_pop(yr int)
RETURNS TABLE(sgg_cd text, sigun text, pop bigint, inf bigint, outf bigint)
LANGUAGE sql STABLE AS $$
  SELECT sgg_cd, sigun,
         sum(population)::bigint,
         sum(inflow)::bigint,
         sum(outflow)::bigint
  FROM gold_youth_population
  WHERE year = yr
  GROUP BY sgg_cd, sigun;
$$;

CREATE OR REPLACE FUNCTION agg_business(yr int)
RETURNS TABLE(sgg_cd text, sigun text, bc bigint, emp bigint)
LANGUAGE sql STABLE AS $$
  SELECT sgg_cd, sigun,
         sum(biz_count)::bigint,
         sum(employees)::bigint
  FROM gold_business
  WHERE year = yr
  GROUP BY sgg_cd, sigun;
$$;

CREATE OR REPLACE FUNCTION agg_facility(ftype_filter text)
RETURNS TABLE(sgg_cd text, sigun text, n bigint)
LANGUAGE sql STABLE AS $$
  SELECT sgg_cd, sigun, count(*)::bigint
  FROM gold_public_facility
  WHERE ftype = ftype_filter
  GROUP BY sgg_cd, sigun;
$$;

CREATE OR REPLACE FUNCTION score_action_data(yr int, ftype_filter text)
RETURNS TABLE(sgg_cd text, sigun text, pop bigint, net bigint, emp bigint, fac bigint)
LANGUAGE sql STABLE AS $$
  WITH y AS (
    SELECT sgg_cd, sigun,
           sum(population)::bigint AS pop,
           (sum(inflow) - sum(outflow))::bigint AS net
    FROM gold_youth_population
    WHERE year = yr
    GROUP BY sgg_cd, sigun
  ),
  b AS (
    SELECT sgg_cd, sum(employees)::bigint AS emp
    FROM gold_business
    WHERE year = yr
    GROUP BY sgg_cd
  ),
  f AS (
    SELECT sgg_cd, count(*)::bigint AS fac
    FROM gold_public_facility
    WHERE ftype = ftype_filter
    GROUP BY sgg_cd
  )
  SELECT y.sgg_cd, y.sigun, y.pop, y.net,
         coalesce(b.emp, 0),
         coalesce(f.fac, 0)
  FROM y
  LEFT JOIN b ON y.sgg_cd = b.sgg_cd
  LEFT JOIN f ON y.sgg_cd = f.sgg_cd;
$$;

-- 품질진단용: 특정 테이블의 컬럼 정보 조회
CREATE OR REPLACE FUNCTION get_table_columns(tbl_name text)
RETURNS TABLE(column_name text, data_type text)
LANGUAGE sql STABLE AS $$
  SELECT column_name::text, data_type::text
  FROM information_schema.columns
  WHERE table_name = tbl_name
    AND table_schema = 'public'
  ORDER BY ordinal_position;
$$;
