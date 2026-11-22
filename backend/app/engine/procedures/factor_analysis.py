"""
Exploratory Factor Analysis (EFA).
Uses factor_analyzer library or scikit-learn for PCA.
"""

from __future__ import annotations
from typing import Any
import numpy as np
import pandas as pd
from scipy import stats as scipy_stats

from app.engine.registry import ProcedureRegistry, ProcedureSpec
from app.engine.dataset_resolver import resolve_dataset


def _execute_efa(
    dataset_id: str,
    variables_meta: list[dict],
    cases: list[list[Any]],
    parameters: dict,
    active_filter: dict | None = None,
    weight_variable: str | None = None,
    split_variables: list[str] | None = None,
    **kwargs,
) -> dict:
    variables: list[str] = parameters.get("variables", [])
    n_factors: int = parameters.get("n_factors", 0)  # 0 = use eigenvalue > 1
    rotation: str = parameters.get("rotation", "varimax")
    extraction: str = parameters.get("extraction", "pca")

    if len(variables) < 3:
        return _error("factor", "INSUFFICIENT_VARS", "At least 3 variables required.", "", "")

    df, fw = resolve_dataset(variables_meta, cases, active_filter)
    warnings = list(fw)

    for v in variables:
        if v not in df.columns:
            return _error("factor", "VAR_NOT_FOUND", f"'{v}' not found.", "", "")

    sub = df[variables].copy()
    for v in variables:
        sub[v] = pd.to_numeric(sub[v], errors="coerce")
    sub = sub.dropna()
    n, p = sub.shape

    if n < p + 10:
        warnings.append({
            "severity": "HIGH",
            "code": "SMALL_SAMPLE",
            "issue": f"N={n}, p={p}. Sample may be too small for factor analysis.",
            "why_it_matters": "Factor analysis requires adequate N/p ratio (typically ≥ 5:1 or ≥ 100 cases).",
            "recommended_action": "Collect more data or reduce variables.",
            "procedure_id": "factor",
            "variables_involved": variables,
        })

    X = sub.to_numpy(dtype=float)

    # Correlation matrix
    corr_matrix = np.corrcoef(X.T)

    # KMO (Kaiser-Meyer-Olkin)
    kmo = _compute_kmo(corr_matrix)

    # Bartlett's test of sphericity
    n_obs = n
    chi2_bartlett = -(n_obs - 1 - (2*p + 5)/6) * np.log(np.linalg.det(corr_matrix))
    df_bartlett = p * (p - 1) / 2
    p_bartlett = 1 - scipy_stats.chi2.cdf(chi2_bartlett, df_bartlett)

    # KMO warnings
    if kmo < 0.5:
        warnings.append({
            "severity": "HIGH",
            "code": "LOW_KMO",
            "issue": f"KMO = {kmo:.3f} < 0.5. Factor analysis may not be appropriate.",
            "why_it_matters": "Low KMO indicates variables are not suitable for factor extraction.",
            "recommended_action": "Remove variables with low individual KMO or reconsider the variable set.",
            "procedure_id": "factor",
            "variables_involved": variables,
        })

    # PCA via eigendecomposition of correlation matrix
    from sklearn.decomposition import PCA
    pca = PCA()
    pca.fit(X)

    # Standardize X for factor loadings
    X_std = (X - X.mean(axis=0)) / (X.std(axis=0) + 1e-10)
    pca_std = PCA()
    pca_std.fit(X_std)

    eigenvalues = pca_std.explained_variance_
    explained_var_ratio = pca_std.explained_variance_ratio_
    components = pca_std.components_  # shape: (n_components, p)

    # Determine number of factors (eigenvalue > 1 rule if not specified)
    if n_factors == 0:
        n_factors = max(1, int(np.sum(eigenvalues > 1)))
    n_factors = min(n_factors, p - 1)

    # Communalities (from first n_factors components)
    loadings_raw = components[:n_factors].T  # shape: (p, n_factors) — scaled by sqrt(eigenvalue)
    for j in range(n_factors):
        loadings_raw[:, j] *= np.sqrt(eigenvalues[j])

    communalities_initial = np.ones(p)
    communalities_extraction = np.sum(loadings_raw**2, axis=1)

    # Apply Varimax rotation if requested
    if rotation == "varimax" and n_factors > 1:
        loadings_rotated = _varimax(loadings_raw)
    else:
        loadings_rotated = loadings_raw

    # Build eigenvalue table
    eigenvalue_table = []
    cumulative_pct = 0
    for i in range(p):
        ev = float(eigenvalues[i]) if i < len(eigenvalues) else 0
        pct = float(explained_var_ratio[i] * 100) if i < len(explained_var_ratio) else 0
        cumulative_pct += pct
        eigenvalue_table.append({
            "component": i + 1,
            "eigenvalue": round(ev, 6),
            "pct_variance": round(pct, 4),
            "cumulative_pct": round(cumulative_pct, 4),
            "extracted": i < n_factors,
        })

    # Factor loading matrix
    loading_matrix = []
    for j, v in enumerate(variables):
        row = {"variable": v}
        for f in range(n_factors):
            row[f"factor_{f+1}"] = round(float(loadings_rotated[j, f]), 6)
        row["communality"] = round(float(communalities_extraction[j]), 6)
        loading_matrix.append(row)

    # Correlation matrix for output
    corr_out = {
        variables[i]: {variables[j]: round(float(corr_matrix[i, j]), 6) for j in range(p)}
        for i in range(p)
    }

    syntax = (
        f"FACTOR VARIABLES={' '.join(variables)}\n"
        f"  /EXTRACTION={extraction.upper()}\n"
        f"  /ROTATION={rotation.upper()}\n"
        "  /PRINT=INITIAL EXTRACTION ROTATION KMO."
    )

    return {
        "status": "complete",
        "syntax": syntax,
        "result": {
            "variables": variables,
            "n": n,
            "n_factors_extracted": n_factors,
            "extraction": extraction,
            "rotation": rotation if n_factors > 1 else "none",
            "kmo": round(float(kmo), 6),
            "bartlett": {
                "chi_square": round(float(chi2_bartlett), 4),
                "df": int(df_bartlett),
                "p": round(float(p_bartlett), 6),
            },
            "eigenvalue_table": eigenvalue_table,
            "loading_matrix": loading_matrix,
            "correlation_matrix": corr_out,
        },
        "warnings": warnings,
        "assumptions_checked": [
            {
                "id": "kmo",
                "name": "Kaiser-Meyer-Olkin Measure of Sampling Adequacy",
                "status": "passed" if kmo >= 0.6 else ("warning" if kmo >= 0.5 else "failed"),
                "test_statistic": round(float(kmo), 6),
                "p_value": None,
                "description": "KMO ≥ 0.6 is considered acceptable.",
                "interpretation": f"KMO = {kmo:.3f}. {_kmo_label(kmo)}",
            },
            {
                "id": "bartlett",
                "name": "Bartlett's Test of Sphericity",
                "status": "passed" if p_bartlett < 0.05 else "failed",
                "test_statistic": round(float(chi2_bartlett), 4),
                "p_value": round(float(p_bartlett), 6),
                "description": "Significant Bartlett's test (p < .05) indicates correlations exist among variables.",
                "interpretation": (
                    f"χ² = {chi2_bartlett:.4f}, df = {int(df_bartlett)}, p = {p_bartlett:.4f}. "
                    + ("Factor analysis is appropriate." if p_bartlett < 0.05
                       else "Variables may be orthogonal — factor analysis may not be meaningful.")
                ),
            },
        ],
    }


