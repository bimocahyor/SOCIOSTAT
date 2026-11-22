"""
Frequencies procedure.
Computes frequency tables with count, percent, valid percent, cumulative percent.
All computation via pandas — no values are fabricated.
"""

from __future__ import annotations
from typing import Any
import numpy as np
import pandas as pd

from app.engine.registry import ProcedureRegistry, ProcedureSpec
from app.engine.dataset_resolver import resolve_dataset, get_variable_meta


def _execute_frequencies(
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
        return _error("frequencies", "NO_VARIABLES", "No variables specified.",
                      "Provide at least one variable name.", "")

    df, filter_warnings = resolve_dataset(variables_meta, cases, active_filter)
    warnings = [{"severity": "LOW", "code": "FILTER_WARN", "issue": w,
                 "why_it_matters": "", "recommended_action": "", "procedure_id": "frequencies",
                 "variables_involved": []} for w in filter_warnings]

    tables = {}
    for var_name in var_names:
        if var_name not in df.columns:
            warnings.append({"severity": "HIGH", "code": "VAR_NOT_FOUND",
                              "issue": f"Variable '{var_name}' not found.",
                              "why_it_matters": "Cannot compute frequencies for a missing variable.",
                              "recommended_action": "Check variable name.",
                              "procedure_id": "frequencies",
                              "variables_involved": [var_name]})
            continue

        meta = get_variable_meta(variables_meta, var_name)
        value_labels = {}
        if meta:
            for lbl in meta.get("value_labels", []):
                value_labels[str(lbl["value"])] = lbl["label"]

        col = df[var_name]
        total = len(col)
        n_missing = col.isna().sum()
        n_valid = total - n_missing

        # Frequency count (including missing in total)
        val_counts = col.value_counts(dropna=True, sort=False).sort_index()
        rows = []
        cumulative_valid_count = 0
        for val, count in val_counts.items():
            cumulative_valid_count += count
            label = value_labels.get(str(val), "")
            rows.append({
                "value": val,
                "label": label,
                "frequency": int(count),
                "percent": round(count / total * 100, 2) if total > 0 else 0,
                "valid_percent": round(count / n_valid * 100, 2) if n_valid > 0 else 0,
                "cumulative_percent": round(cumulative_valid_count / n_valid * 100, 2) if n_valid > 0 else 0,
            })

        if n_missing > 0:
            rows.append({
                "value": None,
                "label": "Missing",
                "frequency": int(n_missing),
                "percent": round(n_missing / total * 100, 2) if total > 0 else 0,
                "valid_percent": None,
                "cumulative_percent": None,
            })

        tables[var_name] = {
            "variable": var_name,
            "label": (meta or {}).get("label", var_name),
            "n_total": total,
            "n_valid": n_valid,
            "n_missing": int(n_missing),
            "rows": rows,
        }

    syntax = _generate_syntax(var_names)
    return {
        "status": "complete",
        "syntax": syntax,
        "result": {"tables": tables},
        "warnings": warnings,
        "assumptions_checked": [],
    }


def _generate_syntax(var_names: list[str]) -> str:
    lines = ["FREQUENCIES VARIABLES=" + " ".join(var_names) + " /ORDER=ANALYSIS."]
    return "\n".join(lines)


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
    id="frequencies",
    category="descriptive",
    display_name="Frequencies",
    description="Compute frequency table with counts, percentages, and cumulative percentages.",
    required_inputs=["variables"],
    execute_fn=_execute_frequencies,
    syntax_generator_fn=_generate_syntax,
))
