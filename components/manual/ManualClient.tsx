'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  LayoutDashboard, Database, Map, ShieldCheck, GitBranch,
  FileBarChart2, Bot, Upload, RefreshCw, Settings2, KeyRound,
  Building2, BookOpen, Info, AlertTriangle, ChevronRight, ChevronLeft,
  ArrowUpRight, Clock, BarChart2, ArrowRightLeft, Package,
  type LucideIcon,
} from 'lucide-react'

// ─── 아이콘 맵 ──────────────────────────────────────────────────────────────
const ICON_MAP: Record<string, LucideIcon> = {
  overview:   BookOpen,
  dashboard:  LayoutDashboard,
  portal:     Database,
  map:        Map,
  quality:    ShieldCheck,
  ontology:   GitBranch,
  report:     FileBarChart2,
  ai:         Bot,
  submission: Upload,
  collect:    RefreshCw,
  process:    Settings2,
  pipeline:   ArrowRightLeft,
  samples:    Package,
  analysis:   BarChart2,
  openapi:    KeyRound,
  admin:      Building2,
}

// ─── 타입 ────────────────────────────────────────────────────────────────────
type Block =
  | { type: 'p';    text: string }
  | { type: 'h';    text: string }
  | { type: 'sub';  text: string }
  | { type: 'ul';   items: string[] }
  | { type: 'tip';  text: string }
  | { type: 'warn'; text: string }
  | { type: 'code'; text: string }
  | { type: 'flow'; items: string[] }
  | { type: 'grid'; items: Array<{ icon: string; name: string; desc: string }> }
  | { type: 'roles'; items: Array<{ badge: string; color: string; desc: string }> }

interface Section {
  id: string
  title: string
  blocks: Block[]
  role?: 'center'
}

