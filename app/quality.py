"""
이음(EUM) 플랫폼 - 규칙기반 품질진단 엔진 (L3)
평가편람 '데이터 값 관리' 대응: 업무규칙 점검 + 오류율 산출(기준 0.001%).
각 데이터셋에 적용 가능한 규칙을 정의하고 위반 건수를 집계한다.
"""
import datetime
from . import database as db

ERROR_RATE_THRESHOLD = 0.001  # 평가편람 2026 기준 (%)

# 데이터셋별 업무규칙 정의: (규칙명, 위반 카운트 SQL)
RULES = {
    "gold_youth_population": [
        ("population 음수 금지", "SELECT count(*) FROM gold_youth_population WHERE population < 0"),
        ("population NULL 금지", "SELECT count(*) FROM gold_youth_population WHERE population IS NULL"),
        ("연령대 코드 유효성", "SELECT count(*) FROM gold_youth_population WHERE age_band NOT IN ('20-24','25-29','30-34','35-39')"),
        ("성별 코드 유효성", "SELECT count(*) FROM gold_youth_population WHERE sex NOT IN ('M','F')"),
        ("연도 범위(2018-2025)", "SELECT count(*) FROM gold_youth_population WHERE year < 2018 OR year > 2025"),
        ("유입/유출 음수 금지", "SELECT count(*) FROM gold_youth_population WHERE inflow < 0 OR outflow < 0"),
    ],
    "gold_business": [
        ("사업체수 양수", "SELECT count(*) FROM gold_business WHERE biz_count <= 0"),
        ("종사자수 음수 금지", "SELECT count(*) FROM gold_business WHERE employees < 0"),
        ("산업분류 결측 금지", "SELECT count(*) FROM gold_business WHERE industry IS NULL OR industry = ''"),
        ("종사자>=사업체 정합성", "SELECT count(*) FROM gold_business WHERE employees < biz_count"),
    ],
    "gold_public_facility": [
        ("좌표 결측 금지", "SELECT count(*) FROM gold_public_facility WHERE lon IS NULL OR lat IS NULL"),
        ("경도 범위(경남)", "SELECT count(*) FROM gold_public_facility WHERE lon IS NOT NULL AND (lon < 127.5 OR lon > 129.5)"),
        ("위도 범위(경남)", "SELECT count(*) FROM gold_public_facility WHERE lat IS NOT NULL AND (lat < 34.5 OR lat > 36.0)"),
        ("정원 양수", "SELECT count(*) FROM gold_public_facility WHERE capacity <= 0"),
        ("시설명 결측 금지", "SELECT count(*) FROM gold_public_facility WHERE name IS NULL OR name = ''"),
    ],
}

RULES_GENERIC_THRESHOLD = 5.0  # 임의 업로드 데이터는 데모 3종보다 기준을 완화한다 (5%)

NUMERIC_TYPES = {"BIGINT", "INTEGER", "DOUBLE", "FLOAT", "DECIMAL", "HUGEINT"}


def generic_rules(table_name: str) -> list[dict]:
    """테이블 컬럼을 스캔해 결측치·중복·타입일관성·음수이상치 규칙을 동적으로 생성한다."""
    cols = db.query(f"PRAGMA table_info('{table_name}')")
    rules = []

    for c in cols:
        name, ctype = c["name"], c["type"]
        rules.append({
            "rule": f"결측치 비율 - {name}",
            "sql": f'SELECT count(*) FROM {table_name} WHERE "{name}" IS NULL',
            "threshold": RULES_GENERIC_THRESHOLD,
        })
        if ctype in NUMERIC_TYPES:
            rules.append({
                "rule": f"음수 이상치 - {name}",
                "sql": f'SELECT count(*) FROM {table_name} WHERE "{name}" < 0',
                "threshold": RULES_GENERIC_THRESHOLD,
            })

    col_list = ", ".join(f'"{c["name"]}"' for c in cols)
    rules.append({
        "rule": "중복행 비율",
        "sql": (
            f"SELECT count(*) - count(DISTINCT ({col_list})) "
            f"FROM {table_name}"
        ),
        "threshold": RULES_GENERIC_THRESHOLD,
    })
    return rules


def run_quality_generic(table_name: str) -> dict:
    """generic_rules()로 만든 규칙을 실행해 run_quality()와 동일한 형태의 결과를 만든다."""
    total_rows = db.query(f"SELECT count(*) c FROM {table_name}")[0]["c"]
    rules = generic_rules(table_name)

    detail = []
    errors = 0
    for r in rules:
        viol = list(db.query(r["sql"])[0].values())[0]
        errors += viol
        detail.append({"rule": r["rule"], "violations": viol, "threshold": r["threshold"]})

    checked = total_rows * len(rules) if rules else 0
    rate = (errors / checked * 100) if checked else 0.0
    passed = rate <= RULES_GENERIC_THRESHOLD

    return {
        "table": table_name,
        "rule_count": len(rules),
        "checked": checked,
        "errors": errors,
        "error_rate": round(rate, 4),
        "threshold": RULES_GENERIC_THRESHOLD,
        "passed": passed,
        "detail": detail,
        "ran_at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }


# dataset_id -> table 매핑(카탈로그에서 가져옴)
def _table_of(dataset_id):
    r = db.query("SELECT table_name FROM catalog WHERE dataset_id = ?", [dataset_id])
    return r[0]["table_name"] if r else None


def run_quality(dataset_id):
    table = _table_of(dataset_id)
    if not table or table not in RULES:
        return None
    rules = RULES[table]
    total_rows = db.query(f"SELECT count(*) c FROM {table}")[0]["c"]
    # 점검 셀 수 = 행 x 규칙 수 (오류율 분모)
    checked = total_rows * len(rules)
    errors = 0
    detail = []
    for rname, sql in rules:
        row = db.query(sql)[0]
        viol = list(row.values())[0]  # 단일 count 컬럼
        errors += viol
        detail.append({"rule": rname, "violations": viol})
    rate = (errors / checked * 100) if checked else 0.0
    passed = rate <= ERROR_RATE_THRESHOLD
    ran = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    db.execute("DELETE FROM quality_results WHERE dataset_id = ?", [dataset_id])
    db.execute(
        "INSERT INTO quality_results VALUES (?,?,?,?,?,?,?,?)",
        [dataset_id, len(rules), checked, errors, round(rate, 5), passed,
         str(detail), ran],
    )
    return {
        "dataset_id": dataset_id, "table": table, "rule_count": len(rules),
        "checked": checked, "errors": errors, "error_rate": round(rate, 5),
        "threshold": ERROR_RATE_THRESHOLD, "passed": passed,
        "detail": detail, "ran_at": ran,
    }


def run_all():
    out = []
    for r in db.query("SELECT dataset_id FROM catalog"):
        res = run_quality(r["dataset_id"])
        if res:
            out.append(res)
    return out
