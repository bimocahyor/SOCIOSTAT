"""
Descriptive Statistics procedure.
Mean, median, std, variance, SE, skewness, kurtosis, min, max, range, percentiles, CI.
All via scipy/numpy — mathematically exact.
"""

from __future__ import annotations
from typing import Any
import numpy as np
import pandas as pd
from scipy import stats as scipy_stats

from app.engine.registry import ProcedureRegistry, ProcedureSpec
from app.engine.dataset_resolver import resolve_dataset, get_variable_meta, get_numeric_column


def _execute_descriptives(
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
    if not var_names:
        return _error("descriptives", "NO_VARIABLES", "No variables specified.",
                      "Provide at least one variable name.", "")

    df, filter_warnings = resolve_dataset(variables_meta, cases, active_filter)
    warnings = list(filter_warnings)
    results = {}

    for var_name in var_names:
        if var_name not in df.columns:
            warnings.append(f"Variable '{var_name}' not found — skipped.")
            continue

        meta = get_variable_meta(variables_meta, var_name)
        if meta and meta.get("measurement_level") == "nominal":
            warnings.append(
                f"Warning: '{var_name}' is nominal. Descriptive statistics on nominal variables "
                "may not be meaningful. Consider using Frequencies instead."
            )

        col = pd.to_numeric(df[var_name], errors="coerce").dropna()
        x = col.to_numpy(dtype=float)
        n = len(x)

        if n == 0:
            results[var_name] = {"n": 0, "n_missing": len(df), "error": "No valid cases"}
            continue

        n_total = len(df[var_name])
        n_missing = n_total - n

        mean = float(np.mean(x))
        median = float(np.median(x))
        # Mode (may have multiple)
        mode_res = scipy_stats.mode(x, keepdims=True)
        mode_val = float(mode_res.mode[0]) if len(mode_res.mode) > 0 else None
        mode_count = int(mode_res.count[0]) if len(mode_res.count) > 0 else None

        std = float(np.std(x, ddof=1)) if n > 1 else None
        variance = float(np.var(x, ddof=1)) if n > 1 else None
        se_mean = float(std / np.sqrt(n)) if (std is not None and n > 0) else None
        minimum = float(np.min(x))
        maximum = float(np.max(x))
        rng = float(maximum - minimum)
        total_sum = float(np.sum(x))

        # Skewness and Kurtosis (using scipy — corrected for sample)
        skewness = float(scipy_stats.skew(x, bias=False)) if n >= 3 else None
        se_skew = float(np.sqrt(6 * n * (n - 1) / ((n - 2) * (n + 1) * (n + 3)))) if n >= 3 else None
        kurtosis = float(scipy_stats.kurtosis(x, bias=False, fisher=True)) if n >= 4 else None
        se_kurt = (float(2 * se_skew * np.sqrt((n * n - 1) / ((n - 3) * (n + 5))))
                   if (se_skew is not None and n >= 4) else None)

        # Percentiles
        percentiles = {}
        for p in [5, 10, 25, 50, 75, 90, 95]:
            percentiles[str(p)] = float(np.percentile(x, p))

        # 95% Confidence Interval for mean
        if n > 1 and std is not None:
            t_crit = scipy_stats.t.ppf(0.975, df=n - 1)
            ci_lower = mean - t_crit * se_mean
            ci_upper = mean + t_crit * se_mean
        else:
            ci_lower = ci_upper = None

        results[var_name] = {
            "variable": var_name,
            "label": (meta or {}).get("label", var_name),
            "n": n,
            "n_missing": n_missing,
            "mean": round(mean, 10),
            "median": round(median, 10),
            "mode": mode_val,
            "mode_count": mode_count,
            "std": round(std, 10) if std is not None else None,
            "variance": round(variance, 10) if variance is not None else None,
            "se_mean": round(se_mean, 10) if se_mean is not None else None,
            "sum": round(total_sum, 10),
            "minimum": round(minimum, 10),
            "maximum": round(maximum, 10),
            "range": round(rng, 10),
            "skewness": round(skewness, 10) if skewness is not None else None,
            "se_skewness": round(se_skew, 10) if se_skew is not None else None,
            "kurtosis": round(kurtosis, 10) if kurtosis is not None else None,
            "se_kurtosis": round(se_kurt, 10) if se_kurt is not None else None,
            "percentiles": {k: round(v, 10) for k, v in percentiles.items()},
            "ci_95_lower": round(ci_lower, 10) if ci_lower is not None else None,
            "ci_95_upper": round(ci_upper, 10) if ci_upper is not None else None,
        }

    syntax = "DESCRIPTIVES VARIABLES=" + " ".join(var_names) + "\n  /STATISTICS=MEAN STDDEV VARIANCE MIN MAX SEMEAN SKEWNESS KURTOSIS."
    return {
        "status": "complete",
        "syntax": syntax,
        "result": {"descriptives": results},
        "warnings": warnings,
        "assumptions_checked": [],
    }


def _error(procedure, code, message, action, detail) -> dict:
    return {
        "status": "error",
        "syntax": "",
        "result": None,
        "warnings": [],
        "assumptions_checked": [],
        "error": {
            "procedure": procedure,
            "error_code": code,
            "message": message,
            "likely_cause": message,
            "suggested_action": action,
            "technical_detail": detail,
        }
    }


ProcedureRegistry.register(ProcedureSpec(
    id="descriptives",
    category="descriptive",
    display_name="Descriptive Statistics",
    description="Compute mean, SD, variance, SE, skewness, kurtosis, min, max, percentiles, CI.",
    required_inputs=["variables"],
    execute_fn=_execute_descriptives,
))
