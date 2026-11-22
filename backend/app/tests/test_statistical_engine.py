"""
SOCIOSTAT — Statistical Engine Validation Tests
All computed values are compared against known reference values.
Tolerance: 1e-4 for most statistics, 1e-6 for exact operations.
"""

import sys
import os
# Add backend directory to path
_backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
sys.path.insert(0, _backend_dir)

import numpy as np
from scipy import stats as scipy_stats

# ─── Reference data ───────────────────────────────────────────────────
# Simple dataset: 20 cases, 2 numeric vars
DATA_X = [4, 5, 3, 7, 6, 8, 2, 9, 5, 4, 6, 7, 3, 5, 6, 8, 4, 7, 5, 6]
DATA_Y = [3, 4, 2, 6, 5, 7, 1, 8, 4, 3, 5, 6, 2, 4, 5, 7, 3, 6, 4, 5]
DATA_GROUP = [0]*10 + [1]*10  # Binary group

VARIABLES_META = [
    {"id": "v1", "name": "x", "label": "Variable X", "type": "numeric",
     "width": 8, "decimals": 2, "value_labels": [], "missing_values": {"type": "none", "system_missing": True, "values": []},
     "measurement_level": "scale", "role": "input", "column_width": 100, "visibility": True, "description": "", "format": "F8.2", "custom_metadata": {}},
    {"id": "v2", "name": "y", "label": "Variable Y", "type": "numeric",
     "width": 8, "decimals": 2, "value_labels": [], "missing_values": {"type": "none", "system_missing": True, "values": []},
     "measurement_level": "scale", "role": "input", "column_width": 100, "visibility": True, "description": "", "format": "F8.2", "custom_metadata": {}},
    {"id": "v3", "name": "g", "label": "Group", "type": "numeric",
     "width": 8, "decimals": 0, "value_labels": [], "missing_values": {"type": "none", "system_missing": True, "values": []},
     "measurement_level": "nominal", "role": "input", "column_width": 100, "visibility": True, "description": "", "format": "F8.0", "custom_metadata": {}},
]

CASES = [[x, y, g] for x, y, g in zip(DATA_X, DATA_Y, DATA_GROUP)]

PASSED = 0
FAILED = 0
ERRORS = []

def assert_close(name, actual, expected, tol=1e-4):
    global PASSED, FAILED
    if actual is None:
        FAILED += 1
        ERRORS.append(f"FAIL {name}: got None, expected {expected}")
        return
    diff = abs(float(actual) - float(expected))
    if diff <= tol:
        PASSED += 1
        print(f"  PASS {name}: {actual:.6f} ~ {expected:.6f}")
    else:
        FAILED += 1
        ERRORS.append(f"FAIL {name}: got {actual:.6f}, expected {expected:.6f}, diff={diff:.2e}")
        print(f"  FAIL {name}: got {actual:.6f}, expected {expected:.6f}, diff={diff:.2e}")

def assert_equal(name, actual, expected):
    global PASSED, FAILED
    if actual == expected:
        PASSED += 1
        print(f"  PASS {name}: {actual}")
    else:
        FAILED += 1
        ERRORS.append(f"FAIL {name}: got {actual!r}, expected {expected!r}")
        print(f"  FAIL {name}: got {actual!r}, expected {expected!r}")

# ─── Compute reference values using scipy directly ────────────────────
x = np.array(DATA_X, dtype=float)
y = np.array(DATA_Y, dtype=float)

REF_MEAN_X = float(np.mean(x))
REF_SD_X = float(np.std(x, ddof=1))
REF_SE_X = REF_SD_X / np.sqrt(len(x))
REF_MIN_X = float(np.min(x))
REF_MAX_X = float(np.max(x))
REF_SKEW_X = float(scipy_stats.skew(x, bias=False))
REF_KURT_X = float(scipy_stats.kurtosis(x, bias=False, fisher=True))

REF_PEARSON_R, REF_PEARSON_P = scipy_stats.pearsonr(x, y)
REF_SPEARMAN_R, REF_SPEARMAN_P = scipy_stats.spearmanr(x, y)

group0 = x[:10]
group1 = x[10:]
REF_T_IND, REF_P_IND = scipy_stats.ttest_ind(group0, group1)
REF_T_WELCH, REF_P_WELCH = scipy_stats.ttest_ind(group0, group1, equal_var=False)

REF_T_OS, REF_P_OS = scipy_stats.ttest_1samp(x, 5.0)
REF_T_PAIR, REF_P_PAIR = scipy_stats.ttest_rel(x, y)

REF_F, REF_P_F = scipy_stats.f_oneway(group0, group1)

