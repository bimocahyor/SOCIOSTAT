const Output = (() => {
  let _outputs=[];  // Array of { id, procedure, result, params, timestamp }
  let _container=null;

  function init(container) { _container=container; }

  function addResult(procedure, result, params) {
    const entry={
      id:uuid(), procedure, result, params,
      timestamp:new Date().toISOString(),
      title:makeProcTitle(procedure,params)
    };
    _outputs.push(entry);
    Project.markDirty();
    render();
    return entry.id;
  }

  function makeProcTitle(procedure, params) {
    const map={
      frequencies:'Frequencies', descriptives:'Descriptives', crosstabs:'Crosstabs',
      correlation:'Bivariate Correlations',
      ttest_onesample:'One-Sample T-Test', one_sample_t:'One-Sample T-Test',
      ttest_independent:'Independent-Samples T-Test', independent_t:'Independent-Samples T-Test',
      ttest_paired:'Paired-Samples T-Test', paired_t:'Paired-Samples T-Test',
      anova_oneway:'One-Way ANOVA', one_way_anova:'One-Way ANOVA',
      linear_regression:'Linear Regression',
      logistic_regression:'Logistic Regression', reliability:'Reliability Analysis',
      factor_analysis:'Factor Analysis',
      nonparametric_mannwhitney:'Mann-Whitney U Test', mann_whitney:'Mann-Whitney U Test',
      nonparametric_wilcoxon:'Wilcoxon Signed-Rank Test', wilcoxon:'Wilcoxon Signed-Rank Test',
      nonparametric_kruskalwallis:'Kruskal-Wallis Test', kruskal_wallis:'Kruskal-Wallis Test',
      nonparametric_friedman:'Friedman Test', friedman:'Friedman Test',
      kaplan_meier:'Kaplan-Meier Survival', kmeans:'K-Means Cluster Analysis',
      probability_calculator:'Probability Calculator (Normal)',
    };
    return map[procedure]||procedure;
  }

  function render() {
    if(!_container) return;
    _container.innerHTML='';
    _container.style.cssText='display:flex;flex-direction:column;height:100%;overflow:hidden;';
    if(!_outputs.length){
      _container.innerHTML='';
      _container.appendChild(el('div',{class:'empty-state-full'},
        el('div',{class:'empty-state-icon'},'📊'),
        el('h3',{},'No Analysis Results Yet'),
        el('p',{},'Run a statistical procedure to see results here. Start with Descriptive Statistics if you\'re new.'),
        el('div',{class:'empty-state-actions'},
          el('button',{class:'btn btn-primary',onclick:()=>{ if(window._sociostatNavigate) window._sociostatNavigate('analyze'); }},'🔍 Open Analyze'),
          el('button',{class:'btn btn-secondary',onclick:()=>{ if(window._sociostatNavigate) window._sociostatNavigate('graphs'); }},'📈 Create a Chart')
        )
      ));
      return;
    }

    // Toolbar
    const toolbar=el('div',{class:'output-toolbar',style:{flexShrink:'0'}});
    toolbar.appendChild(el('button',{class:'btn btn-sm',onclick:()=>clearAll()},'Clear All'));
    toolbar.appendChild(el('button',{class:'btn btn-sm',onclick:()=>exportHTML()},'📄 Export HTML'));
    toolbar.appendChild(el('button',{class:'btn btn-sm',onclick:()=>exportPDF()},'📋 Export PDF'));
    toolbar.appendChild(el('button',{class:'btn btn-sm',onclick:()=>exportXLSX()},'📊 Export XLSX'));
    toolbar.appendChild(el('button',{class:'btn btn-sm',onclick:()=>{
      if (typeof ChartExportManager !== 'undefined') ChartExportManager.downloadAll();
    }},'🖼 Download All Charts'));
    _container.appendChild(toolbar);

    // Tree + content split — flex:1 so it fills remaining height
    const split=el('div',{class:'output-split',style:{flex:'1',minHeight:'0'}});
    const tree=el('div',{class:'output-tree'});
    const content=el('div',{class:'output-content',id:'output-content'});

    _outputs.forEach((entry,idx)=>{
      const node=el('div',{class:'output-tree-node',onclick:()=>{
        $$('.output-tree-node').forEach(n=>n.classList.remove('active'));
        node.classList.add('active');
        renderOutputEntry(content, entry);
      }});
      node.appendChild(el('span',{class:'tree-icon'},'📊'));
      node.appendChild(el('span',{},entry.title));
      node.appendChild(el('span',{class:'muted small'},` ${fmtDate(entry.timestamp)}`));
      const del=el('button',{class:'btn btn-xs btn-danger tree-del',onclick:e=>{
        e.stopPropagation(); _outputs.splice(idx,1); Project.markDirty(); render();
      }},'✕');
      node.appendChild(del);
      tree.appendChild(node);
    });

    // Auto-select last
    const nodes=$$('.output-tree-node',tree);
    if(nodes.length){ nodes[nodes.length-1].classList.add('active'); renderOutputEntry(content,_outputs[_outputs.length-1]); }

    split.appendChild(tree); split.appendChild(content);
    _container.appendChild(split);
  }

  function renderOutputEntry(container, entry) {
    container.innerHTML='';
    const { procedure, result, params, timestamp } = entry;

    // Header
    container.appendChild(el('div',{class:'output-header'},
      el('h2',{},entry.title),
      el('span',{class:'muted small'},fmtDate(timestamp))
    ));

    if(result.status==='error'){
      container.appendChild(renderError(result.error));
      return;
    }

    // Warnings
    if(result.warnings&&result.warnings.length){
      result.warnings.forEach(w=>container.appendChild(renderWarning(w)));
    }

    // Syntax
    if(result.syntax){
      container.appendChild(el('div',{class:'output-syntax'},
        el('h4',{},'Syntax'),
        el('pre',{class:'syntax-pre'},result.syntax)
      ));
    }

    // Dispatch to specific renderer — support both old and new procedure IDs
    const renderers={
      frequencies: renderFrequencies,
      descriptives: renderDescriptives,
      crosstabs: renderCrosstabs,
      correlation: renderCorrelation,
      ttest_onesample: renderOneSampleT,   one_sample_t: renderOneSampleT,
      ttest_independent: renderIndepT,     independent_t: renderIndepT,
      ttest_paired: renderPairedT,         paired_t: renderPairedT,
      anova_oneway: renderOneWayANOVA,     one_way_anova: renderOneWayANOVA,
      linear_regression: renderLinearRegression,
      logistic_regression: renderLogisticRegression,
      reliability: renderReliability,
      factor_analysis: renderFactorAnalysis,
      nonparametric_mannwhitney: renderNonpar,  mann_whitney: renderNonpar,
      nonparametric_wilcoxon: renderNonpar,     wilcoxon: renderNonpar,
      nonparametric_kruskalwallis: renderNonpar, kruskal_wallis: renderNonpar,
      nonparametric_friedman: renderNonpar,     friedman: renderNonpar,
      kaplan_meier: renderKaplanMeier,
      kmeans: renderKMeans,
      probability_calculator: renderProbabilityOutput,
    };
    const renderer=renderers[procedure];
    if(renderer) renderer(container, result.result, params, entry.id);
    else container.appendChild(el('pre',{},JSON.stringify(result.result,null,2)));
  }

  /* ── Table helpers ─────────────────────────────────────────── */
  function pivotTable(headers, rows, caption='') {
    const wrap=el('div',{class:'pivot-wrap'});
    if(caption) wrap.appendChild(el('div',{class:'table-caption'},caption));
    const scroll=el('div',{class:'table-scroll'});
    const tbl=el('table',{class:'pivot-table'});
    const thead=el('thead',{},el('tr',{},...headers.map(h=>el('th',{},String(h)))));
    tbl.appendChild(thead);
    const tbody=el('tbody');
    rows.forEach(r=>{
      const tr=el('tr');
      r.forEach(c=>{
        const isNum=typeof c==='number';
        const td=el('td',{class:isNum?'num-cell':''}, c==null?'':typeof c==='number'?fmt(c,3):String(c));
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    scroll.appendChild(tbl); wrap.appendChild(scroll);
    return wrap;
  }

  function renderError(err) {
    return el('div',{class:'warning-box high'},
      el('div',{class:'warning-header'},'ERROR'),
      el('div',{class:'warning-procedure'},`Procedure: ${err?.procedure||'Unknown'}`),
      el('div',{class:'warning-issue'},`Issue: ${err?.message||'Unknown error'}`),
      el('div',{class:'warning-cause'},`Likely cause: ${err?.likely_cause||''}`),
      el('div',{class:'warning-action'},`Suggested action: ${err?.suggested_action||''}`)
    );
  }

  function renderWarning(w) {
    const sev=w.severity||'MEDIUM';
    return el('div',{class:`warning-box ${sev.toLowerCase()}`},
      el('div',{class:'warning-header'},`⚠ WARNING — ${sev}`),
      el('div',{class:'warning-issue'},w.message||w.issue||''),
      w.details?el('div',{class:'warning-details'},w.details):null,
      w.suggested_action?el('div',{class:'warning-action'},`Action: ${w.suggested_action}`):null
    );
  }

  function section(title, termKey) {
    const wrap = el('div',{class:'output-section-header'}, title);
    if (termKey && typeof StatTooltips !== 'undefined') {
      wrap.appendChild(StatTooltips.badge(termKey));
    }
    return wrap;
  }

  /* ── Frequency renderer ────────────────────────────────────── */
  /* ── Frequencies renderer — engine: result.tables = {vn:{variable,rows}} ── */
  function renderFrequencies(container, result) {
    // Engine returns result.tables as an OBJECT keyed by variable name, not an array.
    const tablesObj = result.tables || {};
    const tableList = Array.isArray(tablesObj) ? tablesObj : Object.values(tablesObj);
    if (!tableList.length) {
      container.appendChild(el('p',{class:'muted'},'No frequency tables produced.'));
      return;
    }
    tableList.forEach(tbl => {
      container.appendChild(section(`Frequencies — ${tbl.label || tbl.variable}`));
      container.appendChild(pivotTable(
        ['Value','Label','Frequency','%','Valid %','Cumulative %'],
        (tbl.rows || []).map(r => [
          r.value ?? '.',
          r.label || '',
          r.frequency,
          fmt(r.percent, 2),
          r.valid_percent != null ? fmt(r.valid_percent, 2) : '—',
          r.cumulative_percent != null ? fmt(r.cumulative_percent, 2) : '—'
        ])
      ));
    });
  }

  /* ── Descriptives renderer — engine: result.descriptives = {vn:{variable,n,n_missing,mean,std,...}} ── */
  function renderDescriptives(container, result) {
    container.appendChild(section('Descriptive Statistics'));
    // Engine returns result.descriptives as an object keyed by variable name.
    const descObj = result.descriptives || {};
    const descList = Array.isArray(descObj) ? descObj : Object.values(descObj);
    if (!descList.length) {
      container.appendChild(el('p',{class:'muted'},'No descriptive statistics produced.'));
      return;
    }
    const headers = ['Variable','N','Missing','Mean','Std Dev','Variance','Min','Max','Range','Skewness','Kurtosis'];
    const rows = descList.map(v => [
      v.variable || v.label || '?',
      v.n,
      v.n_missing ?? '—',
      fmt(v.mean),
      fmt(v.std),          // engine field: std (not std_dev)
      fmt(v.variance),
      fmt(v.minimum),      // engine field: minimum (not min)
      fmt(v.maximum),      // engine field: maximum (not max)
      fmt(v.range),
      fmt(v.skewness),
      fmt(v.kurtosis)
    ]);
    container.appendChild(pivotTable(headers, rows));
    // Additional: median, mode, CI
    const extraRows = descList.filter(v => v.ci_95_lower != null).map(v => [
      v.variable, fmt(v.median), fmt(v.mode),
      `[${fmt(v.ci_95_lower)}, ${fmt(v.ci_95_upper)}]`
    ]);
    if (extraRows.length) {
      container.appendChild(section('Additional Statistics'));
      container.appendChild(pivotTable(['Variable','Median','Mode','95% CI for Mean'], extraRows));
    }
  }

  /* ── Crosstabs renderer — engine: result.{row_variable, col_variable, row_values, col_values,
     table_rows:[{row_value,col_value,observed,...}], statistics:{chi_square,chi_square_df,...}} ── */
  function renderCrosstabs(container, result) {
    const rVar = result.row_variable || '?';
    const cVar = result.col_variable || result.column_variable || '?';  // engine: col_variable
    container.appendChild(section(`Crosstabs: ${rVar} × ${cVar}`));

    const rowVals = result.row_values || [];
    const colVals = result.col_values || result.column_values || [];

    if (!rowVals.length || !colVals.length) {
      container.appendChild(el('p',{class:'warning-box medium'},'No crosstab data returned. Check that both variables have valid values.'));
      return;
    }

    // Build count matrix from table_rows (engine format)
    const tblRows = result.table_rows || [];
    const countMap = {};
    tblRows.forEach(r => {
      const key = `${r.row_value}|${r.col_value}`;
      countMap[key] = { observed: r.observed, expected: r.expected,
        row_pct: r.row_pct, col_pct: r.col_pct, total_pct: r.total_pct };
    });

    // Observed counts table
    const obsHeaders = [rVar, ...colVals, 'Total'];
    const obsRows = rowVals.map(rv => {
      const rowTotal = colVals.reduce((s, cv) => s + (countMap[`${rv}|${cv}`]?.observed || 0), 0);
      return [rv, ...colVals.map(cv => countMap[`${rv}|${cv}`]?.observed ?? 0), rowTotal];
    });
    // Add column totals row
    const colTotals = colVals.map(cv => rowVals.reduce((s, rv) => s + (countMap[`${rv}|${cv}`]?.observed || 0), 0));
    const grandTotal = colTotals.reduce((s, v) => s + v, 0);
    obsRows.push(['Total', ...colTotals, grandTotal]);
    container.appendChild(pivotTable(obsHeaders, obsRows, 'Count'));

    // Row % table
    const rowPctRows = rowVals.map(rv => [
      rv, ...colVals.map(cv => fmt(countMap[`${rv}|${cv}`]?.row_pct, 1) + '%')
    ]);
    container.appendChild(pivotTable([rVar, ...colVals], rowPctRows, 'Row %'));

    // Chi-square statistics
    const stats = result.statistics || {};
    const chi2 = stats.chi_square;
    if (chi2 != null) {
      container.appendChild(section('Chi-Square Tests'));
      const statRows = [
        ['Pearson Chi-Square', fmt(chi2, 3), stats.chi_square_df, fmtP(stats.chi_square_p), result.n_total]
      ];
      if (stats.chi_square_yates != null)
        statRows.push(['Continuity Correction (Yates)', fmt(stats.chi_square_yates, 3), 1, fmtP(stats.chi_square_yates_p), result.n_total]);
      if (stats.likelihood_ratio != null)
        statRows.push(['Likelihood Ratio G²', fmt(stats.likelihood_ratio, 3), stats.chi_square_df, fmtP(stats.likelihood_ratio_p), result.n_total]);
      if (stats.fisher_exact_p != null)
        statRows.push(['Fisher\'s Exact Test (2-sided)', '—', '—', fmtP(stats.fisher_exact_p), result.n_total]);
      container.appendChild(pivotTable(['Statistic','Value','df','p','N'], statRows));

      // Symmetric measures
      const symRows = [];
      if (stats.phi != null) symRows.push(['Phi', fmt(stats.phi, 3)]);
      if (stats.cramers_v != null) symRows.push(["Cramér's V", fmt(stats.cramers_v, 3)]);
      if (stats.contingency_coefficient != null) symRows.push(['Contingency Coefficient', fmt(stats.contingency_coefficient, 3)]);
      if (symRows.length) {
        container.appendChild(section('Symmetric Measures'));
        container.appendChild(pivotTable(['Measure','Value'], symRows));
      }
      // Expected count footnote
      if (stats.pct_cells_expected_lt5 != null) {
        container.appendChild(el('p', {class:'muted small'},
          `a. ${stats.pct_cells_expected_lt5.toFixed(1)}% of cells have expected count < 5. Minimum expected count = ${stats.min_expected_count?.toFixed(2) ?? '—'}.`
        ));
      }
    }
  }

  /* ── Correlation renderer — engine: result.{correlation_matrix:{v1:{v2:r}}, p_matrix, n_matrix} ── */
  function renderCorrelation(container, result) {
    const method = result.method || 'pearson';
    const methodLabel = method === 'spearman' ? 'Spearman' : method === 'kendall' ? "Kendall's τ" : 'Pearson';
    container.appendChild(section(`${methodLabel} Correlations`, 'effect-size'));

    const vars = result.variables || [];
    if (!vars.length) {
      container.appendChild(el('p',{class:'muted'},'No variables returned.'));
      return;
    }

    // Engine format: correlation_matrix[v1][v2], p_matrix[v1][v2], n_matrix[v1][v2]
    const corrMat = result.correlation_matrix || {};
    const pMat = result.p_matrix || {};
    const nMat = result.n_matrix || {};

    // Render correlation coefficient matrix
    const headers = ['', ...vars];
    const corrRows = vars.map(v1 => [
      v1,
      ...vars.map(v2 => {
        if (v1 === v2) return '1.000';
        const r = corrMat[v1]?.[v2];
        return r != null ? fmt(r, 3) : '—';
      })
    ]);
    container.appendChild(pivotTable(headers, corrRows, 'Correlation Coefficient'));

    // p-value matrix
    const pRows = vars.map(v1 => [
      v1,
      ...vars.map(v2 => {
        if (v1 === v2) return '—';
        const p = pMat[v1]?.[v2];
        return p != null ? fmtP(p) : '—';
      })
    ]);
    container.appendChild(pivotTable(headers, pRows, 'Sig. (2-tailed)'));

    // N matrix
    const nRows = vars.map(v1 => [
      v1,
      ...vars.map(v2 => {
        if (v1 === v2) return '—';
        const n = nMat[v1]?.[v2];
        return n != null ? n : '—';
      })
    ]);
    container.appendChild(pivotTable(headers, nRows, 'N'));
  }

  /* ── One-Sample T-Test renderer — engine: result.{variable,test_value,n,mean,std,se,t,df,p_two_tailed,...} ── */
  function renderOneSampleT(container, result) {
    container.appendChild(section(`One-Sample T-Test (test value = ${result.test_value})`));
    container.appendChild(pivotTable(
      ['Variable','N','Mean','Std Dev','SE Mean'],
      [[result.variable, result.n, fmt(result.mean), fmt(result.std), fmt(result.se)]]
    ));
    container.appendChild(pivotTable(
      ['Variable','t','df','p (2-tailed)','Mean Diff','CI Lower','CI Upper'],
      [[result.variable, fmt(result.t, 3), result.df, fmtP(result.p_two_tailed),
        fmt(result.mean_difference), fmt(result.ci_lower), fmt(result.ci_upper)]]
    ));
    if (result.cohens_d != null) {
      container.appendChild(section('Effect Size', 'effect-size'));
      container.appendChild(pivotTable(["Cohen's d"], [[fmt(result.cohens_d, 3)]]));
    }
    // [Explain Z] — for one-sample t, t ≈ Z for large n
    if (result.t != null) {
      container.appendChild(el('button', { class: 'btn btn-sm explain-z-btn',
        title: 'Open Probability Calculator with this t-value (approximates Z for large n)',
        onclick: () => ProbabilityCalcUI.open(parseFloat(fmt(result.t, 4)))
      }, '📐 Explain Z (t = ' + fmt(result.t, 4) + ')'));
    }
  }

  /* ── Independent T-Test renderer — engine: result.{variable,grouping_variable,group1,group2,
     group1_n,group2_n,group1_mean,group2_mean,group1_std,group2_std,levene_statistic,levene_p,
     equal_variance:{t,df,p_two_tailed,mean_difference,se_difference,ci_lower,ci_upper},
     unequal_variance:{...}, cohens_d} ── */
  function renderIndepT(container, result) {
    container.appendChild(section(`Independent-Samples T-Test: ${result.variable} by ${result.grouping_variable}`));
    // Group statistics
    container.appendChild(pivotTable(
      ['Group','N','Mean','Std Dev','SE Mean'],
      [
        [result.group1, result.group1_n, fmt(result.group1_mean), fmt(result.group1_std), fmt(result.group1_se)],
        [result.group2, result.group2_n, fmt(result.group2_mean), fmt(result.group2_std), fmt(result.group2_se)]
      ], 'Group Statistics'
    ));
    // Levene's test
    if (result.levene_statistic != null) {
      container.appendChild(pivotTable(
        ["Levene's F", 'p'],
        [[fmt(result.levene_statistic, 3), fmtP(result.levene_p)]],
        "Levene's Test for Equality of Variances"
      ));
    }
    // T-test rows
    const eq = result.equal_variance || {};
    const uq = result.unequal_variance || {};
    container.appendChild(pivotTable(
      ['', 't', 'df', 'p (2-tailed)', 'Mean Diff', 'SE Diff', 'CI Lower', 'CI Upper'],
      [
        ['Equal variances assumed', fmt(eq.t, 3), eq.df, fmtP(eq.p_two_tailed),
          fmt(eq.mean_difference), fmt(eq.se_difference), fmt(eq.ci_lower), fmt(eq.ci_upper)],
        ['Equal variances not assumed', fmt(uq.t, 3), fmt(uq.df, 1), fmtP(uq.p_two_tailed),
          fmt(uq.mean_difference), fmt(uq.se_difference), fmt(uq.ci_lower), fmt(uq.ci_upper)]
      ], 'Independent Samples Test'
    ));
    if (result.cohens_d != null) {
      container.appendChild(section('Effect Size', 'effect-size'));
      container.appendChild(pivotTable(["Cohen's d"], [[fmt(result.cohens_d, 3)]]));
    }
    // [Explain Z] button
    const eq2 = result.equal_variance || {};
    if (eq2.t != null) {
      container.appendChild(el('button', { class: 'btn btn-sm explain-z-btn',
        title: 'Open Probability Calculator with this t-value',
        onclick: () => ProbabilityCalcUI.open(parseFloat(fmt(eq2.t, 4)))
      }, '📐 Explain Z (t = ' + fmt(eq2.t, 4) + ')'));
    }
  }

  /* ── Paired T-Test renderer — engine: result.{variable1,variable2,n,mean_difference,
     std_difference,se_difference,t,df,p_two_tailed,ci_lower,ci_upper,cohens_d} ── */
  function renderPairedT(container, result) {
    container.appendChild(section(`Paired-Samples T-Test: ${result.variable1} & ${result.variable2}`));
    container.appendChild(pivotTable(
      ['Variable','N','Mean'],
      [
        [result.variable1, result.n, fmt(result.mean1)],
        [result.variable2, result.n, fmt(result.mean2)]
      ], 'Paired Samples Statistics'
    ));
    container.appendChild(pivotTable(
      ['Pair','Mean Diff','Std Dev','SE','t','df','p (2-tailed)','CI Lower','CI Upper'],
      [[
        `${result.variable1} − ${result.variable2}`,
        fmt(result.mean_difference), fmt(result.std_difference), fmt(result.se_difference),
        fmt(result.t, 3), result.df, fmtP(result.p_two_tailed),
        fmt(result.ci_lower), fmt(result.ci_upper)
      ]]
    ));
    if (result.cohens_d != null) {
      container.appendChild(pivotTable(["Cohen's d"], [[fmt(result.cohens_d, 3)]], 'Effect Size'));
    }
  }

  /* ── One-Way ANOVA renderer — engine: result.{dependent,factor,n_total,k_groups,grand_mean,
     group_stats:{k:{n,mean,std,se,...}}, anova_table:{between:{ss,df,ms,f,p},within,total},
     eta_squared, levene:{statistic,p}, welch:{f,df1,df2,p}, post_hoc:{method:[{group1,group2,mean_difference,se,p}]}} ── */
  function renderOneWayANOVA(container, result) {
    container.appendChild(section(`ANOVA: ${result.dependent} by ${result.factor}`));

    // Group descriptives
    if (result.group_stats) {
      const gKeys = Object.keys(result.group_stats);
      container.appendChild(pivotTable(
        ['Group','N','Mean','Std Dev','SE','95% CI Lower','95% CI Upper','Min','Max'],
        gKeys.map(k => {
          const g = result.group_stats[k];
          return [k, g.n, fmt(g.mean), fmt(g.std), fmt(g.se),
            fmt(g.ci_lower), fmt(g.ci_upper), fmt(g.minimum), fmt(g.maximum)];
        }), 'Descriptives'
      ));
    }

    // ANOVA table — engine fields: ss (lowercase), df, ms, f, p
    const at = result.anova_table || {};
    const bw = at.between || {};
    const wi = at.within || {};
    const tot = at.total || {};
    container.appendChild(pivotTable(
      ['Source','SS','df','MS','F','p'],
      [
        ['Between Groups', fmt(bw.ss), bw.df, fmt(bw.ms), fmt(bw.f, 3), fmtP(bw.p)],
        ['Within Groups', fmt(wi.ss), wi.df, fmt(wi.ms), '', ''],
        ['Total', fmt(tot.ss), tot.df, '', '', '']
      ], 'ANOVA Table'
    ));

    // Effect size
    if (result.eta_squared != null) {
      container.appendChild(pivotTable(['η²'], [[fmt(result.eta_squared, 4)]], 'Effect Size'));
    }

    // Levene's test — engine: result.levene.{statistic, p}
    const lev = result.levene || {};
    if (lev.statistic != null) {
      container.appendChild(pivotTable(
        ["Levene's F", 'p'],
        [[fmt(lev.statistic, 3), fmtP(lev.p)]],
        "Levene's Test for Equality of Variances"
      ));
    }

    // Welch's ANOVA — engine: result.welch.{f, df1, df2, p}
    const wl = result.welch || {};
    if (wl.f != null) {
      container.appendChild(pivotTable(
        ["Welch's F", 'df1', 'df2', 'p'],
        [[fmt(wl.f, 3), wl.df1, fmt(wl.df2, 1), fmtP(wl.p)]],
        "Welch's Robust Test of Equality of Means"
      ));
    }

    // Post hoc — engine: result.post_hoc = {method:[{group1,group2,mean_difference,se,p,significant}]}
    const ph = result.post_hoc || {};
    Object.entries(ph).forEach(([method, comps]) => {
      if (!comps || !comps.length) return;
      container.appendChild(section(`Post Hoc: ${method.charAt(0).toUpperCase() + method.slice(1)}`));
      container.appendChild(pivotTable(
        ['(I) Group','(J) Group','Mean Diff (I-J)','SE','p','Sig.'],
        comps.map(c => [c.group1, c.group2, fmt(c.mean_difference), fmt(c.se), fmtP(c.p), c.significant ? '*' : 'n.s.'])
      ));
    });
  }

  /* ── Linear Regression renderer — engine: result.{dependent,independent,n,
     model_summary:{r,r_squared,adjusted_r_squared,se_estimate},
     anova_table:{regression:{ss,df,ms,f,p},residual,total},
     coefficients:[{name,b,se,beta,t,p,ci_lower,ci_upper}],
     vif:{varname:{vif,tolerance}},
     diagnostics:{durbin_watson,residuals_sample,fitted_sample}} ── */
  function renderLinearRegression(container, result) {
    // Model Summary
    const ms = result.model_summary || {};
    container.appendChild(section('Model Summary', 'r-squared'));
    container.appendChild(pivotTable(
      ['R', 'R²', 'Adj. R²', 'SE of Estimate'],
      [[fmt(ms.r, 3), fmt(ms.r_squared, 3), fmt(ms.adjusted_r_squared, 3), fmt(ms.se_estimate, 3)]]
    ));

    // ANOVA table
    const at = result.anova_table || {};
    const reg = at.regression || {};
    const res = at.residual || {};
    const tot = at.total || {};
    container.appendChild(section('ANOVA'));
    container.appendChild(pivotTable(
      ['Model','SS','df','MS','F','p'],
      [
        ['Regression', fmt(reg.ss), reg.df, fmt(reg.ms), fmt(reg.f, 3), fmtP(reg.p)],
        ['Residual', fmt(res.ss), res.df, fmt(res.ms), '', ''],
        ['Total', fmt(tot.ss), tot.df, '', '', '']
      ]
    ));

    // Coefficients — engine fields: name, b, se, beta, t, p, ci_lower, ci_upper
    const coefs = result.coefficients || [];
    const vifMap = result.vif || {};
    container.appendChild(section('Coefficients', 'vif'));
    container.appendChild(pivotTable(
      ['Variable','B','SE','Beta','t','p','CI Lower','CI Upper','VIF'],
      coefs.map(c => [
        c.name,
        fmt(c.b, 4), fmt(c.se, 4), c.beta != null ? fmt(c.beta, 4) : '—',
        fmt(c.t, 3), fmtP(c.p), fmt(c.ci_lower, 4), fmt(c.ci_upper, 4),
        vifMap[c.name] ? fmt(vifMap[c.name].vif, 3) : '—'
      ])
    ));

    // Diagnostics
    const diag = result.diagnostics || {};
    if (diag.durbin_watson != null) {
      container.appendChild(section('Diagnostics'));
      container.appendChild(pivotTable(
        ['Statistic','Value','Interpretation'],
        [['Durbin-Watson', fmt(diag.durbin_watson, 3), 'Range 1.5–2.5 = no autocorrelation']]
      ));
    }

    // Residuals scatterplot
    if (diag.fitted_sample && diag.residuals_sample) {
      const chartId = 'chart_' + uuid();
      container.appendChild(el('div',{id:chartId,class:'output-chart',style:{height:'280px'}}));
      setTimeout(() => Charts.scatterResiduals(chartId, diag.fitted_sample, diag.residuals_sample), 100);
    }
  }

  /* ── Logistic Regression renderer — engine: result.{dependent,independent,n,
     coefficients:[{name,b,se,wald,df,p,exp_b,exp_b_ci_lower,exp_b_ci_upper}],
     model_fit:{chi_square,df,p,neg_2ll,cox_snell_r2,nagelkerke_r2},
     classification_table:{tp,tn,fp,fn,overall_accuracy_pct}} ── */
  function renderLogisticRegression(container, result) {
    // Model fit
    const mf = result.model_fit || {};
    container.appendChild(section('Model Summary'));
    container.appendChild(pivotTable(
      ['-2 Log Likelihood','Cox & Snell R²','Nagelkerke R²'],
      [[fmt(mf.neg_2ll, 3), fmt(mf.cox_snell_r2, 3), fmt(mf.nagelkerke_r2, 3)]]
    ));
    // Omnibus test
    container.appendChild(pivotTable(
      ['Model χ²', 'df', 'p'],
      [[fmt(mf.chi_square, 3), mf.df, fmtP(mf.p)]], 'Omnibus Tests of Model Coefficients'
    ));

    // Coefficients — engine fields: name, b, se, wald, df, p, exp_b, exp_b_ci_lower, exp_b_ci_upper
    const coefs = result.coefficients || [];
    container.appendChild(section('Variables in the Equation'));
    container.appendChild(pivotTable(
      ['Variable','B','SE','Wald','df','p','Exp(B)','CI Lower','CI Upper'],
      coefs.map(c => [
        c.name,
        fmt(c.b, 4), fmt(c.se, 4), fmt(c.wald, 3), c.df,
        fmtP(c.p), fmt(c.exp_b, 4),
        fmt(c.exp_b_ci_lower, 4), fmt(c.exp_b_ci_upper, 4)
      ])
    ));

    // Classification table — engine fields: tp, tn, fp, fn, overall_accuracy_pct
    const ct = result.classification_table || {};
    if (ct.tp != null) {
      container.appendChild(section('Classification Table'));
      const total0 = (ct.tn || 0) + (ct.fp || 0);
      const total1 = (ct.fn || 0) + (ct.tp || 0);
      const pct0 = total0 > 0 ? fmt(ct.tn / total0 * 100, 1) + '%' : '—';
      const pct1 = total1 > 0 ? fmt(ct.tp / total1 * 100, 1) + '%' : '—';
      container.appendChild(pivotTable(
        ['Observed','Predicted 0','Predicted 1','% Correct'],
        [
          ['0', ct.tn, ct.fp, pct0],
          ['1', ct.fn, ct.tp, pct1],
          ['Overall', '', '', fmt(ct.overall_accuracy_pct, 1) + '%']
        ]
      ));
    }
  }

  /* ── Reliability renderer — engine: result.{model,n_cases,n_items,alpha,
     item_statistics:[{item,item_mean,item_std,corrected_item_total_r,alpha_if_deleted}]} ── */
  function renderReliability(container, result) {
    container.appendChild(section('Reliability Statistics', 'cronbach-alpha'));
    container.appendChild(pivotTable(
      ["Cronbach's α", 'N of Items', 'N of Cases'],
      [[fmt(result.alpha, 3), result.n_items, result.n_cases]]
    ));
    if (result.alpha_interpretation) {
      container.appendChild(el('p', {class:'muted small'}, `Interpretation: ${result.alpha_interpretation}`));
    }
    container.appendChild(section('Item-Total Statistics'));
    const rows = (result.item_statistics || []).map(s => [
      s.item,
      fmt(s.item_mean, 3),
      fmt(s.item_std, 3),
      fmt(s.corrected_item_total_r, 3),
      s.alpha_if_deleted != null ? fmt(s.alpha_if_deleted, 3) : '—'
    ]);
    container.appendChild(pivotTable(
      ['Item','Mean','SD','Corrected Item-Total r','α if Item Deleted'], rows
    ));
    if (result.scale_statistics) {
      const ss = result.scale_statistics;
      container.appendChild(section('Scale Statistics'));
      container.appendChild(pivotTable(
        ['Scale Mean','Scale Variance','Scale Std Dev'],
        [[fmt(ss.mean, 3), fmt(ss.variance, 3), fmt(ss.std, 3)]]
      ));
    }
  }

  /* ── Factor Analysis renderer — engine: result.{variables,n,n_factors_extracted,kmo,
     bartlett:{chi_square,df,p}, eigenvalue_table:[{component,eigenvalue,pct_variance,cumulative_pct}],
     loading_matrix:[{variable,factor_1,...,communality}]} ── */
  function renderFactorAnalysis(container, result) {
    container.appendChild(section("KMO and Bartlett's Test", 'kmo'));
    const bart = result.bartlett || {};
    container.appendChild(pivotTable(
      ['KMO Measure', "Bartlett's χ²", 'df', 'p'],
      [[fmt(result.kmo, 3), fmt(bart.chi_square, 3), bart.df, fmtP(bart.p)]]
    ));

    // Eigenvalue table — engine: eigenvalue_table[].{component,eigenvalue,pct_variance,cumulative_pct}
    container.appendChild(section('Total Variance Explained'));
    const evTable = (result.eigenvalue_table || []).slice(0, 15);
    container.appendChild(pivotTable(
      ['Component','Eigenvalue','% Variance','Cumulative %','Extracted'],
      evTable.map(r => [r.component, fmt(r.eigenvalue, 3), fmt(r.pct_variance, 2), fmt(r.cumulative_pct, 2), r.extracted ? '✓' : ''])
    ));

    // Factor loading matrix — engine: loading_matrix[].{variable, factor_1, factor_2, ..., communality}
    if (result.loading_matrix && result.loading_matrix.length) {
      const nFact = result.n_factors_extracted || 1;
      container.appendChild(section(result.rotation !== 'none' ? 'Rotated Component Matrix' : 'Component Matrix'));
      const fHeaders = ['Variable', ...Array.from({length:nFact},(_,i)=>`Factor ${i+1}`), 'Communality'];
      container.appendChild(pivotTable(
        fHeaders,
        result.loading_matrix.map(row => [
          row.variable,
          ...Array.from({length:nFact},(_,i)=>fmt(row[`factor_${i+1}`], 3)),
          fmt(row.communality, 3)
        ])
      ));
    }

    // Scree plot — eigenvalue_table[]
    if (evTable.length) {
      const chartId = 'chart_' + uuid();
      container.appendChild(el('div',{id:chartId,class:'output-chart',style:{height:'280px'}}));
      setTimeout(() => Charts.screePlot(chartId, evTable.map(r => r.eigenvalue)), 100);
    }
  }

  /* ── Nonparametric renderer — engine procedure-specific fields ── */
  function renderNonpar(container, result) {
    const testLabel = result.test || 'Nonparametric Test';
    container.appendChild(section(testLabel));
    const rows = [];
    // Mann-Whitney U — engine fields: U, z, p, n1, n2, effect_size_r, group1_median, group2_median
    if (result.test === 'Mann-Whitney U') {
      if (result.grouping_variable) rows.push(['Grouping variable', result.grouping_variable]);
      rows.push(['Group 1 (median)', fmt(result.group1_median, 3)]);
      rows.push(['Group 2 (median)', fmt(result.group2_median, 3)]);
      rows.push(['n₁', result.n1]);
      rows.push(['n₂', result.n2]);
      rows.push(['U statistic', fmt(result.U, 3)]);
      rows.push(['Z', fmt(result.z, 3)]);
      rows.push(['p (2-tailed)', fmtP(result.p)]);
      if (result.effect_size_r != null) rows.push(['r (effect size)', fmt(result.effect_size_r, 3)]);
    }
    // Wilcoxon Signed-Rank — engine fields: T, z, p, n_pairs, n_nonzero_diff
    else if (result.test === 'Wilcoxon Signed-Rank') {
      rows.push(['Variable 1', result.variable1 || '']);
      rows.push(['Variable 2', result.variable2 || '']);
      rows.push(['N (pairs)', result.n_pairs]);
      rows.push(['N (non-zero diff)', result.n_nonzero_diff]);
      rows.push(['T statistic', fmt(result.T, 3)]);
      rows.push(['Z', fmt(result.z, 3)]);
      rows.push(['p (2-tailed)', fmtP(result.p)]);
    }
    // Kruskal-Wallis — engine fields: H, df, p, n_total, epsilon_squared, group_medians
    else if (result.test === 'Kruskal-Wallis') {
      rows.push(['H statistic', fmt(result.H, 3)]);
      rows.push(['df', result.df]);
      rows.push(['p', fmtP(result.p)]);
      rows.push(['N', result.n_total]);
      if (result.epsilon_squared != null) rows.push(['ε² (effect size)', fmt(result.epsilon_squared, 4)]);
      if (result.group_medians) {
        Object.entries(result.group_medians).forEach(([g,med])=>rows.push([`Median (group ${g})`, fmt(med,3)]));
      }
    }
    // Friedman — engine fields: chi_square, df, p, n_cases, kendall_w
    else if (result.test === 'Friedman') {
      rows.push(['χ²', fmt(result.chi_square, 3)]);
      rows.push(['df', result.df]);
      rows.push(['p', fmtP(result.p)]);
      rows.push(['N (cases)', result.n_cases]);
      if (result.kendall_w != null) rows.push(["Kendall's W", fmt(result.kendall_w, 4)]);
    }
    else {
      // Generic fallback: dump all scalar result fields
      Object.entries(result).forEach(([k, v]) => {
        if (typeof v === 'number') rows.push([k, fmt(v, 4)]);
        else if (typeof v === 'string') rows.push([k, v]);
      });
    }
    if (rows.length) container.appendChild(pivotTable(['Statistic','Value'], rows));
    else container.appendChild(el('p',{class:'muted'},'No renderable values in result.'));
  }

  /* ── Kaplan-Meier renderer ─────────────────────────────────── */
  // Engine result: { time_variable, event_variable, group_variable, n, groups, survival_curves:{key:[{t,survival,n_risk,n_event,n_censor}]} }
  function renderKaplanMeier(container, result) {
    container.appendChild(section('Kaplan-Meier Survival Analysis'));
    // Summary row
    const curves = result.survival_curves || {};
    const allSteps = Object.values(curves).flat();
    const n_total = result.n || 0;
    const n_events = allSteps.filter(s=>s.n_event>0).reduce((s,r)=>s+r.n_event, 0);
    const n_censored = allSteps.filter(s=>s.n_censor>0).reduce((s,r)=>s+r.n_censor, 0);
    // Median survival: first time survival ≤ 0.5
    const getMedian = (steps) => {
      for (const s of steps) { if (s.survival <= 0.5) return s.t; }
      return null;
    };
    const summaryRows = Object.entries(curves).map(([grp, steps]) => {
      const med = getMedian(steps);
      const nevt = steps.reduce((s,r)=>s+r.n_event,0);
      const nris = steps[0]?.n_risk || 0;
      return [grp === 'all' ? 'Overall' : grp, nris, nevt, med != null ? fmt(med,2) : 'Not reached'];
    });
    container.appendChild(pivotTable(['Group','N at Risk','Events','Median Survival'], summaryRows));
    // Per-group survival table (first group only to keep it concise)
    const firstKey = Object.keys(curves)[0];
    if (firstKey) {
      const steps = curves[firstKey];
      container.appendChild(section(`Survival Table${firstKey !== 'all' ? ' — ' + firstKey : ''}`));
      container.appendChild(pivotTable(
        ['Time','N Risk','Events','Censored','Survival'],
        steps.map(s=>[fmt(s.t,2),s.n_risk,s.n_event,s.n_censor,fmt(s.survival,4)])
      ));
    }
    // KM chart
    const chartId='chart_'+uuid();
    container.appendChild(el('div',{id:chartId,class:'output-chart',style:{height:'350px'}}));
    setTimeout(()=>Charts.kaplanMeier(chartId,result),100);
  }

  /* ── K-Means renderer ─────────────────────────────────────── */
  // Engine result: { variables, k, n, assignments, sizes:[n0,n1,...], centers:[{cluster,n,means:{vn:val}}], silhouette_score }
  function renderKMeans(container, result) {
    container.appendChild(section('K-Means Cluster Analysis'));
    container.appendChild(pivotTable(
      ['K','N','Silhouette Score'],[[result.k, result.n, fmt(result.silhouette_score,4)]]
    ));
    // Cluster sizes from centers array
    const centers = result.centers || [];
    container.appendChild(section('Cluster Sizes'));
    container.appendChild(pivotTable(
      ['Cluster','N'],
      centers.map(c=>[`Cluster ${c.cluster}`, c.n])
    ));
    // Final cluster centers (means object keyed by variable name)
    const vars = result.variables || [];
    if (vars.length && centers.length) {
      container.appendChild(section('Final Cluster Centers'));
      container.appendChild(pivotTable(
        ['Variable', ...centers.map(c=>`Cluster ${c.cluster}`)],
        vars.map(vn=>[ vn, ...centers.map(c=>fmt((c.means||{})[vn], 3)) ])
      ));
    }
  }

  function renderProbabilityOutput(container, result) {
    if (!result) return;
    // If result has HTML, render it directly
    if (result.html) {
      container.insertAdjacentHTML('beforeend', result.html);
      return;
    }
    // Fallback: render from data object
    const data = result.data || result;
    container.appendChild(section('Normal Distribution — Probability Calculator'));
    const rows = [];
    if (data.type === 'between') {
      rows.push(['Z₁', data.z1 != null ? data.z1.toFixed(6) : '—']);
      rows.push(['Z₂', data.z2 != null ? data.z2.toFixed(6) : '—']);
    } else {
      rows.push(['Z-Score', data.z != null ? data.z.toFixed(6) : '—']);
    }
    if (data.mode === 'raw') {
      rows.push(['Mean (μ)', data.mean]);
      rows.push(['SD (σ)', data.sd]);
    }
    const tailLabel = { left: 'P(Z ≤ z)', right: 'P(Z > z)', between: 'P(z₁ < Z < z₂)', two: 'P(|Z| ≥ |z|)' }[data.type] || data.type;
    rows.push([tailLabel, data.probability != null ? data.probability.toFixed(7) : '—']);
    rows.push(['Percentage', data.percentage != null ? data.percentage.toFixed(4) + '%' : '—']);
    if (data.tableValue != null) rows.push(['Z-Table (4 dp)', data.tableValue.toFixed(4)]);
    rows.push(['Method', data.method || '—']);
    container.appendChild(pivotTable(['Parameter', 'Value'], rows));
    // Re-open calculator button
    container.appendChild(el('button', { class: 'btn btn-sm btn-primary', style: { marginTop: '8px' },
      onclick: () => ProbabilityCalcUI.open(data.z) }, '📐 Open in Calculator'));
  }

  function clearAll() { if(confirm('Clear all output?')){ _outputs=[]; Project.markDirty(); render(); } }

  function exportXLSX() {
    if(!_outputs.length){ notify('No output to export','warning'); return; }
    if(typeof XLSX === 'undefined'){ notify('Excel export unavailable — library not loaded. Retry from Settings → System Status.','error'); return; }
    const wb=XLSX.utils.book_new();
    _outputs.forEach(entry=>{
      try {
        const tmp=document.createElement('div');
        renderOutputEntry(tmp,entry);
        const tables=tmp.querySelectorAll('table.pivot-table');
        tables.forEach((tbl,ti)=>{
          const ws2=XLSX.utils.table_to_sheet(tbl);
          const sheetName=(entry.title||entry.procedure).replace(/[:\\\/\?\*\[\]]/g,'').slice(0,28)+(tables.length>1?`_${ti+1}`:'');
          XLSX.utils.book_append_sheet(wb,ws2,sheetName.slice(0,31));
        });
      } catch(e) { /* skip */ }
    });
    if(wb.SheetNames.length===0){ notify('No tables to export','warning'); return; }
    XLSX.writeFile(wb,'sociostat_output.xlsx');
  }

  function exportHTML() {
    let html='<!DOCTYPE html><html><head><meta charset="utf-8"><title>SOCIOSTAT Output</title>';
    html+=`<style>body{font-family:system-ui,sans-serif;max-width:900px;margin:40px auto;} table{border-collapse:collapse;width:100%;margin-bottom:16px;} th,td{border:1px solid #ccc;padding:6px 10px;text-align:left;} th{background:#f0f0f0;} h2{border-bottom:2px solid #333;} h3{margin-top:24px;}</style></head><body>`;
    html+=`<h1>SOCIOSTAT Output — ${new Date().toLocaleString()}</h1>`;
    const tmp=document.createElement('div'); tmp.innerHTML='';
    _outputs.forEach(entry=>{
      html+=`<h2>${entry.title}</h2><p class="muted">${fmtDate(entry.timestamp)}</p>`;
      const cont=document.createElement('div');
      renderOutputEntry(cont,entry);
      // Strip chart divs
      $$('.output-chart',cont).forEach(c=>c.remove());
      html+=cont.innerHTML;
    });
    html+='</body></html>';
    const blob=new Blob([html],{type:'text/html'});
    const a=el('a',{href:URL.createObjectURL(blob),download:'sociostat_output.html'});
    a.click();
  }

  function exportPDF() {
    const tmp=document.createElement('div');
    tmp.style.cssText='position:absolute;left:-9999px;top:0;width:800px;background:white;font-family:system-ui,sans-serif;padding:20px;';
    _outputs.forEach(entry=>{ const cont=document.createElement('div'); renderOutputEntry(cont,entry); $$('.output-chart',cont).forEach(c=>c.remove()); tmp.appendChild(cont); });
    document.body.appendChild(tmp);
    const { jsPDF } = window.jspdf||{};
    if(!jsPDF){ notify('jsPDF not loaded','error'); tmp.remove(); return; }
    const doc=new jsPDF({ orientation:'portrait', unit:'pt', format:'a4' });
    doc.html(tmp, {
      callback: pdf => { pdf.save('sociostat_output.pdf'); tmp.remove(); },
      x:20, y:20, width:555, windowWidth:800
    });
  }

  function getOutputs() { return _outputs; }
  function setOutputs(arr) { _outputs=arr||[]; render(); }

  return { init, addResult, render, getOutputs, setOutputs, clearAll, exportXLSX };
})();

/* ══════════════════════════════════════════════════════════════════
   SECTION 10B: CHART EXPORT MANAGER
   ══════════════════════════════════════════════════════════════════ */

const History = (() => {
  let _entries = [];
  let _container = null;

  function init(container) { _container = container; }

  function addEntry(entry) {
    _entries.push({ ...entry, id: uuid() });
    if (_container && _container.offsetParent !== null) render();
  }

  function setEntries(arr) { _entries = arr || []; }
  function getEntries() { return _entries; }

  function render() {
    if (!_container) return;
    _container.innerHTML = '';
    _container.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden;';
    if (!_entries.length) {
      _container.innerHTML = '<div class="empty-state">No history yet. Actions will be recorded here.</div>';
      return;
    }
    _container.appendChild(el('div', { class: 'data-toolbar', style: { flexShrink: '0' } },
      el('span', { class: 'muted' }, `${_entries.length} entries`),
      el('button', { class: 'btn btn-sm btn-danger', onclick: () => { if (confirm('Clear history?')) { _entries = []; render(); } } }, 'Clear')
    ));
    const list = el('div', { class: 'history-list' });
    [..._entries].reverse().forEach(e => {
      const icon = e.type === 'analysis' ? '📊' : e.type === 'syntax' ? '📝' : e.type === 'import' ? '📥' : '🔧';
      const title = e.type === 'analysis' ? `Analysis: ${e.procedure}` :
        e.type === 'syntax' ? `Syntax: ${(e.syntax || '').slice(0, 40)}` :
        e.type === 'import' ? `Import: ${e.name}` : e.type;
      const row = el('div', { class: 'history-entry' },
        el('span', { class: 'history-icon' }, icon),
        el('div', { class: 'history-info' },
          el('div', { class: 'history-title' }, title),
          el('div', { class: 'muted small' }, fmtDate(e.timestamp))
        ),
        e.type === 'analysis' ? el('button', {
          class: 'btn btn-sm',
          onclick: () => {
            AnalysisDialogs.runAnalysis(e.procedure, e.params);
          }
        }, '↻ Re-run') : el('span', {})
      );
      list.appendChild(row);
    });
    _container.appendChild(list);
  }

  return { init, addEntry, setEntries, getEntries, render };
})();

/* ══════════════════════════════════════════════════════════════════
   SECTION 16: TRANSFORMATION DIALOGS
   ══════════════════════════════════════════════════════════════════ */