// ─── 섹션 데이터 ─────────────────────────────────────────────────────────────
const SECTIONS: Section[] = [
  {
    id: 'overview', title: '플랫폼 개요',
    blocks: [
      { type: 'h', text: '이음(EUM)이란?' },
      { type: 'p', text: '이음(EUM)은 경상남도 공공데이터 개방 플랫폼입니다. 민간·공공데이터를 수집·가공·개방하고, AI 기반 질의와 데이터 품질 자동 진단을 제공합니다. 온톨로지 방식의 통합 데이터 플랫폼 구조로 설계된 경남형 데이터 허브입니다.' },
      { type: 'h', text: '주요 기능' },
      { type: 'grid', items: [
        { icon: 'dashboard',  name: '대시보드',    desc: '플랫폼 현황 종합 요약' },
        { icon: 'portal',     name: '데이터 포털', desc: '공개 데이터셋 검색·다운로드' },
        { icon: 'map',        name: '지도',        desc: '경남 공공시설 위치 시각화' },
        { icon: 'quality',    name: '품질 진단',   desc: '데이터 품질 자동 규칙 검사' },
        { icon: 'ontology',   name: '온톨로지',    desc: '지식 그래프 탐색 및 정책 추천' },
        { icon: 'report',     name: '리포트',      desc: '데이터 관리 역량 평가편람 대응' },
        { icon: 'ai',         name: 'AI 질의',     desc: '자연어 기반 데이터 조회' },
        { icon: 'submission', name: '데이터 등록', desc: 'CSV 업로드 및 심사 워크플로우' },
        { icon: 'collect',    name: '수집',        desc: '외부 API/파일 자동 수집 관리' },
        { icon: 'process',    name: '가공',        desc: '규칙 기반 ETL 파이프라인' },
        { icon: 'openapi',    name: '개방 API',    desc: 'API 키 발급 및 웹훅 관리' },
        { icon: 'admin',      name: '기관 관리',   desc: '입주 기관 계정 관리 (센터 전용)' },
      ]},
      { type: 'h', text: '역할(Role) 안내' },
      { type: 'roles', items: [
        { badge: 'center', color: 'bg-blue-50 text-blue-700 ring-blue-200',  desc: '경남빅데이터센터 — 모든 기능 접근, 기관 관리, 데이터 심사' },
        { badge: 'agency', color: 'bg-green-50 text-green-700 ring-green-200', desc: '입주 기관 — 데이터 등록·제출, 공개 데이터 열람' },
        { badge: 'viewer', color: 'bg-gray-50 text-gray-600 ring-gray-200',  desc: '일반 사용자 — 공개 데이터 포털, AI 질의, 지도 열람' },
      ]},
    ],
  },
  {
    id: 'dashboard', title: '대시보드',
    blocks: [
      { type: 'h', text: '화면 구성' },
      { type: 'p', text: '로그인 후 처음 보이는 화면으로, 플랫폼 전체 현황을 한눈에 파악할 수 있습니다.' },
      { type: 'sub', text: '평가 점수 카드' },
      { type: 'p', text: '데이터 관리 역량 평가편람 기준으로 자동 산출된 영역별 점수를 표시합니다.' },
      { type: 'ul', items: [
        '종합 점수: 5개 영역 가중 평균 (100점 만점)',
        '개방·활용: 공개 데이터셋 비율, AI-Ready 비율 (가중치 48점)',
        '품질: 자동 규칙 검사 통과율 (가중치 20점)',
        '분석·활용: API 연계, 온톨로지 구축 여부 (가중치 12점)',
        '공유: 입주 기관 활성 비율 (가중치 10점)',
        '관리체계: 수집·가공 파이프라인 운영 (가중치 10점)',
      ]},
      { type: 'sub', text: '제출 현황' },
      { type: 'p', text: '입주 기관의 데이터 등록 신청 상태별 건수를 보여줍니다 (대기·검토중·승인·반려).' },
      { type: 'sub', text: '시군별 청년 순이동 차트' },
      { type: 'p', text: 'KT 통신 데이터 기반 2024년 경남 18개 시군의 청년(20~39세) 순유입·순유출 현황입니다.' },
      { type: 'tip', text: '점수는 실시간 데이터 기준으로 자동 계산됩니다. 데이터가 추가·변경되면 즉시 반영됩니다.' },
    ],
  },
  {
    id: 'portal', title: '데이터 포털',
    blocks: [
      { type: 'h', text: '데이터셋 검색 및 다운로드' },
      { type: 'p', text: '공개된 데이터셋을 검색하고 다운로드할 수 있는 공개 포털 기능입니다.' },
      { type: 'sub', text: '검색' },
      { type: 'ul', items: [
        '검색창에 키워드 입력 후 Enter 또는 검색 버튼 클릭',
        'PostgreSQL 전문 검색(tsvector) 기반 — 제목·설명·주제 전체에서 검색',
        '300ms 디바운스 적용 (입력 후 잠시 대기하면 자동 검색)',
      ]},
      { type: 'sub', text: '테마 필터' },
      { type: 'p', text: '상단 테마 탭을 클릭해 인구·가구, 산업·고용, 공공행정 등 분야별로 필터링합니다.' },
      { type: 'sub', text: '데이터셋 카드' },
      { type: 'ul', items: [
        '카드 클릭 → 상세 페이지로 이동',
        '상세 페이지에서 미리보기(5행), 메타데이터, 다운로드 버튼 제공',
        '포맷: CSV / JSON / GeoJSON / API 엔드포인트',
      ]},
      { type: 'tip', text: '데이터셋이 "API" 포맷인 경우, 개방 API 키를 발급받아 프로그래밍 방식으로 접근 가능합니다.' },
    ],
  },
  {
    id: 'map', title: '지도',
    blocks: [
      { type: 'h', text: '경남 공공시설 위치 시각화' },
      { type: 'p', text: '경남 18개 시군의 청년 인프라(청년센터·도서관·체육관·문화센터) 위치를 카카오맵에서 확인합니다. 마커·클러스터·히트맵 3가지 레이어로 밀도와 개별 시설을 모두 살펼 수 있습니다.' },
      { type: 'sub', text: '레이어 전환' },
      { type: 'ul', items: [
        '마커: 개별 시설을 유형별 핀으로 표시, 클릭 시 팝업 상세 확인',
        '클러스터: 줌 아웃 시 근접 마커를 묶어 개수 표시, 밀집도를 한눈에 파악',
        '히트맵: 시설 분포의 밀도를 색상 그라데이션으로 시각화',
        '상단 레이어 토글 버튼으로 즉시 전환, URL에도 상태가 반영됩니다',
      ]},
      { type: 'sub', text: '검색 및 카테고리 필터' },
      { type: 'ul', items: [
        '검색창에 시설명 또는 시군명을 입력하면 실시간으로 목록과 지도가 필터링됩니다',
        '상단 칩 버튼으로 청년센터·도서관·체육관·문화센터를 선택/해제할 수 있습니다',
        '"전체" 버튼을 눌러 모든 유형을 한 번에 선택하거나 해제할 수 있습니다',
      ]},
      { type: 'sub', text: '목록 보기' },
      { type: 'p', text: '하단 "목록 보기" 버튼을 클릭하면 지도 위에서 필터링된 시설 목록을 슬라이드업 패널로 확인할 수 있습니다. 항목을 선택하면 해당 시설의 상세 정보를 확인할 수 있습니다.' },
      { type: 'sub', text: 'URL 파라미터' },
      { type: 'code', text: '/map?layer=cluster   # 클러스터 모드로 열기\n/map?layer=heatmap  # 히트맵 모드로 열기\n/map?layer=marker   # 기본 마커 모드로 열기 (기본값)' },
      { type: 'tip', text: '레이어 상태는 브라우저 URL에 자동 저장되어 공유 링크로 전달할 수 있습니다.' },
    ],
  },
  {
    id: 'quality', title: '품질 진단',
    blocks: [
      { type: 'h', text: '자동 품질 검사' },
      { type: 'p', text: '등록된 골드 데이터셋(gold_*) 전체에 대해 사전 정의된 규칙을 자동 실행하고 결과를 표시합니다.' },
      { type: 'sub', text: '검사 테이블' },
      { type: 'ul', items: [
        'gold_youth_population: 경남 시군별 청년 인구 (KT/주민등록 기반)',
        'gold_business: 경남 시군별 사업체·고용 현황',
        'gold_public_facility: 경남 공공시설 위치 정보',
      ]},
      { type: 'sub', text: '규칙 유형' },
      { type: 'ul', items: [
        '음수 금지 (population, biz_count 등)',
        'NULL 금지 (필수 컬럼)',
        '코드 유효성 (age_group, sex 등 허용 값 범위)',
        '연도·좌표 범위 검사',
        '참조 무결성 (예: 종사자 수 ≥ 사업체 수)',
      ]},
      { type: 'sub', text: '재검사' },
      { type: 'p', text: '우측 상단 "전체 재검사" 버튼을 클릭하면 전체 데이터셋을 즉시 재검사합니다.' },
      { type: 'tip', text: '데이터 수집·가공 파이프라인 완료 후 자동으로 품질 검사가 트리거됩니다.' },
      { type: 'warn', text: '오류율이 0.001% 기준을 초과하면 "미흡"으로 표시됩니다. 데이터 원본을 확인하세요.' },
    ],
  },
  {
    id: 'ontology', title: '온톨로지',
    blocks: [
      { type: 'h', text: '지식 그래프 탐색' },
      { type: 'p', text: '경남 청년 데이터를 노드(시군, 데이터셋, 지표)와 엣지(관계)로 구성한 지식 그래프입니다. 온톨로지 방식의 통합 데이터 플랫폼 구조로 엔티티 간 관계를 표현합니다.' },
      { type: 'sub', text: '탭 구성' },
      { type: 'ul', items: [
        '개요: 그래프 통계(노드·엣지 수), 정책 액션 추천',
        '그래프: 시각적 노드-엣지 탐색 (시군 코드로 필터 가능)',
        '노드 목록: 모든 노드를 테이블로 확인',
      ]},
      { type: 'sub', text: '정책 액션' },
      { type: 'ul', items: [
        '청년 정착지원 우선지역: 규모·산업·인프라·순유출 종합 스코어링',
        '청년 주거지원 우선지역: 인프라 부족 + 순유출 심한 지역',
        '청년 취업지원 우선지역: 청년인구 대비 고용 기반 취약 지역',
      ]},
      { type: 'tip', text: '"우선순위 보기" 버튼을 클릭하면 AI 질의 페이지로 연결되어 상세 순위를 확인할 수 있습니다.' },
      { type: 'sub', text: '온톨로지 재구축' },
      { type: 'p', text: '우측 상단 버튼으로 전체 온톨로지를 재구축합니다. 데이터 변경 후 실행하세요.' },
    ],
  },
  {
    id: 'report', title: '평가 리포트',
    blocks: [
      { type: 'h', text: '데이터 관리 역량 평가편람 대응 리포트' },
      { type: 'p', text: '행정안전부·한국지능정보사회진흥원의 데이터 관리 역량 평가편람 기준에 맞춰 플랫폼 현황을 자동 산출해 보여주는 리포트입니다.' },
      { type: 'sub', text: '종합 점수' },
      { type: 'p', text: '5개 영역의 지표를 가중 합산한 종합 점수 (100점 만점)와 세부 요약 통계를 표시합니다.' },
      { type: 'sub', text: '레이더 차트' },
      { type: 'p', text: '5개 영역(개방·활용 / 품질 / 분석·활용 / 공유 / 관리체계)을 방사형 차트로 시각화합니다.' },
      { type: 'sub', text: '영역별 지표 테이블' },
      { type: 'p', text: '각 영역에 속한 세부 지표를 현황 값, 충족/미흡 상태, 설명과 함께 테이블로 제공합니다.' },
      { type: 'sub', text: 'PDF 출력' },
      { type: 'p', text: '우측 상단 "PDF 출력" 버튼 → 브라우저 인쇄 다이얼로그 → PDF로 저장을 선택합니다.' },
      { type: 'tip', text: '리포트 수치는 실시간 데이터 기준으로 자동 계산됩니다. 별도 수작업 없이 평가 제출용 자료를 생성할 수 있습니다.' },
    ],
  },
  {
    id: 'ai', title: 'AI 질의',
    blocks: [
      { type: 'h', text: '자연어 기반 데이터 조회' },
      { type: 'p', text: '자연어로 질문하면 의도를 파악해 해당 데이터를 표 또는 차트로 반환합니다. 룰 기반 의도 매칭과 Qwen AI 모델을 결합해 공공망 환경에서도 동작합니다.' },
      { type: 'sub', text: '지원 의도 (Intent)' },
      { type: 'ul', items: [
        '정착잠재지수: "청년 정착잠재 순위", "어디가 살기 좋아"',
        '청년인구: "거창군 청년 유입", "인구 많은 시군"',
        '사업체·고용: "창원시 사업체 현황", "제조업 일자리"',
        '소득·신용: "소득 높은 시군", "신용점수"',
        '공공시설: "거제시 청년센터", "도서관 어디 있어"',
      ]},
      { type: 'sub', text: '사용 방법' },
      { type: 'ul', items: [
        '검색창에 질문 입력 후 Enter 또는 "질문" 버튼 클릭',
        '예제 버튼(회색 태그)을 클릭하면 바로 실행됩니다',
        '숫자형 데이터는 자동으로 막대 차트로 전환됩니다',
        '차트/표 전환 버튼으로 원하는 뷰를 선택합니다',
        '대화는 브라우저 로컬 저장소에 자동 저장되며, 새 대화 추가·이름 변경·공유·내보내기·마크다운 내보내기가 가능합니다',
      ]},
      { type: 'tip', text: '특정 시군을 포함해 질문하면 해당 시군에 집중된 결과를 반환합니다. 예: "밀양시 청년 현황"' },
    ],
  },
  {
    id: 'submission', title: '데이터 등록',
    blocks: [
      { type: 'h', text: '입주 기관 데이터 등록 워크플로우' },
      { type: 'p', text: '입주 기관이 CSV 데이터를 제출하면 센터에서 검토·승인하는 워크플로우입니다.' },
      { type: 'sub', text: '기관(agency) — 데이터 등록' },
      { type: 'ul', items: [
        '"데이터 등록" 버튼 클릭 → 폼 열기',
        '제목·주제·포맷·라이선스·설명 입력',
        'CSV 파일을 드래그앤드롭 또는 클릭하여 선택',
        '파일 선택 시 컬럼 스키마(TEXT/NUMBER 자동 추론)와 5행 미리보기 표시',
        '"등록" 버튼 클릭 → 제출 완료 (상태: 검토 대기)',
      ]},
      { type: 'sub', text: '센터(center) — 데이터 심사' },
      { type: 'ul', items: [
        '목록에서 행 클릭 → 상세 심사 패널 오픈',
        '데이터 미리보기, 자동 품질 요약 확인',
        '코멘트 입력 후 승인 또는 반려 처리',
      ]},
      { type: 'sub', text: '상태 흐름' },
      { type: 'flow', items: ['검토 대기', '검토 중', '승인 / 반려'] },
      { type: 'warn', text: 'CSV 파일은 UTF-8 인코딩을 권장합니다. 한글이 포함된 경우 Excel에서 저장 시 UTF-8 CSV로 저장하세요.' },
    ],
  },
  {
    id: 'collect', title: '데이터 수집',
    blocks: [
      { type: 'h', text: '외부 데이터 자동 수집 관리' },
      { type: 'p', text: '외부 API 또는 URL에서 데이터를 주기적으로 자동 수집하는 기능입니다.' },
      { type: 'sub', text: '수집 소스 등록' },
      { type: 'ul', items: [
        '"수집 소스 등록" 버튼 클릭 → 소스 설정 폼 오픈',
        '이름, URL, 메서드(GET/POST), 응답 형식(JSON/CSV/XML) 설정',
        '인증 방식(API 키·Bearer·없음) 및 인증값 입력 — AES-256-CBC로 암호화 저장 (평문 노출 없음)',
        '페이지네이션(pageNo/numOfRows 등) 및 수집 주기(manual·daily·weekly·monthly) 설정',
        '저장 전 "연결 테스트" 버튼으로 미리보기 및 컬럼 확인 가능',
      ]},
      { type: 'sub', text: '수집 주기 옵션' },
      { type: 'ul', items: [
        '수동(manual): "수집 실행" 버튼으로 즉시 실행',
        '매일(daily): 매일 오전 2시 자동 실행 (Vercel Cron)',
        '매주(weekly): 매주 월요일 오전 2시 자동 실행',
        '매월(monthly): 매월 1일 오전 2시 자동 실행',
      ]},
      { type: 'sub', text: '수집 로그' },
      { type: 'p', text: '각 소스별 최근 수집 시각, 상태(성공·실패), 수집된 데이터 크기를 확인할 수 있습니다.' },
      { type: 'tip', text: '수집 완료 후 자동으로 품질 진단이 트리거됩니다.' },
    ],
  },
  {
    id: 'process', title: '데이터 가공',
    blocks: [
      { type: 'h', text: '규칙 기반 ETL 파이프라인' },
      { type: 'p', text: '수집된 원천 데이터를 변환·정제하는 파이프라인을 정의하고 실행합니다.' },
      { type: 'sub', text: '파이프라인 추가' },
      { type: 'ul', items: [
        '"+ 파이프라인 추가" 버튼 클릭',
        '파이프라인 이름, 입력 소스, 출력 테이블 지정',
        '변환 규칙을 순서대로 추가',
      ]},
      { type: 'sub', text: '지원 변환 규칙 (15종)' },
      { type: 'ul', items: [
        'select: 컬럼 포함/제외',
        'rename: 컬럼명 변경',
        'cast: 데이터 타입 변환 (문자/숫자/날짜)',
        'nullfill / nulldrop: NULL 값 채우기 또는 NULL 행 제거',
        'filter: 조건에 맞는 행만 유지',
        'normalize: 문자열 정규화(trim·대소문자)',
        'derive: 기존 컬럼으로 새 컬럼 계산(연도·월·일차 등)',
        'dedup: 중복 행 제거',
        'codemap: 코드 값 치환',
        'concat / split: 컬럼 합치기·분리',
        'aggregate: 그룹 집계(sum·count·mean·max·min)',
        'join: 다른 테이블과 조인',
        'pivot: 행·열 전환',
      ]},
      { type: 'sub', text: '실행 및 이력' },
      { type: 'p', text: '파이프라인 상세에서 "실행" 버튼을 클릭하면 즉시 실행되고, 실행 이력(시간·행 수·오류)이 기록됩니다.' },
    ],
  },
  {
    id: 'openapi', title: '개방 API',
    blocks: [
      { type: 'h', text: '외부 연계 API 키 및 웹훅 관리' },
      { type: 'p', text: '외부 시스템에서 이음 플랫폼 데이터에 프로그래밍 방식으로 접근할 수 있도록 API 키를 발급합니다.' },
      { type: 'sub', text: 'API 키 발급' },
      { type: 'ul', items: [
        '"+ API 키 발급" 버튼 클릭',
        '키 이름·만료일·권한(읽기/쓰기) 설정',
        '발급된 키는 최초 1회만 표시됩니다 — 반드시 즉시 복사·보관하세요',
        '키는 SHA-256 해시로 저장되어 평문 재조회 불가',
      ]},
      { type: 'sub', text: 'API 사용 방법' },
      { type: 'code', text: 'GET /api/openapi/data?dataset=gold_youth_population\nX-API-Key: your_api_key_here' },
      { type: 'sub', text: '웹훅' },
      { type: 'ul', items: [
        '특정 이벤트 발생 시 지정 URL로 POST 알림',
        '웹훅 탭에서 URL·이벤트 유형·활성화 여부 설정',
        '최근 발송 이력과 HTTP 응답 코드 확인 가능',
      ]},
      { type: 'warn', text: 'API 키는 외부에 노출되지 않도록 주의하세요. 유출 시 즉시 삭제하고 재발급하세요.' },
    ],
  },
  {
    id: 'analysis', title: '분석',
    blocks: [
      { type: 'h', text: '데이터 분석 개요' },
      { type: 'p', text: '이음 플랫폼의 분석 모듈은 업로드한 파일이나 카탈로그에 등록된 데이터를 별도 설치 없이 브라우저에서 통계 분석할 수 있도록 지원합니다. Python 기반 분석 엔진(pandas, scipy, statsmodels, lifelines)이 서버에서 실행되며, 결과는 표와 함께 CSV로 내보낼 수 있습니다.' },
      { type: 'sub', text: '데이터 로드 방식' },
      { type: 'ul', items: [
        '파일 업로드: CSV 또는 Excel(.xlsx) 파일을 드래그앤드롭 또는 클릭으로 선택',
        '카탈로그 선택: 등록된 데이터셋 목록에서 검색 후 선택하면 자동으로 세션에 로드',
        '카탈로그 데이터는 catalog 테이블의 table_name 또는 submission_uploads.preview(JSONB)에서 조회됩니다',
      ]},
      { type: 'sub', text: '변수 매핑' },
      { type: 'p', text: '분석 전 각 컬럼의 측정 척도를 올바르게 지정해야 합니다. 변수명 오른쪽의 배지를 클릭하면 타입을 전환할 수 있습니다.' },
      { type: 'ul', items: [
        '연속(scale): 평균·표준편차·상관·회귀 등 수치형 분석에 사용',
        '명목(nominal): 성별·유형처럼 순서 없는 범주, 교차표·t-검정 집단 변수로 사용',
        '순서(ordinal): 등급·만족도처럼 순서 있는 범주, 비모수 검정에 사용',
      ]},
      { type: 'sub', text: '지원 분석 목록 (17종)' },
      { type: 'grid', items: [
        { icon: 'analysis', name: '기술통계량', desc: '평균·표준편차·사분위수·왜도·첨도' },
        { icon: 'analysis', name: '빈도 분석', desc: '범주별 빈도·백분율·누적' },
        { icon: 'analysis', name: '정규성 검정', desc: 'Shapiro-Wilk / KS 검정' },
        { icon: 'analysis', name: '교차 분석', desc: '교차표 + 카이제곱 검정 + Cramér\'s V' },
        { icon: 'analysis', name: '카이제곱 독립성', desc: '두 범주 변수 간 독립성 검정' },
        { icon: 'analysis', name: '상관 분석', desc: '피어슨 / 스피어만 상관계수 행렬' },
        { icon: 'analysis', name: '독립표본 t-검정', desc: '두 집단 평균 비교, 2개 범주 선택 지원' },
        { icon: 'analysis', name: 'ANOVA', desc: '3개 이상 집단 평균 비교 + Tukey HSD' },
        { icon: 'analysis', name: '대응표본 t-검정', desc: '동일 대상의 두 측정값 평균 비교' },
        { icon: 'analysis', name: 'Mann-Whitney U', desc: '비모수 독립표본 검정' },
        { icon: 'analysis', name: 'Wilcoxon', desc: '비모수 대응표본 검정' },
        { icon: 'analysis', name: '선형 회귀', desc: 'OLS 회귀계수·R²·VIF 다중공선성' },
        { icon: 'analysis', name: '로지스틱 회귀', desc: '이항 분류·Odds Ratio·AIC/BIC' },
        { icon: 'analysis', name: 'PCA', desc: '주성분분석·Scree plot·PC 산점도' },
        { icon: 'analysis', name: 'K-Means', desc: '비지도 클러스터링·클리스터 산점도' },
        { icon: 'analysis', name: '생존 분석', desc: 'Kaplan-Meier 생존 함수 + Log-rank' },
        { icon: 'analysis', name: '시계열 분해', desc: 'STL 추세·계절성·잔차 분해' },
      ]},
      { type: 'sub', text: '결과 내보내기' },
      { type: 'p', text: '분석 실행 후 우측 상단 "CSV 내보내기" 버튼을 클릭하면 전체 결과 테이블을 UTF-8 CSV 파일로 저장할 수 있습니다. 차트가 포함된 분석은 별도의 차트 뷰에서 시각적으로 확인할 수 있습니다.' },
      { type: 'tip', text: '집단 변수에 3개 이상 범주가 있을 때는 독립표본 t-검정에서 비교할 2개 범주를 직접 선택해야 합니다.' },
    ],
  },
  {
    id: 'pipeline', title: '수집→가공→분석 파이프라인',
    blocks: [
      { type: 'h', text: '데이터 활용 흐름' },
      { type: 'p', text: '외부 데이터를 체계적으로 수집·가공한 뒤 분석과 개방까지 연결하는 전체 파이프라인입니다. 각 단계는 실행 이력이 남으며, 품질 진단과 연동됩니다.' },
      { type: 'flow', items: ['수집 소스 등록', '원천 데이터 수집', '가공 파이프라인', '품질 진단', '분석 및 개방'] },
      { type: 'sub', text: '1) 수집 소스 등록' },
      { type: 'p', text: '외부 API, 파일 URL, 주기적 Cron 등 데이터 원천을 등록합니다. API 키는 AES-256-CBC로 암호화되어 안전하게 저장됩니다.' },
      { type: 'sub', text: '2) 원천 데이터 수집' },
      { type: 'p', text: '수동 실행 또는 매일/매주/매월 Cron으로 데이터를 수집합니다. 수집 완료 후 자동으로 가공 단계로 넘어갈 수 있도록 파이프라인을 연결할 수 있습니다.' },
      { type: 'sub', text: '3) 가공 파이프라인' },
      { type: 'p', text: 'select, rename, cast, filter, derive, aggregate, join, pivot 등 15가지 규칙으로 원천 데이터를 정제·변환하여 gold 테이블이나 분석용 세션을 만듭니다.' },
      { type: 'sub', text: '4) 품질 진단' },
      { type: 'p', text: '가공된 데이터는 음수 금지, NULL 금지, 코드 유효성, 좌표 범위 등 사전 정의 규칙으로 자동 검사됩니다. 오류율이 기준을 초과하면 데이터 관리자에게 알림이 갑니다.' },
      { type: 'sub', text: '5) 분석 및 개방' },
      { type: 'p', text: '품질을 통과한 데이터는 카탈로그에 공개되거나, 분석 모듈에서 즉시 분석할 수 있습니다. 개방 API 키를 발급하면 외부 시스템 연계도 가능합니다.' },
      { type: 'tip', text: '가공 파이프라인 실행 시 "분석으로" 버튼을 클릭하면 결과 데이터가 분석 탭의 세션으로 바로 로드됩니다.' },
    ],
  },
  {
    id: 'samples', title: '샘플 데이터',
    blocks: [
      { type: 'h', text: 'data/samples/ 샘플 데이터 안내' },
      { type: 'p', text: '로컬 개발과 분석 기능 테스트를 위해 5개 주제의 샘플 CSV/JSON이 준비되어 있습니다. 카탈로그의 dataset_id(예: ds-traffic-accident)와 연결되어 있어 별도 업로드 없이 바로 분석해 볼 수 있습니다.' },
      { type: 'grid', items: [
        { icon: 'samples', name: '교통사고', desc: 'ds-traffic-accident · 사고 유형·상해·재산피해' },
        { icon: 'samples', name: '상권', desc: 'ds-commercial-area · 업종별 점포·매출·종사자' },
        { icon: 'samples', name: '대기질', desc: 'ds-air-quality · 측정소별 PM10·PM2.5·오염물질' },
        { icon: 'samples', name: '공공의료', desc: 'ds-public-hospital · 보건소·의료원 의료인력·병상' },
        { icon: 'samples', name: '학교/교육', desc: 'ds-school-population · 학교급별 학교 수·학생·교원' },
      ]},
      { type: 'sub', text: '활용 방법' },
      { type: 'ul', items: [
        '분석 탭 → "카탈로그 로드" → 샘플 데이터셋 선택 → 변수 타입 확인 → 분석 실행',
        'CSV 파일을 직접 업로드하여 동일한 분석을 테스트할 수도 있습니다',
        '상권·대기질 데이터는 시군별 비교(ANOVA, t-검정), 교통사고는 교차표, 공공의료는 기술통계에 적합합니다',
      ]},
      { type: 'tip', text: '샘플 데이터는 개발 환경에서 catalog/submission_uploads 미리보기로 제공되며, 운영 환경에서는 scripts/load-samples-to-catalog.mjs를 통해 DB에 적재할 수 있습니다.' },
    ],
  },
  {
    id: 'admin', title: '기관 관리', role: 'center',
    blocks: [
      { type: 'h', text: '입주 기관 계정 관리 (센터 전용)' },
      { type: 'p', text: '경남빅데이터센터 계정(center)만 접근 가능한 기관 관리 기능입니다.' },
      { type: 'sub', text: '기관 목록' },
      { type: 'ul', items: [
        '등록된 입주 기관 목록, 활성화 상태, 제출 건수 확인',
        '기관별 상세 클릭 → 계정 정보, 제출 이력, 통계 조회',
      ]},
      { type: 'sub', text: '기관 등록' },
      { type: 'ul', items: [
        '기관명, 이메일, 담당자 정보 입력',
        '역할(agency) 자동 부여',
        '등록 시 임시 비밀번호 이메일 발송 (Supabase Auth 연동)',
      ]},
      { type: 'sub', text: '기관 활성화/비활성화' },
      { type: 'p', text: '비활성화 처리 시 해당 기관 계정의 로그인이 차단됩니다.' },
    ],
  },
]

