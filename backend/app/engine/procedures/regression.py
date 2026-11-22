"""
Linear Regression: Simple and Multiple.
Uses statsmodels OLS — exact computation with VIF, diagnostics.
"""

from __future__ import annotations
from typing import Any
import numpy as np
import pandas as pd
import statsmodels.api as sm
from scipy import stats as scipy_stats

from app.engine.registry import ProcedureRegistry, ProcedureSpec
from app.engine.dataset_resolver import resolve_dataset


def _execute_regression(
    dataset_id: str,
    variables_meta: list[dict],
    cases: list[list[Any]],
    parameters: dict,
    active_filter: dict | None = None,
    weight_variable: str | None = None,
    split_variables: list[str] | None = None,
    **kwargs,
) -> dict:
    dependent: str = parameters.get("dependent", "")
    independent: list[str] = parameters.get("independent", [])
    include_constant: bool = parameters.get("include_constant", True)
    confidence_level: float = float(parameters.get("confidence_level", 0.95))

    if not dependent:
        return _error("regression", "NO_DEPENDENT", "Dependent variable required.", "", "")
    if not independent:
        return _error("regression", "NO_INDEPENDENT", "At least one independent variable required.", "", "")

    df, fw = resolve_dataset(variables_meta, cases, active_filter)
    warnings = list(fw)

    all_vars = [dependent] + independent
    for v in all_vars:
        if v not in df.columns:
            return _error("regression", "VAR_NOT_FOUND", f"Variable '{v}' not found.", "", "")

    sub = df[all_vars].copy()
    for v in all_vars:
        sub[v] = pd.to_numeric(sub[v], errors="coerce")
    sub = sub.dropna()
    n = len(sub)

    if n < len(independent) + 2:
        return _error("regression", "INSUFFICIENT_N",
                      f"N={n} is too small for {len(independent)} predictors.", "", "")

    y = sub[dependent].to_numpy(dtype=float)
    X = sub[independent].to_numpy(dtype=float)

    if include_constant:
        X_const = sm.add_constant(X)
        coef_names = ["(Constant)"] + independent
    else:
        X_const = X
        coef_names = independent

    # Check for perfect multicollinearity
    try:
        model = sm.OLS(y, X_const)
        result = model.fit()
    except np.linalg.LinAlgError as e:
        return _error("regression", "SINGULAR_MATRIX",
                      "Matrix inversion failed due to perfect multicollinearity.",
                      "Remove redundant predictors or inspect correlation matrix.",
                      str(e))

    # Model summary
    r = float(np.sqrt(result.rsquared)) if result.rsquared >= 0 else 0.0
    r_sq = float(result.rsquared)
    adj_r_sq = float(result.rsquared_adj)
    se_estimate = float(result.mse_resid**0.5)

    # ANOVA table
    ss_regression = float(result.ess)
    ss_residual = float(result.ssr)
    ss_total = ss_regression + ss_residual
    df_regression = len(independent)
    df_residual = int(result.df_resid)
    df_total = n - 1
    ms_regression = ss_regression / df_regression if df_regression > 0 else None
    ms_residual = ss_residual / df_residual if df_residual > 0 else None
    f_stat = float(result.fvalue) if result.fvalue else None
    p_f = float(result.f_pvalue) if result.f_pvalue is not None else None

    # Coefficients
    coefficients = []
    bse = result.bse
    tvals = result.tvalues
    pvals = result.pvalues
    params_vals = result.params
    ci = result.conf_int(alpha=1-confidence_level)

    # Standardized beta (for independent vars only, not constant)
    y_std = float(np.std(y, ddof=1))
    x_stds = [float(np.std(sub[v], ddof=1)) for v in independent]

    for i, name in enumerate(coef_names):
        b = float(params_vals[i])
        se = float(bse[i])
        t = float(tvals[i])
        p = float(pvals[i])
        ci_lo = float(ci[0][i])
        ci_hi = float(ci[1][i])

        # Beta (standardized)
        if name != "(Constant)" and y_std > 0:
            ind_idx = independent.index(name)
            beta = b * x_stds[ind_idx] / y_std if x_stds[ind_idx] > 0 else 0.0
        else:
            beta = None

        coefficients.append({
            "name": name,
            "b": round(b, 6),
            "se": round(se, 6),
            "beta": round(float(beta), 6) if beta is not None else None,
            "t": round(t, 6),
            "p": round(p, 6),
            "ci_lower": round(ci_lo, 6),
            "ci_upper": round(ci_hi, 6),
        })

    # VIF / Tolerance
    vif_results = {}
    if len(independent) > 1:
        try:
            from statsmodels.stats.outliers_influence import variance_inflation_factor
            for j, v in enumerate(independent):
                # VIF is computed on X without constant for SM's VIF function
                vif = variance_inflation_factor(sub[independent].to_numpy(dtype=float), j)
                tolerance = 1 / vif if vif > 0 else None
                vif_results[v] = {
                    "vif": round(float(vif), 4),
                    "tolerance": round(float(tolerance), 4) if tolerance else None,
                }
                if vif > 10:
                    warnings.append({
                        "severity": "HIGH",
                        "code": "HIGH_VIF",
                        "issue": f"VIF for '{v}' = {vif:.2f} (> 10).",
                        "why_it_matters": "High VIF indicates severe multicollinearity.",
                        "recommended_action": "Remove or combine correlated predictors.",
                        "procedure_id": "regression",
                        "variables_involved": [v],
                    })
                elif vif > 5:
                    warnings.append({
                        "severity": "MEDIUM",
                        "code": "MODERATE_VIF",
                        "issue": f"VIF for '{v}' = {vif:.2f} (5–10).",
                        "why_it_matters": "Moderate multicollinearity detected.",
                        "recommended_action": "Review predictor correlations.",
                        "procedure_id": "regression",
                        "variables_involved": [v],
                    })
        except Exception:
            pass

    # Diagnostics
    fitted = np.asarray(result.fittedvalues)
    residuals = np.asarray(result.resid)
    std_residuals = residuals / se_estimate if se_estimate > 0 else residuals

    # Durbin-Watson
    dw = float(sm.stats.stattools.durbin_watson(residuals))

    # Normality of residuals (Shapiro-Wilk)
    if len(residuals) >= 3:
        sw_stat, sw_p = scipy_stats.shapiro(residuals[:min(len(residuals), 5000)])
    else:
        sw_stat, sw_p = None, None

    assumption_checks = []
    if sw_stat is not None:
        assumption_checks.append({
            "id": "residual_normality",
            "name": "Normality of Residuals (Shapiro-Wilk)",
            "status": "passed" if sw_p >= 0.05 else "warning",
            "test_statistic": round(float(sw_stat), 6),
            "p_value": round(float(sw_p), 6),
            "description": "Residuals should be approximately normally distributed.",
            "interpretation": (
                f"Shapiro-Wilk W = {sw_stat:.4f}, p = {sw_p:.4f}. "
                + ("Residuals appear normal." if sw_p >= 0.05
                   else "Residuals may not be normal. Inspect Q-Q plot.")
            ),
        })
    assumption_checks.append({
        "id": "durbin_watson",
        "name": "Independence of Residuals (Durbin-Watson)",
        "status": "passed" if 1.5 <= dw <= 2.5 else "warning",
        "test_statistic": round(dw, 4),
        "p_value": None,
        "description": "DW ≈ 2 indicates no autocorrelation. DW < 1.5 or > 2.5 may indicate autocorrelation.",
        "interpretation": f"Durbin-Watson = {dw:.4f}.",
    })

    syntax = (
        f"REGRESSION\n"
        f"  /DEPENDENT {dependent}\n"
        f"  /METHOD=ENTER {' '.join(independent)}."
    )

    return {
        "status": "complete",
        "syntax": syntax,
        "result": {
            "dependent": dependent,
            "independent": independent,
            "n": n,
            "model_summary": {
                "r": round(r, 6),
                "r_squared": round(r_sq, 6),
                "adjusted_r_squared": round(adj_r_sq, 6),
                "se_estimate": round(se_estimate, 6),
            },
            "anova_table": {
                "regression": {
                    "ss": round(ss_regression, 6), "df": df_regression,
                    "ms": round(ms_regression, 6) if ms_regression else None,
                    "f": round(f_stat, 6) if f_stat else None,
                    "p": round(p_f, 6) if p_f is not None else None,
                },
                "residual": {
                    "ss": round(ss_residual, 6), "df": df_residual,
                    "ms": round(ms_residual, 6) if ms_residual else None,
                },
                "total": {"ss": round(ss_total, 6), "df": df_total},
            },
            "coefficients": coefficients,
            "vif": vif_results,
            "diagnostics": {
                "durbin_watson": round(dw, 4),
                "residuals_sample": [round(float(r), 4) for r in residuals[:50]],
                "fitted_sample": [round(float(f), 4) for f in fitted[:50]],
            },
        },
        "warnings": warnings,
        "assumptions_checked": assumption_checks,
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
    id="linear_regression",
    category="regression",
    display_name="Linear Regression",
    description="Simple and multiple linear regression with diagnostics, VIF, and standardized coefficients.",
    required_inputs=["dependent", "independent"],
    execute_fn=_execute_regression,
))
