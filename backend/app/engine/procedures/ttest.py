"""
T-Test procedures: One-Sample, Independent Samples, Paired Samples.
Uses scipy.stats — mathematically verified.
"""

from __future__ import annotations
from typing import Any
import numpy as np
import pandas as pd
from scipy import stats as scipy_stats

from app.engine.registry import ProcedureRegistry, ProcedureSpec
from app.engine.dataset_resolver import resolve_dataset


def _execute_ttest(
    dataset_id: str,
    variables_meta: list[dict],
    cases: list[list[Any]],
    parameters: dict,
    active_filter: dict | None = None,
    weight_variable: str | None = None,
    split_variables: list[str] | None = None,
    **kwargs,
) -> dict:
    test_type: str = parameters.get("type", "onesample")
    df, fw = resolve_dataset(variables_meta, cases, active_filter)
    warnings = list(fw)

    if test_type == "onesample":
        return _onesample(df, parameters, warnings)
    elif test_type == "independent":
        return _independent(df, parameters, warnings)
    elif test_type == "paired":
        return _paired(df, parameters, warnings)
    else:
        return _error("ttest", "UNKNOWN_TYPE", f"Unknown test type: {test_type}", "Use onesample, independent, or paired.", "")


def _onesample(df: pd.DataFrame, params: dict, warnings: list) -> dict:
    var_name: str = params.get("variable", "")
    test_value: float = float(params.get("test_value", 0))
    confidence_level: float = float(params.get("confidence_level", 0.95))

    if var_name not in df.columns:
        return _error("ttest", "VAR_NOT_FOUND", f"Variable '{var_name}' not found.", "", "")

    x = pd.to_numeric(df[var_name], errors="coerce").dropna().to_numpy(dtype=float)
    n = len(x)

    if n < 2:
        return _error("ttest", "INSUFFICIENT_N", f"N={n}. At least 2 cases required.", "", "")

    mean = float(np.mean(x))
    std = float(np.std(x, ddof=1))
    se = float(std / np.sqrt(n))
    t_stat, p_val = scipy_stats.ttest_1samp(x, popmean=test_value)
    dof = n - 1
    mean_diff = mean - test_value

    alpha = 1 - confidence_level
    t_crit = scipy_stats.t.ppf(1 - alpha / 2, df=dof)
    ci_lower = mean_diff - t_crit * se
    ci_upper = mean_diff + t_crit * se

    # Cohen's d
    cohens_d = mean_diff / std if std > 0 else None

    syntax = (f"T-TEST\n  /TESTVAL={test_value}\n"
              f"  /VARIABLES={var_name}\n"
              "  /CRITERIA=CI(0.95).")

    return {
        "status": "complete",
        "syntax": syntax,
        "result": {
            "test_type": "onesample",
            "variable": var_name,
            "test_value": test_value,
            "n": n,
            "mean": round(mean, 6),
            "std": round(std, 6),
            "se": round(se, 6),
            "mean_difference": round(mean_diff, 6),
            "t": round(float(t_stat), 6),
            "df": dof,
            "p_two_tailed": round(float(p_val), 6),
            "ci_lower": round(ci_lower, 6),
            "ci_upper": round(ci_upper, 6),
            "cohens_d": round(float(cohens_d), 6) if cohens_d is not None else None,
        },
        "warnings": warnings,
        "assumptions_checked": _check_normality(x, var_name),
    }


