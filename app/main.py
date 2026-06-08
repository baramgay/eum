"""
이음(EUM) 플랫폼 - API 게이트웨이 & 웹 서버 (L6)
FastAPI 단일 진입점. 백엔드 모듈을 REST API로 노출하고
정적 프론트엔드(SPA)를 서빙한다.
"""
import os
import datetime
from fastapi import FastAPI, Query
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles

from . import database as db
from . import seed_data, quality, evaluation, ontology, nlquery

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB_DIR = os.path.join(BASE_DIR, "web")

app = FastAPI(title="이음(EUM) 플랫폼 API", version="0.1.0")


@app.on_event("startup")
def _startup():
    db.init_schema()
    # 데이터가 비어있으면 시드 + 파이프라인 자동 실행
    n = db.query("SELECT count(*) c FROM catalog")[0]["c"]
    if n == 0:
        seed_data.run_seed()
        quality.run_all()
        ontology.build_ontology()


# ---------- 메타/대시보드 ----------
@app.get("/api/overview")
def overview():
    ev = evaluation.compute_indicators()
    return {
        "platform": "이음(EUM)",
        "generated_at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "summary": ev["summary"],
        "overall_score": ev["overall"],
    }


@app.get("/api/tenants")
def tenants():
    return db.query("SELECT * FROM tenants ORDER BY gov_type DESC, name")


# ---------- L3 카탈로그(개방포털) ----------
@app.get("/api/catalog")
def catalog(q: str = Query(default="")):
    if q:
        rows = db.query(
            "SELECT * FROM catalog WHERE title ILIKE ? OR keywords ILIKE ? ORDER BY high_value DESC",
            [f"%{q}%", f"%{q}%"])
    else:
        rows = db.query("SELECT * FROM catalog ORDER BY high_value DESC")
    return rows


@app.get("/api/dataset/{dataset_id}")
def dataset(dataset_id: str, limit: int = 20):
    meta = db.query("SELECT * FROM catalog WHERE dataset_id = ?", [dataset_id])
    if not meta:
        return JSONResponse({"error": "not found"}, status_code=404)
    meta = meta[0]
    # 활용 로그 기록(평가 활용도 지표 반영)
    db.execute("INSERT INTO usage_log VALUES (?,?,?)",
               [dataset_id, "view",
                datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")])
    preview = db.query(f"SELECT * FROM {meta['table_name']} LIMIT {int(limit)}")
    q = db.query("SELECT * FROM quality_results WHERE dataset_id = ?", [dataset_id])
    return {"meta": meta, "preview": preview, "quality": q[0] if q else None}


# ---------- L3 품질 ----------
@app.get("/api/quality")
def quality_all():
    return quality.run_all()


@app.post("/api/quality/run")
def quality_run():
    return {"results": quality.run_all(),
            "ran_at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")}


# ---------- 평가대응 엔진 ----------
@app.get("/api/evaluation")
def eval_api():
    return evaluation.compute_indicators()


# ---------- L4 온톨로지 ----------
@app.post("/api/ontology/build")
def onto_build():
    return ontology.build_ontology()


@app.get("/api/ontology/graph")
def onto_graph(sgg: str = Query(default="")):
    return ontology.graph(center_sgg=sgg or None)


@app.get("/api/ontology/action/settlement")
def onto_action(top: int = 10):
    return {"action": "청년 정착지원 우선지역 선정",
            "method": "온톨로지 객체 속성 스코어링(청년규모·산업기반·인프라부족·순유출)",
            "results": ontology.action_settlement_priority(top)}


# ---------- L5 자연어 질의 ----------
@app.get("/api/nlquery")
def nl(q: str = Query(...)):
    return nlquery.answer(q)


# ---------- 정적 프론트엔드 ----------
@app.get("/")
def index():
    return FileResponse(os.path.join(WEB_DIR, "index.html"))


@app.get("/status")
def status_page():
    return FileResponse(os.path.join(BASE_DIR, "status.html"))


app.mount("/static", StaticFiles(directory=WEB_DIR), name="static")
app.mount("/docs", StaticFiles(directory=os.path.join(BASE_DIR, "docs")), name="docs")
