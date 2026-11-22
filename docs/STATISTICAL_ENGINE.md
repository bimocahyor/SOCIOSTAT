# SOCIOSTAT — Statistical Engine

## Design

The statistical engine is the single source of truth for all numerical output.
No statistics are computed in the frontend.

## ProcedureRegistry Pattern

Every statistical procedure is registered with a full specification:

```python
ProcedureRegistry.register(ProcedureSpec(
    id="linear_regression",
    category="regression",
    display_name="Linear Regression",
    required_inputs=["dependent", "independent"],
    input_schema=LinearRegressionInput,
    validation_fn=validate_linear_regression,
    execute_fn=execute_linear_regression,
    output_schema=LinearRegressionOutput,
    syntax_generator=linear_regression_syntax,
    assumption_checkers=[
        check_linearity,
        check_multicollinearity,
        check_residual_normality,
        check_homoscedasticity,
        check_influential_points,
    ],
    interpretation_template="linear_regression",
))
```

## Engine Layers

```
User Request (UI dialog or Syntax)
         │
         ▼
  AnalysisSpec (typed Pydantic model)
         │
         ▼
  ProcedureValidator
  - variable existence
  - measurement level compatibility
  - data type checks
  - sample size minimum
  - missing data assessment
         │
         ▼
  DatasetResolver
  - apply active filter
  - apply weights
  - apply split
  - resolve missing values (listwise / pairwise)
         │
         ▼
  AssumptionChecker (pre-analysis)
         │
         ▼
  ComputeEngine (NumPy / SciPy / Statsmodels)
         │
         ▼
  WarningEngine
  - check numerical stability
  - flag unexpected results
         │
         ▼
  ResultSerializer (typed Pydantic output schema)
         │
         ▼
  SyntaxGenerator
         │
         ▼
  OutputObjectBuilder
         │
         ▼
  AnalysisRecord (stored to DB)
```

## Numerical Libraries

| Purpose                  | Library              |
|--------------------------|----------------------|
| Array operations         | NumPy 1.26+          |
| DataFrame operations     | Pandas 2.0+          |
| Statistical tests        | SciPy 1.11+          |
| Linear models, GLM       | Statsmodels 0.14+    |
| Machine learning         | Scikit-learn 1.3+    |
| Effect sizes, power      | Pingouin 0.5+        |
| Survival analysis        | Lifelines 0.27+      |

## Implemented Procedures (Phase 1-5)

### Phase 3 — Core Statistics
- `frequencies` — Frequency table
- `descriptives` — Descriptive statistics
- `explore` — Exploratory analysis with normality
- `crosstabs` — Contingency table + chi-square

### Phase 4 — Inferential
- `correlation_pearson` — Pearson correlation
- `correlation_spearman` — Spearman correlation
- `correlation_kendall` — Kendall correlation
- `ttest_onesample` — One-sample t-test
- `ttest_independent` — Independent samples t-test
- `ttest_paired` — Paired samples t-test
- `anova_oneway` — One-way ANOVA

### Phase 5 — Research Statistics
- `linear_regression_simple` — Simple linear regression
- `linear_regression_multiple` — Multiple linear regression
- `logistic_regression_binary` — Binary logistic regression
- `reliability_alpha` — Cronbach's alpha
- `factor_efa` — Exploratory factor analysis
- `nonparametric_mannwhitney` — Mann-Whitney U
- `nonparametric_wilcoxon` — Wilcoxon signed-rank
- `nonparametric_kruskalwallis` — Kruskal-Wallis

## Numerical Validation

Every procedure has:
1. Unit tests with known reference values
2. Comparison against trusted implementations (SciPy/Statsmodels)
3. Defined numerical tolerance (typically 1e-6 for statistics, 1e-10 for exact)
4. Edge case tests (n=2, all-same values, perfect correlation, etc.)

Reference datasets are stored in `backend/tests/reference_data/`.

## Error Contract

All computation errors return structured objects:

```python
class ComputationError(BaseModel):
    procedure: str
    error_code: str
    message: str
    likely_cause: str
    suggested_action: str
    technical_detail: str | None
```

Never return generic 500 errors for statistical failures.