def _varimax(loadings: np.ndarray, max_iter: int = 1000, tol: float = 1e-6) -> np.ndarray:
    """Varimax rotation."""
    p, k = loadings.shape
    if k == 1:
        return loadings
    rot = np.eye(k)
    for _ in range(max_iter):
        old_rot = rot.copy()
        for i in range(k):
            for j in range(i+1, k):
                L = loadings @ rot
                u = L[:, i]**2 - L[:, j]**2
                v = 2 * L[:, i] * L[:, j]
                A = np.sum(u)
                B = np.sum(v)
                C = np.sum(u**2 - v**2)
                D = np.sum(u*v)
                num = D - A*B/p
                den = C - (A**2 - B**2)/p
                angle = 0.25 * np.arctan2(num, den) if den != 0 else 0
                c, s = np.cos(angle), np.sin(angle)
                G = np.eye(k)
                G[i, i] = c; G[j, j] = c
                G[i, j] = -s; G[j, i] = s
                rot = rot @ G
        if np.max(np.abs(rot - old_rot)) < tol:
            break
    return loadings @ rot


def _compute_kmo(corr: np.ndarray) -> float:
    """Kaiser-Meyer-Olkin measure."""
    try:
        inv_corr = np.linalg.inv(corr)
        # Partial correlation matrix
        d = np.diag(inv_corr)
        partial = np.outer(np.sqrt(d), np.sqrt(d))
        anti = -inv_corr / partial
        np.fill_diagonal(anti, 0)
        sum_r2 = np.sum(corr**2) - corr.shape[0]
        sum_q2 = np.sum(anti**2)
        kmo = sum_r2 / (sum_r2 + sum_q2) if (sum_r2 + sum_q2) > 0 else 0
        return max(0.0, min(1.0, float(kmo)))
    except Exception:
        return 0.0


def _kmo_label(kmo: float) -> str:
    if kmo >= 0.9: return "Marvelous"
    if kmo >= 0.8: return "Meritorious"
    if kmo >= 0.7: return "Middling"
    if kmo >= 0.6: return "Mediocre"
    if kmo >= 0.5: return "Miserable"
    return "Unacceptable"


def _error(procedure, code, message, action, detail) -> dict:
    return {
        "status": "error", "syntax": "", "result": None, "warnings": [],
        "assumptions_checked": [],
        "error": {"procedure": procedure, "error_code": code,
                  "message": message, "likely_cause": message,
                  "suggested_action": action, "technical_detail": detail}
    }


ProcedureRegistry.register(ProcedureSpec(
    id="factor_analysis",
    category="dimension_reduction",
    display_name="Exploratory Factor Analysis",
    description="EFA with KMO, Bartlett's test, eigenvalues, communalities, and rotated loadings.",
    required_inputs=["variables"],
    execute_fn=_execute_efa,
))
