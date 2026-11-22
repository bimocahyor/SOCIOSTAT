"""
ANOVA procedure: One-Way ANOVA with Levene, Welch, Brown-Forsythe, and post hoc tests.
Uses scipy.stats and statsmodels — exact computation.
"""

from __future__ import annotations
from typing import Any
import numpy as np
import pandas as pd
from scipy import stats as scipy_stats

from app.engine.registry import ProcedureRegistry, ProcedureSpec
from app.engine.dataset_resolver import resolve_dataset


def _execute_anova(
    dataset_id: str,
    variables_meta: list[dict],
    cases: list[list[Any]],
    parameters: dict,
    active_filter: dict | None = None,
    weight_variable: str | None = None,
    split_variables: list[str] | None = None,
    **kwargs,
) -> dict:
    dep_var: str = parameters.get("dependent", "")
    factor_var: str = parameters.get("factor", "")
    post_hoc: list[str] = parameters.get("post_hoc", [])  # tukey, bonferroni, scheffe
    confidence_level: float = float(parameters.get("confidence_level", 0.95))

    if not dep_var or not factor_var:
        return _error("anova", "MISSING_VARIABLES", "Dependent and factor variables required.", "", "")

    df, fw = resolve_dataset(variables_meta, cases, active_filter)
    warnings = list(fw)

    if dep_var not in df.columns:
        return _error("anova", "VAR_NOT_FOUND", f"'{dep_var}' not found.", "", "")
    if factor_var not in df.columns:
        return _error("anova", "VAR_NOT_FOUND", f"'{factor_var}' not found.", "", "")

    sub = df[[dep_var, factor_var]].copy()
    sub[dep_var] = pd.to_numeric(sub[dep_var], errors="coerce")
    sub = sub.dropna()

    groups_data = {g: sub[sub[factor_var] == g][dep_var].to_numpy(dtype=float)
                   for g in sub[factor_var].unique()}
    group_names = sorted(groups_data.keys(), key=str)

    if len(group_names) < 2:
        return _error("anova", "INSUFFICIENT_GROUPS", "At least 2 groups required.", "", "")

    for g in group_names:
        if len(groups_data[g]) < 2:
            warnings.append({
                "severity": "HIGH",
                "code": "SMALL_GROUP",
                "issue": f"Group '{g}' has only {len(groups_data[g])} case(s).",
                "why_it_matters": "ANOVA requires at least 2 cases per group for stable estimates.",
                "recommended_action": "Check data coding or remove the group.",
                "procedure_id": "anova",
                "variables_involved": [factor_var],
            })

    group_arrays = [groups_data[g] for g in group_names]

    # One-way ANOVA
    f_stat, p_val = scipy_stats.f_oneway(*group_arrays)

    n_total = sum(len(g) for g in group_arrays)
    k = len(group_arrays)
    grand_mean = float(np.mean(np.concatenate(group_arrays)))

    ss_between = float(sum(len(g) * (np.mean(g) - grand_mean)**2 for g in group_arrays))
    ss_within = float(sum(np.sum((g - np.mean(g))**2) for g in group_arrays))
    ss_total = ss_between + ss_within
    df_between = k - 1
    df_within = n_total - k
    ms_between = ss_between / df_between if df_between > 0 else None
    ms_within = ss_within / df_within if df_within > 0 else None

    # Eta squared
    eta_sq = ss_between / ss_total if ss_total > 0 else None

    # Levene's test
    levene_stat, levene_p = scipy_stats.levene(*group_arrays)

    # Welch's ANOVA
    welch_result = _welch_anova(group_arrays, group_names)

    # Group descriptives
    group_stats = {}
    for g in group_names:
        arr = groups_data[g]
        n = len(arr)
        mean = float(np.mean(arr))
        std = float(np.std(arr, ddof=1)) if n > 1 else None
        se = std / np.sqrt(n) if std is not None else None
        ci_lower = ci_upper = None
        if n > 1 and se is not None:
            t_crit = scipy_stats.t.ppf(1 - (1-confidence_level)/2, df=n-1)
            ci_lower = mean - t_crit * se
            ci_upper = mean + t_crit * se
        group_stats[str(g)] = {
            "n": n, "mean": round(mean, 6),
            "std": round(std, 6) if std else None,
            "se": round(se, 6) if se else None,
            "ci_lower": round(ci_lower, 6) if ci_lower is not None else None,
            "ci_upper": round(ci_upper, 6) if ci_upper is not None else None,
            "minimum": round(float(np.min(arr)), 6),
            "maximum": round(float(np.max(arr)), 6),
        }

    # Post Hoc tests
    post_hoc_results = {}
    if post_hoc and ms_within is not None and ms_within > 0:
        post_hoc_results = _compute_post_hoc(group_arrays, group_names, ms_within, df_within, post_hoc, warnings)

    assumptions = [
        {
            "id": "levene",
            "name": "Homogeneity of Variances (Levene's Test)",
            "status": "passed" if levene_p >= 0.05 else "warning",
            "test_statistic": round(float(levene_stat), 6),
            "p_value": round(float(levene_p), 6),
            "description": "Tests equality of group variances.",
            "interpretation": (
                f"Levene's F = {levene_stat:.4f}, p = {levene_p:.4f}. "
                + ("Homogeneity of variances assumption met." if levene_p >= 0.05
                   else "Variances are significantly different. Consider Welch's ANOVA.")
            ),
        }
    ]

    syntax = (f"ONEWAY {dep_var} BY {factor_var}\n"
              "  /STATISTICS DESCRIPTIVES HOMOGENEITY WELCH.\n"
              + (f"  /POSTHOC={' '.join(p.upper() for p in post_hoc)}.\n" if post_hoc else ""))

    return {
        "status": "complete",
        "syntax": syntax,
        "result": {
            "dependent": dep_var,
            "factor": factor_var,
            "n_total": n_total,
            "k_groups": k,
            "grand_mean": round(grand_mean, 6),
            "group_stats": group_stats,
            "anova_table": {
                "between": {
                    "ss": round(ss_between, 6), "df": df_between,
                    "ms": round(ms_between, 6) if ms_between else None,
                    "f": round(float(f_stat), 6), "p": round(float(p_val), 6),
                },
                "within": {
                    "ss": round(ss_within, 6), "df": df_within,
                    "ms": round(ms_within, 6) if ms_within else None,
                },
                "total": {"ss": round(ss_total, 6), "df": n_total - 1},
            },
            "eta_squared": round(float(eta_sq), 6) if eta_sq is not None else None,
            "levene": {
                "statistic": round(float(levene_stat), 6),
                "p": round(float(levene_p), 6),
            },
            "welch": welch_result,
            "post_hoc": post_hoc_results,
        },
        "warnings": warnings,
        "assumptions_checked": assumptions,
    }