const UPDATE_LOG = [
  { date: '2026-06-14', items: [
    '사용 안내 — 분석·지도·수집→가공→분석·샘플 데이터 섹션 추가',
    '분석 가이드: 17종 분석·파일/카탈로그 로드·변수 매핑·CSV 내보내기',
    '가공 가이드: 15가지 변환 규칙(aggregate·join·pivot 등) 반영',
    '지도 가이드: 마커/큘러스터/히트맵, 검색·필터·목록 보기, URL layer 파라미터',
    'AI 질의 가이드: 대화 이력·차트/표 전환·마크다운 내보내기 추가',
    '기관명 "경남빅데이터센터"로 통일',
    'status.html 최신 상태(3단계 완료·탭별 현황·산출물) 갱신',
  ]},
  { date: '2026-06-12', items: [
    'Qwen AI 모델 연동 (qwen-turbo) — 자연어 질의 향상',
    'Lucide SVG 아이콘 시스템 적용 — 이모지 전면 교체',
    'Phase 5: 수집·가공·활용·연계 4대 모듈 추가',
    '헤더 2단 레이아웃으로 개편 (탭 오버플로우 해결)',
    'AI 질의 차트 뷰 추가 + 예제 버튼 5종',
    '평가리포트 페이지 신규 (레이더 차트 + PDF 출력)',
    '데이터 등록 드래그앤드롭 + CSV 미리보기',
  ]},
  { date: '2026-05', items: [
    'Phase 4: 대시보드·포털·품질·온톨로지·AI 질의·지도 구현',
    'Supabase RLS 기반 역할별 접근 제어',
    '품질 자동 진단 엔진 구축',
  ]},
  { date: '2026-04', items: ['Phase 1~3: 인증·골드 데이터·카탈로그 기반 구축'] },
]

