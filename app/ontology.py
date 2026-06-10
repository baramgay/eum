"""
이음(EUM) 플랫폼 - 온톨로지 코어 (L4, 2단계 코어의 MVP)
Gold 데이터를 객체(Object)·관계(Link)로 승격한다.
객체: 시군, 청년인구(시군x연도 집계), 사업체(시군 집계), 공공시설
관계: 시군-(보유)->시설, 시군-(청년규모)->청년인구, 청년인구-(유입/유출)
액션: 정착지원 우선지역 선정 (스코어링)
"""
from . import database as db


def build_ontology():
    """Gold 데이터에서 객체/관계를 생성(멱등)."""
    db.execute("DELETE FROM onto_objects")
    db.execute("DELETE FROM onto_links")

    objs = []
    links = []

    # 1) 시군 객체
    for t in db.query("SELECT sgg_cd, name, gov_type FROM tenants"):
        oid = f"sigun:{t['sgg_cd']}"
        objs.append((oid, "시군", t["name"], f"유형={t['gov_type']}"))

    # 2) 청년인구 객체 (시군 x 최신연도 집계) + 관계
    latest = db.query("SELECT max(year) y FROM gold_youth_population")[0]["y"]
    yp = db.query("""
        SELECT sgg_cd, sigun, sum(population) pop, sum(inflow) inf, sum(outflow) outf
        FROM gold_youth_population WHERE year = ?
        GROUP BY sgg_cd, sigun""", [latest])
    for r in yp:
        oid = f"youth:{r['sgg_cd']}"
        net = r["inf"] - r["outf"]
        objs.append((oid, "청년인구", f"{r['sigun']} 청년",
                     f"인구={r['pop']};순이동={net}"))
        links.append((f"sigun:{r['sgg_cd']}", "청년규모", oid, float(r["pop"])))
        links.append((oid, "순유입" if net >= 0 else "순유출",
                      f"sigun:{r['sgg_cd']}", float(abs(net))))

    # 3) 사업체 객체(시군 집계) + 관계
    bz = db.query("""
        SELECT sgg_cd, sigun, sum(biz_count) bc, sum(employees) emp
        FROM gold_business WHERE year = ? GROUP BY sgg_cd, sigun""", [latest])
    for r in bz:
        oid = f"biz:{r['sgg_cd']}"
        objs.append((oid, "사업체", f"{r['sigun']} 사업체",
                     f"사업체={r['bc']};종사자={r['emp']}"))
        links.append((f"sigun:{r['sgg_cd']}", "산업기반", oid, float(r["emp"])))

    # 4) 공공시설 객체(청년센터만 대표로) + 관계
    fac = db.query("""
        SELECT sgg_cd, sigun, count(*) n
        FROM gold_public_facility WHERE ftype = '청년센터'
        GROUP BY sgg_cd, sigun""")
    for r in fac:
        oid = f"fac:{r['sgg_cd']}"
        objs.append((oid, "청년인프라", f"{r['sigun']} 청년센터",
                     f"개수={r['n']}"))
        links.append((f"sigun:{r['sgg_cd']}", "보유시설", oid, float(r["n"])))

    for o in objs:
        db.execute("INSERT INTO onto_objects VALUES (?,?,?,?)", list(o))
    for l in links:
        db.execute("INSERT INTO onto_links VALUES (?,?,?,?)", list(l))

    return {"objects": len(objs), "links": len(links), "year": latest}


def graph(center_sgg=None):
    """그래프 시각화용 노드/엣지 반환. center_sgg가 있으면 해당 시군 중심."""
    if center_sgg:
        oids = [f"sigun:{center_sgg}", f"youth:{center_sgg}",
                f"biz:{center_sgg}", f"fac:{center_sgg}"]
        ph = ",".join(["?"] * len(oids))
        nodes = db.query(f"SELECT * FROM onto_objects WHERE obj_id IN ({ph})", oids)
        edges = db.query(
            f"SELECT * FROM onto_links WHERE src IN ({ph}) OR dst IN ({ph})",
            oids + oids)
    else:
        nodes = db.query("SELECT * FROM onto_objects")
        edges = db.query("SELECT * FROM onto_links")
    return {"nodes": nodes, "edges": edges}


