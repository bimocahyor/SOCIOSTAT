"""
Nonparametric tests: Mann-Whitney U, Wilcoxon Signed-Rank, Kruskal-Wallis, Friedman.
Uses scipy.stats.
"""

from __future__ import annotations
from typing import Any
import numpy as np
import pandas as pd
from scipy import stats as scipy_stats

from app.engine.registry import ProcedureRegistry, ProcedureSpec
from app.engine.dataset_resolver import resolve_dataset


def _execute_nonparametric(
    dataset_id: str,
    variables_meta: list[dict],
    cases: list[list[Any]],
    parameters: dict,
    active_filter: dict | None = None,
    weight_variable: str | None = None,
    split_variables: list[str] | None = None,
    **kwargs,
) -> dict:
    test: str = parameters.get("test", "mannwhitney")
    df, fw = resolve_dataset(variables_meta, cases, active_filter)
    warnings = list(fw)

    if test == "mannwhitney":
        return _mann_whitney(df, parameters, warnings)
    elif test == "wilcoxon":
        return _wilcoxon(df, parameters, warnings)
    elif test == "kruskalwallis":
        return _kruskal_wallis(df, parameters, warnings)
    elif test == "friedman":
        return _friedman(df, parameters, warnings)
    return _error("nonparametric", "UNKNOWN_TEST", f"Unknown test: {test}", "", "")


def _mann_whitney(df, params, warnings):
    var: str = params.get("variable", "")
    group_var: str = params.get("grouping_variable", "")
    alternative: str = params.get("alternative", "two-sided")

    if var not in df.columns or group_var not in df.columns:
        return _error("nonparametric", "VAR_NOT_FOUND", "Variable not found.", "", "")

    sub = df[[var, group_var]].copy()
    sub[var] = pd.to_numeric(sub[var], errors="coerce")
    sub = sub.dropna()
    groups = sub[group_var].unique()
    if len(groups) != 2:
        return _error("nonparametric", "GROUPS", f"Expected 2 groups, found {len(groups)}.", "", "")

    g1 = sub[sub[group_var] == groups[0]][var].to_numpy(dtype=float)
    g2 = sub[sub[group_var] == groups[1]][var].to_numpy(dtype=float)

    stat, p = scipy_stats.mannwhitneyu(g1, g2, alternative=alternative)
    n1, n2 = len(g1), len(g2)
    n = n1 + n2

    # Effect size: r = Z / sqrt(N)
    z = (stat - n1*n2/2) / np.sqrt(n1*n2*(n+1)/12)
    r_effect = abs(z) / np.sqrt(n)

    syntax = f"NPAR TESTS M-W={var} BY {group_var}({groups[0]} {groups[1]})."
    return {
        "status": "complete",
        "syntax": syntax,
        "result": {
            "test": "Mann-Whitney U",
            "variable": var, "grouping_variable": group_var,
            "group1": str(groups[0]), "group2": str(groups[1]),
            "n1": n1, "n2": n2,
            "group1_median": round(float(np.median(g1)), 6),
            "group2_median": round(float(np.median(g2)), 6),
            "U": round(float(stat), 4),
            "z": round(float(z), 4),
            "p": round(float(p), 6),
            "alternative": alternative,
            "effect_size_r": round(float(r_effect), 6),
        },
        "warnings": warnings, "assumptions_checked": [],
    }


def _wilcoxon(df, params, warnings):
    var1: str = params.get("variable1", "")
    var2: str = params.get("variable2", "")
    alternative: str = params.get("alternative", "two-sided")

    for v in [var1, var2]:
        if v not in df.columns:
            return _error("nonparametric", "VAR_NOT_FOUND", f"'{v}' not found.", "", "")

    sub = df[[var1, var2]].copy()
    for v in [var1, var2]:
        sub[v] = pd.to_numeric(sub[v], errors="coerce")
    sub = sub.dropna()

    x1 = sub[var1].to_numpy(dtype=float)
    x2 = sub[var2].to_numpy(dtype=float)
    diff = x1 - x2

    # Remove zeros
    nonzero = diff[diff != 0]
    if len(nonzero) == 0:
        return _error("nonparametric", "NO_DIFFERENCES", "All differences are zero.", "", "")

    stat, p = scipy_stats.wilcoxon(x1, x2, alternative=alternative)
    n = len(nonzero)

    syntax = f"NPAR TESTS WILCOXON={var1} WITH {var2}."
    return {
        "status": "complete",
        "syntax": syntax,
        "result": {
            "test": "Wilcoxon Signed-Rank",
            "variable1": var1, "variable2": var2,
            "n_pairs": len(sub), "n_nonzero_diff": n,
            "T": round(float(stat), 4),
            "p": round(float(p), 6),
            "alternative": alternative,
        },
        "warnings": warnings, "assumptions_checked": [],
    }


