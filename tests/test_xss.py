"""
이음(EUM) 플랫폼 - XSS 방어 테스트

백엔드 정책:
  - 백엔드는 XSS 페이로드를 escape하지 않고 raw 값 그대로 저장한다.
  - 렌더링 시 이스케이프는 프런트엔드 esc() 함수가 담당한다.

이 파일은 두 가지를 검증한다:
  1. 백엔드가 XSS 페이로드를 raw 그대로 저장하는지 (저장 정책 문서화)
  2. 프런트엔드 esc() 함수(Python으로 재현)가 HTML 특수문자를 올바르게 이스케이프하는지
"""
import uuid

import pytest

from app import database as db
from app import submission as sub_mod


# ---------- 프런트엔드 esc() 재현 헬퍼 ----------

def frontend_esc(s: object) -> str:
    """web/app.js의 esc() 함수를 Python으로 재현.

    원본 JS:
        const esc = (s) => String(s ?? '').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
    """
    return str(s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


# ---------- 1. XSS 페이로드 raw 저장 확인 ----------

def test_submission_comment_xss_payload_stored_as_is():
    """XSS 페이로드가 DB에 raw 그대로 저장되는지 확인한다.
    백엔드는 escape하지 않고 저장 — 이스케이프는 프런트가 담당한다.
    """
    db.init_schema()

    sub_id = "test_xss_" + uuid.uuid4().hex[:8]
    xss_title = "<script>alert(1)</script>"
    xss_comment = "<img src=x onerror=alert(2)>"

    # 테스트용 제출 레코드 직접 삽입 (table_name은 실제 테이블이 없어도 메타 조회까지만 사용)
    placeholder_table = "sub_test_xss_placeholder"
    db.execute(
        "INSERT INTO submissions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [
            sub_id, "48121", xss_title, "desc", "t", "k", "MIT", "CSV",
            placeholder_table, 1, "submitted",
            "규칙 4종/오류 0건/오류율 0.0%/통과",
            None, "2026-01-01 00:00:00", None,
        ],
    )

    comment_id = sub_mod.add_comment(sub_id, xss_comment)

    # get_submission()은 테이블 미리보기를 시도하므로, DB에서 직접 조회한다.
    meta_rows = db.query(
        "SELECT * FROM submissions WHERE submission_id = ?", [sub_id]
    )
    comment_rows = db.query(
        "SELECT * FROM consultant_comments WHERE comment_id = ?", [comment_id]
    )

    try:
        # 백엔드는 raw 값 그대로 저장
        assert meta_rows[0]["title"] == xss_title
        assert comment_rows[0]["comment"] == xss_comment
    finally:
        # 정리
        db.execute("DELETE FROM submissions WHERE submission_id = ?", [sub_id])
        db.execute("DELETE FROM consultant_comments WHERE comment_id = ?", [comment_id])


# ---------- 2. 프런트엔드 esc() 동치 함수 검증 ----------

def test_esc_escapes_script_tag():
    assert frontend_esc("<script>alert(1)</script>") == "&lt;script&gt;alert(1)&lt;/script&gt;"


def test_esc_escapes_img_onerror():
    assert frontend_esc("<img src=x onerror=alert(2)>") == "&lt;img src=x onerror=alert(2)&gt;"


def test_esc_handles_none():
    assert frontend_esc(None) == ""


def test_esc_handles_ampersand():
    assert frontend_esc("a & b") == "a &amp; b"
