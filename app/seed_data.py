"""
이음(EUM) 플랫폼 - 합성 시드 데이터 생성 (L1 수집 시뮬레이션)
경남 18개 시군의 공공데이터를 합성으로 생성한다.
실데이터가 아닌 데모용 합성값이며, 구조/흐름 시연이 목적이다.
"""
import random
import datetime
from . import database as db

random.seed(48)  # 경남 시군구 코드 앞자리 48

# 경남 18개 시군 (시 8 / 군 10)
SIGUN = [
    ("48121", "창원시", "시"), ("48170", "진주시", "시"), ("48220", "통영시", "시"),
    ("48240", "사천시", "시"), ("48250", "김해시", "시"), ("48270", "밀양시", "시"),
    ("48310", "거제시", "시"), ("48330", "양산시", "시"),
    ("48720", "의령군", "군"), ("48730", "함안군", "군"), ("48740", "창녕군", "군"),
    ("48820", "고성군", "군"), ("48840", "남해군", "군"), ("48850", "하동군", "군"),
    ("48860", "산청군", "군"), ("48870", "함양군", "군"), ("48880", "거창군", "군"),
    ("48890", "합천군", "군"),
]

# 시군별 대략 인구 규모 가중치(데모용)
POP_WEIGHT = {
    "창원시": 100, "김해시": 53, "진주시": 34, "양산시": 35, "거제시": 24,
    "통영시": 12, "사천시": 11, "밀양시": 10, "함안군": 6, "거창군": 6,
    "창녕군": 6, "고성군": 5, "합천군": 4, "남해군": 4, "하동군": 4,
    "함양군": 4, "산청군": 3, "의령군": 3,
}

NOW = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
YEARS = [2022, 2023, 2024, 2025]
YOUTH_AGES = ["20-24", "25-29", "30-34", "35-39"]  # 청년 20~39세 (전 데이터 통일)


def _table(name):
    db.execute(f"DROP TABLE IF EXISTS {name}")


def seed_tenants():
    db.execute("DELETE FROM tenants")
    for cd, name, gtype in SIGUN:
        # 데모: 시는 모두 입주, 군은 일부만 입주(온보딩 진행 상태 표현)
        onboarded = gtype == "시" or name in ("함안군", "거창군", "남해군")
        db.execute(
            "INSERT INTO tenants VALUES (?,?,?,?,?)",
            [cd, name, gtype, cd, onboarded],
        )


def seed_youth_population():
    """청년인구 현황 (gold) - 시군 x 연도 x 연령대 x 성별."""
    _table("gold_youth_population")
    db.execute("""
        CREATE TABLE gold_youth_population(
            sgg_cd VARCHAR, sigun VARCHAR, year INT, age_band VARCHAR,
            sex VARCHAR, population INT, inflow INT, outflow INT
        )""")
    rows = []
    for cd, name, _ in SIGUN:
        base = POP_WEIGHT[name] * 1000
        for y in YEARS:
            decline = 1.0 - 0.04 * (y - 2022)  # 청년인구 점진 감소 추세
            for age in YOUTH_AGES:
                for sex in ("M", "F"):
                    pop = int(base * decline * random.uniform(0.08, 0.16))
                    inflow = int(pop * random.uniform(0.05, 0.18))
                    outflow = int(pop * random.uniform(0.07, 0.22))
                    rows.append((cd, name, y, age, sex, pop, inflow, outflow))
    db.execute("INSERT INTO gold_youth_population VALUES " +
               ",".join(["(?,?,?,?,?,?,?,?)"] * len(rows)),
               [v for r in rows for v in r])
    return len(rows)


def seed_business():
    """사업체 현황 (gold)."""
    _table("gold_business")
    db.execute("""
        CREATE TABLE gold_business(
            sgg_cd VARCHAR, sigun VARCHAR, year INT, industry VARCHAR,
            biz_count INT, employees INT
        )""")
    industries = ["제조", "도소매", "숙박음식", "건설", "정보통신", "농림어업", "보건복지"]
    rows = []
    for cd, name, _ in SIGUN:
        base = POP_WEIGHT[name] * 30
        for y in YEARS:
            for ind in industries:
                bc = int(base * random.uniform(0.5, 1.5))
                emp = int(bc * random.uniform(3, 12))
                rows.append((cd, name, y, ind, bc, emp))
    db.execute("INSERT INTO gold_business VALUES " +
               ",".join(["(?,?,?,?,?,?)"] * len(rows)),
               [v for r in rows for v in r])
    return len(rows)