# Cronbach alpha reference
items_data = np.column_stack([x, y, x + y + np.random.RandomState(42).normal(0, 0.5, 20)])
k = items_data.shape[1]
item_vars = np.var(items_data, axis=0, ddof=1)
total_var = np.var(items_data.sum(axis=1), ddof=1)
REF_ALPHA = (k / (k - 1)) * (1 - item_vars.sum() / total_var)

# Linear regression reference
import statsmodels.api as sm
X_const = sm.add_constant(x)
ols = sm.OLS(y, X_const).fit()
REF_REG_B0 = float(ols.params[0])
REF_REG_B1 = float(ols.params[1])
REF_REG_R2 = float(ols.rsquared)
REF_REG_F = float(ols.fvalue)

# ─── Run tests ────────────────────────────────────────────────────────
print("\n" + "="*60)
print("SOCIOSTAT STATISTICAL ENGINE VALIDATION")
print("="*60)

# Test 1: Descriptives
print("\n[1] Descriptive Statistics")
from app.engine.procedures.descriptives import _execute_descriptives
result = _execute_descriptives("ds1", VARIABLES_META, CASES, {"variables": ["x"]})
assert_equal("status", result["status"], "complete")
d = result["result"]["descriptives"]["x"]
assert_close("mean", d["mean"], REF_MEAN_X)
assert_close("std", d["std"], REF_SD_X)
assert_close("se_mean", d["se_mean"], REF_SE_X)
assert_close("minimum", d["minimum"], REF_MIN_X)
assert_close("maximum", d["maximum"], REF_MAX_X)
assert_close("skewness", d["skewness"], REF_SKEW_X)
assert_close("kurtosis", d["kurtosis"], REF_KURT_X)

# Test 2: Frequencies
print("\n[2] Frequencies")
from app.engine.procedures.frequencies import _execute_frequencies

# Create simple categorical variable
cat_vars_meta = [{"id": "c1", "name": "cat", "label": "Category", "type": "categorical",
    "width": 8, "decimals": 0, "value_labels": [{"value": "1", "label": "A"}, {"value": "2", "label": "B"}],
    "missing_values": {"type": "none", "system_missing": True, "values": []},
    "measurement_level": "nominal", "role": "input", "column_width": 100, "visibility": True,
    "description": "", "format": "A8", "custom_metadata": {}}]
cat_cases = [["1"]]*8 + [["2"]]*12
freq_result = _execute_frequencies("ds1", cat_vars_meta, cat_cases, {"variables": ["cat"]})
assert_equal("freq status", freq_result["status"], "complete")
t = freq_result["result"]["tables"]["cat"]
assert_equal("freq n_total", t["n_total"], 20)
assert_equal("freq n_missing", t["n_missing"], 0)
r1 = next(r for r in t["rows"] if str(r["value"]) == "1")
assert_equal("freq count 1", r1["frequency"], 8)
assert_close("freq pct 1", r1["percent"], 40.0)
assert_close("freq valid_pct 1", r1["valid_percent"], 40.0)

# Test 3: Correlation
print("\n[3] Correlation")
from app.engine.procedures.correlation import _execute_correlation
corr_result = _execute_correlation("ds1", VARIABLES_META, CASES, {"variables": ["x", "y"], "method": "pearson"})
assert_equal("corr status", corr_result["status"], "complete")
r_val = corr_result["result"]["correlation_matrix"]["x"]["y"]
p_val = corr_result["result"]["p_matrix"]["x"]["y"]
assert_close("pearson r", r_val, REF_PEARSON_R)
assert_close("pearson p", p_val, REF_PEARSON_P)

# Test 4: One-Sample T-Test
print("\n[4] One-Sample T-Test")
from app.engine.procedures.ttest import _execute_ttest
os_result = _execute_ttest("ds1", VARIABLES_META, CASES,
    {"type": "onesample", "variable": "x", "test_value": 5.0})
assert_equal("onesample status", os_result["status"], "complete")
r = os_result["result"]
assert_close("t stat", r["t"], REF_T_OS)
assert_close("p value", r["p_two_tailed"], REF_P_OS)
assert_close("mean", r["mean"], REF_MEAN_X)

# Test 5: Independent T-Test
print("\n[5] Independent Samples T-Test")
ind_result = _execute_ttest("ds1", VARIABLES_META, CASES,
    {"type": "independent", "variable": "x", "grouping_variable": "g"})
assert_equal("independent status", ind_result["status"], "complete")
r = ind_result["result"]
assert_close("t equal var", r["equal_variance"]["t"], REF_T_IND, tol=1e-3)
assert_close("t welch", r["unequal_variance"]["t"], REF_T_WELCH, tol=1e-3)

# Test 6: Paired T-Test (use different random data to avoid degenerate case)
print("\n[6] Paired T-Test")
pair_result = _execute_ttest("ds1", VARIABLES_META, CASES,
    {"type": "paired", "variable1": "x", "variable2": "g"})
