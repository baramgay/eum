"""데모용 JWT 인증. 운영 배포 시 외부 IdP(경남도 SSO)로 교체 예정."""
import os
import time

from jose import JWTError, jwt
from fastapi import Header, HTTPException

SECRET = os.getenv("EUM_JWT_SECRET", "eum-demo-secret-2026")
ALGORITHM = "HS256"
TOKEN_TTL = 8 * 3600  # 8시간

# 데모 계정 (운영 시 DB/LDAP으로 교체)
DEMO_USERS = {
    "center": {"password": "center2026", "role": "center", "tenant_id": None},
    "48121":  {"password": "gn48121",    "role": "agency", "tenant_id": "48121"},
    "48170":  {"password": "gn48170",    "role": "agency", "tenant_id": "48170"},
}


def create_token(username: str) -> str:
    user = DEMO_USERS[username]
    payload = {
        "sub": username,
        "role": user["role"],
        "tenant_id": user["tenant_id"],
        "exp": int(time.time()) + TOKEN_TTL,
    }
    return jwt.encode(payload, SECRET, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="토큰이 유효하지 않습니다")


def get_current_user(authorization: str = Header(default="")) -> dict:
    """FastAPI 의존성 주입용 현재 사용자 추출."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="인증이 필요합니다")
    return decode_token(authorization[7:])


def require_center(user: dict = None) -> dict:
    """센터 역할 필요 라우트용 의존성."""
    if user["role"] != "center":
        raise HTTPException(status_code=403, detail="센터 권한이 필요합니다")
    return user
