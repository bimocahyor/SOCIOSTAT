const SyntaxEditor = (() => {
  let _container = null;
  let _history = [];
  let _currentSyntax = '';

  function init(container) { _container = container; }

  function render() {
    if (!_container) return;
    _container.innerHTML = '';
    _container.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden;';

    const toolbar = el('div', { class: 'data-toolbar', style: { flexShrink: '0' } },
      el('button', { class: 'btn btn-primary btn-sm', onclick: () => runSyntax() }, '▶ Run'),
      el('button', { class: 'btn btn-sm', onclick: () => clearEditor() }, 'Clear'),
      el('button', { class: 'btn btn-sm', onclick: () => exportSyntax() }, 'Export .sps'),
      el('span', { class: 'muted small', style: { marginLeft:'8px' } }, 'Supported: DESCRIPTIVES, FREQUENCIES, CORRELATIONS, T-TEST, ONEWAY, REGRESSION, RELIABILITY, CROSSTABS, COMPUTE, SORT CASES, SELECT IF, T_DISTRIBUTION, T_PROBABILITY, T_TEST_STAT')
    );

    const textarea = el('textarea', {
      class: 'syntax-editor-area',
      style: { flex: '1', minHeight: '0' },
      placeholder: '* SOCIOSTAT Syntax\n* Example:\nDESCRIPTIVES VARIABLES=age income\n  /STATISTICS=MEAN STDDEV MIN MAX.\n\nREGRESSION\n  /DEPENDENT income\n  /METHOD=ENTER education age.\n',
      onchange: e => { _currentSyntax = e.target.value; },
      onkeyup: e => { _currentSyntax = e.target.value; }
    });
    textarea.value = _currentSyntax;  // set value after creation to avoid attribute encoding issues

    const histBox = el('div', { class: 'syntax-history', style: { flexShrink: '0' } });
    histBox.appendChild(el('h4', {}, 'Syntax History'));
    if (_history.length === 0) histBox.appendChild(el('p', { class: 'muted' }, 'No syntax run yet. Commands you run will appear here.'));
    [..._history].reverse().slice(0, 20).forEach((entry) => {
      const node = el('div', { class: 'syntax-history-entry' },
        el('span', { class: 'muted small' }, fmtDate(entry.timestamp) + ' '),
        el('code', {}, entry.syntax.slice(0, 60) + (entry.syntax.length > 60 ? '…' : '')),
        el('button', { class: 'btn btn-xs', onclick: () => { _currentSyntax = entry.syntax; render(); } }, 'Reuse')
      );
      histBox.appendChild(node);
    });

    _container.appendChild(toolbar);
    _container.appendChild(textarea);
    _container.appendChild(histBox);
  }

  function runSyntax() {
    const syntax = _currentSyntax.trim();
    if (!syntax) { notify('No syntax to run', 'warning'); return; }
    const ds = AppState.get('activeDataset');

    // Distribution commands (T_DISTRIBUTION / T_PROBABILITY / T_TEST_STAT) do not
    // require a dataset — allow them to run even when no dataset is loaded.
    const DATASET_FREE_CMDS = /^(T_DISTRIBUTION|T_PROBABILITY|T_TEST_STAT)\b/i;
    if (!ds && !DATASET_FREE_CMDS.test(syntax.trim())) {
      notify('No dataset loaded', 'error'); return;
    }

    // Parse → execute synchronously through ProcedureRegistry (no async gap)
    const outcome = parseSyntax(syntax, ds);
    _history.push({ syntax, timestamp: new Date().toISOString(), outcome });
    History.addEntry({ type: 'syntax', syntax, timestamp: new Date().toISOString() });

    if (outcome.parseError) {
      notify('Syntax error: ' + outcome.parseError, 'error');
    } else if (outcome.execError) {
      notify('Execution error: ' + outcome.execError, 'error');
    } else if (outcome.isTransform) {
      // Transform / filter — already notified inside parseSyntax
    } else {
      // Statistical procedure — result is already in Output
      notify(outcome.procedureId + ' completed', 'success');
      App.navigate('output');
    }
    render();
  }

  /**
   * parseSyntax — Parses one SOCIOSTAT syntax command and executes it
   * synchronously through ProcedureRegistry.runProcedure().
   *
   * GUI and Syntax now share the exact same execution path:
   *   Parser → AnalysisSpec (params) → ProcedureRegistry.runProcedure() → Output.addResult()
   *
   * Returns:
   *   { procedureId, result }          on successful statistical run
   *   { parseError: string }           on parse failure
   *   { execError: string }            on engine error
   *   { isTransform: true }            for COMPUTE / SORT / SELECT IF (no Output entry)
   */
  function parseSyntax(syntax, dataset) {
    const lines = syntax.split('\n').map(l => l.replace(/\*.*/, '').trim()).filter(Boolean);
    if (!lines.length) return { parseError: 'Empty syntax.' };
    const cmd = lines[0].toUpperCase();

    /* Helper: run a procedure through the registry, add to Output, return outcome */
    function runProc(procedureId, params) {
      const result = ProcedureRegistry.runProcedure(procedureId, dataset, params);
      Output.addResult(procedureId, result, params);
      History.addEntry({ type: 'analysis', procedure: procedureId, params, timestamp: new Date().toISOString() });
      if (result.status === 'error') {
        return { procedureId, execError: result.error?.message || 'Unknown engine error', result };
      }
      return { procedureId, result };
    }

    try {
      /* ── DESCRIPTIVES ── */
      if (cmd.startsWith('DESCRIPTIVES')) {
        const vars = extractVarList(lines, 'VARIABLES');
        if (!vars.length) return { parseError: 'No variables specified for DESCRIPTIVES.' };
        return runProc('descriptives', { variables: vars });
      }

      /* ── FREQUENCIES ── */
      if (cmd.startsWith('FREQUENCIES')) {
        const vars = extractVarList(lines, 'VARIABLES');
        if (!vars.length) return { parseError: 'No variables for FREQUENCIES.' };
        return runProc('frequencies', { variables: vars });
      }

      /* ── CORRELATIONS ── */
      if (cmd.startsWith('CORRELATIONS')) {
        const vars = extractVarList(lines, 'VARIABLES');
        if (!vars.length) return { parseError: 'No variables for CORRELATIONS.' };
        const method = /SPEARMAN/i.test(syntax) ? 'spearman' : 'pearson';
        return runProc('correlation', { variables: vars, method });
      }

      /* ── T-TEST ── */
      if (cmd.startsWith('T-TEST') || cmd.startsWith('TTEST')) {
        if (/\/TESTVAL/i.test(syntax)) {
          const vars = extractVarList(lines, 'VARIABLES');
          if (!vars.length) return { parseError: 'T-TEST /TESTVAL requires VARIABLES=.' };
          const tv = parseFloat(syntax.match(/\/TESTVAL\s*=\s*([\d.\-]+)/i)?.[1] || '0');
          // Run one per variable; last result determines overall outcome
          let last;
          vars.forEach(vn => { last = runProc('ttest_onesample', { variable: vn, test_value: tv }); });
          return last || { parseError: 'T-TEST: no variables processed.' };
        }
        if (/\/PAIRS/i.test(syntax)) {
          const m = syntax.match(/\/PAIRS\s*=\s*(\w+)\s+WITH\s+(\w+)/i);
          if (!m) return { parseError: 'T-TEST /PAIRS syntax error. Use: /PAIRS=var1 WITH var2.' };
          return runProc('ttest_paired', { variable1: m[1], variable2: m[2] });
        }
        // Independent-samples
        const vars = extractVarList(lines, 'VARIABLES');
        const grpM = syntax.match(/\/GROUPS\s*=\s*(\w+)\s*\(\s*([\d.]+)\s+([\d.]+)\s*\)/i);
        if (grpM && vars[0]) {
          return runProc('ttest_independent', {
            variable: vars[0], grouping_variable: grpM[1],
            group1: Number(grpM[2]), group2: Number(grpM[3])
          });
        }
        return { parseError: 'T-TEST syntax error. Use /TESTVAL=, /PAIRS=, or VARIABLES= /GROUPS=grp(1 2).' };
      }

      /* ── ONEWAY ── */
      if (cmd.startsWith('ONEWAY')) {
        const dvM = syntax.match(/ONEWAY\s+([\w\s]+)\s+BY\s+(\w+)/i);
        if (!dvM) return { parseError: 'ONEWAY syntax error. Use: ONEWAY depvar BY factor.' };
        const dvs = dvM[1].trim().split(/\s+/);
        const fv  = dvM[2];
        const ph  = /TUKEY/i.test(syntax) ? ['tukey'] : /BONFERRONI/i.test(syntax) ? ['bonferroni'] : [];
        let last;
        dvs.forEach(dv => { last = runProc('anova_oneway', { dependent: dv, factor: fv, post_hoc: ph }); });
        return last || { parseError: 'ONEWAY: no dependent variables processed.' };
      }

      /* ── REGRESSION ── */
      if (cmd.startsWith('REGRESSION')) {
        const depM = syntax.match(/\/DEPENDENT\s+(\w+)/i);
        const indM = syntax.match(/METHOD\s*=\s*ENTER\s+([\w\s]+)/i);
        if (!depM || !indM) return { parseError: 'REGRESSION syntax error. Use: REGRESSION /DEPENDENT y /METHOD=ENTER x1 x2.' };
        return runProc('linear_regression', {
          dependent: depM[1],
          independent: indM[1].trim().split(/\s+/).filter(Boolean)
        });
      }

      /* ── RELIABILITY ── */
      if (cmd.startsWith('RELIABILITY')) {
        const vars = extractVarList(lines, 'VARIABLES');
        if (vars.length < 2) return { parseError: 'RELIABILITY requires at least 2 variables.' };
        return runProc('reliability', { items: vars });
      }

      /* ── CROSSTABS ── */
      if (cmd.startsWith('CROSSTABS')) {
        const m = syntax.match(/\/TABLES\s*=\s*(\w+)\s+BY\s+(\w+)/i);
        if (!m) return { parseError: 'CROSSTABS syntax error. Use: CROSSTABS /TABLES=row BY col.' };
        return runProc('crosstabs', {
          row_variable: m[1], column_variable: m[2],
          statistics: { chi_square: true, phi_cramer: true }
        });
      }

      /* ── COMPUTE (transform — no Output entry) ── */
      if (cmd.startsWith('COMPUTE')) {
        const m = syntax.match(/COMPUTE\s+(\w+)\s*=\s*(.+)\./i);
        if (!m) return { parseError: 'COMPUTE syntax error. Use: COMPUTE newvar = expression.' };
        Transform.computeVariable(dataset, m[1].trim(), m[2].trim());
        notify('Computed variable: ' + m[1], 'success');
        Project.markDirty();
        return { isTransform: true };
      }

      /* ── SORT CASES (transform) ── */
      if (cmd.startsWith('SORT CASES')) {
        const m = syntax.match(/BY\s+([\w\s()\-ADSC]+)\./i);
        if (!m) return { parseError: 'SORT CASES syntax error. Use: SORT CASES BY var1 (A) var2 (D).' };
        const parts = m[1].trim().split(/\s+/);
        const keys = [];
        for (let i = 0; i < parts.length; i++) {
          if (parts[i + 1] === '(D)') { keys.push({ variable: parts[i], direction: 'desc' }); i++; }
          else if (parts[i] !== '(A)') keys.push({ variable: parts[i], direction: 'asc' });
        }
        Transform.sortCases(dataset, keys);
        notify('Cases sorted.', 'success');
        Project.markDirty();
        return { isTransform: true };
      }

      /* ── SELECT IF / FILTER (transform) ── */
      if (cmd.startsWith('SELECT IF') || cmd.startsWith('FILTER')) {
        const m = syntax.match(/(?:SELECT IF|FILTER)\s+(.+)\./i);
        if (!m) return { parseError: 'SELECT IF syntax error. Use: SELECT IF expression.' };
        Transform.selectCases(dataset, m[1].trim());
        notify('Filter applied: ' + m[1], 'success');
        Project.markDirty();
        App.updateStatusBar();
        return { isTransform: true };
      }

      /* ── T_DISTRIBUTION — Find Critical t ── */
      if (cmd.startsWith('T_DISTRIBUTION')) {
        const dfM   = lines.join(' ').match(/\/DF\s*=\s*([\d.]+)/i);
        const alpM  = lines.join(' ').match(/\/ALPHA\s*=\s*([\d.]+)/i);
        const tailM = lines.join(' ').match(/\/TAIL\s*=\s*(\w+)/i);
        if (!dfM || !alpM) return { parseError: 'T_DISTRIBUTION requires /DF= and /ALPHA=.' };
        const tailRaw = (tailM?.[1] || 'TWO').toUpperCase();
        const tail = tailRaw === 'TWO' ? 'two-tailed' : tailRaw === 'RIGHT' ? 'right' : 'left';
        const r = StudentTCalc.criticalT({ df: Number(dfM[1]), alpha: Number(alpM[1]), tail });
        if (r.error) return { parseError: 'T_DISTRIBUTION: ' + r.error };
        const dispVal = r.tail === 'two-tailed'
          ? `±${r.criticalValueAbs.toFixed(6)}` : r.criticalValue.toFixed(6);
        const htmlOutput = `<div class="output-section">
          <h3 class="output-title">Student's t Distribution — Critical t</h3>
          <table class="pivot-table">
            <thead><tr><th>Parameter</th><th>Value</th></tr></thead>
            <tbody>
              <tr><td>df</td><td><strong>${r.df}</strong></td></tr>
              <tr><td>α</td><td><strong>${r.alpha}</strong></td></tr>
              <tr><td>Tail</td><td><strong>${r.tail}</strong></td></tr>
              <tr><td>Table α</td><td><strong>${r.tableAlpha}</strong></td></tr>
              <tr><td>t critical</td><td><strong>${dispVal}</strong></td></tr>
              ${r.tableAvailable ? `<tr><td>Reference table value</td><td><strong>${r.tableValue}</strong></td></tr>` : ''}
              <tr><td>Method</td><td>${r.method}</td></tr>
            </tbody>
          </table>
        </div>`;
        Output.addResult('student_t', {
          status: 'complete',
          result: { html: htmlOutput, text: `t critical = ${dispVal}  df=${r.df}  α=${r.alpha}  ${r.tail}`, data: r },
          warnings: []
        }, { distribution: 'student_t' });
        return { procedureId: 'student_t', result: { status: 'complete', data: r } };
      }

      /* ── T_PROBABILITY — Calculate probability / p-value ── */
      if (cmd.startsWith('T_PROBABILITY')) {
        const dfM   = lines.join(' ').match(/\/DF\s*=\s*([\d.]+)/i);
        const tM    = lines.join(' ').match(/\/T\s*=\s*([-\d.]+)/i);
        const tailM = lines.join(' ').match(/\/TAIL\s*=\s*(\w+)/i);
        if (!dfM || !tM) return { parseError: 'T_PROBABILITY requires /DF= and /T=.' };
        const tailRaw = (tailM?.[1] || 'TWO').toUpperCase();
        const tail = tailRaw === 'TWO' ? 'two-tailed' : tailRaw === 'RIGHT' ? 'right' : 'left';
        const r = StudentTCalc.probability({ df: Number(dfM[1]), t: Number(tM[1]), tail });
        if (r.error) return { parseError: 'T_PROBABILITY: ' + r.error };
        const htmlOutput = `<div class="output-section">
          <h3 class="output-title">Student's t Distribution — Probability</h3>
          <table class="pivot-table">
            <thead><tr><th>Parameter</th><th>Value</th></tr></thead>
            <tbody>
              <tr><td>t</td><td><strong>${r.t.toFixed(6)}</strong></td></tr>
              <tr><td>df</td><td><strong>${r.df}</strong></td></tr>
              <tr><td>Tail</td><td><strong>${r.tail}</strong></td></tr>
              <tr><td>P(T ≤ t)</td><td>${r.leftTail.toFixed(7)}</td></tr>
              <tr><td>P(T ≥ t)</td><td>${r.rightTail.toFixed(7)}</td></tr>
              <tr><td>p-value (${r.tail})</td><td><strong>${r.pValue.toFixed(7)}</strong></td></tr>
            </tbody>
          </table>
        </div>`;
        Output.addResult('student_t', {
          status: 'complete',
          result: { html: htmlOutput, text: `p-value = ${r.pValue.toFixed(7)}  t=${r.t}  df=${r.df}  ${r.tail}`, data: r },
          warnings: []
        }, { distribution: 'student_t' });
        return { procedureId: 'student_t', result: { status: 'complete', data: r } };
      }

      /* ── T_TEST_STAT — Test a t statistic ── */
      if (cmd.startsWith('T_TEST_STAT')) {
        const tObsM = lines.join(' ').match(/\/T_OBSERVED\s*=\s*([-\d.]+)/i);
        const dfM   = lines.join(' ').match(/\/DF\s*=\s*([\d.]+)/i);
        const alpM  = lines.join(' ').match(/\/ALPHA\s*=\s*([\d.]+)/i);
        const tailM = lines.join(' ').match(/\/TAIL\s*=\s*(\w+)/i);
        if (!tObsM || !dfM || !alpM) return { parseError: 'T_TEST_STAT requires /T_OBSERVED=, /DF=, /ALPHA=.' };
        const tailRaw = (tailM?.[1] || 'TWO').toUpperCase();
        const tail = tailRaw === 'TWO' ? 'two-tailed' : tailRaw === 'RIGHT' ? 'right' : 'left';
        const r = StudentTCalc.testStatistic({ t: Number(tObsM[1]), df: Number(dfM[1]), alpha: Number(alpM[1]), tail });
        if (r.error) return { parseError: 'T_TEST_STAT: ' + r.error };
        const critDisp = r.tail === 'two-tailed' ? `±${r.tCriticalAbs.toFixed(6)}` : r.tCritical.toFixed(6);
        const htmlOutput = `<div class="output-section">
          <h3 class="output-title">Student's t Distribution — Hypothesis Test</h3>
          <table class="pivot-table">
            <thead><tr><th>Parameter</th><th>Value</th></tr></thead>
            <tbody>
              <tr><td>t observed</td><td><strong>${r.tObserved.toFixed(6)}</strong></td></tr>
              <tr><td>df</td><td><strong>${r.df}</strong></td></tr>
              <tr><td>α</td><td><strong>${r.alpha}</strong></td></tr>
              <tr><td>Tail</td><td><strong>${r.tail}</strong></td></tr>
              <tr><td>t critical</td><td><strong>${critDisp}</strong></td></tr>
              <tr><td>p-value</td><td><strong>${r.pValue.toFixed(7)}</strong></td></tr>
              <tr><td>Decision</td><td><strong style="color:${r.reject?'#dc2626':'#15803d'}">${r.decision}</strong></td></tr>
            </tbody>
          </table>
        </div>`;
        Output.addResult('student_t', {
          status: 'complete',
          result: { html: htmlOutput, text: `Decision: ${r.decision}  t=${r.tObserved}  df=${r.df}  α=${r.alpha}  ${r.tail}`, data: r },
          warnings: []
        }, { distribution: 'student_t' });
        return { procedureId: 'student_t', result: { status: 'complete', data: r } };
      }

      return { parseError: 'Unrecognized command: ' + lines[0].split(/\s/)[0] };

    } catch (e) {
      return { parseError: e.message };
    }
  }

  function extractVarList(lines, keyword) {
    const full = lines.join(' ');
    const m = full.match(new RegExp(keyword + '\\s*=\\s*([\\w\\s]+?)(?:\\/|\\.|$)', 'i'));
    if (!m) return [];
    return m[1].trim().split(/\s+/).filter(Boolean);
  }

  function clearEditor() { _currentSyntax = ''; render(); }

  function exportSyntax() {
    const blob = new Blob([_currentSyntax], { type: 'text/plain' });
    const a = el('a', { href: URL.createObjectURL(blob), download: 'syntax.sps' });
    a.click();
  }

  function setSyntax(s) { _currentSyntax = s; }

  return { init, render, setSyntax };
})();

/* ══════════════════════════════════════════════════════════════════
   SECTION 13: PROJECT SYSTEM
   ══════════════════════════════════════════════════════════════════ */
