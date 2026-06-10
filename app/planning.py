"""
이음(EUM) 플랫폼 - 평가대응 엔진 확장: 계획서 초안 생성
실제 제출·진단 데이터를 평가편람 양식에 맞춰 규칙기반으로
텍스트 초안을 채운다 (외부 LLM 미사용 — 공공망 환경 대응).
"""
import re

from . import database as db


def _tenant_name(tenant_id: str) -> str:
    rows = db.query("SELECT name FROM tenants WHERE tenant_id = ?", [tenant_id])
    return rows[0]["name"] if rows else tenant_id


def draft_open_plan(tenant_id: str) -> str:
    """제출 현황(개방/보류/검토대기 건수)을 근거로 개방계획 초안을 만든다."""
    name = _tenant_name(tenant_id)
    rows = db.query(
        "SELECT status, title, decision_note FROM submissions WHERE tenant_id = ? "
        "ORDER BY submitted_at",
        [tenant_id],
    )

    approved = [r for r in rows if r["status"] == "approved"]
    rejected = [r for r in rows if r["status"] == "rejected"]
    pending = [r for r in rows if r["status"] == "submitted"]

    lines = [
        f"# {name} 공공데이터 개방계획 초안",
        "",
        f"- 등록 {len(rows)}건 / 개방 {len(approved)}건 / 보류 {len(rejected)}건 "
        f"/ 검토대기 {len(pending)}건",
        "",
        "## 1. 개방 완료",
    ]
    lines += [f"- {r['title']}" for r in approved] or ["- (해당 없음)"]

    lines += ["", "## 2. 보류 사유 및 향후 조치"]
    if rejected:
        lines += [f"- {r['title']}: {r['decision_note'] or '사유 미기재'}" for r in rejected]
    else:
        lines += ["- (해당 없음)"]

    lines += ["", "## 3. 향후 개방 예정(검토대기)"]
    lines += [f"- {r['title']}" for r in pending] or ["- (해당 없음)"]

    return "\n".join(lines)


_RATE_RE = re.compile(r"오류율\s*([\d.]+)%")
_RULE_RE = re.compile(r"규칙\s*(\d+)종")
_ERR_RE = re.compile(r"오류\s*(\d+)건")


def draft_quality_plan(tenant_id: str) -> str:
    """미통과(반려) 제출의 진단 요약을 분석해 품질개선계획 초안을 만든다."""
    name = _tenant_name(tenant_id)
    rows = db.query(
        "SELECT title, status, quality_summary FROM submissions "
        "WHERE tenant_id = ? AND status = 'rejected' ORDER BY submitted_at",
        [tenant_id],
    )

    lines = [
        f"# {name} 품질개선계획 초안",
        "",
        f"- 개선 검토 대상(보류) {len(rows)}건",
        "",
        "## 개선과제",
    ]
    if not rows:
        lines.append("- (현재 보류 상태인 제출이 없어 개선과제가 없습니다)")
        return "\n".join(lines)

    for r in rows:
        summary = r["quality_summary"] or ""
        rate_m = _RATE_RE.search(summary)
        err_m = _ERR_RE.search(summary)
        rate = rate_m.group(1) + "%" if rate_m else "확인 필요"
        errors = err_m.group(1) + "건" if err_m else "확인 필요"
        lines.append(
            f"- **{r['title']}** — 오류 {errors}, 오류율 {rate}: "
            f"데이터 입력 단계의 결측치·중복·이상치 점검 후 재정제하여 재진단 권장"
        )

    return "\n".join(lines)