// ─── 블록 렌더러 ─────────────────────────────────────────────────────────────
function renderBlock(block: Block, idx: number) {
  switch (block.type) {
    case 'h':
      return (
        <h3 key={idx} className="text-base font-semibold text-gray-900 mt-8 mb-3 flex items-center gap-2">
          <span className="w-1 h-4 rounded-full bg-blue-500 flex-shrink-0" />
          {block.text}
        </h3>
      )
    case 'sub':
      return (
        <h4 key={idx} className="text-sm font-semibold text-gray-700 mt-5 mb-2 uppercase tracking-wide">
          {block.text}
        </h4>
      )
    case 'p':
      return <p key={idx} className="text-sm text-gray-600 leading-7 mb-3">{block.text}</p>
    case 'ul':
      return (
        <ul key={idx} className="space-y-2 mb-4">
          {block.items.map((item, i) => (
            <li key={i} className="flex items-start gap-3 text-sm text-gray-600">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 mt-2 flex-shrink-0" />
              <span className="leading-7">{item}</span>
            </li>
          ))}
        </ul>
      )
    case 'tip':
      return (
        <div key={idx} className="flex items-start gap-3 bg-blue-50 rounded-xl p-4 my-4 border border-blue-100">
          <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-blue-700 leading-6">{block.text}</p>
        </div>
      )
    case 'warn':
      return (
        <div key={idx} className="flex items-start gap-3 bg-amber-50 rounded-xl p-4 my-4 border border-amber-100">
          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-700 leading-6">{block.text}</p>
        </div>
      )
    case 'code':
      return (
        <div key={idx} className="my-4 rounded-xl overflow-hidden">
          <div className="bg-gray-800 px-4 py-2 flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-red-400" />
            <span className="w-3 h-3 rounded-full bg-yellow-400" />
            <span className="w-3 h-3 rounded-full bg-green-400" />
          </div>
          <div className="bg-gray-900 text-green-300 text-xs p-4 font-mono leading-6 whitespace-pre overflow-x-auto">
            {block.text}
          </div>
        </div>
      )
    case 'flow':
      return (
        <div key={idx} className="flex items-center gap-2 my-4 flex-wrap">
          {block.items.map((item, i) => (
            <span key={i} className="flex items-center gap-2">
              <span className="bg-gray-100 text-gray-700 px-3 py-1.5 rounded-full text-xs font-medium ring-1 ring-gray-200">
                {item}
              </span>
              {i < block.items.length - 1 && (
                <ChevronRight className="w-4 h-4 text-gray-300" />
              )}
            </span>
          ))}
        </div>
      )
    case 'grid': {
      return (
        <div key={idx} className="grid grid-cols-2 md:grid-cols-3 gap-3 my-4">
          {block.items.map((f, i) => {
            const Icon = ICON_MAP[f.icon] ?? BookOpen
            return (
              <div key={i} className="flex items-start gap-3 bg-gray-50 rounded-xl p-3.5 ring-1 ring-gray-200/70">
                <div className="w-8 h-8 rounded-lg bg-white ring-1 ring-gray-200 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4 text-gray-600" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-800 leading-5">{f.name}</p>
                  <p className="text-xs text-gray-500 leading-5">{f.desc}</p>
                </div>
              </div>
            )
          })}
        </div>
      )
    }
    case 'roles':
      return (
        <div key={idx} className="space-y-2.5 my-4">
          {block.items.map((r, i) => (
            <div key={i} className="flex items-center gap-3 p-3.5 bg-gray-50 rounded-xl ring-1 ring-gray-200/70">
              <span className={`text-xs px-2.5 py-1 rounded-full font-semibold flex-shrink-0 ring-1 ${r.color}`}>
                {r.badge}
              </span>
              <span className="text-sm text-gray-600 leading-6">{r.desc}</span>
            </div>
          ))}
        </div>
      )
    default:
      return null
  }
}