def _independent(df: pd.DataFrame, params: dict, warnings: list) -> dict:
    var_name: str = params.get("variable", "")
    group_var: str = params.get("grouping_variable", "")
    group1 = params.get("group1")
    group2 = params.get("group2")
    confidence_level: float = float(params.get("confidence_level", 0.95))

    if var_name not in df.columns:
        return _error("ttest", "VAR_NOT_FOUND", f"Variable '{var_name}' not found.", "", "")
    if group_var not in df.columns:
        return _error("ttest", "VAR_NOT_FOUND", f"Grouping variable '{group_var}' not found.", "", "")

    sub = df[[var_name, group_var]].copy()
    sub[var_name] = pd.to_numeric(sub[var_name], errors="coerce")
    sub = sub.dropna()

    if group1 is None or group2 is None:
        unique_groups = sub[group_var].unique()
        if len(unique_groups) != 2:
            return _error("ttest", "GROUPS", f"Expected 2 groups, found {len(unique_groups)}.",
                          "Specify group1 and group2 values.", "")
        group1, group2 = unique_groups[0], unique_groups[1]

    g1 = sub[sub[group_var] == group1][var_name].to_numpy(dtype=float)
    g2 = sub[sub[group_var] == group2][var_name].to_numpy(dtype=float)

    if len(g1) < 2 or len(g2) < 2:
        return _error("ttest", "INSUFFICIENT_N",
                      f"Group 1 n={len(g1)}, Group 2 n={len(g2)}. Both must be ≥ 2.", "", "")

    mean1 = float(np.mean(g1))
    mean2 = float(np.mean(g2))
    std1 = float(np.std(g1, ddof=1))
    std2 = float(np.std(g2, ddof=1))
    se1 = std1 / np.sqrt(len(g1))
    se2 = std2 / np.sqrt(len(g2))

    # Levene's test for equality of variances
    levene_stat, levene_p = scipy_stats.levene(g1, g2)

    # Independent t-test — both equal and unequal variance versions
    t_equal, p_equal = scipy_stats.ttest_ind(g1, g2, equal_var=True)
    t_welch, p_welch = scipy_stats.ttest_ind(g1, g2, equal_var=False)

    n1, n2 = len(g1), len(g2)
    df_equal = n1 + n2 - 2
    # Welch-Satterthwaite df
    df_welch = (se1**2 + se2**2)**2 / (se1**4 / (n1 - 1) + se2**4 / (n2 - 1))

    alpha = 1 - confidence_level
    mean_diff = mean1 - mean2

    # CI equal variance
    se_diff_equal = float(np.sqrt(((n1 - 1)*std1**2 + (n2 - 1)*std2**2) / (n1 + n2 - 2) * (1/n1 + 1/n2)))
    t_crit_equal = scipy_stats.t.ppf(1 - alpha/2, df=df_equal)
    ci_eq = (mean_diff - t_crit_equal * se_diff_equal, mean_diff + t_crit_equal * se_diff_equal)

    # CI Welch
    se_diff_welch = float(np.sqrt(se1**2 + se2**2))
    t_crit_welch = scipy_stats.t.ppf(1 - alpha/2, df=df_welch)
    ci_wl = (mean_diff - t_crit_welch * se_diff_welch, mean_diff + t_crit_welch * se_diff_welch)

    # Cohen's d (pooled)
    pooled_std = float(np.sqrt(((n1-1)*std1**2 + (n2-1)*std2**2) / (n1+n2-2)))
    cohens_d = mean_diff / pooled_std if pooled_std > 0 else None

    # Warnings
    if levene_p < 0.05:
        warnings.append({
            "severity": "MEDIUM",
            "code": "UNEQUAL_VARIANCE",
            "issue": f"Levene's test significant (p={levene_p:.4f}) — variances are not equal.",
            "why_it_matters": "Use Welch's t-test (unequal variance assumed) for more accurate results.",
            "recommended_action": "Use Welch's t-test result.",
            "procedure_id": "ttest",
            "variables_involved": [var_name, group_var],
        })

    syntax = (f"T-TEST GROUPS={group_var}({group1} {group2})\n"
              f"  /VARIABLES={var_name}\n"
              "  /CRITERIA=CI(0.95).")

    return {
        "status": "complete",
        "syntax": syntax,
        "result": {
            "test_type": "independent",
            "variable": var_name,
            "grouping_variable": group_var,
            "group1": group1, "group2": group2,
            "group1_n": n1, "group2_n": n2,
            "group1_mean": round(mean1, 6), "group2_mean": round(mean2, 6),
            "group1_std": round(std1, 6), "group2_std": round(std2, 6),
            "group1_se": round(se1, 6), "group2_se": round(se2, 6),
            "levene_statistic": round(float(levene_stat), 6),
            "levene_p": round(float(levene_p), 6),
            "equal_variance": {
                "t": round(float(t_equal), 6),
                "df": round(df_equal, 4),
                "p_two_tailed": round(float(p_equal), 6),
                "mean_difference": round(mean_diff, 6),
                "se_difference": round(se_diff_equal, 6),
                "ci_lower": round(ci_eq[0], 6),
                "ci_upper": round(ci_eq[1], 6),
            },
            "unequal_variance": {
                "t": round(float(t_welch), 6),
                "df": round(float(df_welch), 4),
                "p_two_tailed": round(float(p_welch), 6),
                "mean_difference": round(mean_diff, 6),
                "se_difference": round(se_diff_welch, 6),
                "ci_lower": round(ci_wl[0], 6),
                "ci_upper": round(ci_wl[1], 6),
            },
            "cohens_d": round(float(cohens_d), 6) if cohens_d is not None else None,
        },
        "warnings": warnings,
        "assumptions_checked": (
            _check_normality(g1, f"{var_name}[{group1}]") +
            _check_normality(g2, f"{var_name}[{group2}]") +
            [{
                "id": "levene",
                "name": "Equality of Variances (Levene's Test)",
                "status": "passed" if levene_p >= 0.05 else "failed",
                "test_statistic": round(float(levene_stat), 6),
                "p_value": round(float(levene_p), 6),
                "description": "Tests whether the two groups have equal variances.",
                "interpretation": (
                    f"Levene's F = {levene_stat:.4f}, p = {levene_p:.4f}. "
                    + ("Equal variances assumed." if levene_p >= 0.05 else "Equal variances NOT assumed. Use Welch's t-test.")
                ),
            }]
        ),
    }


