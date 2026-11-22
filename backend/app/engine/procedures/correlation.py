"""
Correlation procedures: Pearson, Spearman, Kendall.
Uses scipy.stats for exact computation.
"""

from __future__ import annotations
from typing import Any
import numpy as np
import pandas as pd
from scipy import stats as scipy_stats

from app.engine.registry import ProcedureRegistry, ProcedureSpec
from app.engine.dataset_resolver import resolve_dataset


def _execute_correlation(
    dataset_id: str,
    variables_meta: list[dict],
    cases: list[list[Any]],
    parameters: dict,
    active_filter: dict | None = None,
    weight_variable: str | None = None,
    split_variables: list[str] | None = None,
    **kwargs,
) -> dict:
    var_names: list[str] = parameters.get("variables", [])
    method: str = parameters.get("method", "pearson")  # pearson | spearman | kendall
    flag_significance: bool = parameters.get("flag_significance", True)

    if len(var_names) < 2:
        return _error("correlation", "INSUFFICIENT_VARIABLES",
                      "At least 2 variables required.", "Add more variables.", "")

    df, fw = resolve_dataset(variables_meta, cases, active_filter)
    warnings = list(fw)

    # Extract numeric columns
    sub = df[var_names].copy()
    for v in var_names:
        sub[v] = pd.to_numeric(sub[v], errors="coerce")

    # Pairwise deletion: compute correlation for each pair
    matrix = {}
    n_matrix = {}
    p_matrix = {}

    for i, v1 in enumerate(var_names):
        matrix[v1] = {}
        n_matrix[v1] = {}
        p_matrix[v1] = {}
        for j, v2 in enumerate(var_names):
            if v1 == v2:
                matrix[v1][v2] = 1.0
                n_matrix[v1][v2] = int(sub[[v1]].dropna().shape[0])
                p_matrix[v1][v2] = None
            else:
                pair = sub[[v1, v2]].dropna()
                n = len(pair)
                n_matrix[v1][v2] = n
                if n < 3:
                    matrix[v1][v2] = None
                    p_matrix[v1][v2] = None
                    warnings.append({
                        "severity": "HIGH",
                        "code": "INSUFFICIENT_N",
                        "issue": f"Fewer than 3 valid cases for {v1} and {v2} (n={n}).",
                        "why_it_matters": "Correlation cannot be computed with n < 3.",
                        "recommended_action": "Check for missing data.",
                        "procedure_id": "correlation",
                        "variables_involved": [v1, v2],
                    })
                    continue

                x = pair[v1].to_numpy(dtype=float)
                y = pair[v2].to_numpy(dtype=float)

                if method == "pearson":
                    r, p = scipy_stats.pearsonr(x, y)
                elif method == "spearman":
                    r, p = scipy_stats.spearmanr(x, y)
                elif method == "kendall":
                    r, p = scipy_stats.kendalltau(x, y)
                else:
                    r, p = scipy_stats.pearsonr(x, y)

                matrix[v1][v2] = round(float(r), 6)
                p_matrix[v1][v2] = round(float(p), 6)

    syntax = (f"CORRELATIONS\n  /VARIABLES={' '.join(var_names)}\n"
              f"  /PRINT={'TWOTAIL' if flag_significance else 'NOSIG'} NOSIG.\n"
              f"  /MISSING=PAIRWISE.")

    return {
        "status": "complete",
        "syntax": syntax,
        "result": {
            "method": method,
            "variables": var_names,
            "correlation_matrix": matrix,
            "n_matrix": n_matrix,
            "p_matrix": p_matrix,
        },
        "warnings": warnings,
        "assumptions_checked": [],
    }


def _error(procedure, code, message, action, detail) -> dict:
    return {
        "status": "error", "syntax": "", "result": None, "warnings": [],
        "assumptions_checked": [],
        "error": {"procedure": procedure, "error_code": code,
                  "message": message, "likely_cause": message,
                  "suggested_action": action, "technical_detail": detail}
    }


ProcedureRegistry.register(ProcedureSpec(
    id="correlation",
    category="correlate",
    display_name="Bivariate Correlation",
    description="Pearson, Spearman, or Kendall correlation with p-values.",
    required_inputs=["variables"],
    execute_fn=_execute_correlation,
))