def seed_facility():
    """공공시설 현황 (gold) - 위경도 포함(공간데이터)."""
    _table("gold_public_facility")
    db.execute("""
        CREATE TABLE gold_public_facility(
            facility_id VARCHAR, sgg_cd VARCHAR, sigun VARCHAR,
            ftype VARCHAR, name VARCHAR, lon DOUBLE, lat DOUBLE,
            -- 데모 의도적 결함: 일부 좌표 결측(품질엔진이 탐지)
            capacity INT
        )""")
    ftypes = ["도서관", "체육관", "보건소", "청년센터", "복지관", "문화시설"]
    rows = []
    fid = 0
    for cd, name, _ in SIGUN:
        n = max(5, POP_WEIGHT[name] // 3)
        for _ in range(n):
            fid += 1
            ftype = random.choice(ftypes)
            lon = round(128.0 + random.uniform(-0.6, 0.9), 6)
            lat = round(35.2 + random.uniform(-0.5, 0.6), 6)
            # 5% 확률로 좌표 결측 (의도된 품질 결함)
            if random.random() < 0.05:
                lon, lat = None, None
            cap = random.choice([50, 100, 200, 300, 0])  # 0은 의도된 이상치
            rows.append((f"FAC{fid:05d}", cd, name, ftype,
                         f"{name} {ftype}", lon, lat, cap))
    db.execute("INSERT INTO gold_public_facility VALUES " +
               ",".join(["(?,?,?,?,?,?,?,?)"] * len(rows)),
               [v for r in rows for v in r])
    return len(rows)


# 카탈로그(DCAT) 등록 정의: (dataset_id, tenant, title, theme, keywords, table, open, ai_ready, high_value)
def register_catalog(counts):
    db.execute("DELETE FROM catalog")
    entries = [
        ("ds-youth-pop", "48000", "경남 청년인구 유출입 현황", "인구·가구",
         "청년,인구,유입,유출,정착", "gold_youth_population", counts["youth"],
         True, True, True, "통계표", "CSV/API"),
        ("ds-business", "48000", "경남 사업체 산업별 현황", "산업·고용",
         "사업체,산업,고용,일자리", "gold_business", counts["business"],
         True, True, True, "통계표", "CSV/API"),
        ("ds-facility", "48000", "경남 공공시설 위치 현황", "공공행정",
         "공공시설,청년센터,위치,공간", "gold_public_facility", counts["facility"],
         True, False, True, "공간정보", "CSV/GeoJSON"),
    ]
    for e in entries:
        (did, ten, title, theme, kw, tbl, rows, op, ai, hv, fmt2, fmt) = e
        db.execute(
            "INSERT INTO catalog VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            [did, ten, title,
             f"{title} 데이터셋. 경남 18개 시군 단위.", theme, kw,
             "gold", tbl, rows, op, ai, hv, NOW, "공공누리 제1유형", fmt],
        )


def seed_usage_log():
    """개방데이터 활용 로그(데모) - 활용도 지표 산출용."""
    db.execute("DELETE FROM usage_log")
    rows = []
    for did in ("ds-youth-pop", "ds-business", "ds-facility"):
        for _ in range(random.randint(40, 160)):
            act = random.choice(["view", "view", "download", "api"])
            rows.append((did, act, NOW))
    db.execute("INSERT INTO usage_log VALUES " +
               ",".join(["(?,?,?)"] * len(rows)),
               [v for r in rows for v in r])


def run_seed():
    db.init_schema()
    seed_tenants()
    counts = {
        "youth": seed_youth_population(),
        "business": seed_business(),
        "facility": seed_facility(),
    }
    register_catalog(counts)
    seed_usage_log()
    return counts


if __name__ == "__main__":
    c = run_seed()
    print("seed done:", c)
