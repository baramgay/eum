"""
eum_platform 권한별 테스트 계정 생성
Supabase Admin API (service role key) 사용
"""
import sys, json
import urllib.request, urllib.error

import os

SUPABASE_URL     = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
DEFAULT_PASSWORD = os.environ.get("TEST_USER_PASSWORD", "Test1234!")

if not SUPABASE_URL or not SERVICE_ROLE_KEY:
    print("환경변수 NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요")
    sys.exit(1)

USERS = [
    {
        "email": "center@test.eum",
        "password": DEFAULT_PASSWORD,
        "role": "center",
        "tenant_id": None,
        "display": "센터 관리자 (전체 권한)",
    },
    {
        "email": "agency.changwon@test.eum",
        "password": DEFAULT_PASSWORD,
        "role": "agency",
        "tenant_id": "48121",
        "display": "기관 - 창원시 (agency)",
    },
    {
        "email": "agency.jinju@test.eum",
        "password": DEFAULT_PASSWORD,
        "role": "agency",
        "tenant_id": "48170",
        "display": "기관 - 진주시 (agency)",
    },
    {
        "email": "agency.gimhae@test.eum",
        "password": DEFAULT_PASSWORD,
        "role": "agency",
        "tenant_id": "48250",
        "display": "기관 - 김해시 (agency)",
    },
    {
        "email": "viewer@test.eum",
        "password": DEFAULT_PASSWORD,
        "role": "viewer",
        "tenant_id": None,
        "display": "일반 열람자 (viewer)",
    },
]


def call_admin_api(path: str, body: dict) -> dict:
    url = f"{SUPABASE_URL}/auth/v1/admin/{path}"
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
            "apikey": SERVICE_ROLE_KEY,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        err = json.loads(e.read())
        raise RuntimeError(err.get("message", str(e)))


def list_users() -> list:
    url = f"{SUPABASE_URL}/auth/v1/admin/users?per_page=100"
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
            "apikey": SERVICE_ROLE_KEY,
        },
        method="GET",
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read()).get("users", [])


def update_user(uid: str, body: dict) -> dict:
    url = f"{SUPABASE_URL}/auth/v1/admin/users/{uid}"
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
            "apikey": SERVICE_ROLE_KEY,
        },
        method="PUT",
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    print("=" * 60)
    print("eum_platform 테스트 계정 생성")
    print(f"비밀번호: {DEFAULT_PASSWORD}")
    print("=" * 60)

    existing = {u["email"]: u for u in list_users()}

    results = []
    for u in USERS:
        email = u["email"]
        meta = {"role": u["role"]}
        if u["tenant_id"]:
            meta["tenant_id"] = u["tenant_id"]

        try:
            if email in existing:
                # 이미 존재 → user_metadata만 업데이트
                uid = existing[email]["id"]
                update_user(uid, {"user_metadata": meta})
                status = "업데이트됨"
            else:
                # 신규 생성
                call_admin_api("users", {
                    "email": email,
                    "password": u["password"],
                    "email_confirm": True,
                    "user_metadata": meta,
                })
                status = "생성됨"

            results.append((status, u["display"], email, u["role"],
                            u.get("tenant_id") or "-"))
            print(f"  [{status:6s}] {u['display']}")

        except RuntimeError as e:
            print(f"  [오류]   {u['display']} — {e}")

    print()
    print("-" * 60)
    print("  이메일                        역할     tenant_id")
    print("-" * 60)
    for status, display, email, role, tid in results:
        print(f"  {email:<35} {role:<8} {tid}")
    print("-" * 60)
    print(f"  공통 비밀번호: {DEFAULT_PASSWORD}")
    print()


if __name__ == "__main__":
    main()