def _kruskal_wallis(df, params, warnings):
    var: str = params.get("variable", "")
    factor: str = params.get("factor", "")

    if var not in df.columns or factor not in df.columns:
        return _error("nonparametric", "VAR_NOT_FOUND", "Variable not found.", "", "")

    sub = df[[var, factor]].copy()
    sub[var] = pd.to_numeric(sub[var], errors="coerce")
    sub = sub.dropna()

    groups = {g: sub[sub[factor] == g][var].to_numpy(dtype=float) for g in sub[factor].unique()}
    if len(groups) < 2:
        return _error("nonparametric", "GROUPS", "At least 2 groups required.", "", "")

    stat, p = scipy_stats.kruskal(*groups.values())
    k = len(groups)
    n = len(sub)

    # Epsilon squared (effect size)
    eps_sq = (stat - k + 1) / (n - k)

    syntax = f"NPAR TESTS K-W={var} BY {factor}."
    return {
        "status": "complete",
        "syntax": syntax,
        "result": {
            "test": "Kruskal-Wallis",
            "variable": var, "factor": factor,
            "k_groups": k, "n_total": n,
            "group_medians": {str(g): round(float(np.median(v)), 6) for g, v in groups.items()},
            "H": round(float(stat), 4),
            "df": k - 1,
            "p": round(float(p), 6),
            "epsilon_squared": round(float(eps_sq), 6),
        },
        "warnings": warnings, "assumptions_checked": [],
    }


def _friedman(df, params, warnings):
    variables: list[str] = params.get("variables", [])
    if len(variables) < 2:
        return _error("nonparametric", "INSUFFICIENT_VARS", "At least 2 variables required.", "", "")

    for v in variables:
        if v not in df.columns:
            return _error("nonparametric", "VAR_NOT_FOUND", f"'{v}' not found.", "", "")

    sub = df[variables].copy()
    for v in variables:
        sub[v] = pd.to_numeric(sub[v], errors="coerce")
    sub = sub.dropna()
    n = len(sub)

    if n < 2:
        return _error("nonparametric", "INSUFFICIENT_N", "At least 2 complete cases required.", "", "")

    stat, p = scipy_stats.friedmanchisquare(*[sub[v].to_numpy(dtype=float) for v in variables])
    k = len(variables)
    kendall_w = float(stat) / (n * (k - 1)) if (n * (k - 1)) > 0 else None

    syntax = f"NPAR TESTS FRIEDMAN={' '.join(variables)}."
    return {
        "status": "complete",
        "syntax": syntax,
        "result": {
            "test": "Friedman",
            "variables": variables,
            "n_cases": n, "k_conditions": k,
            "chi_square": round(float(stat), 4),
            "df": k - 1,
            "p": round(float(p), 6),
            "kendall_w": round(float(kendall_w), 6) if kendall_w is not None else None,
        },
        "warnings": warnings, "assumptions_checked": [],
    }


def _error(procedure, code, message, action, detail) -> dict:
    return {
        "status": "error", "syntax": "", "result": None, "warnings": [],
        "assumptions_checked": [],
        "error": {"procedure": procedure, "error_code": code,
                  "message": message, "likely_cause": message,
                  "suggested_action": action, "technical_detail": detail}
    }


for spec in [
    ("nonparametric_mannwhitney", "Mann-Whitney U Test", "Compare distributions of two independent groups."),
    ("nonparametric_wilcoxon", "Wilcoxon Signed-Rank Test", "Compare two related samples."),
    ("nonparametric_kruskalwallis", "Kruskal-Wallis Test", "Compare distributions across multiple independent groups."),
    ("nonparametric_friedman", "Friedman Test", "Compare related samples across multiple conditions."),
]:
    _id, _name, _desc = spec
    ProcedureRegistry.register(ProcedureSpec(
        id=_id,
        category="nonparametric",
        display_name=_name,
        description=_desc,
        required_inputs=["variable"],
        execute_fn=_execute_nonparametric,
    ))
