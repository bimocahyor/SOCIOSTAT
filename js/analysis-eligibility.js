/* ════════════════════════════════════════════════════════════════════
   AnalysisEligibility — procedure-aware variable eligibility service
   ════════════════════════════════════════════════════════════════════
   Exposes:
     AnalysisEligibility.getEligibleVariables(dataset, procedure, role)
       → [ { varDef, stats, eligible, reason } ]

     AnalysisEligibility.filterFn(dataset, procedure, role)
       → function(varDef) → boolean   (for use with varList filterFn)

     AnalysisEligibility.getActualCaseCount(dataset)
       → number   (cases with at least one non-missing registered value)

   Procedure IDs match ProcedureRegistry keys:
     'frequencies', 'descriptives', 'crosstabs',
     'correlation', 'ttest_onesample', 'ttest_independent', 'ttest_paired',
     'anova_oneway', 'linear_regression', 'logistic_regression',
     'reliability', 'factor_analysis', 'nonparametric_*', 'kaplan_meier',
     'kmeans'

   Roles:
     'dependent'   — outcome variable
     'independent' — predictor / factor
     'item'        — scale item (reliability / factor)
     'any'         — no role restriction (default)
   ════════════════════════════════════════════════════════════════════ */
const AnalysisEligibility = (() => {

  /* ── Helpers ───────────────────────────────────────────────────── */

  function _isNumericType(varDef) {
    return varDef.type === 'numeric' || varDef.type === 'boolean';
  }

  function _isCategoricalType(varDef) {
    // String, boolean, or numeric used as nominal/ordinal
    return varDef.type === 'string' ||
           varDef.type === 'boolean' ||
           (varDef.type === 'numeric' && (varDef.measurementLevel === 'nominal' || varDef.measurementLevel === 'ordinal'));
  }

  /**
   * Count actual cases (rows with at least one non-missing value across
   * registered variables).  Delegates to DataQuality.
   */
  function getActualCaseCount(dataset) {
    if (!dataset || !Array.isArray(dataset.cases)) return 0;
    return dataset.cases.filter(row => DataQuality.isActualCase(row, dataset)).length;
  }

  /* ── Per-procedure eligibility rules ──────────────────────────── */

  /**
   * Returns eligibility rules for a given procedure + role combination.
   * Rules:
   *   typeOk(varDef)    → type is compatible
   *   dataOk(stats)     → has sufficient actual data
   *   reason(varDef, stats) → human-readable reason when NOT eligible
   */
  function _getRules(procedure, role) {
    const proc = (procedure || '').toLowerCase();

    // ── Frequencies: any variable with data ───────────────────────
    if (proc === 'frequencies') {
      return {
        typeOk: () => true,
        dataOk: s => s.valid > 0,
        reason: (v, s) => s.valid === 0 ? 'Empty — no values' : null
      };
    }

    // ── Descriptives: numeric, non-empty ──────────────────────────
    if (proc === 'descriptives') {
      return {
        typeOk: v => _isNumericType(v),
        dataOk: s => s.valid > 0,
        reason: (v, s) => {
          if (!_isNumericType(v)) return 'String/date — numeric only';
          if (s.valid === 0) return 'Empty — no numeric values';
          return null;
        }
      };
    }

    // ── Crosstabs: any non-empty variable ─────────────────────────
    if (proc === 'crosstabs') {
      return {
        typeOk: () => true,
        dataOk: s => s.valid > 0,
        reason: (v, s) => s.valid === 0 ? 'Empty — no values' : null
      };
    }

    // ── Bivariate Correlation: numeric non-empty ──────────────────
    if (proc === 'correlation' || proc === 'bivariate_correlations') {
      return {
        typeOk: v => _isNumericType(v),
        dataOk: s => s.valid > 0,
        reason: (v, s) => {
          if (!_isNumericType(v)) return 'String/date — numeric only';
          if (s.valid === 0) return 'Empty — no values';
          return null;
        }
      };
    }

    // ── T-Tests ───────────────────────────────────────────────────
    if (proc === 'ttest_onesample' || proc === 'ttest_paired') {
      return {
        typeOk: v => _isNumericType(v),
        dataOk: s => s.valid > 0,
        reason: (v, s) => {
          if (!_isNumericType(v)) return 'Numeric required';
          if (s.valid === 0) return 'Empty — no values';
          return null;
        }
      };
    }

    if (proc === 'ttest_independent') {
      if (role === 'independent') {
        // Grouping variable: any non-empty
        return {
          typeOk: () => true,
          dataOk: s => s.valid > 0,
          reason: (v, s) => s.valid === 0 ? 'Empty — no values' : null
        };
      }
      // Dependent: numeric
      return {
        typeOk: v => _isNumericType(v),
        dataOk: s => s.valid > 0,
        reason: (v, s) => {
          if (!_isNumericType(v)) return 'Numeric required for test variable';
          if (s.valid === 0) return 'Empty — no values';
          return null;
        }
      };
    }

    // ── One-Way ANOVA ─────────────────────────────────────────────
    if (proc === 'anova_oneway') {
      if (role === 'independent') {
        // Factor: any non-empty variable (categorical OR numeric)
        return {
          typeOk: () => true,
          dataOk: s => s.valid > 0,
          reason: (v, s) => s.valid === 0 ? 'Empty — no values' : null
        };
      }
      // Dependent: numeric non-empty
      return {
        typeOk: v => _isNumericType(v),
        dataOk: s => s.valid > 0,
        reason: (v, s) => {
          if (!_isNumericType(v)) return 'Numeric required for dependent variable';
          if (s.valid === 0) return 'Empty — no values';
          return null;
        }
      };
    }

    // ── Linear Regression ─────────────────────────────────────────
    if (proc === 'linear_regression') {
      return {
        typeOk: v => _isNumericType(v),
        dataOk: s => s.valid > 0,
        reason: (v, s) => {
          if (!_isNumericType(v)) return 'String/date — not compatible with linear regression';
          if (s.valid === 0) return 'Empty — no values';
          return null;
        }
      };
    }

    // ── Logistic Regression ───────────────────────────────────────
    if (proc === 'logistic_regression') {
      return {
        typeOk: v => _isNumericType(v),
        dataOk: s => s.valid > 0,
        reason: (v, s) => {
          if (!_isNumericType(v)) return 'Numeric/binary required';
          if (s.valid === 0) return 'Empty — no values';
          return null;
        }
      };
    }

    // ── Reliability (Cronbach's α) ─────────────────────────────────
    if (proc === 'reliability') {
      return {
        typeOk: v => _isNumericType(v),
        dataOk: s => s.valid > 0,
        reason: (v, s) => {
          if (!_isNumericType(v)) return 'Numeric required for scale items';
          if (s.valid === 0) return 'Empty — no valid values';
          return null;
        }
      };
    }

    // ── Factor Analysis ───────────────────────────────────────────
    if (proc === 'factor_analysis') {
      return {
        typeOk: v => _isNumericType(v),
        dataOk: s => s.valid > 0,
        reason: (v, s) => {
          if (!_isNumericType(v)) return 'Numeric required';
          if (s.valid === 0) return 'Empty — no values';
          return null;
        }
      };
    }

    // ── Nonparametric tests ───────────────────────────────────────
    if (proc.startsWith('nonparametric')) {
      if (role === 'independent') {
        return {
          typeOk: () => true,
          dataOk: s => s.valid > 0,
          reason: (v, s) => s.valid === 0 ? 'Empty — no values' : null
        };
      }
      return {
        typeOk: v => _isNumericType(v),
        dataOk: s => s.valid > 0,
        reason: (v, s) => {
          if (!_isNumericType(v)) return 'Numeric required';
          if (s.valid === 0) return 'Empty — no values';
          return null;
        }
      };
    }

    // ── K-Means ───────────────────────────────────────────────────
    if (proc === 'kmeans') {
      return {
        typeOk: v => _isNumericType(v),
        dataOk: s => s.valid > 0,
        reason: (v, s) => {
          if (!_isNumericType(v)) return 'Numeric required';
          if (s.valid === 0) return 'Empty — no values';
          return null;
        }
      };
    }

    // ── Kaplan-Meier ──────────────────────────────────────────────
    if (proc === 'kaplan_meier') {
      if (role === 'independent') {
        return {
          typeOk: () => true,
          dataOk: s => s.valid > 0,
          reason: (v, s) => s.valid === 0 ? 'Empty — no values' : null
        };
      }
      return {
        typeOk: v => _isNumericType(v),
        dataOk: s => s.valid > 0,
        reason: (v, s) => {
          if (!_isNumericType(v)) return 'Numeric required';
          if (s.valid === 0) return 'Empty — no values';
          return null;
        }
      };
    }

    // ── Default: any non-empty variable ───────────────────────────
    return {
      typeOk: () => true,
      dataOk: s => s.valid > 0,
      reason: (v, s) => s.valid === 0 ? 'Empty — no values' : null
    };
  }

  /* ── Public API ────────────────────────────────────────────────── */

  /**
   * Returns an array of eligibility objects for every variable in `dataset`.
   *
   * Each object: { varDef, stats, eligible, reason }
   *   varDef  — the variable definition object
   *   stats   — { valid, missing, total, status } from DataQuality
   *   eligible — boolean
   *   reason  — string (why ineligible) or null when eligible
   */
  function getEligibleVariables(dataset, procedure, role) {
    if (!dataset || !Array.isArray(dataset.variables)) return [];
    const rules = _getRules(procedure, role || 'any');
    return dataset.variables
      .filter(v => v.visibility !== false)
      .map(v => {
        const stats = DataQuality.getVariableStats(dataset, v.name);
        const typeOk = rules.typeOk(v);
        const dataOk = rules.dataOk(stats);
        const eligible = typeOk && dataOk;
        const reason = eligible ? null : rules.reason(v, stats);
        return { varDef: v, stats, eligible, reason };
      });
  }

  /**
   * Returns a simple boolean filter function suitable for passing to
   * AnalysisDialogs.varList() as the `filterFn` argument.
   *
   * Usage:
   *   varList(ds, sel, true, onChange,
   *     AnalysisEligibility.filterFn(ds, 'reliability'))
   */
  function filterFn(dataset, procedure, role) {
    const list = getEligibleVariables(dataset, procedure, role);
    const eligibleNames = new Set(list.filter(e => e.eligible).map(e => e.varDef.name));
    return v => eligibleNames.has(v.name);
  }

  return { getEligibleVariables, filterFn, getActualCaseCount };
})();
