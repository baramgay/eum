# 이음(EUM) — 경남 공공데이터 통합 플랫폼 (1단계 MVP)

> 데이터를 잇고, 가치를 연다 · 경남빅데이터센터

계획서(`../경남_공공데이터플랫폼_이음_구축계획서.html`)의 1단계 로드맵을 실제 동작하는
웹 플랫폼으로 구현한 MVP. **FastAPI + DuckDB + 바닐라 JS(의존성 0, 공공망 친화)**.

## 실행

```powershell
cd D:\업무\gd\eum_platform
pip install -r requirements.txt
python run.py
# 브라우저: http://127.0.0.1:5959   (제작기록: http://127.0.0.1:5959/status)
```

최초 기동 시 합성 시드 → 품질진단 → 온톨로지 구축 파이프라인이 자동 실행된다.

## 구성 (계획서 7계층 매핑)

| 계층 | 모듈 | 설명 |
|---|---|---|
| L2 저장/질의 | `app/database.py` | DuckDB·메타 스키마 |
| L1 수집 | `app/seed_data.py` | 경남 18시군 합성 데이터 |
| L3 품질 | `app/quality.py` | 규칙기반 진단(오류율 0.001%) |
| ⊗ 평가엔진 | `app/evaluation.py` | 평가편람 5영역 19지표 자동산출 |
| L4 온톨로지 | `app/ontology.py` | 객체·관계·액션 |
| L5 AI | `app/nlquery.py` | 자연어 질의·SQL 자동생성 |
| L6 API·웹 | `app/main.py`, `web/` | API 게이트웨이·SPA |

## API

`/api/overview` · `/api/tenants` · `/api/catalog` · `/api/dataset/{id}` ·
`/api/quality` · `/api/evaluation` · `/api/ontology/graph` ·
`/api/ontology/action/settlement` · `/api/nlquery?q=` · `/status`

## 화면

대시보드 · 개방포털(DCAT) · 품질진단 · 온톨로지(그래프+액션) · 자연어 질의

> 데이터는 데모용 합성값이다. 실데이터 수집·멀티테넌트·공공클라우드·실 LLM은 2~3단계 고도화 대상.
