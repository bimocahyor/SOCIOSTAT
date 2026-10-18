/* ════════════════════════════════════════════════════════════════════
   DataQuality — reusable data-quality helpers
   ════════════════════════════════════════════════════════════════════
   Exposes:
     DataQuality.isMissingValue(val, varDef)
     DataQuality.isVariableEmpty(dataset, variableName)
     DataQuality.isActualCase(caseObject, dataset)
     DataQuality.getVariableStats(dataset, variableName)
       → { valid, missing, total, status }
         status: 'empty' | 'populated' | 'partial' | 'invalid'
   ════════════════════════════════════════════════════════════════════ */
const DataQuality = (() => {

  /**
   * Return true when `val` should be treated as system-missing.
   * Respects user-defined missing values on the variable definition.
   *
   * Missing: null, undefined, '' (empty string), whitespace-only string.
   * Valid:   number 0, boolean false, any non-blank string, any finite number.
   */
  function isMissingValue(val, varDef) {
    // Null / undefined
    if (val === null || val === undefined) return true;
    // Empty or whitespace-only string
    if (typeof val === 'string' && val.trim() === '') return true;
    // User-defined missing values (point or range)
    if (varDef && Array.isArray(varDef.missingValues) && varDef.missingValues.length > 0) {
      for (const mv of varDef.missingValues) {
        if (typeof mv === 'object' && mv !== null && mv.low !== undefined && mv.high !== undefined) {
          // Range missing
          if (typeof val === 'number' && val >= mv.low && val <= mv.high) return true;
        } else {
          // Point missing — loose equality to handle "3" === 3
          // eslint-disable-next-line eqeqeq
          if (val == mv) return true;
        }
      }
    }
    return false;
  }

  /**
   * Return true when every actual case in `dataset` has a missing value
   * for `variableName` (using the rules above).
   *
   * A dataset with zero actual cases is also considered "empty" for the variable.
   */
  function isVariableEmpty(dataset, variableName) {
    if (!dataset || !Array.isArray(dataset.cases) || dataset.cases.length === 0) return true;
    const varDef = dataset.variables ? dataset.variables.find(v => v.name === variableName) : null;
    for (const row of dataset.cases) {
      if (!isMissingValue(row[variableName], varDef)) return false;
    }
    return true;
  }

  /**
   * Return true when `caseObject` contains at least one meaningful value
   * across the dataset's registered variables.
   *
   * Visual placeholder rows that were never typed into contain only null/undefined
   * for every registered variable, so they return false.
   */
  function isActualCase(caseObject, dataset) {
    if (!caseObject || !dataset || !Array.isArray(dataset.variables)) return false;
    for (const varDef of dataset.variables) {
      if (!isMissingValue(caseObject[varDef.name], varDef)) return true;
    }
    return false;
  }

  /**
   * Return summary statistics for a variable in `dataset`.
   *
   * Returns:
   *   {
   *     valid:   number,   // non-missing values
   *     missing: number,   // missing values (by isMissingValue rules)
   *     total:   number,   // dataset.cases.length
   *     status:  string,   // 'empty' | 'populated' | 'partial' | 'invalid'
   *   }
   *
   * 'invalid' is returned when a numeric variable contains no parseable
   * numbers yet has non-missing string values (e.g. after a type mismatch).
   */
  function getVariableStats(dataset, variableName) {
    if (!dataset || !Array.isArray(dataset.cases)) {
      return { valid: 0, missing: 0, total: 0, status: 'empty' };
    }
    const varDef = dataset.variables ? dataset.variables.find(v => v.name === variableName) : null;
    const total = dataset.cases.length;
    let valid = 0, missing = 0, invalidNumeric = 0;

    for (const row of dataset.cases) {
      const val = row[variableName];
      if (isMissingValue(val, varDef)) {
        missing++;
      } else {
        valid++;
        // Flag: numeric variable has a non-numeric, non-parseable string value
        if (varDef && varDef.type === 'numeric' && typeof val === 'string') {
          const parsed = (typeof DataTypeConverter !== 'undefined')
            ? DataTypeConverter.parseSemanticNumber(val)
            : null;
          if (parsed === null) invalidNumeric++;
        }
      }
    }

    let status;
    if (valid === 0) {
      status = 'empty';
    } else if (invalidNumeric > 0 && varDef && varDef.type === 'numeric') {
      status = 'invalid';
    } else if (missing > 0) {
      status = 'partial';
    } else {
      status = 'populated';
    }

    return { valid, missing, total, status };
  }

  return { isMissingValue, isVariableEmpty, isActualCase, getVariableStats };
})();
