"""
Reliability Analysis — Cronbach's Alpha and item statistics.
Exact computation per the standard formula.
"""

from __future__ import annotations
from typing import Any
import numpy as np
import pandas as pd

from app.engine.registry import ProcedureRegistry, ProcedureSpec
from app.engine.dataset_resolver import resolve_dataset


def _execute_reliability(
    dataset_id: str,
    variables_meta: list[dict],
    cases: list[list[Any]],
    parameters: dict,
    active_filter: dict | None = None,
    weight_variable: str | None = None,
    split_variables: list[str] | None = None,
    **kwargs,
) -> dict:
    items: list[str] = parameters.get("items", [])
    model: str = parameters.get("model", "alpha")

    if len(items) < 2:
        return _error("reliability", "INSUFFICIENT_ITEMS",
                      "At least 2 items required for reliability analysis.", "", "")

    df, fw = resolve_dataset(variables_meta, cases, active_filter)
    warnings = list(fw)

    for item in items:
        if item not in df.columns:
            return _error("reliability", "VAR_NOT_FOUND", f"Item '{item}' not found.", "", "")

    sub = df[items].copy()
    for item in items:
        sub[item] = pd.to_numeric(sub[item], errors="coerce")

    # Listwise deletion for reliability
    sub = sub.dropna()
    n, k = sub.shape

    if n < 2:
        return _error("reliability", "INSUFFICIENT_N",
                      f"Only {n} complete cases. Need at least 2.", "", "")

    # Cronbach's Alpha = (k / (k-1)) * (1 - sum(var_i) / var_total)
    item_variances = sub.var(ddof=1).to_numpy()
    total_scores = sub.sum(axis=1)
    total_variance = float(total_scores.var(ddof=1))

    if total_variance == 0:
        return _error("reliability", "ZERO_VARIANCE",
                      "Total score variance is zero. All items may have the same value.",
                      "Check item distributions.", "")

    alpha = float((k / (k - 1)) * (1 - np.sum(item_variances) / total_variance))

    # Item-total statistics
    item_stats = []
    for item in items:
        item_values = sub[item].to_numpy(dtype=float)
        # Scale mean / variance if item deleted
        rest = sub.drop(columns=[item])
        rest_total = rest.sum(axis=1).to_numpy(dtype=float)

        scale_mean_if_deleted = float(np.mean(total_scores - item_values))
        scale_var_if_deleted = float(np.var(total_scores - item_values, ddof=1))

        # Corrected item-total correlation
        # Correlate item with sum of REST (not including the item itself)
        if np.std(item_values) > 0 and np.std(rest_total) > 0:
            r_it = float(np.corrcoef(item_values, rest_total)[0, 1])
        else:
            r_it = 0.0

        # Alpha if item deleted
        k_red = k - 1
        rest_var = sub.drop(columns=[item]).var(ddof=1).to_numpy()
        rest_total_var = float(np.var(rest_total, ddof=1))
        if rest_total_var > 0 and k_red > 1:
            alpha_if_deleted = float((k_red / (k_red - 1)) * (1 - np.sum(rest_var) / rest_total_var))
        else:
            alpha_if_deleted = None

        item_stats.append({
            "item": item,
            "item_mean": round(float(np.mean(item_values)), 6),
            "item_std": round(float(np.std(item_values, ddof=1)), 6),
            "scale_mean_if_deleted": round(scale_mean_if_deleted, 6),
            "scale_variance_if_deleted": round(scale_var_if_deleted, 6),
            "corrected_item_total_r": round(r_it, 6),
            "alpha_if_deleted": round(alpha_if_deleted, 6) if alpha_if_deleted is not None else None,
        })

    # Scale statistics
    scale_mean = float(total_scores.mean())
    scale_variance = total_variance
    scale_std = float(total_scores.std(ddof=1))

    # Interpretation guidance
    alpha_interp = _interpret_alpha(alpha)

    # Warning for low alpha
    if alpha < 0.7:
        warnings.append({
            "severity": "MEDIUM",
            "code": "LOW_ALPHA",
            "issue": f"Cronbach's alpha = {alpha:.3f} < 0.7.",
            "why_it_matters": "Alpha below 0.7 indicates questionable internal consistency.",
            "recommended_action": "Review item-total correlations and consider removing items with low corrected r.",
            "procedure_id": "reliability",
            "variables_involved": items,
        })

    syntax = f"RELIABILITY\n  /VARIABLES={' '.join(items)}\n  /MODEL=ALPHA\n  /STATISTICS=DESCRIPTIVE SCALE CORR.\n  /SUMMARY=TOTAL."

    return {
        "status": "complete",
        "syntax": syntax,
        "result": {
            "model": "alpha",
            "n_cases": n,
            "n_items": k,
            "alpha": round(alpha, 6),
            "alpha_interpretation": alpha_interp,
            "scale_statistics": {
                "mean": round(scale_mean, 6),
                "variance": round(scale_variance, 6),
                "std": round(scale_std, 6),
            },
            "item_statistics": item_stats,
        },
        "warnings": warnings,
        "assumptions_checked": [],
    }


def _interpret_alpha(alpha: float) -> str:
    if alpha >= 0.9:
        return "Excellent (α ≥ 0.9)"
    elif alpha >= 0.8:
        return "Good (0.8 ≤ α < 0.9)"
    elif alpha >= 0.7:
        return "Acceptable (0.7 ≤ α < 0.8)"
    elif alpha >= 0.6:
        return "Questionable (0.6 ≤ α < 0.7)"
    elif alpha >= 0.5:
        return "Poor (0.5 ≤ α < 0.6)"
    else:
        return "Unacceptable (α < 0.5)"


def _error(procedure, code, message, action, detail) -> dict:
    return {
        "status": "error", "syntax": "", "result": None, "warnings": [],
        "assumptions_checked": [],
        "error": {"procedure": procedure, "error_code": code,
                  "message": message, "likely_cause": message,
                  "suggested_action": action, "technical_detail": detail}
    }


ProcedureRegistry.register(ProcedureSpec(
    id="reliability",
    category="scale",
    display_name="Reliability Analysis (Cronbach's Alpha)",
    description="Compute Cronbach's Alpha and item-total statistics for scale reliability.",
    required_inputs=["items"],
    execute_fn=_execute_reliability,
))
