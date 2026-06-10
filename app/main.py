"""
이음(EUM) 플랫폼 - API 게이트웨이 & 웹 서버 (L6)
FastAPI 단일 진입점. 백엔드 모듈을 REST API로 노출하고
정적 프론트엔드(SPA)를 서빙한다.
"""
import ast
import json
import os
import datetime
from contextlib import asynccontextmanager
from fastapi import Depends, FastAPI, HTTPException, Query, UploadFile, File, Form
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles

from . import auth
from . import database as db
from . import seed_data, quality, evaluation, ontology, nlquery, submission, planning

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _parse_detail(raw: str) -> list:
    """quality_results.detail 역직렬화 — JSON 우선, str(list) 레거시 데이터 폴백."""
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return ast.literal_eval(raw)  # 기존 str(list) 형식 레거시 데이터 처리
WEB_DIR = os.path.join(BASE_DIR, "web")


@asynccontextmanager
async def _lifespan(app: FastAPI):
    db.init_schema()
    # 데이터가 비어있으면 시드 + 파이프라인 자동 실행
    n = db.query("SELECT count(*) c FROM catalog")[0]["c"]
    if n == 0:
        seed_data.run_seed()
        quality.run_all()
        ontology.build_ontology()
    yield


app = FastAPI(title="이음(EUM) 플랫폼 API", version="0.1.0", lifespan=_lifespan)


# ---------- 인증 ----------
@app.post("/api/login")
def login(username: str = Form(...), password: str = Form(...)):
    user = auth.DEMO_USERS.get(username)
    if not user or user["password"] != password:
        raise HTTPException(status_code=401, detail="아이디 또는 비밀번호가 틀렸습니다")
    token = auth.create_token(username)
    return {"access_token": token, "role": user["role"], "tenant_id": user["tenant_id"]}


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
def catalog(q: str = Query(default=""), sort: str = Query(default="high_value")):
    # 허용 컬럼 화이트리스트 — SQL injection 방지
    allowed_sorts = {"high_value", "updated_at", "rows", "title"}
    sort_col = sort if sort in allowed_sorts else "high_value"
    if q:
        rows = db.query(
            f"SELECT * FROM catalog WHERE title ILIKE ? OR keywords ILIKE ? OR description ILIKE ? ORDER BY {sort_col} DESC",
            [f"%{q}%", f"%{q}%", f"%{q}%"])
    else:
        rows = db.query(f"SELECT * FROM catalog ORDER BY {sort_col} DESC")
    return rows


