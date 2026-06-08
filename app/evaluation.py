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
