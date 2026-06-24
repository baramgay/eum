"""Fix knowledge-graph.json: Korean tags → ASCII, invalid edge types → valid."""
import json, re, sys
from pathlib import Path

KG_PATH = Path("C:/업무/eum_platform/.understand-anything/knowledge-graph.json")

# Korean tag → ASCII mapping (comprehensive)
TAG_MAP = {
    "관리자": "admin",
    "위젯": "widget",
    "서버-컴포넌트": "server-component",
    "서버컴포넌트": "server-component",
    "단위-테스트": "unit-test",
    "단위테스트": "unit-test",
    "클라이언트": "client",
    "클라이언트-컴포넌트": "client-component",
    "클라이언트컴포넌트": "client-component",
    "데이터베이스": "database",
    "데이터": "data",
    "분석": "analytics",
    "품질": "quality",
    "수집": "collect",
    "가공": "process",
    "온톨로지": "ontology",
    "지도": "map",
    "보고서": "report",
    "포털": "portal",
    "파이프라인": "pipeline",
    "제출": "submission",
    "인증": "auth",
    "보안": "security",
    "API": "api",
    "api": "api",
    "라우트": "route",
    "라이브러리": "library",
    "유틸리티": "utility",
    "유틸": "utility",
    "설정": "config",
    "설정파일": "config",
    "스키마": "schema",
    "마이그레이션": "migration",
    "타입": "type",
    "타입스크립트": "typescript",
    "컴포넌트": "component",
    "훅": "hook",
    "컨텍스트": "context",
    "미들웨어": "middleware",
    "서비스": "service",
    "통계": "statistics",
    "시각화": "visualization",
    "차트": "chart",
    "테이블": "table",
    "폼": "form",
    "모달": "modal",
    "목록": "list",
    "검색": "search",
    "필터": "filter",
    "페이지": "page",
    "레이아웃": "layout",
    "네비게이션": "navigation",
    "헤더": "header",
    "사이드바": "sidebar",
    "대시보드": "dashboard",
    "사용자": "user",
    "역할": "role",
    "권한": "permission",
    "테스트": "test",
    "통합-테스트": "integration-test",
    "통합테스트": "integration-test",
    "e2e-테스트": "e2e-test",
    "e2e테스트": "e2e-test",
    "상수": "constant",
    "환경변수": "env",
    "공개-api": "public-api",
    "공개api": "public-api",
    "seed": "seed",
    "시드": "seed",
    "문서": "documentation",
    "스크립트": "script",
    "빌드": "build",
    "배포": "deploy",
    "캐시": "cache",
    "오류": "error",
    "오류처리": "error-handling",
    "로깅": "logging",
    "이메일": "email",
    "알림": "notification",
    "파일": "file",
    "업로드": "upload",
    "다운로드": "download",
    "csv": "csv",
    "json": "json",
    "gis": "gis",
    "지리": "geo",
    "클러스터": "cluster",
    "마커": "marker",
    "좌표": "coordinate",
    "레이어": "layer",
    "수직형": "vertical",
    "수평형": "horizontal",
    "반응형": "responsive",
    "접근성": "accessibility",
    "다크모드": "dark-mode",
    "테마": "theme",
    "색상": "color",
    "스타일": "style",
    "애니메이션": "animation",
    "ai": "ai",
    "llm": "llm",
    "임베딩": "embedding",
    "벡터": "vector",
    "검색엔진": "search-engine",
    "자연어": "natural-language",
    "쿼리": "query",
    "supabase": "supabase",
    "next.js": "nextjs",
    "react": "react",
    "typescript": "typescript",
}

# Edge type corrections (invalid → valid from the 29-type schema)
EDGE_TYPE_MAP = {
    "depends-on": "depends_on",
    "uses": "reads_from",
    "references": "related",
    "tests": "tested_by",
    "contains": "contains",  # keep if valid; actually check
    "imports": "imports",    # keep if valid
    "configures": "configures",  # check
}

# Valid edge types from graph-reviewer schema
VALID_EDGE_TYPES = {
    "imports", "exports", "calls", "instantiates", "extends", "implements",
    "reads_from", "writes_to", "depends_on", "configures", "routes_to",
    "renders", "provides", "consumes", "triggers", "validates", "transforms",
    "tested_by", "documents", "contains", "related", "deployed_with",
    "migrates", "seeds", "type_of", "part_of", "uses_type",
    # also check these common ones that might be valid
    "defines", "declares",
}

def normalize_tag(tag: str) -> str:
    """Convert a tag to valid ASCII-hyphenated lowercase."""
    if tag in TAG_MAP:
        return TAG_MAP[tag]
    # Check if already valid
    if re.match(r'^[a-z0-9][a-z0-9-]*$', tag):
        return tag
    # Try lowercase + hyphenate spaces/underscores
    normalized = tag.lower().replace(' ', '-').replace('_', '-')
    if re.match(r'^[a-z0-9][a-z0-9-]*$', normalized):
        return normalized
    # Strip non-ASCII-alphanumeric
    ascii_only = re.sub(r'[^a-z0-9-]', '', normalized)
    ascii_only = re.sub(r'-+', '-', ascii_only).strip('-')
    if ascii_only and re.match(r'^[a-z0-9][a-z0-9-]*$', ascii_only):
        return ascii_only
    # Fallback: use 'misc'
    return 'misc'


def fix_graph(data: dict) -> tuple[dict, int, int]:
    tag_fixes = 0
    edge_fixes = 0

    for node in data.get('nodes', []):
        tags = node.get('tags', [])
        new_tags = []
        seen = set()
        for t in tags:
            fixed = normalize_tag(t)
            if fixed not in seen:
                new_tags.append(fixed)
                seen.add(fixed)
            if fixed != t:
                tag_fixes += 1
        node['tags'] = new_tags

    for edge in data.get('edges', []):
        etype = edge.get('type', '')
        if etype in EDGE_TYPE_MAP and etype not in VALID_EDGE_TYPES:
            edge['type'] = EDGE_TYPE_MAP[etype]
            edge_fixes += 1
        elif etype not in VALID_EDGE_TYPES:
            # unknown type: map to 'related'
            edge['type'] = 'related'
            edge_fixes += 1

    return data, tag_fixes, edge_fixes


if __name__ == '__main__':
    with open(KG_PATH, encoding='utf-8') as f:
        data = json.load(f)

    fixed, tag_fixes, edge_fixes = fix_graph(data)

    with open(KG_PATH, 'w', encoding='utf-8') as f:
        json.dump(fixed, f, ensure_ascii=False, indent=2)

    print(f"tag fixes: {tag_fixes}, edge type fixes: {edge_fixes}")
    print(f"Written: {KG_PATH}")