# 온톨로지 객체 유형별 매칭 키워드
_OBJ_TYPE_KEYWORDS = {
    "청년인구": ["청년", "인구", "유입", "유출", "이동", "유동인구", "생활인구", "청년인구"],
    "사업체":   ["사업체", "기업", "업체", "종사자", "고용", "산업", "제조업", "사업장"],
    "청년인프라": ["시설", "센터", "인프라", "청년시설", "공공시설", "청년센터", "복지관"],
    "시군":     ["시군", "시군구", "지역", "행정구역", "거주", "주소", "행정동", "읍면동"],
}


def recommend_ontology_candidates(meta: dict) -> list[dict]:
    """제출 메타데이터를 키워드 분석해 온톨로지 객체 유형 후보를 추천한다.
    meta: submissions 테이블 행 dict — title/description/theme/keywords 사용."""
    text = " ".join([
        str(meta.get("title") or ""),
        str(meta.get("description") or ""),
        str(meta.get("theme") or ""),
        str(meta.get("keywords") or ""),
    ]).lower()

    results = []
    for obj_type, kws in _OBJ_TYPE_KEYWORDS.items():
        matched = [kw for kw in kws if kw in text]
        if matched:
            results.append({
                "obj_type": obj_type,
                "matched_keywords": matched,
                "reason": f"'{', '.join(matched[:3])}' 키워드가 메타데이터에서 발견됨",
            })

    return results


def action_settlement_priority(top=10):
    """
    액션: 청년 정착지원 우선지역 선정.
    온톨로지 객체 속성으로 스코어링(데모 휴리스틱).
    점수 = 청년규모 정규화 + 산업기반 + 청년인프라 - 순유출 패널티
    """
    latest = db.query("SELECT max(year) y FROM gold_youth_population")[0]["y"]
    rows = db.query("""
        WITH y AS (
            SELECT sgg_cd, sigun, sum(population) pop,
                   sum(inflow)-sum(outflow) net
            FROM gold_youth_population WHERE year=? GROUP BY sgg_cd, sigun),
        b AS (
            SELECT sgg_cd, sum(employees) emp FROM gold_business
            WHERE year=? GROUP BY sgg_cd),
        f AS (
            SELECT sgg_cd, count(*) fac FROM gold_public_facility
            WHERE ftype='청년센터' GROUP BY sgg_cd)
        SELECT y.sgg_cd, y.sigun, y.pop, y.net,
               coalesce(b.emp,0) emp, coalesce(f.fac,0) fac
        FROM y LEFT JOIN b ON y.sgg_cd=b.sgg_cd
               LEFT JOIN f ON y.sgg_cd=f.sgg_cd
    """, [latest, latest])
    if not rows:
        return []
    mx_pop = max(r["pop"] for r in rows) or 1
    mx_emp = max(r["emp"] for r in rows) or 1
    mx_fac = max(r["fac"] for r in rows) or 1
    mx_out = max(abs(min(0, r["net"])) for r in rows) or 1
    out = []
    for r in rows:
        pop_s = r["pop"] / mx_pop
        emp_s = r["emp"] / mx_emp
        fac_gap = 1 - (r["fac"] / mx_fac)         # 인프라 부족할수록 우선
        out_pen = abs(min(0, r["net"])) / mx_out  # 순유출 클수록 우선
        score = (0.30 * pop_s + 0.20 * emp_s +
                 0.25 * fac_gap + 0.25 * out_pen) * 100
        out.append({
            "sgg_cd": r["sgg_cd"], "sigun": r["sigun"],
            "youth_pop": r["pop"], "net_migration": r["net"],
            "employees": r["emp"], "youth_centers": r["fac"],
            "priority_score": round(score, 1),
        })
    out.sort(key=lambda x: x["priority_score"], reverse=True)
    for i, o in enumerate(out, 1):
        o["rank"] = i
    return out[:top]
