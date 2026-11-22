"""
Dataset resolver — applies filter, weight, split to case data before analysis.
Returns a pandas DataFrame with proper handling of missing values and filter conditions.
"""

from __future__ import annotations
from typing import Any
import numpy as np
import pandas as pd


def resolve_dataset(
    variables_meta: list[dict],
    cases: list[list[Any]],
    active_filter: dict | None = None,
    weight_variable: str | None = None,
    missing_handling: str = "listwise",
) -> tuple[pd.DataFrame, list[str]]:
    """
    Build a pandas DataFrame from raw case data, applying filters.
    Returns (DataFrame, warnings_list).
    """
    if not variables_meta or not cases:
        return pd.DataFrame(), []

    warnings = []
    col_names = [v["name"] for v in variables_meta]
    df = pd.DataFrame(cases, columns=col_names)

    # Convert types
    for var in variables_meta:
        name = var["name"]
        vtype = var.get("type", "numeric")
        if name not in df.columns:
            continue
        if vtype == "numeric":
            df[name] = pd.to_numeric(df[name], errors="coerce")
        # String and categorical stay as-is

    # Apply user-defined missing values
    for var in variables_meta:
        name = var["name"]
        if name not in df.columns:
            continue
        mv = var.get("missing_values", {})
        if not mv:
            continue
        mv_type = mv.get("type", "none")
        mv_values = mv.get("values", [])

        if mv_type == "single" and mv_values:
            df[name] = df[name].replace(mv_values[0], np.nan)
        elif mv_type == "multiple" and mv_values:
            df[name] = df[name].replace(mv_values, np.nan)
        elif mv_type == "range":
            low = mv.get("range_low")
            high = mv.get("range_high")
            if low is not None and high is not None:
                mask = (df[name] >= low) & (df[name] <= high)
                df.loc[mask, name] = np.nan

    # Apply filter expression
    if active_filter and active_filter.get("expression"):
        expr = active_filter["expression"]
        try:
            # Safe subset: translate SQL-like operators to pandas query syntax
            safe_expr = (
                expr.replace("AND", "&").replace("OR", "|")
                    .replace("==", "==").replace("!=", "!=")
            )
            df = df.query(safe_expr)
            if len(df) == 0:
                warnings.append("Filter expression matched 0 cases.")
        except Exception as e:
            warnings.append(f"Filter expression error: {e}. Filter was not applied.")

    return df, warnings


def get_numeric_column(df: pd.DataFrame, name: str, drop_missing: bool = True) -> np.ndarray:
    """Extract a clean numpy array for a numeric variable."""
    if name not in df.columns:
        raise ValueError(f"Variable '{name}' not found in dataset")
    col = pd.to_numeric(df[name], errors="coerce")
    if drop_missing:
        col = col.dropna()
    return col.to_numpy(dtype=float)


def get_variable_meta(variables_meta: list[dict], name: str) -> dict | None:
    for v in variables_meta:
        if v["name"] == name:
            return v
    return None
