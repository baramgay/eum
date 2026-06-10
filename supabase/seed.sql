-- seed.sql — 경남 18개 시군 + 카탈로그 + 사용 로그 초기 데이터

INSERT INTO tenants VALUES
  ('48121','창원시','시','48121',true),
  ('48170','진주시','시','48170',true),
  ('48220','통영시','시','48220',true),
  ('48240','사천시','시','48240',true),
  ('48250','김해시','시','48250',true),
  ('48270','밀양시','시','48270',true),
  ('48310','거제시','시','48310',true),
  ('48330','양산시','시','48330',true),
  ('48720','의령군','군','48720',false),
  ('48730','함안군','군','48730',true),
  ('48740','창녕군','군','48740',false),
  ('48820','고성군','군','48820',false),
  ('48840','남해군','군','48840',true),
  ('48850','하동군','군','48850',false),
  ('48860','산청군','군','48860',false),
  ('48870','함양군','군','48870',false),
  ('48880','거창군','군','48880',true),
  ('48890','합천군','군','48890',false)
ON CONFLICT (tenant_id) DO NOTHING;

INSERT INTO catalog VALUES
  ('ds-youth-pop','48000','경남 청년인구 유출입 현황',
   '경남 18개 시군 청년인구 유출입 현황 데이터셋. 경남 18개 시군 단위.',
   '인구·가구','청년,인구,유입,유출,정착','gold','gold_youth_population',
   2304,true,true,true,NOW()::text,'공공누리 제1유형','CSV/API'),
  ('ds-business','48000','경남 사업체 산업별 현황',
   '경남 18개 시군 사업체 산업별 현황 데이터셋. 경남 18개 시군 단위.',
   '산업·고용','사업체,산업,고용,일자리','gold','gold_business',
   504,true,true,true,NOW()::text,'공공누리 제1유형','CSV/API'),
  ('ds-facility','48000','경남 공공시설 위치 현황',
   '경남 18개 시군 공공시설 위치 현황 데이터셋. 경남 18개 시군 단위.',
   '공공행정','공공시설,청년센터,위치,공간','gold','gold_public_facility',
   186,true,false,true,NOW()::text,'공공누리 제1유형','CSV/GeoJSON')
ON CONFLICT (dataset_id) DO NOTHING;

INSERT INTO usage_log
SELECT d.dataset_id, a.action, NOW()::text
FROM
  (VALUES ('ds-youth-pop'),('ds-business'),('ds-facility')) AS d(dataset_id),
  (VALUES ('view'),('view'),('download'),('api')) AS a(action),
  generate_series(1, 30);