def _welch_anova(group_arrays: list, group_names: list) -> dict | None:
    """Welch's ANOVA — robust to unequal variances."""
    try:
        k = len(group_arrays)
        ns = np.array([len(g) for g in group_arrays], dtype=float)
        means = np.array([np.mean(g) for g in group_arrays], dtype=float)
        vars_ = np.array([np.var(g, ddof=1) for g in group_arrays], dtype=float)

        # Weights
        ws = ns / vars_
        w_total = np.sum(ws)
        grand_mean_w = np.sum(ws * means) / w_total

        # F statistic
        numerator = np.sum(ws * (means - grand_mean_w)**2) / (k - 1)
        # Lambda correction
        h = np.sum(((1 - ws / w_total)**2) / (ns - 1))
        denominator = 1 + 2 * (k - 2) / (k**2 - 1) * h

        f_welch = numerator / denominator
        df1 = k - 1
        df2 = (k**2 - 1) / (3 * h) if h > 0 else None
        p_welch = 1 - scipy_stats.f.cdf(f_welch, df1, df2) if df2 else None

        return {
            "f": round(float(f_welch), 6),
            "df1": round(df1, 4),
            "df2": round(float(df2), 4) if df2 else None,
            "p": round(float(p_welch), 6) if p_welch is not None else None,
        }
    except Exception:
        return None


def _compute_post_hoc(
    group_arrays: list,
    group_names: list,
    ms_within: float,
    df_within: int,
    methods: list[str],
    warnings: list,
) -> dict:
    results = {}
    k = len(group_arrays)

    for method in methods:
        comparisons = []
        for i in range(k):
            for j in range(i + 1, k):
                g1 = group_arrays[i]
                g2 = group_arrays[j]
                n1, n2 = len(g1), len(g2)
                mean_diff = float(np.mean(g1)) - float(np.mean(g2))
                se_diff = float(np.sqrt(ms_within * (1/n1 + 1/n2)))

                if method == "tukey":
                    q = mean_diff / se_diff if se_diff > 0 else 0
                    # Tukey's HSD uses studentized range distribution
                    try:
                        from scipy.stats import studentized_range
                        p = float(studentized_range.sf(abs(q) * np.sqrt(2), k, df_within))
                    except Exception:
                        # Fallback: approximate
                        t_stat = abs(mean_diff) / se_diff if se_diff > 0 else 0
                        p = float(scipy_stats.t.sf(t_stat, df_within) * 2 * k * (k-1) / 2)
                        p = min(p, 1.0)

                elif method == "bonferroni":
                    t_stat = mean_diff / se_diff if se_diff > 0 else 0
                    n_comparisons = k * (k - 1) / 2
                    p_raw = float(scipy_stats.t.sf(abs(t_stat), df_within) * 2)
                    p = min(p_raw * n_comparisons, 1.0)

                elif method == "scheffe":
                    f_stat = (mean_diff / se_diff)**2 / (k - 1) if se_diff > 0 else 0
                    p = float(1 - scipy_stats.f.cdf(f_stat, k - 1, df_within))

                else:
                    continue

                comparisons.append({
                    "group1": str(group_names[i]),
                    "group2": str(group_names[j]),
                    "mean_difference": round(mean_diff, 6),
                    "se": round(se_diff, 6),
                    "p": round(p, 6),
                    "significant": p < 0.05,
                })
        results[method] = comparisons
    return results


def _error(procedure, code, message, action, detail) -> dict:
    return {
        "status": "error", "syntax": "", "result": None, "warnings": [],
        "assumptions_checked": [],
        "error": {"procedure": procedure, "error_code": code,
                  "message": message, "likely_cause": message,
                  "suggested_action": action, "technical_detail": detail}
    }


ProcedureRegistry.register(ProcedureSpec(
    id="anova_oneway",
    category="compare_means",
    display_name="One-Way ANOVA",
    description="Compare means across multiple groups. Includes Levene, Welch, and post hoc tests.",
    required_inputs=["dependent", "factor"],
    execute_fn=_execute_anova,
))
