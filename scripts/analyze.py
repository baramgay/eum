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

# ────────────────────────────────────────────
# 세션 파일 경로
# ────────────────────────────────────────────

def _session_path(session_id: str) -> str:
    return os.path.join(tempfile.gettempdir(), f"eum_session_{session_id}.json")


def _save_session(session_id: str, rows: list, column_types: dict):
    path = _session_path(session_id)
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"rows": rows, "column_types": column_types}, f, ensure_ascii=False, default=str)


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

    return {
        "ok": True,
        "session_id": session_id,
        "total_rows": len(rows),
        "columns": list(df.columns),
        "column_types": column_types,
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
        json.dump(data, f, ensure_ascii=False, default=str)
    return {"ok": True}


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
    return {
        "title": "기술통계",
        "tables": [{
            "title": "기술통계량",
            "headers": ["변수", "N", "평균", "표준편차", "최솟값", "Q1", "중앙값", "Q3", "최댓값", "왜도", "첨도"],
            "rows": rows,
        }],
    }


def run_frequencies(df, variables: dict, options: dict) -> dict:
    import pandas as pd
    cols = variables.get("variables", [])
    if not cols:
        return {"error": "분석 변수를 선택하세요."}
    tables = []
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
    return {"title": "빈도 분석", "tables": tables}


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

    return {
        "title": "교차 분석",
        "tables": [
            {"title": f"{row_var} × {col_var} 교차표", "headers": headers, "rows": rows},
            {"title": "카이제곱 검정", "headers": ["통계량", "값", "자유도", "p값"],
             "rows": chi2_rows, "footnotes": footnotes},
        ],
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
    }


def run_independent_ttest(df, variables: dict, options: dict) -> dict:
    import pandas as pd
    import numpy as np
    from scipy import stats

    dep_var   = (variables.get("dependent")  or [None])[0]
    group_var = (variables.get("group")      or [None])[0]
    if not dep_var or not group_var:
        return {"error": "종속 변수와 집단 변수를 선택하세요."}

    groups = df[group_var].dropna().unique()
    if len(groups) != 2:
        return {"error": f"집단 변수는 정확히 2개 집단이어야 합니다 (현재 {len(groups)}개)."}

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


def run_one_way_anova(df, variables: dict, options: dict) -> dict:
    import pandas as pd
    import numpy as np
    from scipy import stats

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

    return {"title": "일원분산분석(One-Way ANOVA)", "tables": tables}


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

        X_arr = data[pred_vars].values.astype(float)
        vif_rows = [[col, round(float(variance_inflation_factor(X_arr, i)), 4),
                     "문제" if variance_inflation_factor(X_arr, i) > 10
                     else ("경계" if variance_inflation_factor(X_arr, i) > 5 else "양호")]
                    for i, col in enumerate(pred_vars)]

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


# ────────────────────────────────────────────
# 디스패치
# ────────────────────────────────────────────

ANALYSIS_FNS = {
    "descriptives":       run_descriptives,
    "frequencies":        run_frequencies,
    "normality":          run_normality,
    "crosstab":           run_crosstab,
    "correlation":        run_correlation,
    "independent_ttest":  run_independent_ttest,
    "one_way_anova":      run_one_way_anova,
    "linear_regression":  run_linear_regression,
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
                result = {**fn(df, variables, options), "ok": True}
        else:
            result = {"ok": False, "error": f"알 수 없는 action: {action}"}

        sys.stdout.reconfigure(encoding="utf-8")
        print(json.dumps(result, ensure_ascii=False, default=str))

    except Exception:
        err = traceback.format_exc()
        sys.stdout.reconfigure(encoding="utf-8")
        print(json.dumps({"ok": False, "error": err}, ensure_ascii=False))


if __name__ == "__main__":
    main()
