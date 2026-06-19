"""
EUM 플랫폼 NIA 품질 리포트 PDF 생성기
Usage: python scripts/quality_report.py [--dataset DATASET_ID] [--out OUTPUT.pdf]
"""
import sys
import os
import argparse
from datetime import datetime
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')

# .env.local 로드
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / '.env.local')

from supabase import create_client
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, KeepTogether,
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# --- 폰트 등록 (맑은 고딕 없으면 기본 폰트 사용) --------------------------------

def register_font():
    font_paths = [
        r'C:\Windows\Fonts\malgun.ttf',           # 맑은 고딕
        r'C:\Windows\Fonts\NanumGothic.ttf',
        '/usr/share/fonts/truetype/nanum/NanumGothic.ttf',
    ]
    for fp in font_paths:
        if os.path.exists(fp):
            try:
                pdfmetrics.registerFont(TTFont('KorFont', fp))
                return 'KorFont'
            except Exception:
                continue
    return 'Helvetica'

FONT = register_font()

# --- NIA 9대 특성 정의 -------------------------------------------------------

NIA_TRAITS = [
    ('readiness',           '준비성',         '데이터 수집 계획·기준·수집 환경 준비'),
    ('completeness',        '완전성',         '필수 데이터 항목 결측치 없음'),
    ('usefulness',          '유용성',         '목적 부합, 활용 가능성'),
    ('standardConformance', '기준 적합성',    '국가 표준·법령 준수'),
    ('diversity',           '다양성',         '클래스·속성·환경 다양성'),
    ('semanticAccuracy',    '의미 정확성',    '레이블·값의 의미 정확도'),
    ('syntacticAccuracy',   '구문 정확성',    '형식·범위·타입 정확도'),
    ('algorithmicAdequacy', '알고리즘 적정성', '학습 알고리즘 적합성'),
    ('validity',            '유효성',         '전체 품질 종합 유효성'),
]

TRAIT_KEY_TO_IDX = {t[0]: i for i, t in enumerate(NIA_TRAITS)}

# --- Supabase 데이터 조회 ----------------------------------------------------

def fetch_latest_results(sb, dataset_id=None):
    q = sb.table('quality_results').select('*').order('ran_at', desc=True)
    if dataset_id:
        q = q.eq('dataset_id', dataset_id)
    data = q.limit(20).execute()
    return data.data or []

def fetch_checklist(sb, dataset_id):
    if not dataset_id:
        return []
    data = (
        sb.table('quality_checklist_state')
        .select('checked_ids')
        .eq('dataset_id', dataset_id)
        .maybe_single()
        .execute()
    )
    return data.data.get('checked_ids', []) if data.data else []

# --- NIA 점수 집계 (buildNIASignals 동등 로직) --------------------------------

def build_nia_signals(results):
    agg = {}  # trait -> {violations, checked}
    for r in results:
        rule_count = r.get('rule_count', 0)
        checked_total = r.get('checked', 0)
        per_rule = checked_total / rule_count if rule_count > 0 else 0
        for d in (r.get('detail') or []):
            trait = d.get('niaTrait')
            if not trait:
                continue
            if trait not in agg:
                agg[trait] = {'violations': 0, 'checked': 0}
            agg[trait]['violations'] += d.get('violations', 0)
            agg[trait]['checked'] += max(1, round(per_rule))

    signals = []
    for key, label, desc in NIA_TRAITS:
        v = agg.get(key)
        if v is None:
            signals.append({
                'key': key, 'label': label, 'desc': desc,
                'score': -1, 'violations': 0, 'checked': 0,
            })
        else:
            score = (
                max(0, (1 - v['violations'] / max(1, v['checked'])) * 100)
                if v['checked'] > 0 else 100
            )
            signals.append({
                'key': key, 'label': label, 'desc': desc,
                'score': round(score, 2),
                'violations': v['violations'],
                'checked': v['checked'],
            })
    return signals

