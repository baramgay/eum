"""
이음(EUM) 플랫폼 - 자연어 데이터 질의 (L5 MVP)
완전한 LLM text-to-SQL 대신, 안전한 의도(intent) 매칭 기반 질의를 제공한다.
(공공망/폐쇄망에서 LLM 없이도 동작하는 룰 기반 폴백 - 실제로 동작함)
온톨로지 객체/속성 어휘로 질문을 해석한다.
"""
import re
from . import database as db

_ADMIN_SUFFIXES = ('시', '군', '구', '동', '읍', '면')


def answer(question: str):
    q = (question or "").strip()
    ql = q.replace(" ", "")
    # 시군 추출
    sigun = None
    for name, cd in [(r["name"], r["sgg_cd"]) for r in
                     db.query("SELECT name, sgg_cd FROM tenants")]:
        short = name[:-1] if name.endswith(_ADMIN_SUFFIXES) else name  # '창원시'->'창원'
        if name in q or short in q:
            sigun = name
            break

    # 의도 1: 청년 인구 / 유출입
    if any(k in ql for k in ["청년", "인구", "유입", "유출", "순이동"]):
        where = "WHERE year = (SELECT max(year) FROM gold_youth_population)"
        params = []
        if sigun:
            where += " AND sigun = ?"
            params.append(sigun)
        sql = f"""SELECT sigun, sum(population) AS 청년인구,
                  sum(inflow) AS 유입, sum(outflow) AS 유출,
                  sum(inflow)-sum(outflow) AS 순이동
                  FROM gold_youth_population {where}
                  GROUP BY sigun ORDER BY 순이동 DESC"""
        rows = db.query(sql, params)
        return {"intent": "청년인구 유출입", "sigun": sigun,
                "sql": sql.strip(), "columns": list(rows[0].keys()) if rows else [],
                "rows": rows}

    # 의도 2: 사업체 / 산업 / 일자리
    if any(k in ql for k in ["사업체", "산업", "일자리", "고용", "종사자"]):
        where = "WHERE year = (SELECT max(year) FROM gold_business)"
        params = []
        if sigun:
            where += " AND sigun = ?"
            params.append(sigun)
        sql = f"""SELECT sigun, sum(biz_count) AS 사업체수,
                  sum(employees) AS 종사자수 FROM gold_business {where}
                  GROUP BY sigun ORDER BY 종사자수 DESC"""
        rows = db.query(sql, params)
        return {"intent": "사업체·고용", "sigun": sigun, "sql": sql.strip(),
                "columns": list(rows[0].keys()) if rows else [], "rows": rows}

    # 의도 3: 공공시설 / 청년센터
    if any(k in ql for k in ["시설", "청년센터", "도서관", "체육관", "복지관", "인프라"]):
        where = ""
        params = []
        if sigun:
            where = "WHERE sigun = ?"
            params.append(sigun)
        sql = f"""SELECT sigun, ftype AS 시설유형, count(*) AS 개수
                  FROM gold_public_facility {where}
                  GROUP BY sigun, ftype ORDER BY sigun, 개수 DESC"""
        rows = db.query(sql, params)
        return {"intent": "공공시설", "sigun": sigun, "sql": sql.strip(),
                "columns": list(rows[0].keys()) if rows else [], "rows": rows}

    # 폴백: 안내
    return {
        "intent": None, "sigun": sigun, "sql": None, "columns": [], "rows": [],
        "hint": "예: '창원시 청년 순유입 보여줘', '진주 사업체 현황', '거창군 청년센터'"
    }
