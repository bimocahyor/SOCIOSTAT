"""
Crosstabs procedure.
Contingency table with chi-square, Fisher exact, phi, Cramer's V.
Uses scipy.stats — exact calculations only.
"""

from __future__ import annotations
from typing import Any
import numpy as np
import pandas as pd
from scipy import stats as scipy_stats

from app.engine.registry import ProcedureRegistry, ProcedureSpec
from app.engine.dataset_resolver import resolve_dataset, get_variable_meta


def _execute_crosstabs(
    dataset_id: str,
    variables_meta: list[dict],
    cases: list[list[Any]],
    parameters: dict,
    active_filter: dict | None = None,
    weight_variable: str | None = None,
    split_variables: list[str] | None = None,
    **kwargs,
) -> dict:
    row_var: str = parameters.get("row_variable", "")
    col_var: str = parameters.get("column_variable", "")

    if not row_var or not col_var:
        return _error("crosstabs", "MISSING_VARIABLES",
                      "Row and column variables are required.",
                      "Specify row_variable and column_variable.", "")

    df, filter_warnings = resolve_dataset(variables_meta, cases, active_filter)
    warnings = list(filter_warnings)

    if row_var not in df.columns:
        return _error("crosstabs", "VAR_NOT_FOUND", f"Variable '{row_var}' not found.", "", "")
    if col_var not in df.columns:
        return _error("crosstabs", "VAR_NOT_FOUND", f"Variable '{col_var}' not found.", "", "")

    # Drop rows where either variable is missing
    sub = df[[row_var, col_var]].dropna()
    n_total = len(sub)

    if n_total == 0:
        return _error("crosstabs", "NO_VALID_CASES", "No valid cases after removing missing.", "", "")

    # Apply value labels for display
    row_meta = get_variable_meta(variables_meta, row_var)
    col_meta = get_variable_meta(variables_meta, col_var)

    def get_labels(meta):
        if not meta:
            return {}
        return {str(lbl["value"]): lbl["label"] for lbl in meta.get("value_labels", [])}

    row_labels = get_labels(row_meta)
    col_labels = get_labels(col_meta)

    # Build crosstab
    ct = pd.crosstab(sub[row_var], sub[col_var])
    row_values = list(ct.index)
    col_values = list(ct.columns)
    observed = ct.values  # numpy array

    # Expected counts
    row_sums = observed.sum(axis=1, keepdims=True)
    col_sums = observed.sum(axis=0, keepdims=True)
    grand_total = observed.sum()
    expected = row_sums * col_sums / grand_total

    # Chi-square
    chi2, p_chi2, dof, expected_from_scipy = scipy_stats.chi2_contingency(observed, correction=False)

    # Check conditions for Fisher exact
    n_rows_ct, n_cols_ct = observed.shape
    use_fisher = n_rows_ct == 2 and n_cols_ct == 2

    # Yates correction (for 2x2 only)
    chi2_yates = None
    p_yates = None
    if use_fisher:
        chi2_yates, p_yates, _, _ = scipy_stats.chi2_contingency(observed, correction=True)

    # Fisher Exact (2x2 only)
    odds_ratio = None
    p_fisher = None
    if use_fisher:
        odds_ratio, p_fisher = scipy_stats.fisher_exact(observed)
        odds_ratio = float(odds_ratio)
        p_fisher = float(p_fisher)

    # Likelihood ratio chi-square
    # G² = 2 * sum(O * ln(O/E)) — only where O > 0
    with np.errstate(divide="ignore", invalid="ignore"):
        g2 = 2 * np.nansum(
            np.where(observed > 0, observed * np.log(observed / expected_from_scipy), 0)
        )
    p_g2 = 1 - scipy_stats.chi2.cdf(g2, df=dof)

    # Effect sizes
    phi = None
    cramers_v = None
    contingency_coef = None

    if grand_total > 0:
        phi_sq = chi2 / grand_total
        phi = float(np.sqrt(phi_sq)) if use_fisher else None
        k = min(n_rows_ct, n_cols_ct)
        cramers_v = float(np.sqrt(phi_sq / (k - 1))) if k > 1 else 0.0
        contingency_coef = float(np.sqrt(chi2 / (chi2 + grand_total)))

    # Warning: expected count < 5
    min_expected = float(expected_from_scipy.min())
    pct_lt5 = float((expected_from_scipy < 5).sum() / expected_from_scipy.size * 100)
    assumption_warnings = []
    if min_expected < 1:
        warnings.append({
            "severity": "HIGH",
            "code": "EXPECTED_LT1",
            "issue": f"Some cells have expected count < 1 (minimum: {min_expected:.2f}).",
            "why_it_matters": "Chi-square test is invalid when expected counts < 1.",
            "recommended_action": "Combine categories or use Fisher Exact (for 2×2).",
            "procedure_id": "crosstabs",
            "variables_involved": [row_var, col_var],
        })
    elif pct_lt5 > 20:
        warnings.append({
            "severity": "MEDIUM",
            "code": "EXPECTED_LT5",
            "issue": f"{pct_lt5:.1f}% of cells have expected count < 5.",
            "why_it_matters": "Chi-square approximation may be unreliable.",
            "recommended_action": "Consider combining categories.",
            "procedure_id": "crosstabs",
            "variables_involved": [row_var, col_var],
        })

    # Build table rows with row%, col%, total%
    table_rows = []
    for i, rv in enumerate(row_values):
        row_label = row_labels.get(str(rv), str(rv))
        for j, cv in enumerate(col_values):
            col_label = col_labels.get(str(cv), str(cv))
            obs = int(observed[i, j])
            exp = round(float(expected_from_scipy[i, j]), 2)
            row_pct = round(obs / int(row_sums[i, 0]) * 100, 2) if row_sums[i, 0] > 0 else 0
            col_pct = round(obs / int(col_sums[0, j]) * 100, 2) if col_sums[0, j] > 0 else 0
            total_pct = round(obs / grand_total * 100, 2) if grand_total > 0 else 0
            residual = round(obs - exp, 4)
            std_residual = round((obs - exp) / np.sqrt(exp), 4) if exp > 0 else None
            table_rows.append({
                "row_value": rv, "row_label": row_label,
                "col_value": cv, "col_label": col_label,
                "observed": obs, "expected": exp,
                "row_pct": row_pct, "col_pct": col_pct, "total_pct": total_pct,
                "residual": residual, "std_residual": std_residual,
            })

    syntax = (f"CROSSTABS\n  /TABLES={row_var} BY {col_var}\n"
              "  /STATISTICS=CHISQ PHI CC.\n"
              "  /CELLS=COUNT EXPECTED ROW COLUMN TOTAL RESID SRESID.")

    return {
        "status": "complete",
        "syntax": syntax,
        "result": {
            "row_variable": row_var,
            "col_variable": col_var,
            "row_values": [str(v) for v in row_values],
            "col_values": [str(v) for v in col_values],
            "row_labels": row_labels,
            "col_labels": col_labels,
            "n_total": int(grand_total),
            "table_rows": table_rows,
            "statistics": {
                "chi_square": round(float(chi2), 6),
                "chi_square_df": int(dof),
                "chi_square_p": round(float(p_chi2), 6),
                "chi_square_yates": round(float(chi2_yates), 6) if chi2_yates is not None else None,
                "chi_square_yates_p": round(float(p_yates), 6) if p_yates is not None else None,
                "likelihood_ratio": round(float(g2), 6),
                "likelihood_ratio_p": round(float(p_g2), 6),
                "fisher_exact_p": round(float(p_fisher), 6) if p_fisher is not None else None,
                "odds_ratio": round(float(odds_ratio), 6) if odds_ratio is not None else None,
                "phi": round(phi, 6) if phi is not None else None,
                "cramers_v": round(cramers_v, 6) if cramers_v is not None else None,
                "contingency_coefficient": round(contingency_coef, 6) if contingency_coef is not None else None,
                "min_expected_count": round(min_expected, 4),
                "pct_cells_expected_lt5": round(pct_lt5, 2),
            },
        },
        "warnings": warnings,
        "assumptions_checked": [
            {
                "id": "chi2_expected_counts",
                "name": "Expected Cell Frequencies ≥ 5",
                "status": "passed" if pct_lt5 <= 20 and min_expected >= 1 else "failed",
                "test_statistic": min_expected,
                "p_value": None,
                "description": "All expected cell frequencies should be ≥ 5 (or at most 20% < 5).",
                "interpretation": (
                    f"Minimum expected count: {min_expected:.2f}. "
                    f"{pct_lt5:.1f}% of cells have expected count < 5."
                ),
            }
        ],
    }


def _error(procedure, code, message, action, detail) -> dict:
    return {
        "status": "error", "syntax": "", "result": None, "warnings": [],
        "assumptions_checked": [],
        "error": {
            "procedure": procedure, "error_code": code,
            "message": message, "likely_cause": message,
            "suggested_action": action, "technical_detail": detail,
        }
    }


ProcedureRegistry.register(ProcedureSpec(
    id="crosstabs",
    category="descriptive",
    display_name="Crosstabs",
    description="Contingency table with chi-square, Fisher exact, phi, Cramer's V.",
    required_inputs=["row_variable", "column_variable"],
    execute_fn=_execute_crosstabs,
))
