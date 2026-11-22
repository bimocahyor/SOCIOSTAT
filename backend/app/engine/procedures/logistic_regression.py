"""
Binary Logistic Regression.
Uses statsmodels Logit — exact computation.
"""

from __future__ import annotations
from typing import Any
import numpy as np
import pandas as pd
import statsmodels.api as sm
from scipy import stats as scipy_stats

from app.engine.registry import ProcedureRegistry, ProcedureSpec
from app.engine.dataset_resolver import resolve_dataset


def _execute_logistic(
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
    reference_category: Any = parameters.get("reference_category", None)
    confidence_level: float = float(parameters.get("confidence_level", 0.95))

    if not dependent or not independent:
        return _error("logistic", "MISSING_VARS", "Dependent and independent variables required.", "", "")

    df, fw = resolve_dataset(variables_meta, cases, active_filter)
    warnings = list(fw)

    all_vars = [dependent] + independent
    for v in all_vars:
        if v not in df.columns:
            return _error("logistic", "VAR_NOT_FOUND", f"Variable '{v}' not found.", "", "")

    sub = df[all_vars].copy()
    for v in all_vars:
        sub[v] = pd.to_numeric(sub[v], errors="coerce")
    sub = sub.dropna()
    n = len(sub)

    # Validate binary DV
    y_unique = sub[dependent].unique()
    if len(y_unique) != 2:
        return _error("logistic", "NON_BINARY",
                      f"Dependent variable '{dependent}' has {len(y_unique)} unique values. Must be binary.",
                      "Recode to 0/1.", "")

    y_vals = sorted(y_unique)
    if reference_category is not None:
        # Reference is coded as 0
        y = (sub[dependent] == y_vals[1]).astype(int).to_numpy()
    else:
        # Lower value = 0, higher = 1
        y = (sub[dependent] == y_vals[1]).astype(int).to_numpy()

    X = sub[independent].to_numpy(dtype=float)
    X_const = sm.add_constant(X)

    if n < len(independent) + 10:
        warnings.append({
            "severity": "HIGH",
            "code": "SMALL_SAMPLE",
            "issue": f"N={n} may be too small for {len(independent)} predictors.",
            "why_it_matters": "Logistic regression requires adequate events per variable (EPV ≥ 10).",
            "recommended_action": "Consider reducing predictors or collecting more data.",
            "procedure_id": "logistic",
            "variables_involved": independent,
        })

    try:
        model = sm.Logit(y, X_const)
        result = model.fit(disp=False, maxiter=200)
    except Exception as e:
        return _error("logistic", "FIT_FAILED", f"Model fitting failed: {e}",
                      "Check for perfect separation or extreme values.", str(e))

    # Check for separation (very large coefficients)
    max_coef = float(np.max(np.abs(result.params)))
    if max_coef > 20:
        warnings.append({
            "severity": "HIGH",
            "code": "SEPARATION",
            "issue": f"Extremely large coefficient detected (max |B| = {max_coef:.1f}). Possible separation.",
            "why_it_matters": "Complete or quasi-complete separation makes MLE estimates unreliable.",
            "recommended_action": "Inspect predictor distributions by outcome. Consider Firth logistic regression.",
            "procedure_id": "logistic",
            "variables_involved": independent,
        })

    coef_names = ["(Constant)"] + independent
    alpha = 1 - confidence_level
    ci = result.conf_int(alpha=alpha)

    coefficients = []
    for i, name in enumerate(coef_names):
        b = float(result.params[i])
        se = float(result.bse[i])
        wald = (b / se)**2 if se > 0 else 0
        p = float(result.pvalues[i])
        exp_b = float(np.exp(b))
        ci_lo = float(ci[0][i])
        ci_hi = float(ci[1][i])
        exp_ci_lo = float(np.exp(ci_lo))
        exp_ci_hi = float(np.exp(ci_hi))
        coefficients.append({
            "name": name,
            "b": round(b, 6),
            "se": round(se, 6),
            "wald": round(wald, 6),
            "df": 1,
            "p": round(p, 6),
            "exp_b": round(exp_b, 6),
            "exp_b_ci_lower": round(exp_ci_lo, 6),
            "exp_b_ci_upper": round(exp_ci_hi, 6),
        })

    # Pseudo R²
    ll_full = float(result.llf)
    ll_null = float(result.llnull)
    cox_snell_r2 = float(1 - np.exp(-2 * (ll_full - ll_null) / n))
    nagelkerke_r2 = float(cox_snell_r2 / (1 - np.exp(2 * ll_null / n))) if (1 - np.exp(2 * ll_null / n)) != 0 else None

    # Classification table
    predicted_proba = result.predict()
    predicted_class = (predicted_proba >= 0.5).astype(int)
    tp = int(np.sum((y == 1) & (predicted_class == 1)))
    tn = int(np.sum((y == 0) & (predicted_class == 0)))
    fp = int(np.sum((y == 0) & (predicted_class == 1)))
    fn = int(np.sum((y == 1) & (predicted_class == 0)))
    overall_accuracy = round((tp + tn) / n * 100, 2) if n > 0 else 0

    syntax = (
        f"LOGISTIC REGRESSION VARIABLES {dependent}\n"
        f"  /METHOD=ENTER {' '.join(independent)}\n"
        "  /PRINT=GOODFIT CI(95)."
    )

    return {
        "status": "complete",
        "syntax": syntax,
        "result": {
            "dependent": dependent,
            "independent": independent,
            "n": n,
            "reference_value": y_vals[0],
            "event_value": y_vals[1],
            "coefficients": coefficients,
            "model_fit": {
                "chi_square": round(float(result.llr), 6),
                "df": len(independent),
                "p": round(float(result.llr_pvalue), 6),
                "neg_2ll": round(-2 * ll_full, 6),
                "cox_snell_r2": round(cox_snell_r2, 6),
                "nagelkerke_r2": round(nagelkerke_r2, 6) if nagelkerke_r2 else None,
            },
            "classification_table": {
                "tp": tp, "tn": tn, "fp": fp, "fn": fn,
                "overall_accuracy_pct": overall_accuracy,
            },
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
    id="logistic_regression",
    category="regression",
    display_name="Binary Logistic Regression",
    description="Binary logistic regression with Wald statistics, odds ratios, and classification table.",
    required_inputs=["dependent", "independent"],
    execute_fn=_execute_logistic,
))
