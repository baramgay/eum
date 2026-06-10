"""
이음(EUM) 플랫폼 - 평가편람 자동대응 엔진 (횡단 모듈)
2026 평가편람 5개 영역 지표를 플랫폼 운영 데이터에서 자동 산출한다.
데모 범위: 플랫폼이 보유/관측 가능한 지표를 정량 계산하고,
나머지는 체크리스트 형태로 증빙 상태를 표시한다.
"""
from . import database as db

# 5개 영역 정의 (배점은 2026 편람 기준 요약)
AREAS = [
    {"key": "open", "name": "개방·활용", "weight": 48, "color": "#1457b8"},
    {"key": "quality", "name": "품질", "weight": 45, "color": "#0f9d8f"},
    {"key": "analysis", "name": "분석·활용", "weight": 53, "color": "#7b4fc4"},
    {"key": "share", "name": "공유", "weight": 41, "color": "#1aa251"},
    {"key": "mgmt", "name": "관리체계", "weight": 6, "color": "#e8a317"},
]


_MACHINE_READABLE_FORMATS = {"csv", "json", "xlsx", "parquet", "tsv", "geojson"}


def _is_quality_passed(summary: str) -> bool:
    """quality_summary 문자열에서 통과 여부를 추출한다.
    Phase 2에서 구조화된 필드로 전환 시 이 함수만 수정하면 됩니다."""
    s = (summary or "").strip()
    return s.endswith("통과") and not s.endswith("미통과")


def compute_ai_ready_checklist(row: dict) -> dict:
    """제출(submission) 1건의 AI 친화성(AI-Ready) 체크리스트를 평가한다.
    row: submissions 테이블 행(dict) — quality_summary/rows/description/title/
         theme/keywords/license/format 포함."""
    quality_summary = str(row.get("quality_summary") or "")
    quality_passed = _is_quality_passed(quality_summary)
    rows = row.get("rows") or 0
    description = str(row.get("description") or "").strip()
    title = str(row.get("title") or "").strip()
    theme = str(row.get("theme") or "").strip()
    keywords = str(row.get("keywords") or "").strip()
    license_ = str(row.get("license") or "").strip()
    fmt = str(row.get("format") or "").strip().lower()

    checklist = [
        {
            "item": "품질진단 통과",
            "passed": quality_passed,
            "detail": "오류율 기준 이하, 자동 품질진단 통과" if quality_passed
                      else f"품질진단 미통과 — {quality_summary or '진단 미실시'}",
        },
        {
            "item": "충분한 데이터 규모 (30행 이상)",
            "passed": rows >= 30,
            "detail": f"{rows:,}행 — AI 학습에 적정한 규모 확보" if rows >= 30
                      else f"{rows:,}행 — 최소 30행 이상 권장",
        },
        {
            "item": "메타데이터 충실 (제목·설명·주제·키워드)",
            "passed": bool(title and theme and keywords and len(description) >= 20),
            "detail": "제목·설명·주제·키워드가 모두 충실히 입력됨" if (title and theme and keywords and len(description) >= 20)
                      else "제목·설명(20자 이상)·주제·키워드를 모두 입력해야 합니다",
        },
        {
            "item": "라이선스 명시",
            "passed": bool(license_),
            "detail": f"라이선스: {license_}" if license_
                      else "라이선스가 명시되지 않았습니다 — CC BY 4.0 등 명시 권장",
        },
        {
            "item": "기계가독 형식 (CSV/JSON/Parquet 등)",
            "passed": fmt in _MACHINE_READABLE_FORMATS,
            "detail": f"형식 {fmt.upper()} — AI 학습 도구에서 직접 읽기 가능" if fmt in _MACHINE_READABLE_FORMATS
                      else f"형식 {fmt.upper() if fmt else '미지정'} — CSV/JSON/Parquet 등 기계가독 형식 권장",
        },
    ]
    ai_ready = all(c["passed"] for c in checklist)
    return {"ai_ready": ai_ready, "checklist": checklist}


def compute_submission_contribution(row: dict) -> list[dict]:
    """제출(submission) 1건이 평가편람 5개 영역에 기여하는 내용을 계산한다.
    row는 submissions 테이블 행(dict) — status/quality_summary/rows/comment_count/decision_note 포함."""
    status = row.get("status")
    quality_summary = str(row.get("quality_summary") or "")
    quality_passed = _is_quality_passed(quality_summary)
    rows = row.get("rows") or 0
    comment_count = row.get("comment_count") or 0
    has_decision_note = bool(str(row.get("decision_note") or "").strip())

    return [
        {
            "key": "open", "name": "개방·활용",
            "contributes": status == "approved",
            "note": "승인되어 개방포털에 등록·공개됨" if status == "approved"
                    else "승인되면 개방 데이터셋으로 등록되어 기여",
        },
        {
            "key": "quality", "name": "품질",
            "contributes": quality_passed,
            "note": f"자동 진단 결과 — {quality_summary}" if quality_summary
                    else "진단 대기 중",
        },
        {
            "key": "analysis", "name": "분석·활용",
            "contributes": status == "approved" and rows >= 50,
            "note": f"{rows:,}행 데이터가 온톨로지·분석 자산으로 활용 가능"
                    if rows >= 50 else f"{rows:,}행 — 분석 활용 기준(50행 이상) 미달",
        },
        {
            "key": "share", "name": "공유",
            "contributes": comment_count > 0,
            "note": f"센터 컨설팅 코멘트 {comment_count}건으로 기관-센터 간 공유 실적 형성"
                    if comment_count > 0 else "코멘트 등록 시 기관-센터 간 공유 실적으로 기여",
        },
        {
            "key": "mgmt", "name": "관리체계",
            "contributes": status in ("approved", "rejected") and has_decision_note,
            "note": "담당자 결정 이력(메모 포함)이 기록되어 관리체계 증빙으로 활용"
                    if (status in ("approved", "rejected") and has_decision_note)
                    else "검토·결정 메모가 등록되면 관리체계 증빙으로 기여",
        },
    ]


