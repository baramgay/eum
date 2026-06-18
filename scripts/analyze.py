#!/usr/bin/env python3
"""EUM 통합 통계 분석 엔진 — Next.js API에서 subprocess로 호출.

stdin: JSON { action, session_id, ... }
stdout: JSON result
"""
import sys
import json
import os
import tempfile
import traceback
import math

# ────────────────────────────────────────────
# JSON 직렬화용 NaN/Inf 정리
# ────────────────────────────────────────────

def _sanitize_json(obj):
    """pandas/JSON에서 발생하는 NaN, Inf, -Inf를 None으로 치환."""
    if isinstance(obj, dict):
        return {k: _sanitize_json(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize_json(v) for v in obj]
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    return obj


# ────────────────────────────────────────────
# 세션 파일 경로
# ────────────────────────────────────────────

def _session_path(session_id: str) -> str:
    return os.path.join(tempfile.gettempdir(), f"eum_session_{session_id}.json")


def _save_session(session_id: str, rows: list, column_types: dict):
    path = _session_path(session_id)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(
            _sanitize_json({"rows": rows, "column_types": column_types}),
            f,
            ensure_ascii=False,
            default=str,
            allow_nan=False,
        )


def _load_df(session_id: str):
    import pandas as pd
    path = _session_path(session_id)
    if not os.path.exists(path):
        raise FileNotFoundError(f"세션 없음: {session_id}")
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    df = pd.DataFrame(data["rows"])
    for col, ctype in data.get("column_types", {}).items():
        if col in df.columns and ctype == "scale":
            df[col] = pd.to_numeric(df[col], errors="coerce")
    return df


# ────────────────────────────────────────────
# 파일 파싱 (업로드 / 카탈로그 JSON)
# ────────────────────────────────────────────

def action_parse(config: dict) -> dict:
    """파일 경로를 읽어 session 생성 후 columns + preview 반환."""
    import pandas as pd

    session_id = config["session_id"]
    file_path  = config.get("file_path")
    raw_json   = config.get("raw_json")          # 카탈로그 JSON 직접 전달

    if raw_json is not None:
        df = pd.DataFrame(raw_json)
    elif file_path:
        ext = os.path.splitext(file_path)[1].lower()
        if ext in (".xlsx", ".xls"):
            df = pd.read_excel(file_path, dtype=str, nrows=50_000)
        elif ext == ".csv":
            for enc in ("utf-8-sig", "utf-8", "cp949", "euc-kr"):
                try:
                    df = pd.read_csv(file_path, dtype=str, encoding=enc, nrows=50_000)
                    break
                except UnicodeDecodeError:
                    continue
            else:
                df = pd.read_csv(file_path, dtype=str, encoding="latin1", nrows=50_000)
        else:
            raise ValueError(f"지원하지 않는 파일 형식: {ext}")
    else:
        raise ValueError("file_path 또는 raw_json 필요")

    # 자동 타입 추론
    column_types: dict[str, str] = {}
    for col in df.columns:
        num = pd.to_numeric(df[col], errors="coerce")
        n_valid = num.notna().sum()
        n_total = len(df)
        unique_ratio = df[col].nunique() / max(n_total, 1)
        if n_valid / max(n_total, 1) >= 0.7:
            column_types[col] = "scale"
        elif unique_ratio < 0.05:
            column_types[col] = "nominal"
        else:
            column_types[col] = "nominal"

    rows = df.to_dict("records")
    _save_session(session_id, rows, column_types)

    # 범주형 컬럼의 고유값 미리 수집 (UI에서 범주 선택용)
    column_values: dict[str, list] = {}
    for col in df.columns:
        if column_types.get(col) in ("nominal", "ordinal"):
            vals = df[col].dropna().unique().tolist()
            column_values[col] = _sanitize_json(vals[:200])

    return {
        "ok": True,
        "session_id": session_id,
        "total_rows": len(rows),
        "columns": list(df.columns),
        "column_types": column_types,
        "column_values": column_values,
        "preview": rows[:50],
    }


def action_update_types(config: dict) -> dict:
    """column_types 갱신 (세션 파일 업데이트)."""
    session_id = config["session_id"]
    new_types  = config["column_types"]
    path = _session_path(session_id)
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    data["column_types"].update(new_types)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(_sanitize_json(data), f, ensure_ascii=False, default=str, allow_nan=False)
    return {"ok": True}


def _apply_level_filters(df, variables: dict):
    """level_values에 따라 범주형 변수의 선택된 레벨만 남긴 DataFrame 반환."""
    level_values = variables.get("level_values") or {}
    for col, levels in level_values.items():
        if col not in df.columns or not levels:
            continue
        df = df[df[col].astype(str).isin([str(v) for v in levels])]
    return df.copy()


# ────────────────────────────────────────────
# 분석 함수들
# ────────────────────────────────────────────

def run_descriptives(df, variables: dict, options: dict) -> dict:
    import pandas as pd
    cols = variables.get("variables", [])
    if not cols:
        return {"error": "분석 변수를 선택하세요."}
    rows = []
    for col in cols:
        if col not in df.columns:
            continue
        s = pd.to_numeric(df[col], errors="coerce").dropna()
        n = len(s)
        if n == 0:
            rows.append([col, 0] + ["-"] * 9)
            continue
        rows.append([
            col, n,
            round(float(s.mean()), 4),
            round(float(s.std()), 4),
            round(float(s.min()), 4),
            round(float(s.quantile(0.25)), 4),
            round(float(s.median()), 4),
            round(float(s.quantile(0.75)), 4),
            round(float(s.max()), 4),
            round(float(s.skew()), 4),
            round(float(s.kurtosis()), 4),
        ])
    # 시각화용 막대 데이터
    bar_data = []
    for row in rows:
        if len(row) >= 3 and isinstance(row[2], (int, float)):
            bar_data.append({"name": row[0], "평균": row[2]})

    return {
        "title": "기술통계",
        "tables": [{
            "title": "기술통계량",
            "headers": ["변수", "N", "평균", "표준편차", "최솟값", "Q1", "중앙값", "Q3", "최댓값", "왜도", "첨도"],
            "rows": rows,
        }],
        "charts": [
            {
                "type": "bar",
                "title": "변수별 평균",
                "data": bar_data,
                "xKey": "name",
                "yKey": "평균",
            }
        ] if bar_data else [],
    }


def run_frequencies(df, variables: dict, options: dict) -> dict:
    import pandas as pd
    cols = variables.get("variables", [])
    if not cols:
        return {"error": "분석 변수를 선택하세요."}
    tables = []
    charts = []
    for col in cols:
        if col not in df.columns:
            continue
        vc = df[col].value_counts(dropna=False).reset_index()
        vc.columns = ["값", "빈도"]
        total = int(vc["빈도"].sum())
        vc["백분율(%)"] = (vc["빈도"] / total * 100).round(2)
        vc["누적(%)"]  = vc["백분율(%)"].cumsum().round(2)
        rows = [
            [str(r["값"]), int(r["빈도"]), float(r["백분율(%)"]), float(r["누적(%)"])]
            for _, r in vc.iterrows()
        ]
        rows.append(["합계", total, 100.00, ""])
        tables.append({
            "title": f"{col} — 빈도표",
            "headers": ["값", "빈도", "백분율(%)", "누적(%)"],
            "rows": rows,
        })
        # 시각화: 상위 20개 범주 막대 + 파이 차트
        plot_vc = vc.head(20)
        bar_data = [
            {"name": str(r["값"]), "빈도": int(r["빈도"])}
            for _, r in plot_vc.iterrows()
        ]
        pie_data = [
            {"name": str(r["값"]), "value": int(r["빈도"])}
            for _, r in plot_vc.iterrows()
        ]
        charts.append({
            "type": "bar",
            "title": f"{col} — 빈도 (상위 20개)",
            "data": bar_data,
            "xKey": "name",
            "yKey": "빈도",
        })
        charts.append({
            "type": "pie",
            "title": f"{col} — 비율 (상위 20개)",
            "data": pie_data,
            "xKey": "name",
            "yKey": "value",
        })
    return {"title": "빈도 분석", "tables": tables, "charts": charts}


def run_normality(df, variables: dict, options: dict) -> dict:
    import pandas as pd
    from scipy import stats
    cols = variables.get("variables", [])
    if not cols:
        return {"error": "분석 변수를 선택하세요."}
    rows = []
    for col in cols:
        if col not in df.columns:
            continue
        s = pd.to_numeric(df[col], errors="coerce").dropna()
        n = len(s)
        if n < 3:
            rows.append([col, n, "-", "-", "-", "판정 불가(n<3)"])
            continue
        if n <= 5000:
            stat, p = stats.shapiro(s)
            method = "Shapiro-Wilk"
        else:
            z = (s - s.mean()) / s.std()
            stat, p = stats.kstest(z, "norm")
            method = "Kolmogorov-Smirnov"
        rows.append([col, n, method, round(float(stat), 4), round(float(p), 4),
                     "정규" if p > 0.05 else "비정규"])
    return {
        "title": "정규성 검정",
        "tables": [{
            "title": "Shapiro-Wilk / KS 정규성 검정",
            "headers": ["변수", "N", "검정 방법", "통계량", "p값", "판정(α=0.05)"],
            "rows": rows,
            "footnotes": ["* p < 0.05: 정규분포 기각", "N > 5,000 이면 KS 검정 사용"],
        }],
    }


def run_crosstab(df, variables: dict, options: dict) -> dict:
    import pandas as pd
    import numpy as np
    from scipy import stats

    df = _apply_level_filters(df, variables)

    row_var = (variables.get("row") or [None])[0]
    col_var = (variables.get("column") or [None])[0]
    if not row_var or not col_var:
        return {"error": "행 변수와 열 변수를 모두 선택하세요."}
    if row_var not in df.columns or col_var not in df.columns:
        return {"error": "선택한 변수가 데이터에 없습니다."}

    ct = pd.crosstab(df[row_var], df[col_var], margins=True, margins_name="합계")
    ct_nm = pd.crosstab(df[row_var], df[col_var])

    headers = [f"{row_var} \\ {col_var}"] + [str(c) for c in ct.columns]
    rows = [[str(idx)] + [int(v) if hasattr(v, "__int__") else v for v in row]
            for idx, row in zip(ct.index, ct.values)]

    try:
        chi2, p, dof, _ = stats.chi2_contingency(ct_nm)
        n = ct_nm.values.sum()
        k = min(ct_nm.shape) - 1
        cv = float(np.sqrt(chi2 / (n * k))) if n * k > 0 else 0
        chi2_rows = [
            ["피어슨 카이제곱", round(float(chi2), 4), int(dof), round(float(p), 4)],
            ["Cramér's V", round(cv, 4), "-", "-"],
        ]
        footnotes = ["* p < 0.05: 유의한 연관성"]
    except Exception as e:
        chi2_rows, footnotes = [], [str(e)]

    # 시각화용 히트맵 데이터
    heatmap_data = []
    for i, (row_name, row) in enumerate(ct_nm.iterrows()):
        for col_name in ct_nm.columns:
            heatmap_data.append({
                "x": str(row_name),
                "y": str(col_name),
                "value": int(row[col_name]),
            })

    return {
        "title": "교차 분석",
        "tables": [
            {"title": f"{row_var} × {col_var} 교차표", "headers": headers, "rows": rows},
            {"title": "카이제곱 검정", "headers": ["통계량", "값", "자유도", "p값"],
             "rows": chi2_rows, "footnotes": footnotes},
        ],
        "charts": [
            {
                "type": "heatmap",
                "title": "교차표 빈도 히트맵",
                "data": heatmap_data,
                "xKey": "x",
                "yKey": "y",
                "valueKey": "value",
            }
        ] if heatmap_data else [],
    }


def run_correlation(df, variables: dict, options: dict) -> dict:
    import pandas as pd
    from scipy import stats

    cols   = variables.get("variables", [])
    method = options.get("method", "pearson")
    if len(cols) < 2:
        return {"error": "상관 분석에는 2개 이상의 변수가 필요합니다."}

    data = df[cols].apply(pd.to_numeric, errors="coerce").dropna()
    n    = len(data)
    if n < 3:
        return {"error": f"유효 관측치 부족(n={n})"}

    fn = stats.pearsonr if method == "pearson" else stats.spearmanr
    label = "피어슨(Pearson)" if method == "pearson" else "스피어만(Spearman)"

    # 상삼각 행렬
    corr_rows = []
    for i, ci in enumerate(cols):
        row = [ci]
        for j, cj in enumerate(cols):
            if i == j:
                row.append("1.0000")
            elif j < i:
                row.append("")
            else:
                r, p = fn(data[ci], data[cj])
                sig = "**" if p < 0.01 else ("*" if p < 0.05 else "")
                row.append(f"{r:.4f}{sig}")
        corr_rows.append(row)

    # 쌍별 요약
    pair_rows = []
    for i in range(len(cols)):
        for j in range(i + 1, len(cols)):
            r, p = fn(data[cols[i]], data[cols[j]])
            pair_rows.append([
                cols[i], cols[j], round(float(r), 4), round(float(p), 4),
                "**" if p < 0.01 else ("*" if p < 0.05 else "n.s."),
            ])

    # 시각화용 히트맵 데이터 (상삼각만 값, 대각=1, 하단=None)
    heatmap_data = []
    for i, ci in enumerate(cols):
        for j, cj in enumerate(cols):
            if i == j:
                heatmap_data.append({"x": ci, "y": cj, "value": 1.0, "p": None})
            elif j < i:
                heatmap_data.append({"x": ci, "y": cj, "value": None, "p": None})
            else:
                r, p = fn(data[ci], data[cj])
                heatmap_data.append({"x": ci, "y": cj, "value": round(float(r), 4), "p": round(float(p), 4)})

    return {
        "title": f"상관 분석 ({label})",
        "tables": [
            {
                "title": f"{label} 상관계수 행렬 (상삼각)",
                "headers": ["변수"] + cols,
                "rows": corr_rows,
                "footnotes": ["** p<0.01, * p<0.05", f"N = {n}"],
            },
            {
                "title": "쌍별 상관계수",
                "headers": ["변수1", "변수2", "상관계수(r)", "p값", "유의성"],
                "rows": pair_rows,
            },
        ],
        "charts": [
            {
                "type": "heatmap",
                "title": f"{label} 상관계수 히트맵",
                "data": heatmap_data,
                "xKey": "x",
                "yKey": "y",
                "valueKey": "value",
            }
        ],
    }


def run_independent_ttest(df, variables: dict, options: dict) -> dict:
    import pandas as pd
    import numpy as np
    from scipy import stats

    dep_var   = (variables.get("dependent")  or [None])[0]
    group_var = (variables.get("group")      or [None])[0]
    group_values = variables.get("group_values") or []
    if not dep_var or not group_var:
        return {"error": "종속 변수와 집단 변수를 선택하세요."}

    all_groups = df[group_var].dropna().unique()

    # 사용자가 2개 범주를 지정한 경우 해당 범주만 사용
    if group_values and len(group_values) == 2:
        groups = [g for g in all_groups if str(g) in [str(v) for v in group_values]]
        if len(groups) != 2:
            return {"error": f"선택한 범주를 찾을 수 없습니다: {group_values}"}
    elif len(all_groups) == 2:
        groups = all_groups
    else:
        return {"error": f"집단 변수는 정확히 2개 집단이어야 합니다 (현재 {len(all_groups)}개). 2개 범주를 선택하거나 2값 변수를 사용하세요."}

    g1 = pd.to_numeric(df[df[group_var] == groups[0]][dep_var], errors="coerce").dropna()
    g2 = pd.to_numeric(df[df[group_var] == groups[1]][dep_var], errors="coerce").dropna()

    lev_stat, lev_p = stats.levene(g1, g2)
    equal_var = lev_p > 0.05
    t_stat, t_p = stats.ttest_ind(g1, g2, equal_var=equal_var)

    pooled_std = float(np.sqrt((g1.std()**2 + g2.std()**2) / 2))
    cohens_d   = abs(g1.mean() - g2.mean()) / pooled_std if pooled_std > 0 else 0
    mean_diff  = float(g1.mean()) - float(g2.mean())
    se_diff    = float(np.sqrt(g1.var()/len(g1) + g2.var()/len(g2)))
    df_t = len(g1) + len(g2) - 2 if equal_var else (
        (g1.var()/len(g1) + g2.var()/len(g2))**2
        / ((g1.var()/len(g1))**2/(len(g1)-1) + (g2.var()/len(g2))**2/(len(g2)-1))
    )
    t_crit  = stats.t.ppf(0.975, df_t)
    ci_lo   = round(mean_diff - t_crit * se_diff, 4)
    ci_hi   = round(mean_diff + t_crit * se_diff, 4)

    d_label = "소(small)" if cohens_d < 0.5 else ("중(medium)" if cohens_d < 0.8 else "대(large)")

    return {
        "title": "독립표본 t-검정",
        "tables": [
            {
                "title": "집단별 기술통계",
                "headers": ["집단", "N", "평균", "표준편차", "표준오차"],
                "rows": [
                    [str(groups[0]), len(g1), round(float(g1.mean()),4), round(float(g1.std()),4), round(float(g1.sem()),4)],
                    [str(groups[1]), len(g2), round(float(g2.mean()),4), round(float(g2.std()),4), round(float(g2.sem()),4)],
                ],
                "footnotes": [f"비교 대상: {groups[0]} vs {groups[1]}"],
            },
            {
                "title": "독립표본 t-검정 결과",
                "headers": ["검정 방식", "Levene F", "Levene p", "t", "자유도", "p값", "평균차이", "95% CI 하한", "95% CI 상한"],
                "rows": [[
                    "등분산" if equal_var else "Welch",
                    round(float(lev_stat),4), round(float(lev_p),4),
                    round(float(t_stat),4), round(float(df_t),1), round(float(t_p),4),
                    round(mean_diff,4), ci_lo, ci_hi,
                ]],
                "footnotes": [
                    f"Levene p={lev_p:.4f} → {'등분산 가정' if equal_var else 'Welch 보정 사용'}",
                    f"Cohen's d = {cohens_d:.4f} ({d_label})",
                ],
            },
        ],
    }


def run_paired_ttest(df, variables: dict, options: dict) -> dict:
    import pandas as pd
    import numpy as np
    from scipy import stats

    v1 = (variables.get("variable1") or [None])[0]
    v2 = (variables.get("variable2") or [None])[0]
    if not v1 or not v2:
        return {"error": "두 변수를 선택하세요."}
    if v1 == v2:
        return {"error": "서로 다른 두 변수를 선택해야 합니다."}

    s1 = pd.to_numeric(df[v1], errors="coerce").dropna()
    s2 = pd.to_numeric(df[v2], errors="coerce").dropna()

    # 공통 관측치만 사용 (대응표본)
    valid_idx = s1.index.intersection(s2.index)
    x1 = s1.loc[valid_idx]
    x2 = s2.loc[valid_idx]
    n = len(valid_idx)
    if n < 3:
        return {"error": f"대응된 유효 쌍이 3개 이상 필요합니다 (현재 {n}개)."}

    diff = x1 - x2
    t_stat, t_p = stats.ttest_rel(x1, x2)
    mean_diff = float(diff.mean())
    se_diff   = float(diff.std(ddof=1) / np.sqrt(n))
    t_crit    = stats.t.ppf(0.975, n - 1)
    ci_lo     = round(mean_diff - t_crit * se_diff, 4)
    ci_hi     = round(mean_diff + t_crit * se_diff, 4)

    # Cohen's d for paired (평균 차이 / 차이의 표준편차)
    cohens_d = abs(mean_diff) / float(diff.std(ddof=1)) if diff.std(ddof=1) > 0 else 0
    d_label = "소(small)" if cohens_d < 0.2 else ("중(medium)" if cohens_d < 0.5 else "대(large)")

    return {
        "title": "대응표본 t-검정",
        "tables": [
            {
                "title": "변수별 기술통계",
                "headers": ["변수", "N(쌍)", "평균", "표준편차"],
                "rows": [
                    [str(v1), n, round(float(x1.mean()), 4), round(float(x1.std()), 4)],
                    [str(v2), n, round(float(x2.mean()), 4), round(float(x2.std()), 4)],
                ],
            },
            {
                "title": "대응표본 t-검정 결과",
                "headers": ["t", "자유도", "p값", "평균차이", "95% CI 하한", "95% CI 상한"],
                "rows": [[
                    round(float(t_stat), 4), n - 1, round(float(t_p), 4),
                    round(mean_diff, 4), ci_lo, ci_hi,
                ]],
                "footnotes": [
                    f"Cohen's d = {cohens_d:.4f} ({d_label})",
                    f"차이 평균 = {mean_diff:.4f}, 차이 표준편차 = {float(diff.std(ddof=1)):.4f}",
                ],
            },
        ],
    }


def run_one_way_anova(df, variables: dict, options: dict) -> dict:
    import pandas as pd
    import numpy as np
    from scipy import stats

    df = _apply_level_filters(df, variables)

    dep_var    = (variables.get("dependent") or [None])[0]
    factor_var = (variables.get("factor")    or [None])[0]
    if not dep_var or not factor_var:
        return {"error": "종속 변수와 요인 변수를 선택하세요."}

    group_names = sorted(df[factor_var].dropna().unique(), key=str)
    if len(group_names) < 2:
        return {"error": "요인 변수에 2개 이상의 집단이 필요합니다."}

    groups_data = [pd.to_numeric(df[df[factor_var] == g][dep_var], errors="coerce").dropna()
                   for g in group_names]
    f_stat, p_val = stats.f_oneway(*groups_data)

    N           = sum(len(g) for g in groups_data)
    k           = len(groups_data)
    all_vals    = pd.to_numeric(df[dep_var], errors="coerce").dropna()
    grand_mean  = all_vals.mean()
    ss_between  = float(sum(len(g) * (g.mean() - grand_mean)**2 for g in groups_data))
    ss_within   = float(sum(((g - g.mean())**2).sum() for g in groups_data))
    ss_total    = ss_between + ss_within
    df_b, df_w  = k - 1, N - k
    ms_between  = ss_between / df_b
    ms_within   = ss_within  / df_w
    eta_sq      = ss_between / ss_total if ss_total > 0 else 0
    d_label     = "소" if eta_sq < 0.06 else ("중" if eta_sq < 0.14 else "대")

    desc_rows = [[str(g), len(gd), round(float(gd.mean()),4), round(float(gd.std()),4)]
                 for g, gd in zip(group_names, groups_data)]

    anova_rows = [
        ["집단 간(Between)", round(ss_between,4), df_b, round(ms_between,4), round(float(f_stat),4), round(float(p_val),4), round(eta_sq,4)],
        ["집단 내(Within)",  round(ss_within,4),  df_w, round(ms_within,4),  "",                    "",                    ""],
        ["전체(Total)",      round(ss_total,4),   N-1,  "",                  "",                    "",                    ""],
    ]

    tables = [
        {"title": "집단별 기술통계", "headers": ["집단", "N", "평균", "표준편차"], "rows": desc_rows},
        {"title": "분산분석표(ANOVA)",
         "headers": ["소스", "제곱합(SS)", "자유도(df)", "평균제곱(MS)", "F", "p값", "η²"],
         "rows": anova_rows,
         "footnotes": [f"η² = {eta_sq:.4f} ({d_label} 효과크기)"]},
    ]

    if p_val < 0.05:
        try:
            from statsmodels.stats.multicomp import pairwise_tukeyhsd
            vals_all = np.concatenate([g.values for g in groups_data])
            labs_all = np.concatenate([[str(gn)] * len(g) for gn, g in zip(group_names, groups_data)])
            tukey    = pairwise_tukeyhsd(vals_all, labs_all)
            td       = tukey._results_table.data
            th_rows  = [[str(r[0]), str(r[1]), round(float(r[2]),4), round(float(r[3]),4),
                         "유의" if r[5] else "n.s."]
                        for r in td[1:]]
            tables.append({
                "title": "Tukey HSD 사후 검정",
                "headers": ["집단1", "집단2", "평균차이", "p-adj", "판정(α=0.05)"],
                "rows": th_rows,
            })
        except Exception:
            pass

    # 시각화: 집단별 평균 막대 차트
    bar_data = [{"name": str(g), "평균": round(float(gd.mean()), 4)}
                for g, gd in zip(group_names, groups_data)]

    return {
        "title": "일원분산분석(One-Way ANOVA)",
        "tables": tables,
        "charts": [
            {
                "type": "bar",
                "title": f"{factor_var} 집단별 {dep_var} 평균",
                "data": bar_data,
                "xKey": "name",
                "yKey": "평균",
            }
        ] if bar_data else [],
    }


def run_linear_regression(df, variables: dict, options: dict) -> dict:
    import pandas as pd
    import numpy as np

    dep_var   = (variables.get("dependent")  or [None])[0]
    pred_vars = variables.get("predictors") or []
    if not dep_var or not pred_vars:
        return {"error": "종속 변수와 예측 변수를 선택하세요."}

    data = df[[dep_var] + pred_vars].apply(pd.to_numeric, errors="coerce").dropna()
    n    = len(data)
    if n < len(pred_vars) + 2:
        return {"error": f"관측치({n})가 너무 적습니다(최소 {len(pred_vars)+2}개 필요)."}

    try:
        import statsmodels.api as sm
        from statsmodels.stats.outliers_influence import variance_inflation_factor

        X = sm.add_constant(data[pred_vars])
        y = data[dep_var]
        model = sm.OLS(y, X).fit()

        model_rows = [
            ["R²",       round(float(model.rsquared),     4), "", "", "", ""],
            ["수정 R²",   round(float(model.rsquared_adj), 4), "", "", "", ""],
            ["F통계량",   round(float(model.fvalue),       4), "", round(float(model.f_pvalue), 4), "", ""],
            ["N",         n,                                   "", "", "", ""],
        ]

        coef_rows = []
        for name, b, se, t, p in zip(
            model.params.index, model.params, model.bse, model.tvalues, model.pvalues
        ):
            sig = "***" if p < 0.001 else ("**" if p < 0.01 else ("*" if p < 0.05 else ""))
            coef_rows.append([name, round(float(b),4), round(float(se),4), round(float(t),4), round(float(p),4), sig])

        if len(pred_vars) == 1:
            vif_rows = [[pred_vars[0], 1.0, "양호"]]
        else:
            X_arr = sm.add_constant(data[pred_vars]).values.astype(float)
            vif_rows = [[col, round(float(variance_inflation_factor(X_arr, i + 1)), 4),
                         "문제" if variance_inflation_factor(X_arr, i + 1) > 10
                         else ("경계" if variance_inflation_factor(X_arr, i + 1) > 5 else "양호")]
                        for i, col in enumerate(pred_vars)]

        # 잔차·예측값 테이블 + 시각화 데이터
        fitted = model.fittedvalues
        resid  = model.resid
        resid_rows = []
        scatter_data = []
        for i, (idx, y_real, y_hat, r) in enumerate(zip(data.index, y, fitted, resid)):
            resid_rows.append([
                idx if isinstance(idx, (int, str)) else i,
                round(float(y_real), 4), round(float(y_hat), 4), round(float(r), 4)
            ])
            scatter_data.append({
                "index": i,
                "실제값": round(float(y_real), 4),
                "예측값": round(float(y_hat), 4),
                "잔차": round(float(r), 4),
            })
            if i >= 199:
                break

        # 단순회귀일 때 회귀직선 데이터
        line_data = []
        if len(pred_vars) == 1:
            x = data[pred_vars[0]]
            x_min, x_max = float(x.min()), float(x.max())
            slope = float(model.params[pred_vars[0]])
            intercept = float(model.params["const"])
            line_data = [
                {"x": x_min, "회귀직선": round(intercept + slope * x_min, 4)},
                {"x": x_max, "회귀직선": round(intercept + slope * x_max, 4)},
            ]

        return {
            "title": "선형 회귀분석",
            "tables": [
                {"title": "모델 요약",
                 "headers": ["지표", "값", "", "", "", ""], "rows": model_rows},
                {"title": "회귀계수",
                 "headers": ["변수", "계수(B)", "표준오차(SE)", "t", "p값", "유의성"],
                 "rows": coef_rows,
                 "footnotes": ["*** p<0.001, ** p<0.01, * p<0.05"]},
                {"title": "다중공선성 진단(VIF)",
                 "headers": ["변수", "VIF", "판정"],
                 "rows": vif_rows,
                 "footnotes": ["VIF<5: 양호, 5~10: 경계, >10: 문제"]},
                {"title": "잔차·예측값 (최대 200행)",
                 "headers": ["관측치", "실제값", "예측값", "잔차"],
                 "rows": resid_rows,
                 "footnotes": [f"잔차 평균 = {round(float(resid.mean()), 6)}"]},
            ],
            "charts": [
                {
                    "type": "scatter",
                    "title": "실제값 vs 예측값",
                    "data": scatter_data,
                    "xKey": "실제값",
                    "yKey": "예측값",
                },
                *([{
                    "type": "line",
                    "title": f"{pred_vars[0]}에 따른 회귀직선",
                    "data": line_data,
                    "xKey": "x",
                    "yKey": "회귀직선",
                }] if line_data else []),
            ],
        }
    except ImportError:
        # statsmodels 없을 때 scipy 단순 선형
        from scipy import stats as scipy_stats
        if len(pred_vars) == 1:
            x = data[pred_vars[0]]
            y = data[dep_var]
            slope, intercept, r, p, se = scipy_stats.linregress(x, y)
            return {
                "title": "선형 회귀분석 (단순 — statsmodels 없음)",
                "tables": [{
                    "title": "단순 선형 회귀",
                    "headers": ["지표", "값"],
                    "rows": [["절편", round(float(intercept),4)],
                             [f"{pred_vars[0]} 계수", round(float(slope),4)],
                             ["R²", round(float(r**2),4)], ["p값", round(float(p),4)]],
                }],
            }
        return {"error": "statsmodels 패키지가 필요합니다 (다중 회귀)."}


def run_survival(df, variables: dict, options: dict) -> dict:
    try:
        from lifelines import KaplanMeierFitter
    except ImportError:
        return {"error": "lifelines 패키지가 필요합니다: pip install lifelines"}

    import pandas as pd
    import numpy as np

    dur_var   = (variables.get("duration") or [None])[0]
    event_var = (variables.get("event")    or [None])[0]
    group_var = (variables.get("group")    or [None])[0]

    if not dur_var or not event_var:
        return {"error": "기간(duration) 변수와 이벤트(event) 변수를 선택하세요."}

    cols = [dur_var, event_var] + ([group_var] if group_var else [])
    df2 = df[cols].copy()
    df2[dur_var]   = pd.to_numeric(df2[dur_var],   errors="coerce")
    df2[event_var] = pd.to_numeric(df2[event_var], errors="coerce")
    df2 = df2.dropna(subset=[dur_var, event_var])

    if len(df2) < 5:
        return {"error": f"유효 관측치 부족(n={len(df2)}, 최소 5개 필요)"}

    tables = []
    groups_list = [None] if not group_var else sorted(df2[group_var].dropna().unique().tolist(), key=str)

    # KM 생존 함수 주요 시점 테이블
    km_rows = []
    for g in groups_list:
        subset = df2 if g is None else df2[df2[group_var] == g]
        label  = "전체" if g is None else str(g)
        kmf = KaplanMeierFitter()
        kmf.fit(subset[dur_var], event_observed=subset[event_var])
        sf  = kmf.survival_function_
        ci  = kmf.confidence_interval_
        step = max(1, len(kmf.timeline) // 20)
        for t in kmf.timeline[::step]:
            if t in sf.index:
                s   = float(sf.loc[t].iloc[0])
                lo  = float(ci.loc[t].iloc[0])
                hi  = float(ci.loc[t].iloc[1])
                km_rows.append([label, round(float(t), 4), round(s, 4), round(lo, 4), round(hi, 4)])
    tables.append({
        "title": "카플란-마이어 생존 함수 (주요 시점)",
        "headers": ["집단", "시간", "S(t)", "95% CI 하한", "95% CI 상한"],
        "rows": km_rows,
        "footnotes": ["S(t): 시간 t까지 생존 확률", "Greenwood 공식 95% 신뢰구간"],
    })

    # 중앙 생존 시간
    med_rows = []
    for g in groups_list:
        subset = df2 if g is None else df2[df2[group_var] == g]
        label  = "전체" if g is None else str(g)
        kmf = KaplanMeierFitter()
        kmf.fit(subset[dur_var], event_observed=subset[event_var])
        med = kmf.median_survival_time_
        n_ev = int(subset[event_var].sum())
        med_str = round(float(med), 4) if (med is not None and not np.isinf(float(med))) else "미도달"
        med_rows.append([label, len(subset), n_ev, med_str])
    tables.append({
        "title": "중앙 생존 시간(Median Survival Time)",
        "headers": ["집단", "N", "이벤트 수", "중앙생존시간"],
        "rows": med_rows,
    })

    # Log-rank 검정 (집단 2개일 때)
    if group_var and len(groups_list) == 2:
        try:
            from lifelines.statistics import logrank_test
            g0 = df2[df2[group_var] == groups_list[0]]
            g1 = df2[df2[group_var] == groups_list[1]]
            lr = logrank_test(g0[dur_var], g1[dur_var],
                              event_observed_A=g0[event_var],
                              event_observed_B=g1[event_var])
            tables.append({
                "title": "Log-rank 검정",
                "headers": ["항목", "값"],
                "rows": [
                    ["검정통계량", round(float(lr.test_statistic), 4)],
                    ["p값",       round(float(lr.p_value), 4)],
                    ["판정(α=0.05)", "유의 (두 생존 함수 차이)" if lr.p_value < 0.05 else "n.s."],
                ],
                "footnotes": ["귀무가설: 두 집단의 생존 함수가 동일하다"],
            })
        except Exception:
            pass

    return {"title": "생존 분석 (Kaplan-Meier)", "tables": tables}


def run_timeseries_decompose(df, variables: dict, options: dict) -> dict:
    import pandas as pd

    var      = (variables.get("variable") or [None])[0]
    date_col = (variables.get("date_col") or [None])[0]
    period   = int(options.get("period", 12))

    if not var:
        return {"error": "시계열 값 변수를 선택하세요."}

    if date_col and date_col in df.columns:
        df2 = df[[date_col, var]].copy()
        df2[var] = pd.to_numeric(df2[var], errors="coerce")
        df2 = df2.dropna(subset=[var])
        try:
            df2 = df2.sort_values(date_col).reset_index(drop=True)
        except Exception:
            pass
    else:
        df2 = df[[var]].copy()
        df2[var] = pd.to_numeric(df2[var], errors="coerce")
        df2 = df2.dropna(subset=[var]).reset_index(drop=True)

    s = df2[var]
    n = len(s)

    if n < period * 2:
        return {"error": f"관측치({n})가 부족합니다(주기 {period}에 최소 {period*2}개 필요)."}

    try:
        from statsmodels.tsa.seasonal import STL
        stl    = STL(s.values, period=period, robust=True)
        result = stl.fit()

        var_total    = float(s.var())
        var_resid    = float(pd.Series(result.resid).var())
        var_seasonal = float(pd.Series(result.seasonal).var())
        denom_t = var_total - var_seasonal
        denom_s = var_seasonal + var_resid
        ft = round(max(0.0, 1 - var_resid / denom_t), 4) if denom_t > 0 else 0.0
        fs = round(max(0.0, 1 - var_resid / denom_s), 4) if denom_s > 0 else 0.0
        resid_std = round(float(pd.Series(result.resid).std()), 4)

        summary_rows = [
            ["추세(Trend)",     round(float(pd.Series(result.trend).min()),    4),
                                round(float(pd.Series(result.trend).max()),    4), ft],
            ["계절성(Seasonal)", round(float(pd.Series(result.seasonal).min()), 4),
                                round(float(pd.Series(result.seasonal).max()), 4), fs],
            ["잔차(Residual)",  round(float(pd.Series(result.resid).min()),    4),
                                round(float(pd.Series(result.resid).max()),    4), resid_std],
        ]

        step = max(1, n // 24)
        sample_rows = []
        for i in range(0, n, step):
            lbl = str(df2[date_col].iloc[i]) if (date_col and date_col in df2.columns) else str(i)
            sample_rows.append([
                lbl,
                round(float(s.iloc[i]),                4),
                round(float(result.trend[i]),          4),
                round(float(result.seasonal[i]),       4),
                round(float(result.resid[i]),          4),
            ])

        # 시각화: 추세·계절성·잔차 라인 차트
        trend_data = []
        seasonal_data = []
        resid_data = []
        for i in range(n):
            lbl = str(df2[date_col].iloc[i]) if (date_col and date_col in df2.columns) else str(i)
            trend_data.append({
                "시점": lbl,
                "원래값": round(float(s.iloc[i]), 4),
                "추세": round(float(result.trend[i]), 4),
            })
            seasonal_data.append({"시점": lbl, "계절성": round(float(result.seasonal[i]), 4)})
            resid_data.append({"시점": lbl, "잔차": round(float(result.resid[i]), 4)})

        return {
            "title": "시계열 분해 (STL)",
            "tables": [
                {
                    "title": "분해 요약 통계",
                    "headers": ["구성요소", "최솟값", "최댓값", "강도 지수"],
                    "rows": summary_rows,
                    "footnotes": [
                        f"STL 분해 — 주기(period)={period}, robust=True",
                        "추세강도 Ft / 계절강도 Fs: 0(없음) ~ 1(강함)",
                        f"잔차 표준편차(σ_resid): {resid_std}",
                    ],
                },
                {
                    "title": f"성분별 분해 수치 (최대 24행, 표시간격={step})",
                    "headers": ["시점", "원래값", "추세", "계절성", "잔차"],
                    "rows": sample_rows,
                },
            ],
            "charts": [
                {
                    "type": "line",
                    "title": "원래값 및 추세",
                    "data": trend_data,
                    "xKey": "시점",
                },
                {
                    "type": "line",
                    "title": "계절성",
                    "data": seasonal_data,
                    "xKey": "시점",
                },
                {
                    "type": "line",
                    "title": "잔차",
                    "data": resid_data,
                    "xKey": "시점",
                },
            ],
        }
    except ImportError:
        return {"error": "statsmodels 패키지가 필요합니다: pip install statsmodels"}
    except Exception as e:
        return {"error": f"STL 분해 오류: {str(e)}"}


def run_chi_square_test(df, variables: dict, options: dict) -> dict:
    """두 명목 변수 간 카이제곱 독립성 검정."""
    import pandas as pd
    import numpy as np
    from scipy import stats

    df = _apply_level_filters(df, variables)

    var1 = (variables.get("variable1") or [None])[0]
    var2 = (variables.get("variable2") or [None])[0]
    if not var1 or not var2:
        return {"error": "두 범주 변수를 선택하세요."}
    if var1 not in df.columns or var2 not in df.columns:
        return {"error": "선택한 변수가 데이터에 없습니다."}

    ct = pd.crosstab(df[var1], df[var2])
    if ct.size == 0:
        return {"error": "교차표를 만들 수 없습니다."}

    try:
        chi2, p, dof, expected = stats.chi2_contingency(ct)
        n = ct.values.sum()
        k = min(ct.shape) - 1
        cramers_v = float(np.sqrt(chi2 / (n * k))) if n * k > 0 else 0.0
    except Exception as e:
        return {"error": f"카이제곱 검정 오류: {e}"}

    headers = [f"{var1} \\ {var2}"] + [str(c) for c in ct.columns]
    rows = [[str(idx)] + [int(v) for v in row] for idx, row in zip(ct.index, ct.values)]

    # 시각화용 데이터
    stacked_data = []
    heatmap_data = []
    for i, (row_name, row) in enumerate(ct.iterrows()):
        item = {"name": str(row_name)}
        for col_name in ct.columns:
            item[str(col_name)] = int(row[col_name])
            heatmap_data.append({
                "x": str(row_name),
                "y": str(col_name),
                "value": int(row[col_name]),
            })
        stacked_data.append(item)

    return {
        "title": "카이제곱 독립성 검정",
        "tables": [
            {
                "title": f"{var1} × {var2} 교차표",
                "headers": headers,
                "rows": rows,
            },
            {
                "title": "검정 결과",
                "headers": ["통계량", "값", "자유도", "p값"],
                "rows": [
                    ["Pearson Chi-square", round(float(chi2), 4), int(dof), round(float(p), 4)],
                    ["Cramér's V", round(cramers_v, 4), "-", "-"],
                ],
                "footnotes": ["* p < 0.05: 두 변수 간 독립성 기각(연관성 있음)"],
            },
        ],
        "charts": [
            {
                "type": "heatmap",
                "title": "관측 빈도 히트맵",
                "data": heatmap_data,
                "xKey": "x",
                "yKey": "y",
                "valueKey": "value",
            },
            {
                "type": "bar",
                "title": "누적 막대 차트",
                "data": stacked_data,
                "xKey": "name",
                "stackKeys": [str(c) for c in ct.columns],
            },
        ],
    }


def run_logistic_regression(df, variables: dict, options: dict) -> dict:
    """이항 로지스틱 회귀분석."""
    import pandas as pd
    import numpy as np

    dep_var = (variables.get("dependent") or [None])[0]
    pred_vars = variables.get("predictors") or []
    if not dep_var or not pred_vars:
        return {"error": "종속 변수와 예측 변수를 선택하세요."}

    data = df[[dep_var] + pred_vars].copy()
    for p in pred_vars:
        data[p] = pd.to_numeric(data[p], errors="coerce")

    # 종속 변수: 0/1 수치 또는 2개 범주 자동 인코딩
    y_raw = data[dep_var]
    y_num = pd.to_numeric(y_raw, errors="coerce")
    if y_num.notna().all():
        y = y_num
    else:
        y_unique = y_raw.dropna().unique()
        if len(y_unique) != 2:
            return {"error": f"종속 변수는 0/1 또는 2개 값을 가져야 합니다 (현재 {len(y_unique)}개)."}
        y = y_raw.map({y_unique[0]: 0, y_unique[1]: 1})

    data[dep_var] = y
    data = data.dropna()
    n = len(data)
    if n < len(pred_vars) + 2:
        return {"error": f"관측치({n})가 너무 적습니다(최소 {len(pred_vars)+2}개 필요)."}

    y_unique = y.dropna().unique()
    if len(y_unique) != 2:
        return {"error": f"종속 변수는 0/1 또는 2개 값을 가져야 합니다 (현재 {len(y_unique)}개)."}

    try:
        import statsmodels.api as sm
        X = sm.add_constant(data[pred_vars])
        model = sm.Logit(y, X).fit(disp=0)

        coef_rows = []
        for name, b, se, z, p in zip(
            model.params.index, model.params, model.bse, model.tvalues, model.pvalues
        ):
            or_val = round(float(np.exp(b)), 4)
            sig = "***" if p < 0.001 else ("**" if p < 0.01 else ("*" if p < 0.05 else ""))
            coef_rows.append([
                name, round(float(b), 4), round(float(se), 4), round(float(z), 4),
                round(float(p), 4), or_val, sig,
            ])

        # ROC 커브용 예측확률
        probs = model.predict(X)
        roc_data = []
        for i, (actual, prob) in enumerate(zip(y, probs)):
            roc_data.append({"index": i, "actual": int(actual), "prob": round(float(prob), 4)})
            if i >= 199:
                break

        return {
            "title": "이항 로지스틱 회귀분석",
            "tables": [
                {
                    "title": "모델 적합도",
                    "headers": ["지표", "값"],
                    "rows": [
                        ["관측치(N)", n],
                        ["유사 R² (McFadden)", round(float(model.prsquared), 4)],
                        ["Log-Likelihood", round(float(model.llf), 4)],
                        ["AIC", round(float(model.aic), 4)],
                        ["BIC", round(float(model.bic), 4)],
                        ["LR 통계량", round(float(model.llr), 4)],
                        ["LR p값", round(float(model.llr_pvalue), 4)],
                    ],
                },
                {
                    "title": "회귀계수 (Odds Ratio 포함)",
                    "headers": ["변수", "B", "SE", "z", "p값", "Odds Ratio", "유의성"],
                    "rows": coef_rows,
                    "footnotes": ["*** p<0.001, ** p<0.01, * p<0.05", "OR>1: 예측변수 증가 시 결과=1 확률 상승"],
                },
            ],
            "charts": [
                {
                    "type": "scatter",
                    "title": "예측 확률 분포 (0/1 실제값)",
                    "data": roc_data,
                    "xKey": "index",
                    "yKey": "prob",
                    "groupKey": "actual",
                }
            ],
        }
    except ImportError:
        return {"error": "statsmodels 패키지가 필요합니다: pip install statsmodels"}
    except Exception as e:
        return {"error": f"로지스틱 회귀 오류: {e}"}


def run_pca(df, variables: dict, options: dict) -> dict:
    """주성분분석(PCA)."""
    import pandas as pd
    import numpy as np

    cols = variables.get("variables", [])
    n_components = int(options.get("n_components", 2))
    if len(cols) < 2:
        return {"error": "PCA는 2개 이상의 연속 변수가 필요합니다."}

    data = df[cols].apply(pd.to_numeric, errors="coerce").dropna()
    n = len(data)
    if n < 3:
        return {"error": f"유효 관측치 부족(n={n})"}

    n_components = min(n_components, len(cols), n - 1)

    try:
        from sklearn.preprocessing import StandardScaler
        from sklearn.decomposition import PCA

        scaler = StandardScaler()
        X_std = scaler.fit_transform(data)
        pca = PCA(n_components=n_components)
        scores = pca.fit_transform(X_std)

        explained = pca.explained_variance_ratio_
        cumsum = np.cumsum(explained)

        eigen_rows = []
        scree_data = []
        for i in range(n_components):
            eigen_rows.append([
                f"PC{i+1}",
                round(float(pca.explained_variance_[i]), 4),
                round(float(explained[i]), 4),
                round(float(cumsum[i]), 4),
            ])
            scree_data.append({"name": f"PC{i+1}", "기여율": round(float(explained[i]) * 100, 2)})

        loadings_rows = []
        loadings_data = []
        for j, col in enumerate(cols):
            row = [col]
            for i in range(n_components):
                row.append(round(float(pca.components_[i][j]), 4))
            loadings_rows.append(row)
            loadings_data.append({"variable": col, **{f"PC{i+1}": round(float(pca.components_[i][j]), 4) for i in range(n_components)}})

        score_rows = []
        scatter_data = []
        for idx, row in enumerate(scores[:200]):
            score_rows.append([idx] + [round(float(v), 4) for v in row])
            scatter_data.append({"PC1": round(float(row[0]), 4), "PC2": round(float(row[1]) if len(row) > 1 else 0, 4)})

        return {
            "title": f"주성분분석(PCA) — {n_components}개 성분",
            "tables": [
                {
                    "title": "고유값 및 분산 기여율",
                    "headers": ["성분", "고유값", "기여율", "누적기여율"],
                    "rows": eigen_rows,
                },
                {
                    "title": "주성분 적재량(Loadings)",
                    "headers": ["변수"] + [f"PC{i+1}" for i in range(n_components)],
                    "rows": loadings_rows,
                },
                {
                    "title": "주성분 점수 (최대 200행)",
                    "headers": ["관측치"] + [f"PC{i+1}" for i in range(n_components)],
                    "rows": score_rows,
                },
            ],
            "charts": [
                {
                    "type": "bar",
                    "title": "Scree Plot (분산 기여율 %)",
                    "data": scree_data,
                    "xKey": "name",
                    "yKey": "기여율",
                },
                {
                    "type": "scatter",
                    "title": "PC1 vs PC2 점수 산점도",
                    "data": scatter_data,
                    "xKey": "PC1",
                    "yKey": "PC2",
                },
            ],
        }
    except ImportError:
        return {"error": "scikit-learn 패키지가 필요합니다: pip install scikit-learn"}
    except Exception as e:
        return {"error": f"PCA 오류: {e}"}


def run_kmeans_clustering(df, variables: dict, options: dict) -> dict:
    """K-Means 클러스터링."""
    import pandas as pd

    cols = variables.get("variables", [])
    k = int(options.get("k", 3))
    if len(cols) < 1:
        return {"error": "최소 1개 이상의 연속 변수를 선택하세요."}

    data = df[cols].apply(pd.to_numeric, errors="coerce").dropna()
    n = len(data)
    if n < k + 1:
        return {"error": f"관측치({n})가 클러스터 수({k})보다 적습니다."}

    k = min(k, n - 1)

    try:
        from sklearn.preprocessing import StandardScaler
        from sklearn.cluster import KMeans

        X_std = StandardScaler().fit_transform(data)
        model = KMeans(n_clusters=k, random_state=42, n_init="auto").fit(X_std)
        labels = model.labels_
        centers = model.cluster_centers_

        # 클러스터별 요약
        data["__cluster__"] = labels
        summary_rows = []
        cluster_scatter = []
        for c in range(k):
            subset = data[data["__cluster__"] == c][cols]
            centroid = [round(float(v), 4) for v in centers[c]]
            summary_rows.append([
                f"Cluster {c+1}",
                len(subset),
                *centroid,
            ])
            for _, row in subset.head(200).iterrows():
                point = {"cluster": f"Cluster {c+1}"}
                for col in cols:
                    point[col] = round(float(row[col]), 4)
                if len(cols) >= 2:
                    point["x"] = point[cols[0]]
                    point["y"] = point[cols[1]]
                cluster_scatter.append(point)

        return {
            "title": f"K-Means 클러스터링 (k={k})",
            "tables": [
                {
                    "title": "클러스터별 크기 및 표준화 중심",
                    "headers": ["클러스터", "N"] + cols,
                    "rows": summary_rows,
                },
            ],
            "charts": [
                {
                    "type": "scatter",
                    "title": "클러스터 산점도" + (f" ({cols[0]} vs {cols[1]})" if len(cols) >= 2 else ""),
                    "data": cluster_scatter,
                    "xKey": cols[0] if len(cols) >= 1 else "x",
                    "yKey": cols[1] if len(cols) >= 2 else cols[0],
                    "groupKey": "cluster",
                }
            ],
        }
    except ImportError:
        return {"error": "scikit-learn 패키지가 필요합니다: pip install scikit-learn"}
    except Exception as e:
        return {"error": f"K-Means 오류: {e}"}


def run_mann_whitney_u(df, variables: dict, options: dict) -> dict:
    """Mann-Whitney U 검정 (비모수 독립표본 검정)."""
    import pandas as pd
    from scipy import stats

    dep_var = (variables.get("dependent") or [None])[0]
    group_var = (variables.get("group") or [None])[0]
    group_values = variables.get("group_values") or []
    if not dep_var or not group_var:
        return {"error": "종속 변수와 집단 변수를 선택하세요."}

    all_groups = df[group_var].dropna().unique()
    if group_values and len(group_values) == 2:
        groups = [g for g in all_groups if str(g) in [str(v) for v in group_values]]
        if len(groups) != 2:
            return {"error": f"선택한 범주를 찾을 수 없습니다: {group_values}"}
    elif len(all_groups) == 2:
        groups = all_groups
    else:
        return {"error": f"집단 변수는 정확히 2개 집단이어야 합니다 (현재 {len(all_groups)}개)."}

    g1 = pd.to_numeric(df[df[group_var] == groups[0]][dep_var], errors="coerce").dropna()
    g2 = pd.to_numeric(df[df[group_var] == groups[1]][dep_var], errors="coerce").dropna()

    u_stat, p = stats.mannwhitneyu(g1, g2, alternative="two-sided")
    r_effect = 1 - (2 * u_stat) / (len(g1) * len(g2)) if (len(g1) * len(g2)) > 0 else 0

    return {
        "title": "Mann-Whitney U 검정",
        "tables": [
            {
                "title": "집단별 기술통계",
                "headers": ["집단", "N", "중앙값", "평균순위"],
                "rows": [
                    [str(groups[0]), len(g1), round(float(g1.median()), 4), round(float(g1.rank().mean()), 4)],
                    [str(groups[1]), len(g2), round(float(g2.median()), 4), round(float(g2.rank().mean()), 4)],
                ],
            },
            {
                "title": "Mann-Whitney U 검정 결과",
                "headers": ["U 통계량", "z(근사)", "p값", "효과크기 r", "판정(α=0.05)"],
                "rows": [[
                    round(float(u_stat), 4),
                    round(float(stats.norm.ppf(1 - p / 2)), 4) if p > 0 else "-",
                    round(float(p), 4),
                    round(float(r_effect), 4),
                    "유의" if p < 0.05 else "n.s.",
                ]],
            },
        ],
        "charts": [
            {
                "type": "bar",
                "title": "집단별 중앙값 비교",
                "data": [
                    {"name": str(groups[0]), "중앙값": round(float(g1.median()), 4)},
                    {"name": str(groups[1]), "중앙값": round(float(g2.median()), 4)},
                ],
                "xKey": "name",
                "yKey": "중앙값",
            }
        ],
    }


def run_wilcoxon_signed_rank(df, variables: dict, options: dict) -> dict:
    """Wilcoxon signed-rank 검정 (비모수 대응표본 검정)."""
    import pandas as pd
    from scipy import stats

    v1 = (variables.get("variable1") or [None])[0]
    v2 = (variables.get("variable2") or [None])[0]
    if not v1 or not v2:
        return {"error": "두 변수를 선택하세요."}
    if v1 == v2:
        return {"error": "서로 다른 두 변수를 선택해야 합니다."}

    s1 = pd.to_numeric(df[v1], errors="coerce").dropna()
    s2 = pd.to_numeric(df[v2], errors="coerce").dropna()
    valid_idx = s1.index.intersection(s2.index)
    x1 = s1.loc[valid_idx]
    x2 = s2.loc[valid_idx]
    n = len(valid_idx)
    if n < 3:
        return {"error": f"대응된 유효 쌍이 3개 이상 필요합니다 (현재 {n}개)."}

    diff = x1 - x2
    w_stat, p = stats.wilcoxon(x1, x2, alternative="two-sided", zero_method="wilcox")
    r_effect = abs(float(w_stat) - n * (n + 1) / 4) / (n * (n + 1) * (2 * n + 1) / 24) ** 0.5

    return {
        "title": "Wilcoxon Signed-Rank 검정",
        "tables": [
            {
                "title": "변수별 기술통계",
                "headers": ["변수", "N(쌍)", "중앙값"],
                "rows": [
                    [str(v1), n, round(float(x1.median()), 4)],
                    [str(v2), n, round(float(x2.median()), 4)],
                ],
            },
            {
                "title": "Wilcoxon Signed-Rank 검정 결과",
                "headers": ["W 통계량", "p값", "효과크기 r", "판정(α=0.05)"],
                "rows": [[
                    round(float(w_stat), 4),
                    round(float(p), 4),
                    round(float(r_effect), 4),
                    "유의" if p < 0.05 else "n.s.",
                ]],
                "footnotes": [f"차이 중앙값 = {round(float(diff.median()), 4)}"],
            },
        ],
        "charts": [
            {
                "type": "bar",
                "title": "변수별 중앙값 비교",
                "data": [
                    {"name": str(v1), "중앙값": round(float(x1.median()), 4)},
                    {"name": str(v2), "중앙값": round(float(x2.median()), 4)},
                ],
                "xKey": "name",
                "yKey": "중앙값",
            }
        ],
    }


# ────────────────────────────────────────────
# 디스패치
# ────────────────────────────────────────────

ANALYSIS_FNS = {
    "descriptives":           run_descriptives,
    "frequencies":            run_frequencies,
    "normality":              run_normality,
    "crosstab":               run_crosstab,
    "correlation":            run_correlation,
    "independent_ttest":      run_independent_ttest,
    "paired_ttest":           run_paired_ttest,
    "one_way_anova":          run_one_way_anova,
    "linear_regression":      run_linear_regression,
    "survival":               run_survival,
    "timeseries_decompose":   run_timeseries_decompose,
    "chi_square_test":        run_chi_square_test,
    "logistic_regression":    run_logistic_regression,
    "pca":                    run_pca,
    "kmeans_clustering":      run_kmeans_clustering,
    "mann_whitney_u":         run_mann_whitney_u,
    "wilcoxon_signed_rank":   run_wilcoxon_signed_rank,
}


def main():
    try:
        config = json.loads(sys.stdin.read())
        action = config.get("action", "analyze")

        if action == "parse":
            result = action_parse(config)
        elif action == "update_types":
            result = action_update_types(config)
        elif action == "analyze":
            session_id     = config["session_id"]
            analysis_type  = config["analysis_type"]
            variables      = config.get("variables", {})
            options        = config.get("options", {})

            df  = _load_df(session_id)
            fn  = ANALYSIS_FNS.get(analysis_type)
            if fn is None:
                result = {"ok": False, "error": f"지원하지 않는 분석: {analysis_type}"}
            else:
                fn_result = fn(df, variables, options)
                result = {**fn_result, "ok": "error" not in fn_result}
        else:
            result = {"ok": False, "error": f"알 수 없는 action: {action}"}

        sys.stdout.reconfigure(encoding="utf-8")
        print(json.dumps(_sanitize_json(result), ensure_ascii=False, default=str, allow_nan=False))

    except Exception:
        err = traceback.format_exc()
        sys.stdout.reconfigure(encoding="utf-8")
        print(json.dumps({"ok": False, "error": err}, ensure_ascii=False))


if __name__ == "__main__":
    main()