# --- 색상 헬퍼 ---------------------------------------------------------------

def score_color(score):
    if score < 0:    return colors.HexColor('#94a3b8')  # 미측정 -- 회색
    if score >= 99:  return colors.HexColor('#10b981')  # 통과   -- 초록
    if score >= 90:  return colors.HexColor('#f59e0b')  # 경고   -- 노랑
    return colors.HexColor('#ef4444')                   # 위반   -- 빨강

# --- 1-Cycle 체크리스트 인라인 데이터 ----------------------------------------

ONE_CYCLE_CHECKPOINTS = [
    {'phase': 'sample',     'label': '샘플 점검', 'progress': '착수',  'items': [
        {'id': 'sc-1', 'required': True},  {'id': 'sc-2', 'required': True},
        {'id': 'sc-3', 'required': True},  {'id': 'sc-4', 'required': False},
    ]},
    {'phase': 'initial',    'label': '초기 점검', 'progress': '5~10%', 'items': [
        {'id': 'ic-1', 'required': True},  {'id': 'ic-2', 'required': True},
        {'id': 'ic-3', 'required': True},  {'id': 'ic-4', 'required': False},
    ]},
    {'phase': 'midterm',    'label': '중간 점검', 'progress': '30%',   'items': [
        {'id': 'mc-1', 'required': True},  {'id': 'mc-2', 'required': True},
        {'id': 'mc-3', 'required': True},  {'id': 'mc-4', 'required': False},
        {'id': 'mc-5', 'required': False},
    ]},
    {'phase': 'supplement', 'label': '보완 점검', 'progress': '50%',   'items': [
        {'id': 'sp-1', 'required': True},  {'id': 'sp-2', 'required': True},
        {'id': 'sp-3', 'required': False}, {'id': 'sp-4', 'required': False},
    ]},
    {'phase': 'final',      'label': '최종 점검', 'progress': '100%',  'items': [
        {'id': 'fc-1', 'required': True},  {'id': 'fc-2', 'required': True},
        {'id': 'fc-3', 'required': True},  {'id': 'fc-4', 'required': True},
        {'id': 'fc-5', 'required': True},  {'id': 'fc-6', 'required': False},
    ]},
]

# --- PDF 생성 ----------------------------------------------------------------

