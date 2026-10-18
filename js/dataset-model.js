const DataIntegrity = (() => {

  /**
   * Checks that every variable in dataset.variables has a corresponding key
   * in dataset.cases rows, and reports numeric coercion success rates.
   *
   * Returns a structured report object — never throws.
   */
  function check(dataset) {
    if (!dataset) return { ok: false, fatal: 'No dataset provided.' };

    const variables  = dataset.variables  || [];
    const cases      = dataset.cases      || [];
    const nCases     = cases.length;
    const nVariables = variables.length;

    const variableReports = variables.map(meta => {
      const vn = meta.name;
      // Count how many case rows actually have this key (even if null)
      let caseKeyCount  = 0;
      let numericCount  = 0;
      let missingCount  = 0;
      let invalidCount  = 0;
      const sampleValues = [];

      for (let i = 0; i < nCases; i++) {
        const row = cases[i];
        if (Object.prototype.hasOwnProperty.call(row, vn)) {
          caseKeyCount++;
          const raw = row[vn];
          if (raw === null || raw === undefined || raw === '') {
            missingCount++;
          } else if (meta.type === 'numeric') {
            const cleaned = typeof raw === 'string'
              ? raw.trim().replace(/\u00a0/g,'').replace(/,(?=\d{3}(\D|$))/g,'')
              : raw;
            const num = Number(cleaned);
            if (isNaN(num)) { invalidCount++; missingCount++; }
            else { numericCount++; }
          } else {
            // string / date / other — always valid unless empty
            numericCount++;
          }
          if (sampleValues.length < 5 && raw !== null && raw !== undefined && raw !== '') {
            sampleValues.push(raw);
          }
        } else {
          missingCount++;  // key entirely absent from row
        }
      }

      const keyMissing = nCases - caseKeyCount;
      return {
        variable: vn,
        metadataType: meta.type,
        measurementLevel: meta.measurementLevel,
        caseKeyCount,
        keyMissingCount: keyMissing,
        numericCount,
        missingCount,
        invalidCount,
        sampleValues,
        // Diagnostic flags
        noKeysInCases:   caseKeyCount === 0 && nCases > 0,
        allValuesMissing: missingCount === nCases && nCases > 0,
        allNumericInvalid: meta.type === 'numeric' && nCases > 0 && numericCount === 0 && (nCases - missingCount) > 0,
      };
    });

    // Summary
    const matchingVars  = variableReports.filter(r => !r.noKeysInCases);
    const mismatchedVars = variableReports.filter(r => r.noKeysInCases);
    const problemVars   = variableReports.filter(r => r.allValuesMissing || r.allNumericInvalid);

    // Check for orphan case keys (keys in cases that have no variable metadata)
    const varNameSet = new Set(variables.map(v => v.name));
    const orphanKeys = new Set();
    cases.slice(0, Math.min(20, nCases)).forEach(row => {
      Object.keys(row).forEach(k => { if (!varNameSet.has(k)) orphanKeys.add(k); });
    });

    // Active filter
    const activeFilter   = dataset.activeFilter   || null;
    const weightVariable = dataset.weightVariable || null;
    const splitVariables = dataset.splitVariables || [];

    let filterMatchedCases = null;
    let filterWarning = null;
    if (activeFilter) {
      try {
        const allVarNames = variables.map(v => v.name);
        const expr = activeFilter.replace(/\bAND\b/gi,'&&').replace(/\bOR\b/gi,'||').replace(/\bNOT\b/gi,'!');
        // eslint-disable-next-line no-new-func
        const fn = new Function(...allVarNames, `"use strict"; return !!(${expr});`);
        filterMatchedCases = cases.filter(row => {
          try { return fn(...allVarNames.map(vn => row[vn] ?? null)); } catch { return true; }
        }).length;
        if (filterMatchedCases === 0) filterWarning = 'CRITICAL: Active filter removes all cases.';
      } catch(e) {
        filterWarning = 'Filter expression error: ' + e.message;
      }
    }

    const ok = mismatchedVars.length === 0 && problemVars.length === 0 && orphanKeys.size === 0;

    return {
      ok,
      cases: nCases,
      variables: nVariables,
      variablesWithMatchingKeys: matchingVars.length,
      variablesWithMissingKeys:  mismatchedVars.length,
      numericVariables: variableReports.filter(r => r.metadataType === 'numeric').length,
      orphanCaseKeys: [...orphanKeys],
      activeFilter,
      activeWeight: weightVariable,
      activeSplit: splitVariables,
      filterMatchedCases,
      filterWarning,
      variableReports,
      mismatchedVars,
      problemVars,
    };
  }

  /** Render the check() result into an HTML string for the Data View panel. */
  function report(dataset) {
    const r = check(dataset);
    const lines = [];

    const statusColor = r.ok ? '#15803d' : '#b91c1c';
    const statusIcon  = r.ok ? '✓' : '✗';
    lines.push(`<div style="font-family:monospace;font-size:12px;padding:16px;overflow:auto;background:#1e1e2e;color:#cdd6f4;border-radius:8px;max-height:520px;">`);
    lines.push(`<div style="color:${statusColor};font-weight:700;font-size:14px;margin-bottom:12px;">${statusIcon} DATA INTEGRITY CHECK — ${r.ok ? 'PASS' : 'ISSUES FOUND'}</div>`);

    lines.push(`<div style="color:#89b4fa;margin-bottom:6px;">DATASET SUMMARY</div>`);
    lines.push(`<div>Cases: <b style="color:#a6e3a1">${r.cases}</b></div>`);
    lines.push(`<div>Variables: <b style="color:#a6e3a1">${r.variables}</b></div>`);
    lines.push(`<div>Variables with matching case keys: <b style="color:#a6e3a1">${r.variablesWithMatchingKeys}</b></div>`);
    if (r.variablesWithMissingKeys > 0) {
      lines.push(`<div style="color:#f38ba8;">⚠ Variables with NO case keys: <b>${r.variablesWithMissingKeys}</b></div>`);
    }
    if (r.orphanCaseKeys.length > 0) {
      lines.push(`<div style="color:#fab387;">⚠ Orphan case keys (no metadata): <b>${r.orphanCaseKeys.join(', ')}</b></div>`);
    }
    if (r.activeFilter) {
      lines.push(`<div style="margin-top:6px;color:#cba6f7;">Active filter: <code>${r.activeFilter}</code></div>`);
      lines.push(`<div>Filter matched: <b>${r.filterMatchedCases ?? '?'}</b> / ${r.cases} cases</div>`);
      if (r.filterWarning) lines.push(`<div style="color:#f38ba8;font-weight:700;">${r.filterWarning}</div>`);
    }
    if (r.activeWeight) lines.push(`<div>Weight variable: <b>${r.activeWeight}</b></div>`);

    lines.push(`<div style="color:#89b4fa;margin:12px 0 6px;">VARIABLE DETAILS</div>`);
    r.variableReports.forEach(v => {
      const prob = v.noKeysInCases || v.allValuesMissing || v.allNumericInvalid;
      const col  = prob ? '#f38ba8' : '#a6e3a1';
      lines.push(`<div style="margin-bottom:4px;border-bottom:1px solid #313244;padding-bottom:4px;">`);
      lines.push(`<span style="color:${col};font-weight:700;">${v.variable}</span> `);
      lines.push(`<span style="color:#9399b2;">[${v.metadataType}, ${v.measurementLevel}]</span> `);
      lines.push(`keys:${v.caseKeyCount} numeric:${v.numericCount} missing:${v.missingCount}`);
      if (v.invalidCount > 0)   lines.push(` <span style="color:#f38ba8;">invalid:${v.invalidCount}</span>`);
      if (v.noKeysInCases)      lines.push(` <span style="color:#f38ba8;font-weight:700;">⚠ NO CASE KEYS — SCHEMA MISMATCH</span>`);
      if (v.allValuesMissing)   lines.push(` <span style="color:#f38ba8;font-weight:700;">⚠ ALL VALUES MISSING</span>`);
      if (v.allNumericInvalid)  lines.push(` <span style="color:#f38ba8;font-weight:700;">⚠ ALL NUMERIC VALUES INVALID (failed Number())</span>`);
      if (v.sampleValues.length > 0) {
        lines.push(`<br><span style="color:#6c7086;">sample: ${v.sampleValues.map(x=>JSON.stringify(x)).join(', ')}</span>`);
      }
      lines.push(`</div>`);
    });

    lines.push(`</div>`);
    return lines.join('');
  }

  /**
   * Migrate a dataset loaded from an older version where case keys may not
   * match variable names. Strategy: for each variable, if no case has the
   * variable name as a key but every case has an orphan key at the same
   * positional index, remap atomically.
   *
   * This is safe — it only renames keys in cases[], never changes values.
   * Returns { migrated: true/false, changes: [...] }.
   */
  function migrateSchema(dataset) {
    if (!dataset) return { migrated: false, changes: [] };
    const variables = dataset.variables || [];
    const cases     = dataset.cases     || [];
    if (!cases.length || !variables.length) return { migrated: false, changes: [] };

    const changes = [];

    // Build set of all keys present in first case row
    const firstRow   = cases[0];
    const caseKeys   = Object.keys(firstRow);
    const varNames   = variables.map(v => v.name);
    const varNameSet = new Set(varNames);

    // Find orphan keys — present in cases but absent from variable metadata
    const orphans = caseKeys.filter(k => !varNameSet.has(k));

    // Find variables that have NO matching case key
    const homeless = varNames.filter(vn => !Object.prototype.hasOwnProperty.call(firstRow, vn));

    if (homeless.length === 0) return { migrated: false, changes: [] };  // nothing to fix

    // Positional recovery: if there are exactly as many orphans as homeless vars,
    // attempt positional remapping (old schema stored var001, var002, var003…)
    if (orphans.length === homeless.length && orphans.length > 0) {
      // Sort both lists by their index position
      const orphansSorted  = caseKeys.filter(k => orphans.includes(k));
      const homelessSorted = variables
        .filter(v => homeless.includes(v.name))
        .map(v => v.name);

      const oldToNew = {};
      homelessSorted.forEach((vn, i) => { oldToNew[orphansSorted[i]] = vn; });

      // Apply the remapping to every case
      cases.forEach(row => {
        for (const [oldKey, newKey] of Object.entries(oldToNew)) {
          if (Object.prototype.hasOwnProperty.call(row, oldKey)) {
            row[newKey] = row[oldKey];
            delete row[oldKey];
          }
        }
      });

      for (const [old, nw] of Object.entries(oldToNew)) {
        changes.push({ from: old, to: nw });
      }

      dataset.metadata = dataset.metadata || {};
      dataset.metadata.schemaMigrated = true;
      dataset.metadata.schemaMigratedAt = new Date().toISOString();
      dataset.updatedAt = new Date().toISOString();

      return { migrated: true, changes };
    }

    return { migrated: false, changes: [], note: 'Orphan/homeless count mismatch — manual inspection needed.' };
  }

  /**
   * inspect(dataset) — console-friendly text output for developer diagnostics.
   * Mirrors the spec's required DataIntegrity.inspect() output format.
   */
  function inspect(dataset) {
    const r = check(dataset);
    const lines = [];

    lines.push('═══ DATA INTEGRITY REPORT ═══');
    lines.push(`Dataset: ${dataset?.name || '(unnamed)'}`);
    lines.push(`Cases: ${r.cases}`);
    lines.push(`Variables: ${r.variables}`);
    lines.push(`Status: ${r.ok ? 'PASS ✓' : 'ISSUES FOUND ✗'}`);
    lines.push('');

    if (r.activeFilter)  lines.push(`Active Filter: ${r.activeFilter}  (matched: ${r.filterMatchedCases ?? '?'})`);
    else                  lines.push('Active Filter: None');
    lines.push(`Weight: ${r.activeWeight || 'None'}`);
    lines.push(`Split: ${r.activeSplit?.length ? r.activeSplit.join(', ') : 'None'}`);

    if (r.filterWarning) lines.push(`⚠ FILTER WARNING: ${r.filterWarning}`);
    if (r.orphanCaseKeys.length) lines.push(`⚠ Orphan case keys (no metadata): ${r.orphanCaseKeys.join(', ')}`);
    lines.push('');

    lines.push('─── Variable Details ───');
    r.variableReports.forEach(v => {
      const flag = v.noKeysInCases ? ' ⚠ NO CASE KEYS' :
                   v.allValuesMissing ? ' ⚠ ALL MISSING' :
                   v.allNumericInvalid ? ' ⚠ ALL NUMERIC INVALID' : '';
      lines.push(`${v.variable}${flag}`);
      lines.push(`  type: ${v.metadataType}  level: ${v.measurementLevel}`);
      lines.push(`  caseKeyExists: ${v.caseKeyCount} / ${r.cases}`);
      lines.push(`  validNumeric: ${v.numericCount}`);
      lines.push(`  missing: ${v.missingCount}`);
      if (v.invalidCount > 0) lines.push(`  invalid: ${v.invalidCount}`);
      if (v.sampleValues.length > 0) lines.push(`  sampleValues: ${v.sampleValues.join(', ')}`);
      lines.push('');
    });

    const text = lines.join('\n');
    console.log(text);
    return text;
  }

  return { check, report, inspect, migrateSchema };
})();