@app.get("/api/dataset/{dataset_id}")
def dataset(dataset_id: str, limit: int = 20):
    meta = db.query("SELECT * FROM catalog WHERE dataset_id = ?", [dataset_id])
    if not meta:
        return JSONResponse({"error": "not found"}, status_code=404)
    meta = meta[0]
    # 발행기관(publisher) 이름을 tenants 테이블에서 조회해 포함시킨다
    tenant_row = db.query("SELECT name FROM tenants WHERE tenant_id = ?", [meta["tenant_id"]])
    meta["publisher"] = tenant_row[0]["name"] if tenant_row else meta["tenant_id"]
    # 활용 로그 기록(평가 활용도 지표 반영)
    db.execute("INSERT INTO usage_log VALUES (?,?,?)",
               [dataset_id, "view",
                datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")])
    # 카탈로그 테이블명은 시드/파이프라인이 생성한 값이지만,
    # submission 업로드 경로를 거쳤다면 sub_ 패턴일 수 있으므로
    # submission 패턴인 경우에 한해 재검증한다 (그룹 A)
    tname = meta["table_name"]
    if tname.startswith("sub_"):
        submission._validate_table_name(tname)
    preview = db.query(f"SELECT * FROM {tname} LIMIT {int(limit)}")
    q = db.query("SELECT * FROM quality_results WHERE dataset_id = ?", [dataset_id])
    # quality_results.detail은 DB에 문자열로 저장되므로 파이썬 리스트로 역직렬화한다
    quality = None
    if q:
        quality = dict(q[0])
        raw_detail = quality.get("detail")
        if isinstance(raw_detail, str):
            quality["detail"] = _parse_detail(raw_detail)
    return {"meta": meta, "preview": preview, "quality": quality}


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


# ---------- 공급자 워크플로우 ----------
# _TABLE_NAME_RE 및 _validate_table_name 은 submission.py에 정의되어 있다.
# main.py에서는 submission._TABLE_NAME_RE / submission._validate_table_name 을 직접 참조한다.


@app.post("/api/submission/upload")
def submission_upload(
    file: UploadFile = File(...),
    tenant_id: str = Form(...),
    current_user: dict = Depends(auth.get_current_user),
):
    # 기관 담당자는 자기 tenant_id만 업로드 가능
    if current_user["role"] == "agency" and current_user["tenant_id"] != tenant_id:
        raise HTTPException(status_code=403, detail="자신의 기관 데이터만 업로드할 수 있습니다")
    known = db.query("SELECT tenant_id FROM tenants WHERE tenant_id = ?", [tenant_id])
    if not known:
        return JSONResponse({"error": "알 수 없는 tenant_id"}, status_code=400)
    table_name = submission.new_table_name(tenant_id)
    result = submission.load_csv_to_table(file.file, table_name=table_name)
    return result


@app.post("/api/submission")
def submission_create(
    tenant_id: str = Form(...),
    title: str = Form(...),
    description: str = Form(...),
    theme: str = Form(...),
    keywords: str = Form(...),
    license: str = Form(...),
    format: str = Form(...),
    table_name: str = Form(...),
    rows: int = Form(...),
    current_user: dict = Depends(auth.get_current_user),
):
    # 기관 담당자는 자기 tenant_id만 등록 가능
    if current_user["role"] == "agency" and current_user["tenant_id"] != tenant_id:
        raise HTTPException(status_code=403, detail="자신의 기관 데이터만 등록할 수 있습니다")
    known = db.query("SELECT tenant_id FROM tenants WHERE tenant_id = ?", [tenant_id])
    if not known:
        return JSONResponse({"error": "알 수 없는 tenant_id"}, status_code=400)

    m = submission._TABLE_NAME_RE.match(table_name)
    if not m or m.group(1) != tenant_id:
        return JSONResponse({"error": "유효하지 않은 table_name"}, status_code=400)

    meta = {
        "tenant_id": tenant_id, "title": title, "description": description,
        "theme": theme, "keywords": keywords, "license": license, "format": format,
    }
    diag = quality.run_quality_generic(table_name)
    summary = submission.summarize_quality(diag)
    sub_id = submission.create_submission(meta, table_name=table_name, rows=rows,
                                           quality_summary=summary)
    return {"submission_id": sub_id, "status": "submitted",
            "quality": diag, "quality_summary": summary}


@app.get("/api/submission")
def submission_list(
    tenant_id: str = Query(...),
    current_user: dict = Depends(auth.get_current_user),
):
    # 기관 담당자는 자기 tenant_id 목록만 조회 가능
    if current_user["role"] == "agency" and current_user["tenant_id"] != tenant_id:
        raise HTTPException(status_code=403, detail="자신의 기관 데이터만 조회할 수 있습니다")
    return db.query(
        "SELECT s.*, "
        "(SELECT count(*) FROM consultant_comments c WHERE c.submission_id = s.submission_id) AS comment_count "
        "FROM submissions s WHERE s.tenant_id = ? ORDER BY s.submitted_at DESC",
        [tenant_id])


@app.get("/api/submission/all")
def submission_list_all(current_user: dict = Depends(auth.require_center)):
    return db.query(
        "SELECT s.*, "
        "(SELECT count(*) FROM consultant_comments c WHERE c.submission_id = s.submission_id) AS comment_count "
        "FROM submissions s ORDER BY s.submitted_at DESC")


@app.post("/api/submission/{submission_id}/decision")
def submission_decision(
    submission_id: str,
    status: str = Form(...),
    decision_note: str = Form(default=""),
    current_user: dict = Depends(auth.get_current_user),
):
    if current_user["role"] != "center":
        raise HTTPException(status_code=403, detail="센터 권한이 필요합니다")
    if status not in ("approved", "rejected"):  # 그룹 B2: 허용 값 검증
        raise HTTPException(status_code=400, detail="status must be 'approved' or 'rejected'")
    submission.record_decision(submission_id, status=status, decision_note=decision_note)
    return {"submission_id": submission_id, "status": status}


@app.post("/api/submission/{submission_id}/comment")
def submission_comment(
    submission_id: str,
    comment: str = Form(...),
    current_user: dict = Depends(auth.get_current_user),
):
    if current_user["role"] != "center":
        raise HTTPException(status_code=403, detail="센터 권한이 필요합니다")
    comment_id = submission.add_comment(submission_id, comment)
    return {"comment_id": comment_id, "submission_id": submission_id}


@app.get("/api/submission/{submission_id}")
def submission_detail(
    submission_id: str,
    current_user: dict = Depends(auth.get_current_user),
):
    detail = submission.get_submission(submission_id)
    if detail is None:  # 그룹 B1: 존재하지 않는 ID → 404
        raise HTTPException(status_code=404, detail="submission not found")
    # 기관 담당자는 자기 제출만 조회 가능
    if current_user["role"] == "agency" and detail["meta"]["tenant_id"] != current_user["tenant_id"]:
        raise HTTPException(status_code=403, detail="접근 권한이 없습니다")
    diag = quality.run_quality_generic(detail["meta"]["table_name"])
    detail["quality"] = diag
    detail["recommendations"] = quality.generate_quality_recommendations(diag)
    detail["meta"]["comment_count"] = len(detail["comments"])
    detail["contribution"] = evaluation.compute_submission_contribution(detail["meta"])
    detail["ai_ready_checklist"] = evaluation.compute_ai_ready_checklist(detail["meta"])
    detail["ontology_candidates"] = ontology.recommend_ontology_candidates(detail["meta"])
    return detail


@app.get("/api/evaluation/submissions")
def evaluation_submission_contributions(
    current_user: dict = Depends(auth.get_current_user),
):
    """전체 제출 목록을 대상으로 5개 영역별 기여 건수를 집계한다."""
    if current_user["role"] != "center":
        raise HTTPException(status_code=403, detail="센터 권한이 필요합니다")
    rows = db.query(
        "SELECT s.*, "
        "(SELECT count(*) FROM consultant_comments c WHERE c.submission_id = s.submission_id) AS comment_count "
        "FROM submissions s")
    total = len(rows)
    counts = {a["key"]: 0 for a in evaluation.AREAS}
    for row in rows:
        for c in evaluation.compute_submission_contribution(row):
            if c["contributes"]:
                counts[c["key"]] += 1
    return {
        "total": total,
        "areas": [
            {"key": a["key"], "name": a["name"], "color": a["color"],
             "contributing": counts[a["key"]], "total": total}
            for a in evaluation.AREAS
        ],
    }


@app.get("/api/plan/draft")
def plan_draft(tenant_id: str = Query(...), type: str = Query(...)):
    if type == "open":
        return {"type": "open", "draft": planning.draft_open_plan(tenant_id)}
    if type == "quality":
        return {"type": "quality", "draft": planning.draft_quality_plan(tenant_id)}
    return JSONResponse({"error": "type must be 'open' or 'quality'"}, status_code=400)


# ---------- 정적 프론트엔드 ----------
@app.get("/")
def index():
    return FileResponse(os.path.join(WEB_DIR, "index.html"))


@app.get("/status")
def status_page():
    return FileResponse(os.path.join(BASE_DIR, "status.html"))


app.mount("/static", StaticFiles(directory=WEB_DIR), name="static")
app.mount("/docs", StaticFiles(directory=os.path.join(BASE_DIR, "docs")), name="docs")