def build_pdf(output_path, results, nia_signals, checked_ids, dataset_id=None):
    doc = SimpleDocTemplate(
        str(output_path),
        pagesize=A4,
        leftMargin=2*cm, rightMargin=2*cm,
        topMargin=2*cm,  bottomMargin=2*cm,
    )
    W = A4[0] - 4*cm

    h1    = ParagraphStyle('h1',    fontName=FONT, fontSize=16, spaceAfter=6,
                           textColor=colors.HexColor('#1e293b'))
    h2    = ParagraphStyle('h2',    fontName=FONT, fontSize=12, spaceAfter=4,
                           textColor=colors.HexColor('#334155'), spaceBefore=12)
    small = ParagraphStyle('small', fontName=FONT, fontSize=8,
                           textColor=colors.HexColor('#94a3b8'))

    story = []

    # -- 표지 헤더 --
    story.append(Paragraph('NIA AI 데이터 품질 리포트', h1))
    story.append(Paragraph(
        f'생성일시: {datetime.now().strftime("%Y-%m-%d %H:%M")}   |   '
        f'데이터셋: {dataset_id or "전체"}',
        small,
    ))
    story.append(HRFlowable(width=W, thickness=1,
                            color=colors.HexColor('#e2e8f0'), spaceAfter=12))

    # -- 요약 카드 --
    total = len(results)
    passed = sum(1 for r in results if r.get('passed'))
    avg_err = sum(r.get('error_rate', 0) for r in results) / max(1, total)
    summary_data = [
        ['검사 데이터셋', f'{passed}/{total}'],
        ['평균 오류율',   f'{avg_err:.4f}%'],
        ['통과율',        f'{round(passed / max(1, total) * 100)}%'],
    ]
    summary_table = Table(summary_data, colWidths=[W*0.4, W*0.6])
    summary_table.setStyle(TableStyle([
        ('FONTNAME',       (0, 0), (-1, -1), FONT),
        ('FONTSIZE',       (0, 0), (-1, -1), 9),
        ('BACKGROUND',     (0, 0), (0, -1),  colors.HexColor('#f8fafc')),
        ('TEXTCOLOR',      (0, 0), (0, -1),  colors.HexColor('#64748b')),
        ('FONTSIZE',       (1, 0), (1, -1),  11),
        ('ALIGN',          (1, 0), (1, -1),  'RIGHT'),
        ('GRID',           (0, 0), (-1, -1), 0.5, colors.HexColor('#e2e8f0')),
        ('ROWBACKGROUNDS', (0, 0), (-1, -1), [colors.white, colors.HexColor('#f8fafc')]),
        ('TOPPADDING',     (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING',  (0, 0), (-1, -1), 5),
    ]))
    story.append(summary_table)
    story.append(Spacer(1, 0.5*cm))

    # -- NIA 9대 특성 점수표 --
    story.append(Paragraph(
        'NIA AI 데이터 품질관리 가이드라인 v4.0 — 9대 품질 특성', h2,
    ))
    nia_header = ['#', '특성명', '점수', '위반건수', '검사건수', '설명']
    nia_rows = [nia_header]
    for i, sig in enumerate(nia_signals, 1):
        score_str = f'{sig["score"]:.2f}%' if sig['score'] >= 0 else '미측정'
        nia_rows.append([
            str(i),
            sig['label'],
            score_str,
            f'{sig["violations"]:,}' if sig['score'] >= 0 else '-',
            f'{sig["checked"]:,}'    if sig['score'] >= 0 else '-',
            sig['desc'],
        ])
    nia_table = Table(
        nia_rows,
        colWidths=[W*0.05, W*0.15, W*0.1, W*0.1, W*0.1, W*0.5],
    )
    nia_style = [
        ('FONTNAME',       (0, 0), (-1, -1), FONT),
        ('FONTSIZE',       (0, 0), (-1, -1), 8),
        ('BACKGROUND',     (0, 0), (-1,  0), colors.HexColor('#1e293b')),
        ('TEXTCOLOR',      (0, 0), (-1,  0), colors.white),
        ('ALIGN',          (2, 0), (4, -1),  'RIGHT'),
        ('GRID',           (0, 0), (-1, -1), 0.3, colors.HexColor('#e2e8f0')),
        ('TOPPADDING',     (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING',  (0, 0), (-1, -1), 4),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8fafc')]),
    ]
    for i, sig in enumerate(nia_signals, 1):
        c = score_color(sig['score'])
        nia_style.append(('TEXTCOLOR', (2, i), (2, i), c))
    nia_table.setStyle(TableStyle(nia_style))
    story.append(nia_table)
    story.append(Spacer(1, 0.5*cm))

    # -- 위반 상세 (최대 20건) --
    all_violations = []
    for r in results:
        for d in (r.get('detail') or []):
            if d.get('violations', 0) > 0:
                all_violations.append({
                    'table':      r.get('table', ''),
                    'rule':       d.get('rule', ''),
                    'violations': d['violations'],
                    'niaTrait':   d.get('niaTrait', '-'),
                })
    all_violations.sort(key=lambda x: x['violations'], reverse=True)

    if all_violations:
        story.append(Paragraph('위반 상세 (상위 20건)', h2))
        viol_header = ['테이블', '규칙명', 'NIA 특성', '위반건수']
        viol_rows = [viol_header] + [
            [
                v['table'],
                v['rule'][:40],
                v['niaTrait'],
                f'{v["violations"]:,}',
            ]
            for v in all_violations[:20]
        ]
        viol_table = Table(
            viol_rows,
            colWidths=[W*0.2, W*0.45, W*0.2, W*0.15],
        )
        viol_table.setStyle(TableStyle([
            ('FONTNAME',       (0, 0), (-1, -1), FONT),
            ('FONTSIZE',       (0, 0), (-1, -1), 8),
            ('BACKGROUND',     (0, 0), (-1,  0), colors.HexColor('#1e293b')),
            ('TEXTCOLOR',      (0, 0), (-1,  0), colors.white),
            ('ALIGN',          (3, 0), (3, -1),  'RIGHT'),
            ('TEXTCOLOR',      (3, 1), (3, -1),  colors.HexColor('#ef4444')),
            ('GRID',           (0, 0), (-1, -1), 0.3, colors.HexColor('#e2e8f0')),
            ('TOPPADDING',     (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING',  (0, 0), (-1, -1), 4),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8fafc')]),
        ]))
        story.append(viol_table)
        story.append(Spacer(1, 0.5*cm))

    # -- 1-Cycle 체크리스트 현황 --
    story.append(Paragraph('1-Cycle 자가점검 체크리스트 현황', h2))
    checked_set = set(checked_ids)
    cycle_data = [['단계', '수집 진행률', '항목수', '필수 완료', '전체 완료']]
    for cp in ONE_CYCLE_CHECKPOINTS:
        required = [item for item in cp['items'] if item['required']]
        req_done = sum(1 for item in required if item['id'] in checked_set)
        all_done = sum(1 for item in cp['items'] if item['id'] in checked_set)
        cycle_data.append([
            cp['label'],
            cp['progress'],
            str(len(cp['items'])),
            f'{req_done}/{len(required)}',
            f'{all_done}/{len(cp["items"])}',
        ])
    cycle_table = Table(
        cycle_data,
        colWidths=[W*0.2, W*0.15, W*0.1, W*0.2, W*0.2],
    )
    cycle_table.setStyle(TableStyle([
        ('FONTNAME',       (0, 0), (-1, -1), FONT),
        ('FONTSIZE',       (0, 0), (-1, -1), 8),
        ('BACKGROUND',     (0, 0), (-1,  0), colors.HexColor('#1e293b')),
        ('TEXTCOLOR',      (0, 0), (-1,  0), colors.white),
        ('ALIGN',          (2, 0), (-1, -1), 'CENTER'),
        ('GRID',           (0, 0), (-1, -1), 0.3, colors.HexColor('#e2e8f0')),
        ('TOPPADDING',     (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING',  (0, 0), (-1, -1), 4),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8fafc')]),
    ]))
    story.append(cycle_table)

    doc.build(story)
    print(f'PDF 생성 완료: {output_path}')

# --- 메인 -------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description='NIA 품질 리포트 PDF 생성')
    parser.add_argument('--dataset', default=None, help='특정 dataset_id만 포함')
    parser.add_argument('--out', default='quality_report.pdf', help='출력 파일명')
    args = parser.parse_args()

    url = os.getenv('NEXT_PUBLIC_SUPABASE_URL')
    key = os.getenv('SUPABASE_SERVICE_KEY') or os.getenv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
    if not url or not key:
        print(
            '오류: NEXT_PUBLIC_SUPABASE_URL 또는 Supabase 키가 .env.local에 없습니다',
            file=sys.stderr,
        )
        sys.exit(1)

    sb = create_client(url, key)
    print('Supabase 연결 완료')

    results = fetch_latest_results(sb, args.dataset)
    if not results:
        print('품질 검사 결과가 없습니다.')
        sys.exit(0)

    nia_signals = build_nia_signals(results)
    checked_ids = fetch_checklist(sb, args.dataset) if args.dataset else []

    out = Path(args.out)
    build_pdf(out, results, nia_signals, checked_ids, args.dataset)


if __name__ == '__main__':
    main()