assert_equal("paired status", pair_result["status"], "complete")
r = pair_result["result"]
ref_t6, ref_p6 = scipy_stats.ttest_rel(x, np.array(DATA_GROUP, dtype=float))
assert_close("paired t", r["t"], ref_t6)
assert_close("paired p", r["p_two_tailed"], ref_p6)

# Test 7: One-Way ANOVA
print("\n[7] One-Way ANOVA")
from app.engine.procedures.anova import _execute_anova
anova_result = _execute_anova("ds1", VARIABLES_META, CASES,
    {"dependent": "x", "factor": "g"})
assert_equal("anova status", anova_result["status"], "complete")
r = anova_result["result"]["anova_table"]
assert_close("F statistic", r["between"]["f"], REF_F, tol=1e-3)

# Test 8: Linear Regression
print("\n[8] Linear Regression")
from app.engine.procedures.regression import _execute_regression
reg_result = _execute_regression("ds1", VARIABLES_META, CASES,
    {"dependent": "y", "independent": ["x"]})
assert_equal("regression status", reg_result["status"], "complete")
coefs = {c["name"]: c for c in reg_result["result"]["coefficients"]}
assert_close("intercept B", coefs["(Constant)"]["b"], REF_REG_B0, tol=1e-3)
assert_close("x B", coefs["x"]["b"], REF_REG_B1, tol=1e-3)
assert_close("R squared", reg_result["result"]["model_summary"]["r_squared"], REF_REG_R2, tol=1e-3)
assert_close("F stat", reg_result["result"]["anova_table"]["regression"]["f"], REF_REG_F, tol=1e-2)

# Test 9: Reliability
print("\n[9] Reliability Analysis (Cronbach's Alpha)")
from app.engine.procedures.reliability import _execute_reliability
# Use items from all 3 variables
rel_vars_meta = VARIABLES_META + [
    {"id": "v4", "name": "z", "label": "Z", "type": "numeric",
     "width": 8, "decimals": 2, "value_labels": [], "missing_values": {"type": "none", "system_missing": True, "values": []},
     "measurement_level": "scale", "role": "input", "column_width": 100, "visibility": True, "description": "", "format": "F8.2", "custom_metadata": {}}
]
rng = np.random.RandomState(42)
z_vals = list(x + y + rng.normal(0, 0.5, 20))
rel_cases = [[xv, yv, gv, zv] for xv, yv, gv, zv in zip(DATA_X, DATA_Y, DATA_GROUP, z_vals)]
rel_result = _execute_reliability("ds1", rel_vars_meta, rel_cases, {"items": ["x", "y", "z"]})
assert_equal("reliability status", rel_result["status"], "complete")
computed_alpha = rel_result["result"]["alpha"]
assert_close("Cronbach alpha", computed_alpha, REF_ALPHA, tol=0.01)

# Test 10: Crosstabs
print("\n[10] Crosstabs (Chi-Square)")
from app.engine.procedures.crosstabs import _execute_crosstabs
ct_vars = [
    {"id": "a1", "name": "a", "label": "A", "type": "numeric", "width": 8, "decimals": 0,
     "value_labels": [], "missing_values": {"type": "none", "system_missing": True, "values": []},
     "measurement_level": "nominal", "role": "input", "column_width": 100, "visibility": True, "description": "", "format": "F8.0", "custom_metadata": {}},
    {"id": "b1", "name": "b", "label": "B", "type": "numeric", "width": 8, "decimals": 0,
     "value_labels": [], "missing_values": {"type": "none", "system_missing": True, "values": []},
     "measurement_level": "nominal", "role": "input", "column_width": 100, "visibility": True, "description": "", "format": "F8.0", "custom_metadata": {}},
]
# 2x2 table: [[10,5],[3,12]]
ct_cases = [[1,1]]*10 + [[1,2]]*5 + [[2,1]]*3 + [[2,2]]*12
ct_result = _execute_crosstabs("ds1", ct_vars, ct_cases, {"row_variable": "a", "column_variable": "b"})
assert_equal("crosstabs status", ct_result["status"], "complete")
# Reference chi-square for 2x2 [[10,5],[3,12]]
obs = np.array([[10,5],[3,12]])
ref_chi2, ref_p, ref_df, _ = scipy_stats.chi2_contingency(obs, correction=False)
assert_close("chi-square", ct_result["result"]["statistics"]["chi_square"], ref_chi2, tol=1e-3)
assert_close("chi-square p", ct_result["result"]["statistics"]["chi_square_p"], ref_p, tol=1e-3)

# ─── Summary ──────────────────────────────────────────────────────────
print("\n" + "="*60)
print(f"Results: {PASSED} passed, {FAILED} failed")
if ERRORS:
    print("\nFailed tests:")
    for e in ERRORS:
        print(f"  {e}")
print("="*60)
sys.exit(0 if FAILED == 0 else 1)