def _scalar(sql, params=None):
    r = db.query(sql, params)
    return list(r[0].values())[0] if r else 0


def compute_indicators():
    """플랫폼 전체 기준 지표 산출."""
    total_ds = _scalar("SELECT count(*) FROM catalog")
    open_ds = _scalar("SELECT count(*) FROM catalog WHERE is_open")
    ai_ready = _scalar("SELECT count(*) FROM catalog WHERE ai_ready")
    high_value = _scalar("SELECT count(*) FROM catalog WHERE high_value")
    usage = _scalar("SELECT count(*) FROM usage_log")
    # 품질 통과 비율
    q_total = _scalar("SELECT count(*) FROM quality_results")
    q_pass = _scalar("SELECT count(*) FROM quality_results WHERE passed")
    avg_err = _scalar("SELECT coalesce(avg(error_rate),0) FROM quality_results")
    # 온톨로지 규모
    obj_cnt = _scalar("SELECT count(*) FROM onto_objects")
    link_cnt = _scalar("SELECT count(*) FROM onto_links")
    # 입주 현황
    tenant_total = _scalar("SELECT count(*) FROM tenants")
    tenant_on = _scalar("SELECT count(*) FROM tenants WHERE onboarded")

    open_rate = (open_ds / total_ds * 100) if total_ds else 0
    ai_rate = (ai_ready / total_ds * 100) if total_ds else 0
    q_rate = (q_pass / q_total * 100) if q_total else 0

    indicators = [
        # 영역, 지표명, 값, 상태(ok/warn/na), 설명
        ("open", "메타관리시스템 기반 개방 데이터셋", f"{open_ds}/{total_ds}",
         "ok" if open_rate >= 80 else "warn", "DCAT 카탈로그 등록·개방 비율"),
        ("open", "AI친화(AI-Ready) 데이터 비율", f"{ai_rate:.0f}%",
         "ok" if ai_rate >= 50 else "warn", "AI-Ready 체크리스트 자동 점검"),
        ("open", "고가치 데이터 등록 수", f"{high_value}건",
         "ok" if high_value >= 2 else "warn", "고가치 데이터 식별·관리"),
        ("open", "개방데이터 활용 건수", f"{usage}건",
         "ok" if usage >= 100 else "warn", "조회·다운로드·API 호출 로그 집계"),
        ("quality", "품질진단 자동 수행 데이터셋", f"{q_total}/{total_ds}",
         "ok" if q_total >= total_ds and total_ds else "warn", "규칙기반 자동 진단 커버리지"),
        ("quality", "오류율 기준(0.001%) 충족", f"{q_pass}/{q_total}",
         "ok" if q_total and q_pass == q_total else "warn", "데이터 값 관리 - 오류율"),
        ("quality", "평균 오류율", f"{avg_err:.4f}%",
         "ok" if avg_err <= 0.001 else "warn", "전 데이터셋 평균 오류율"),
        ("analysis", "온톨로지 객체/관계 구축", f"{obj_cnt}객체·{link_cnt}관계",
         "ok" if obj_cnt > 0 else "na", "분석 기반 시맨틱 모델 (2단계 코어)"),
        ("analysis", "자연어 질의·분석 활용", "가동" if obj_cnt else "준비",
         "ok" if obj_cnt else "na", "text-to-SQL·셀프서비스 분석"),
        ("share", "기관 간 공유 카탈로그", f"입주 {tenant_on}/{tenant_total}",
         "ok" if tenant_on >= 8 else "warn", "메타관리시스템 기반 공유 실적"),
        ("share", "메타데이터 등록·관리", f"{total_ds}건 등록",
         "ok" if total_ds > 0 else "warn", "DCAT 표준 메타데이터 관리"),
        ("mgmt", "추진기반(플랫폼 운영) 조성", "운영중",
         "ok", "센터 멀티테넌트 플랫폼 가동"),
        ("mgmt", "데이터 성과 리포트 제공", "자동생성",
         "ok", "경영진용 성과 대시보드"),
    ]

    # 영역별 집계
    by_area = {}
    for a in AREAS:
        items = [i for i in indicators if i[0] == a["key"]]
        ok = sum(1 for i in items if i[3] == "ok")
        total = sum(1 for i in items if i[3] != "na")
        score = (ok / total * 100) if total else 0
        by_area[a["key"]] = {
            "name": a["name"], "weight": a["weight"], "color": a["color"],
            "ok": ok, "total": len(items), "score": round(score),
            "indicators": [
                {"name": i[1], "value": i[2], "status": i[3], "desc": i[4]}
                for i in items
            ],
        }

    overall = round(sum(v["score"] for v in by_area.values()) / len(by_area))
    return {
        "overall": overall,
        "areas": [by_area[a["key"]] for a in AREAS],
        "summary": {
            "datasets": total_ds, "open": open_ds, "ai_ready": ai_ready,
            "high_value": high_value, "usage": usage,
            "quality_pass": q_pass, "quality_total": q_total,
            "avg_error_rate": round(avg_err, 4),
            "objects": obj_cnt, "links": link_cnt,
            "tenants_on": tenant_on, "tenants_total": tenant_total,
        },
    }