/* ══════════════════════════════════════════════════════════════════
   SECTION 4B-PIPE: DATA PIPELINE INSPECTOR
   Instruments every stage: import schema → resolve → coercion → filter
   Exposes DataPipelineInspector.inspect(dataset) and .selfTest()
   ══════════════════════════════════════════════════════════════════ */

const DataPipelineInspector = (() => {

  /* ── Stage 1: inspect a live dataset object ─────────────────── */
  function inspect(dataset) {
    if (!dataset) return { ok: false, stages: [], fatal: 'No dataset' };

    const stages = [];
    let ok = true;

    // ── S1: basic shape ──────────────────────────────────────────
    const nCases = (dataset.cases || []).length;
    const nVars  = (dataset.variables || []).length;
    const s1 = {
      stage: 'S1_SHAPE',
      cases: nCases,
      variables: nVars,
      ok: nCases > 0 && nVars > 0,
      detail: nCases === 0 ? 'dataset.cases is empty' : nVars === 0 ? 'dataset.variables is empty' : 'OK',
    };
    stages.push(s1);
    if (!s1.ok) { ok = false; return { ok, stages, firstFailure: s1 }; }

    // ── S2: first 3 raw case objects ─────────────────────────────
    const sampleCases = dataset.cases.slice(0, 3).map((row, i) => ({
      index: i,
      keys: Object.keys(row),
      values: Object.fromEntries(Object.entries(row).slice(0, 15)) // cap at 15 cols
    }));
    stages.push({ stage: 'S2_RAW_CASES', sampleCases });

    // ── S3: variable-level key + coercion check ───────────────────
    const varReports = dataset.variables.map(meta => {
      const vn = meta.name;
      let keyMatches = 0, nullCount = 0, numericOk = 0, numericFail = 0;
      const sampleValues = [], coerceFails = [];

      for (let i = 0; i < nCases; i++) {
        const row = dataset.cases[i];
        if (!Object.prototype.hasOwnProperty.call(row, vn)) { nullCount++; continue; }
        keyMatches++;
        const raw = row[vn];
        if (raw === null || raw === undefined || raw === '') { nullCount++; continue; }
        if (sampleValues.length < 5) sampleValues.push({ raw, type: typeof raw });
        if (meta.type === 'numeric') {
          const cleaned = typeof raw === 'string'
            ? raw.trim().replace(/\u00a0/g, '').replace(/,(?=\d{3}(\D|$))/g, '')
            : raw;
          const num = Number(cleaned);
          if (isNaN(num)) {
            numericFail++;
            if (coerceFails.length < 3) coerceFails.push({ raw, reason: 'Number(' + JSON.stringify(cleaned) + ') = NaN' });
          } else {
            numericOk++;
          }
        } else {
          numericOk++;  // non-numeric vars count as valid
        }
      }

      const schemaOk   = keyMatches === nCases;
      const coercionOk = meta.type !== 'numeric' || numericFail === 0;

      return {
        name: vn,
        type: meta.type,
        measurementLevel: meta.measurementLevel,
        keyMatches: `${keyMatches} / ${nCases}`,
        keyMatchesOk: schemaOk,
        nullCount,
        numericOk,
        numericFail,
        coercionOk,
        sampleValues,
        coerceFails,
        missingValues: meta.missingValues || [],
        ok: schemaOk && coercionOk,
      };
    });

    const schemaBad   = varReports.filter(r => !r.keyMatchesOk);
    const coercionBad = varReports.filter(r => !r.coercionOk);
    const s3ok = schemaBad.length === 0 && coercionBad.length === 0;
    if (!s3ok) ok = false;

    stages.push({
      stage: 'S3_VARIABLES',
      ok: s3ok,
      variables: varReports,
      schemaMismatches: schemaBad.length,
      coercionFailures: coercionBad.length,
      detail: schemaBad.length > 0
        ? `Schema mismatch on: ${schemaBad.map(r=>r.name).join(', ')}`
        : coercionBad.length > 0
          ? `Numeric coercion failures on: ${coercionBad.map(r=>r.name).join(', ')}`
          : 'All variables OK',
    });

    // ── S4: active filter / weight / split ───────────────────────
    const activeFilter   = dataset.activeFilter   || null;
    const weightVariable = dataset.weightVariable || null;
    const splitVariables = dataset.splitVariables || [];
    let filterMatchedCases = activeFilter ? null : nCases;
    let filterOk = true;

    if (activeFilter) {
      try {
        const allVarNames = dataset.variables.map(v => v.name);
        const expr = activeFilter.replace(/\bAND\b/gi,'&&').replace(/\bOR\b/gi,'||').replace(/\bNOT\b/gi,'!');
        // eslint-disable-next-line no-new-func
        const fn = new Function(...allVarNames, `"use strict"; return !!(${expr});`);
        filterMatchedCases = dataset.cases.filter(row => {
          try { return fn(...allVarNames.map(vn => row[vn] ?? null)); } catch { return true; }
        }).length;
        if (filterMatchedCases === 0) filterOk = false;
      } catch (e) {
        filterOk = false;
        filterMatchedCases = `ERROR: ${e.message}`;
      }
    }
    if (!filterOk) ok = false;
    stages.push({
      stage: 'S4_FILTER',
      ok: filterOk,
      activeFilter: activeFilter || 'NONE',
      filterMatchedCases,
      weightVariable: weightVariable || 'NONE',
      splitVariables: splitVariables.length ? splitVariables : 'NONE',
      detail: !filterOk ? `CRITICAL: active filter matches 0 cases` : 'OK',
    });

    // ── S5: resolveDataset trace for first numeric variable ───────
    const firstNumVar = dataset.variables.find(v => v.type === 'numeric');
    let s5 = { stage: 'S5_RESOLVE', ok: true, detail: 'No numeric variable found' };
    if (firstNumVar) {
      try {
        const resolved = Stats.resolveDataset(dataset, [firstNumVar.name], {});
        const resolvedN = resolved.n;
        const rawColLen = resolved.data[firstNumVar.name]?.length ?? 0;
        s5 = {
          stage: 'S5_RESOLVE',
          ok: resolvedN > 0,
          variable: firstNumVar.name,
          resolvedN,
          rawColLen,
          warnings: resolved.warnings,
          detail: resolvedN > 0 ? `N=${resolvedN}` : `CRITICAL: resolvedN=0 for "${firstNumVar.name}"`,
        };
        if (resolvedN === 0) ok = false;
      } catch (e) {
        s5 = { stage: 'S5_RESOLVE', ok: false, detail: `resolveDataset threw: ${e.message}` };
        ok = false;
      }
    }
    stages.push(s5);

    // Determine first failure for fast diagnosis
    const firstFailure = stages.find(s => !s.ok) || null;

    return { ok, stages, firstFailure, dataset: { name: dataset.name, cases: nCases, variables: nVars } };
  }

  /* ── Stage 6: built-in self-test — bypasses import entirely ─── */
  function selfTest() {
    const results = {};

    // Build a minimal test dataset entirely in JS — no CSV, no wizard
    const testDataset = {
      id: '__selftest__',
      name: 'Pipeline Self-Test',
      variables: [{
        id: '__x__', name: 'x', label: 'x', type: 'numeric',
        measurementLevel: 'scale', missingValues: [], valueLabels: {},
        width: 8, decimals: 2, role: 'input', visibility: true
      }],
      cases: [{ x: 1 }, { x: 2 }, { x: 3 }, { x: 4 }, { x: 5 }],
      activeFilter: null, weightVariable: null, splitVariables: [],
      metadata: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };

    // T1: resolveDataset
    try {
      const resolved = Stats.resolveDataset(testDataset, ['x'], {});
      const pass = resolved.n === 5 && resolved.data.x?.length === 5;
      results.resolveDataset = {
        pass,
        resolvedN: resolved.n,
        data: resolved.data.x,
        detail: pass ? 'PASS — N=5' : `FAIL — got N=${resolved.n}, data=${JSON.stringify(resolved.data.x)}`
      };
    } catch (e) {
      results.resolveDataset = { pass: false, detail: `THREW: ${e.message}` };
    }

    // T2: descriptives
    try {
      const desc = Stats.descriptives(testDataset, { variables: ['x'] });
      const v = desc?.result?.descriptives?.x;
      const passN    = v?.n === 5;
      const passMean = v?.mean !== undefined && Math.abs(v.mean - 3) < 0.001;
      const passMin  = v?.minimum === 1;
      const passMax  = v?.maximum === 5;
      const pass = passN && passMean && passMin && passMax;
      results.descriptives = {
        pass,
        n: v?.n,
        mean: v?.mean,
        min: v?.minimum,
        max: v?.maximum,
        detail: pass ? 'PASS — N=5, mean=3, min=1, max=5'
          : `FAIL — n=${v?.n}, mean=${v?.mean}, min=${v?.minimum}, max=${v?.maximum}, error=${v?.error || 'none'}`
      };
    } catch (e) {
      results.descriptives = { pass: false, detail: `THREW: ${e.message}` };
    }

    // T3: schema check via DataIntegrity
    try {
      const integ = DataIntegrity.check(testDataset);
      results.schemaCheck = {
        pass: integ.ok,
        detail: integ.ok ? 'PASS' : `FAIL — ${integ.variableReports?.[0]?.noKeysInCases ? 'NO CASE KEYS' : 'problem vars: ' + integ.problemVars?.map(v=>v.variable).join(',')}`
      };
    } catch (e) {
      results.schemaCheck = { pass: false, detail: `THREW: ${e.message}` };
    }

    // T4: numeric coercion — stored as number (not string)
    const firstCase = testDataset.cases[0];
    const rawX = firstCase.x;
    const typeofX = typeof rawX;
    results.numericCoercion = {
      pass: typeofX === 'number' && rawX === 1,
      rawValue: rawX,
      typeofValue: typeofX,
      detail: typeofX === 'number' ? `PASS — typeof x = 'number'` : `FAIL — typeof x = '${typeofX}', value=${JSON.stringify(rawX)}`
    };

    // Overall
    const allPass = Object.values(results).every(r => r.pass);
    results._summary = {
      pass: allPass,
      conclusion: allPass
        ? 'Pipeline OK — problem is in import layer or persisted data schema.'
        : 'Pipeline itself has a bug — the statistical engine or resolver is broken.'
    };

    return results;
  }

  /* ── Plain-text console output ──────────────────────────────── */
  function printInspect(dataset) {
    const r = inspect(dataset);
    const lines = [
      '╔══ DATA PIPELINE INSPECTOR ══╗',
      `Dataset: ${r.dataset?.name ?? '(none)'}`,
      `Cases: ${r.dataset?.cases ?? '—'}`,
      `Variables: ${r.dataset?.variables ?? '—'}`,
      `Overall: ${r.ok ? 'PASS ✓' : 'FAIL ✗'}`,
      '',
    ];
    r.stages.forEach(s => {
      lines.push(`[${s.ok === false ? 'FAIL' : s.ok === true ? 'PASS' : '....'}] ${s.stage}: ${s.detail || ''}`);
      if (s.stage === 'S2_RAW_CASES' && s.sampleCases) {
        s.sampleCases.forEach(c => {
          lines.push(`  Case ${c.index}: ${JSON.stringify(c.values)}`);
        });
      }
      if (s.stage === 'S3_VARIABLES' && s.variables) {
        s.variables.forEach(v => {
          const flag = v.ok ? '✓' : '✗';
          lines.push(`  ${flag} ${v.name} [${v.type}] keys:${v.keyMatches} numOk:${v.numericOk} numFail:${v.numericFail} null:${v.nullCount}`);
          if (v.coerceFails.length > 0) {
            v.coerceFails.forEach(f => lines.push(`    ⚠ coerce fail: ${JSON.stringify(f)}`));
          }
          if (v.sampleValues.length > 0) {
            lines.push(`    sample: ${v.sampleValues.map(s=>`${JSON.stringify(s.raw)}(${s.type})`).join(', ')}`);
          }
        });
      }
    });
    if (r.firstFailure) {
      lines.push('');
      lines.push(`FIRST FAILURE: ${r.firstFailure.stage} — ${r.firstFailure.detail}`);
    }
    const text = lines.join('\n');
    console.log(text);
    return text;
  }

  function printSelfTest() {
    const r = selfTest();
    const lines = ['╔══ PIPELINE SELF-TEST ══╗'];
    Object.entries(r).forEach(([k, v]) => {
      if (k === '_summary') return;
      lines.push(`[${v.pass ? 'PASS' : 'FAIL'}] ${k}: ${v.detail}`);
    });
    lines.push('');
    lines.push(`CONCLUSION: ${r._summary.conclusion}`);
    const text = lines.join('\n');
    console.log(text);
    return r;
  }

  return { inspect, selfTest, printInspect, printSelfTest };
})();

/* ══════════════════════════════════════════════════════════════════
   SECTION 4B-CONV: DATA TYPE CONVERTER
   parseSemanticNumber  — locale-aware, currency-aware value parser
   DataTypeConverter    — preview + case-level type conversion
   ══════════════════════════════════════════════════════════════════ */
