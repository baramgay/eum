#!/usr/bin/env python3
"""
eum_platform에서 agents 시스템의 update_status.py를 호출하는 브릿지 스크립트.

사용법:
    python scripts/agent-status.py [agent_id] [status] "[message]"

예시:
    python scripts/agent-status.py backend working "품질진단 엔진 개선 시작"
    python scripts/agent-status.py backend done "품질진단 엔진 개선 완료"
"""
import subprocess
import sys
from pathlib import Path

AGENTS_ROOT = Path("C:/업무/agents")
UPDATE_STATUS = AGENTS_ROOT / "scripts" / "update_status.py"


def main() -> int:
    if len(sys.argv) < 4:
        print(__doc__)
        return 1

    agent_id = sys.argv[1]
    status = sys.argv[2]
    message = sys.argv[3]

    if not UPDATE_STATUS.exists():
        print(f"[오류] agents 시스템 스크립트를 찾을 수 없습니다: {UPDATE_STATUS}", file=sys.stderr)
        return 1

    cmd = [
        sys.executable,
        str(UPDATE_STATUS),
        agent_id,
        status,
        message,
    ]

    result = subprocess.run(cmd, cwd=AGENTS_ROOT)
    return result.returncode


if __name__ == "__main__":
    sys.exit(main())