// ─── 컴포넌트 ────────────────────────────────────────────────────────────────
export default function ManualClient({ role }: { role: string }) {
  const [activeId, setActiveId] = useState('overview')
  const [showLog, setShowLog]   = useState(false)

  const visibleSections = SECTIONS.filter(s => !s.role || s.role === role)
  const active    = visibleSections.find(s => s.id === activeId) ?? visibleSections[0]
  const activeIdx = visibleSections.findIndex(s => s.id === activeId)

  const ActiveIcon = ICON_MAP[active.id] ?? BookOpen

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* 페이지 헤더 */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">사용 안내</h1>
          <p className="text-sm text-gray-500 mt-1.5">이음(EUM) 플랫폼 기능 및 사용법 가이드</p>
        </div>
        <button
          onClick={() => setShowLog(v => !v)}
          className="flex items-center gap-2 text-sm text-gray-500 border border-gray-200 rounded-xl px-4 py-2 hover:bg-gray-50 transition-colors"
        >
          <Clock className="w-4 h-4" />
          {showLog ? '가이드 보기' : '업데이트 이력'}
        </button>
      </div>

      {showLog ? (
        /* ─── 업데이트 이력 ─── */
        <div className="bg-white rounded-2xl ring-1 ring-gray-200 shadow-sm p-8">
          <h2 className="text-lg font-bold text-gray-900 mb-6">업데이트 이력</h2>
          <div className="space-y-8">
            {UPDATE_LOG.map(log => (
              <div key={log.date} className="flex gap-6">
                <div className="flex-shrink-0 w-24">
                  <span className="text-sm font-semibold text-blue-600">{log.date}</span>
                </div>
                <ul className="flex-1 space-y-2 border-l border-gray-100 pl-6">
                  {log.items.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                      <span className="w-1 h-1 rounded-full bg-gray-400 mt-2.5 flex-shrink-0" />
                      <span className="leading-6">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* ─── 메인 레이아웃 ─── */
        <div className="flex gap-6 items-start">
          {/* 사이드바 */}
          <aside className="w-56 flex-shrink-0 sticky top-6">
            <nav className="bg-white rounded-2xl ring-1 ring-gray-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">메뉴</p>
              </div>
              {visibleSections.map(s => {
                const SIcon = ICON_MAP[s.id] ?? BookOpen
                const isActive = activeId === s.id
                return (
                  <button
                    key={s.id}
                    onClick={() => setActiveId(s.id)}
                    className={`
                      w-full flex items-center gap-3 px-4 py-3 text-sm text-left transition-all
                      border-b border-gray-50 last:border-b-0
                      ${isActive
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}
                    `}
                  >
                    <SIcon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-white' : 'text-gray-400'}`} />
                    <span className="font-medium leading-5 flex-1">{s.title}</span>
                    {s.role === 'center' && (
                      <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${
                        isActive ? 'bg-white/20 text-white' : 'bg-blue-50 text-blue-600'
                      }`}>
                        센터
                      </span>
                    )}
                  </button>
                )
              })}
            </nav>

            {/* 바로가기 */}
            <div className="mt-4 bg-white rounded-2xl ring-1 ring-gray-200 shadow-sm p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">바로가기</p>
              <div className="space-y-1">
                {[
                  { href: '/',       label: '대시보드',    icon: LayoutDashboard },
                  { href: '/portal', label: '데이터 포털', icon: Database },
                  { href: '/ai',     label: 'AI 질의',     icon: Bot },
                ].map(({ href, label, icon: LIcon }) => (
                  <Link
                    key={href} href={href}
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors group"
                  >
                    <LIcon className="w-4 h-4 text-gray-400 group-hover:text-gray-600" />
                    <span className="flex-1">{label}</span>
                    <ArrowUpRight className="w-3 h-3 text-gray-300 group-hover:text-gray-500" />
                  </Link>
                ))}
              </div>
            </div>
          </aside>

          {/* 본문 */}
          <main className="flex-1 min-w-0">
            <div className="bg-white rounded-2xl ring-1 ring-gray-200 shadow-sm">
              {/* 섹션 헤더 */}
              <div className="flex items-center gap-4 px-8 py-6 border-b border-gray-100">
                <div className="w-10 h-10 rounded-xl bg-blue-50 ring-1 ring-blue-100 flex items-center justify-center flex-shrink-0">
                  <ActiveIcon className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{active.title}</h2>
                  {active.role === 'center' && (
                    <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium ring-1 ring-blue-200">
                      센터 전용 기능
                    </span>
                  )}
                </div>
              </div>

              {/* 콘텐츠 */}
              <div className="px-8 py-6">
                {active.blocks.map((block, i) => renderBlock(block, i))}
              </div>
            </div>

            {/* 하단 네비게이션 */}
            <div className="mt-4 flex items-center justify-between bg-white rounded-2xl ring-1 ring-gray-200 shadow-sm px-6 py-3.5">
              <p className="text-xs text-gray-400">
                마지막 업데이트: 2026-06-14 · 기능 추가 시 자동 갱신
              </p>
              <div className="flex gap-2">
                {activeIdx > 0 && (
                  <button
                    onClick={() => setActiveId(visibleSections[activeIdx - 1].id)}
                    className="flex items-center gap-1.5 text-xs text-gray-500 border border-gray-200 rounded-xl px-3.5 py-2 hover:bg-gray-50 transition-colors"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    이전
                  </button>
                )}
                {activeIdx < visibleSections.length - 1 && (
                  <button
                    onClick={() => setActiveId(visibleSections[activeIdx + 1].id)}
                    className="flex items-center gap-1.5 text-xs text-blue-600 border border-blue-200 rounded-xl px-3.5 py-2 hover:bg-blue-50 transition-colors"
                  >
                    다음
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </main>
        </div>
      )}
    </div>
  )
}