def _paired(df: pd.DataFrame, params: dict, warnings: list) -> dict:
    var1: str = params.get("variable1", "")
    var2: str = params.get("variable2", "")
    confidence_level: float = float(params.get("confidence_level", 0.95))

    for v in [var1, var2]:
        if v not in df.columns:
            return _error("ttest", "VAR_NOT_FOUND", f"Variable '{v}' not found.", "", "")

    sub = df[[var1, var2]].copy()
    sub[var1] = pd.to_numeric(sub[var1], errors="coerce")
    sub[var2] = pd.to_numeric(sub[var2], errors="coerce")
    sub = sub.dropna()
    n = len(sub)

    if n < 2:
        return _error("ttest", "INSUFFICIENT_N", f"N={n}. At least 2 pairs required.", "", "")

    x1 = sub[var1].to_numpy(dtype=float)
    x2 = sub[var2].to_numpy(dtype=float)
    diff = x1 - x2

    t_stat, p_val = scipy_stats.ttest_rel(x1, x2)
    mean_diff = float(np.mean(diff))
    std_diff = float(np.std(diff, ddof=1))
    se_diff = std_diff / np.sqrt(n)
    dof = n - 1

    alpha = 1 - confidence_level
    t_crit = scipy_stats.t.ppf(1 - alpha/2, df=dof)
    ci_lower = mean_diff - t_crit * se_diff
    ci_upper = mean_diff + t_crit * se_diff

    cohens_d = mean_diff / std_diff if std_diff > 0 else None
    r_corr, r_p = scipy_stats.pearsonr(x1, x2)

    syntax = (f"T-TEST PAIRS={var1} WITH {var2}\n"
              "  /CRITERIA=CI(0.95).")

    return {
        "status": "complete",
        "syntax": syntax,
        "result": {
            "test_type": "paired",
            "variable1": var1, "variable2": var2,
            "n": n,
            "mean1": round(float(np.mean(x1)), 6),
            "mean2": round(float(np.mean(x2)), 6),
            "std1": round(float(np.std(x1, ddof=1)), 6),
            "std2": round(float(np.std(x2, ddof=1)), 6),
            "mean_difference": round(mean_diff, 6),
            "std_difference": round(std_diff, 6),
            "se_difference": round(se_diff, 6),
            "r": round(float(r_corr), 6),
            "r_p": round(float(r_p), 6),
            "t": round(float(t_stat), 6),
            "df": dof,
            "p_two_tailed": round(float(p_val), 6),
            "ci_lower": round(ci_lower, 6),
            "ci_upper": round(ci_upper, 6),
            "cohens_d": round(float(cohens_d), 6) if cohens_d is not None else None,
        },
        "warnings": warnings,
        "assumptions_checked": _check_normality(diff, f"{var1}-{var2} difference"),
    }


def _check_normality(x: np.ndarray, var_label: str) -> list[dict]:
    """Shapiro-Wilk normality test (n ≤ 5000)."""
    n = len(x)
    if n < 3:
        return []
    if n > 5000:
        # Use K-S with normal params
        mu, sigma = float(np.mean(x)), float(np.std(x, ddof=1))
        if sigma == 0:
            return []
        stat, p = scipy_stats.kstest(x, "norm", args=(mu, sigma))
        test_name = "Kolmogorov-Smirnov"
    else:
        stat, p = scipy_stats.shapiro(x)
        test_name = "Shapiro-Wilk"

    return [{
        "id": f"normality_{var_label}",
        "name": f"Normality of {var_label} ({test_name})",
        "status": "passed" if float(p) >= 0.05 else "warning",
        "test_statistic": round(float(stat), 6),
        "p_value": round(float(p), 6),
        "description": f"{test_name} test for normality of {var_label}.",
        "interpretation": (
            f"{test_name} W/D = {stat:.4f}, p = {p:.4f}. "
            + ("Distribution appears normal." if p >= 0.05
               else "Distribution may deviate from normality. Consider non-parametric alternatives.")
        ),
    }]


def _error(procedure, code, message, action, detail) -> dict:
    return {
        "status": "error", "syntax": "", "result": None, "warnings": [],
        "assumptions_checked": [],
        "error": {"procedure": procedure, "error_code": code,
                  "message": message, "likely_cause": message,
                  "suggested_action": action, "technical_detail": detail}
    }


for spec_id, test_type, display, desc in [
    ("ttest_onesample", "onesample", "One-Sample T-Test", "Compare sample mean to a known value."),
    ("ttest_independent", "independent", "Independent Samples T-Test", "Compare means of two independent groups."),
    ("ttest_paired", "paired", "Paired Samples T-Test", "Compare means of two related measurements."),
]:
    ProcedureRegistry.register(ProcedureSpec(
        id=spec_id,
        category="compare_means",
        display_name=display,
        description=desc,
        required_inputs=["variable"],
        execute_fn=lambda type_=test_type, **kw: _execute_ttest(**{**kw, "parameters": {**kw.get("parameters", {}), "type": type_}}),
    ))
