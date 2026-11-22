/**
 * Output Viewer — structured display of statistical results
 */

import { el, svgIcon, fmt, fmtP } from '../../app/utils.js';
import { state } from '../../app/store.js';

export function renderOutputViewer(container) {
  container.innerHTML = '';
  const docs = state.get('outputDocuments') || [];

  if (docs.length === 0) {
    container.appendChild(el('div', {
      style: { padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }
    }, 'No output yet. Run an analysis to see results here.'));
    return;
  }

  const viewer = el('div', { class: 'output-viewer' });
  const tree = el('div', { class: 'output-tree' });
  const content = el('div', { class: 'output-content' });

  viewer.appendChild(tree);
  viewer.appendChild(content);
  container.appendChild(viewer);

  let currentDocIdx = docs.length - 1;

  function renderDoc(idx) {
    currentDocIdx = idx;
    const doc = docs[idx];
    if (!doc) return;
    renderTree(doc, tree, content, idx);
    renderContent(doc, content);
  }

  renderDoc(currentDocIdx);
}

function renderTree(doc, treeEl, contentEl, docIdx) {
  treeEl.innerHTML = '';
  treeEl.appendChild(el('div', {
    class: 'output-tree-item heading',
    style: { borderBottom: '1px solid var(--border)', paddingBottom: '6px', marginBottom: '4px', fontSize: '11px', color: 'var(--text-muted)' }
  }, doc.title || 'Output'));

  const objects = doc.objects_data || [];
  for (const obj of objects) {
    const item = el('div', {
      class: `output-tree-item ${obj.type === 'heading' ? 'heading' : 'child'}`,
    }, obj.title || obj.type);
    item.addEventListener('click', () => {
      const elem = contentEl.querySelector(`[data-id="${obj.id}"]`);
      if (elem) elem.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    treeEl.appendChild(item);
  }
}

function renderContent(doc, contentEl) {
  contentEl.innerHTML = '';
  const objects = doc.objects_data || [];

  for (const obj of objects) {
    const section = renderOutputObject(obj);
    if (section) contentEl.appendChild(section);
  }
}

function renderOutputObject(obj) {
  const wrap = el('div', { 'data-id': obj.id, class: 'output-section' });

  switch (obj.type) {
    case 'heading':
      wrap.appendChild(el('div', { class: 'output-section-title' }, obj.title || ''));
      break;
    case 'paragraph':
    case 'text':
      wrap.appendChild(el('p', { style: { fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' } }, obj.data?.text || obj.title || ''));
      break;
    case 'warning':
      wrap.appendChild(renderWarningBox(obj.data));
      break;
    case 'pivotTable':
      wrap.appendChild(el('div', { class: 'output-subtitle' }, obj.title || ''));
      wrap.appendChild(renderPivotTable(obj.data));
      break;
    case 'modelSummary':
      wrap.appendChild(el('div', { class: 'output-subtitle' }, obj.title || 'Model Summary'));
      wrap.appendChild(renderModelSummary(obj.data));
      break;
    case 'diagnostic':
    case 'interpretation':
      wrap.appendChild(renderInterpretation(obj));
      break;
    default:
      if (obj.title) wrap.appendChild(el('div', { class: 'output-subtitle' }, obj.title));
  }

  return wrap;
}

// ─── Render analysis result from API ─────────────────────────────────
export function renderAnalysisResult(record, container) {
  container.innerHTML = '';
  if (!record) return;

  const procedureLabels = {
    frequencies: 'Frequencies',
    descriptives: 'Descriptive Statistics',
    crosstabs: 'Crosstabs',
    correlation: 'Correlations',
    ttest_onesample: 'One-Sample T-Test',
    ttest_independent: 'Independent Samples T-Test',
    ttest_paired: 'Paired Samples T-Test',
    anova_oneway: 'One-Way ANOVA',
    linear_regression: 'Linear Regression',
    logistic_regression: 'Binary Logistic Regression',
    reliability: 'Reliability Analysis',
    factor_analysis: 'Factor Analysis',
    nonparametric_mannwhitney: 'Mann-Whitney U Test',
    nonparametric_wilcoxon: 'Wilcoxon Signed-Rank Test',
    nonparametric_kruskalwallis: 'Kruskal-Wallis Test',
    nonparametric_friedman: 'Friedman Test',
  };

  const title = procedureLabels[record.procedure_id] || record.procedure_id;
  container.appendChild(el('div', { class: 'output-section-title' }, title));

  // Warnings
  const warnings = record.warnings || [];
  for (const w of warnings) {
    if (typeof w === 'object' && w.issue) {
      container.appendChild(renderWarningBox(w));
    }
  }

  // Error
  if (record.status === 'error' && record.error) {
    const errBox = el('div', { class: 'warning-box high' },
      el('div', { class: 'title' }, `Error: ${record.error.error_code}`),
      el('div', {}, el('strong', {}, 'Procedure: '), record.error.procedure),
      el('div', {}, el('strong', {}, 'Message: '), record.error.message),
      el('div', {}, el('strong', {}, 'Likely cause: '), record.error.likely_cause),
      el('div', {}, el('strong', {}, 'Suggested action: '), record.error.suggested_action),
    );
    container.appendChild(errBox);
    return;
  }

  // Assumptions
  const assumptions = record.assumptions_checked || [];
  if (assumptions.length > 0) {
    const assumpSection = el('div', { class: 'result-card', style: { marginBottom: '16px' } });
    const header = el('div', { class: 'result-card-header' },
      el('div', { class: 'result-card-title' }, 'Assumption Checks'),
      el('span', { class: 'text-sm text-muted' }, `${assumptions.filter(a => a.status === 'passed').length}/${assumptions.length} passed`)
    );
    const body = el('div', { class: 'result-card-body' });
    for (const a of assumptions) {
      body.appendChild(renderAssumptionItem(a));
    }
    header.addEventListener('click', () => { body.style.display = body.style.display === 'none' ? '' : 'none'; });
    assumpSection.appendChild(header);
    assumpSection.appendChild(body);
    container.appendChild(assumpSection);
  }

  // Result tables
  const result = record.result;
  if (!result) return;

  if (record.procedure_id === 'frequencies') renderFrequenciesResult(result, container);
  else if (record.procedure_id === 'descriptives') renderDescriptivesResult(result, container);
  else if (record.procedure_id === 'crosstabs') renderCrosstabsResult(result, container);
  else if (record.procedure_id === 'correlation') renderCorrelationResult(result, container);
  else if (record.procedure_id.startsWith('ttest')) renderTTestResult(result, container, record.procedure_id);
  else if (record.procedure_id === 'anova_oneway') renderAnovaResult(result, container);
  else if (record.procedure_id === 'linear_regression') renderRegressionResult(result, container);
  else if (record.procedure_id === 'logistic_regression') renderLogisticResult(result, container);
  else if (record.procedure_id === 'reliability') renderReliabilityResult(result, container);
  else if (record.procedure_id === 'factor_analysis') renderFactorResult(result, container);
  else if (record.procedure_id.startsWith('nonparametric')) renderNonparametricResult(result, container);

  // Syntax
  if (record.syntax) {
    const synCard = el('div', { class: 'result-card' });
    const synHeader = el('div', { class: 'result-card-header' }, el('div', { class: 'result-card-title' }, 'Generated Syntax'));
    const synBody = el('div', { class: 'result-card-body' },
      el('pre', { class: 'font-mono', style: { fontSize: '12px', background: '#1e1e2e', color: '#cdd6f4', padding: '12px', borderRadius: '4px', overflowX: 'auto' } },
        record.syntax)
    );
    synHeader.addEventListener('click', () => { synBody.style.display = synBody.style.display === 'none' ? '' : 'none'; });
    synCard.appendChild(synHeader);
    synCard.appendChild(synBody);
    container.appendChild(synCard);
  }
}

// ─── Frequencies ─────────────────────────────────────────────────────
function renderFrequenciesResult(result, container) {
  const tables = result.tables || {};
  for (const [varName, t] of Object.entries(tables)) {
    const card = el('div', { class: 'result-card' });
    const header = el('div', { class: 'result-card-header' },
      el('div', { class: 'result-card-title' }, t.label || varName),
      el('span', { class: 'text-sm text-muted' }, `N=${t.n_total}, Missing=${t.n_missing}`)
    );
    const body = el('div', { class: 'result-card-body' });
    const table = el('table', { class: 'pivot-table' });
    const thead = el('thead', {},
      el('tr', {},
        el('th', {}, 'Value'),
        el('th', {}, 'Label'),
        el('th', { class: 'center' }, 'Frequency'),
        el('th', { class: 'center' }, 'Percent'),
        el('th', { class: 'center' }, 'Valid %'),
        el('th', { class: 'center' }, 'Cum. %'),
      )
    );
    const tbody = el('tbody', {});
    for (const row of t.rows) {
      tbody.appendChild(el('tr', {},
        el('td', { class: 'label' }, row.value == null ? '' : String(row.value)),
        el('td', { class: 'label' }, row.label || ''),
        el('td', {}, String(row.frequency)),
        el('td', {}, fmt(row.percent, 1) + '%'),
        el('td', {}, row.valid_percent != null ? fmt(row.valid_percent, 1) + '%' : ''),
        el('td', {}, row.cumulative_percent != null ? fmt(row.cumulative_percent, 1) + '%' : ''),
      ));
    }
    table.appendChild(thead);
    table.appendChild(tbody);
    body.appendChild(table);
    card.appendChild(header);
    card.appendChild(body);
    container.appendChild(card);
  }
}

// ─── Descriptives ─────────────────────────────────────────────────────
function renderDescriptivesResult(result, container) {
  const descs = result.descriptives || {};
  const card = el('div', { class: 'result-card' });
  const header = el('div', { class: 'result-card-header' },
    el('div', { class: 'result-card-title' }, 'Descriptive Statistics')
  );
  const body = el('div', { class: 'result-card-body' });
  const table = el('table', { class: 'pivot-table' });
  const thead = el('thead', {},
    el('tr', {},
      el('th', {}, 'Variable'),
      el('th', { class: 'center' }, 'N'),
      el('th', { class: 'center' }, 'Mean'),
      el('th', { class: 'center' }, 'SD'),
      el('th', { class: 'center' }, 'SE Mean'),
      el('th', { class: 'center' }, 'Min'),
      el('th', { class: 'center' }, 'Max'),
      el('th', { class: 'center' }, 'Skewness'),
      el('th', { class: 'center' }, 'Kurtosis'),
    )
  );
  const tbody = el('tbody', {});
  for (const [varName, d] of Object.entries(descs)) {
    if (d.error) {
      tbody.appendChild(el('tr', {}, el('td', { colspan: '9' }, el('span', { class: 'text-error' }, `${varName}: ${d.error}`))));
      continue;
    }
    tbody.appendChild(el('tr', {},
      el('td', { class: 'label' }, d.label || varName),
      el('td', {}, String(d.n)),
      el('td', {}, fmt(d.mean, 4)),
      el('td', {}, d.std != null ? fmt(d.std, 4) : '—'),
      el('td', {}, d.se_mean != null ? fmt(d.se_mean, 4) : '—'),
      el('td', {}, fmt(d.minimum, 4)),
      el('td', {}, fmt(d.maximum, 4)),
      el('td', {}, d.skewness != null ? fmt(d.skewness, 4) : '—'),
      el('td', {}, d.kurtosis != null ? fmt(d.kurtosis, 4) : '—'),
    ));
  }
  table.appendChild(thead);
  table.appendChild(tbody);
  body.appendChild(table);
  card.appendChild(header);
  card.appendChild(body);
  container.appendChild(card);
}

// ─── Crosstabs ────────────────────────────────────────────────────────
function renderCrosstabsResult(result, container) {
  const stats = result.statistics || {};
  const rowValues = result.row_values || [];
  const colValues = result.col_values || [];

  // Main table
  const card = el('div', { class: 'result-card' });
  const header = el('div', { class: 'result-card-header' },
    el('div', { class: 'result-card-title' }, `${result.row_variable} × ${result.col_variable}`),
    el('span', { class: 'text-sm text-muted' }, `N = ${result.n_total}`)
  );
  const body = el('div', { class: 'result-card-body', style: { overflowX: 'auto' } });

  // Build contingency matrix
  const matrix = {};
  for (const row of result.table_rows || []) {
    const key = `${row.row_value}|${row.col_value}`;
    matrix[key] = row;
  }

  const table = el('table', { class: 'pivot-table' });
  const thead = el('thead', {});
  const hRow = el('tr', {}, el('th', {}, result.row_variable));
  for (const cv of colValues) {
    const lbl = result.col_labels?.[String(cv)] || String(cv);
    hRow.appendChild(el('th', { class: 'center' }, lbl || String(cv)));
  }
  hRow.appendChild(el('th', { class: 'center' }, 'Total'));
  thead.appendChild(hRow);
  table.appendChild(thead);

  const tbody = el('tbody', {});
  for (const rv of rowValues) {
    const rowLabel = result.row_labels?.[String(rv)] || String(rv);
    const tr = el('tr', {});
    tr.appendChild(el('td', { class: 'label' }, rowLabel));
    let rowTotal = 0;
    for (const cv of colValues) {
      const cell = matrix[`${rv}|${cv}`];
      const obs = cell?.observed ?? 0;
      rowTotal += obs;
      tr.appendChild(el('td', {},
        el('div', {}, String(obs)),
        el('div', { class: 'text-muted text-sm' }, `${cell?.col_pct ?? 0}%`)
      ));
    }
    tr.appendChild(el('td', {}, String(rowTotal)));
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  body.appendChild(table);
  card.appendChild(header);
  card.appendChild(body);
  container.appendChild(card);

  // Statistics table
  const statsCard = el('div', { class: 'result-card' });
  const statsHeader = el('div', { class: 'result-card-header' },
    el('div', { class: 'result-card-title' }, 'Chi-Square Tests')
  );
  const statsBody = el('div', { class: 'result-card-body' });
  const statsTable = el('table', { class: 'pivot-table' });
  statsTable.appendChild(el('thead', {},
    el('tr', {},
      el('th', {}, 'Statistic'), el('th', { class: 'center' }, 'Value'),
      el('th', { class: 'center' }, 'df'), el('th', { class: 'center' }, 'Asymp. Sig.')
    )
  ));
  const stbody = el('tbody', {});

  const addStatRow = (label, val, df, p, sig = false) => {
    stbody.appendChild(el('tr', {},
      el('td', { class: 'label' }, label),
      el('td', { class: sig ? 'sig' : '' }, val != null ? fmt(val, 4) : '—'),
      el('td', {}, df != null ? String(df) : '—'),
      el('td', { class: sig ? 'sig' : '' }, p != null ? fmtP(p) : '—'),
    ));
  };

  addStatRow('Pearson Chi-Square', stats.chi_square, stats.chi_square_df, stats.chi_square_p, stats.chi_square_p < 0.05);
  if (stats.chi_square_yates != null) addStatRow("Continuity Correction (Yates')", stats.chi_square_yates, 1, stats.chi_square_yates_p);
  addStatRow('Likelihood Ratio (G²)', stats.likelihood_ratio, stats.chi_square_df, stats.likelihood_ratio_p);
  if (stats.fisher_exact_p != null) addStatRow("Fisher's Exact Test", null, null, stats.fisher_exact_p, stats.fisher_exact_p < 0.05);

  statsTable.appendChild(stbody);
  statsBody.appendChild(statsTable);

  // Effect sizes
  statsBody.appendChild(el('div', { class: 'output-subtitle' }, 'Symmetric Measures'));
  const effTable = el('table', { class: 'pivot-table' });
  effTable.appendChild(el('thead', {}, el('tr', {}, el('th', {}, 'Measure'), el('th', { class: 'center' }, 'Value'))));
  const effBody = el('tbody', {});
  if (stats.phi != null) effBody.appendChild(el('tr', {}, el('td', { class: 'label' }, 'Phi'), el('td', {}, fmt(stats.phi, 4))));
  effBody.appendChild(el('tr', {}, el('td', { class: 'label' }, "Cramer's V"), el('td', {}, fmt(stats.cramers_v, 4))));
  effBody.appendChild(el('tr', {}, el('td', { class: 'label' }, 'Contingency Coefficient'), el('td', {}, fmt(stats.contingency_coefficient, 4))));
  effTable.appendChild(effBody);
  statsBody.appendChild(effTable);

  statsCard.appendChild(statsHeader);
  statsCard.appendChild(statsBody);
  container.appendChild(statsCard);
}

// ─── Correlation ──────────────────────────────────────────────────────
function renderCorrelationResult(result, container) {
  const vars = result.variables || [];
  const matrix = result.correlation_matrix || {};
  const nMatrix = result.n_matrix || {};
  const pMatrix = result.p_matrix || {};

  const card = el('div', { class: 'result-card' });
  const header = el('div', { class: 'result-card-header' },
    el('div', { class: 'result-card-title' }, `Correlations (${result.method || 'Pearson'})`),
  );
  const body = el('div', { class: 'result-card-body', style: { overflowX: 'auto' } });
  const table = el('table', { class: 'pivot-table' });
  const thead = el('thead', {});
  const hRow = el('tr', {}, el('th', {}, ''));
  for (const v of vars) hRow.appendChild(el('th', { class: 'center' }, v));
  thead.appendChild(hRow);
  table.appendChild(thead);

  const tbody = el('tbody', {});
  for (const v1 of vars) {
    // Row 1: r values
    const tr1 = el('tr', {}, el('td', { class: 'label' }, v1));
    for (const v2 of vars) {
      const r = matrix[v1]?.[v2];
      const p = pMatrix[v1]?.[v2];
      const sig = p != null && p < 0.05;
      const isdiag = v1 === v2;
      tr1.appendChild(el('td', { class: isdiag ? '' : (sig ? 'sig' : '') },
        isdiag ? '1' : (r != null ? fmt(r, 4) : '—')
      ));
    }
    // Row 2: p values  
    const tr2 = el('tr', {}, el('td', { class: 'subrow' }, 'Sig. (2-tailed)'));
    for (const v2 of vars) {
      const p = pMatrix[v1]?.[v2];
      const n = nMatrix[v1]?.[v2];
      tr2.appendChild(el('td', { class: 'text-muted', style: { fontSize: '11px' } }, v1 === v2 ? '' : (p != null ? fmtP(p) : '—')));
    }
    // Row 3: N
    const tr3 = el('tr', {}, el('td', { class: 'subrow' }, 'N'));
    for (const v2 of vars) {
      const n = nMatrix[v1]?.[v2];
      tr3.appendChild(el('td', { style: { fontSize: '11px', color: 'var(--text-muted)' } }, n != null ? String(n) : ''));
    }
    tbody.appendChild(tr1);
    tbody.appendChild(tr2);
    tbody.appendChild(tr3);
  }
  table.appendChild(tbody);
  body.appendChild(table);
  card.appendChild(header);
  card.appendChild(body);
  container.appendChild(card);
}

// ─── T-Test ───────────────────────────────────────────────────────────
function renderTTestResult(result, container, procedureId) {
  if (result.test_type === 'onesample') {
    renderOneSampleTTest(result, container);
  } else if (result.test_type === 'independent') {
    renderIndependentTTest(result, container);
  } else if (result.test_type === 'paired') {
    renderPairedTTest(result, container);
  }
}

function renderOneSampleTTest(r, container) {
  const card = el('div', { class: 'result-card' });
  card.appendChild(el('div', { class: 'result-card-header' },
    el('div', { class: 'result-card-title' }, `One-Sample T-Test: ${r.variable}`)));
  const body = el('div', { class: 'result-card-body' });

  const statsTable = makePivotTable(
    ['', 'N', 'Mean', 'SD', 'SE Mean'],
    [[r.variable, r.n, fmt(r.mean, 4), fmt(r.std, 4), fmt(r.se, 4)]]
  );
  body.appendChild(el('div', { class: 'output-subtitle' }, 'Statistics'));
  body.appendChild(statsTable);

  const testTable = makePivotTable(
    ['', 't', 'df', 'Sig. (2-tailed)', 'Mean Diff.', '95% CI Lower', '95% CI Upper'],
    [[r.variable, fmt(r.t, 4), r.df, fmtP(r.p_two_tailed), fmt(r.mean_difference, 4), fmt(r.ci_lower, 4), fmt(r.ci_upper, 4)]]
  );
  body.appendChild(el('div', { class: 'output-subtitle' }, `Test Value = ${r.test_value}`));
  body.appendChild(testTable);

  if (r.cohens_d != null) {
    body.appendChild(el('div', { class: 'text-sm text-muted', style: { marginTop: '8px' } },
      `Effect size: Cohen's d = ${fmt(r.cohens_d, 4)}`));
  }

  card.appendChild(body);
  container.appendChild(card);
}

function renderIndependentTTest(r, container) {
  const card = el('div', { class: 'result-card' });
  card.appendChild(el('div', { class: 'result-card-header' },
    el('div', { class: 'result-card-title' }, `Independent Samples T-Test: ${r.variable}`)));
  const body = el('div', { class: 'result-card-body' });

  body.appendChild(el('div', { class: 'output-subtitle' }, 'Group Statistics'));
  body.appendChild(makePivotTable(
    ['Variable', 'Group', 'N', 'Mean', 'SD', 'SE Mean'],
    [
      [r.variable, String(r.group1), r.group1_n, fmt(r.group1_mean, 4), fmt(r.group1_std, 4), fmt(r.group1_se, 4)],
      [r.variable, String(r.group2), r.group2_n, fmt(r.group2_mean, 4), fmt(r.group2_std, 4), fmt(r.group2_se, 4)],
    ]
  ));

  body.appendChild(el('div', { class: 'output-subtitle' }, 'Independent Samples Test'));
  body.appendChild(makePivotTable(
    ['', "Levene's F", "Levene's p", 't', 'df', 'Sig.', 'Mean Diff.', 'SE Diff.', '95% CI'],
    [
      ['Equal var. assumed',
        fmt(r.levene_statistic, 4), fmtP(r.levene_p),
        fmt(r.equal_variance.t, 4), fmt(r.equal_variance.df, 2), fmtP(r.equal_variance.p_two_tailed),
        fmt(r.equal_variance.mean_difference, 4), fmt(r.equal_variance.se_difference, 4),
        `[${fmt(r.equal_variance.ci_lower, 4)}, ${fmt(r.equal_variance.ci_upper, 4)}]`
      ],
      ['Equal var. NOT assumed', '', '',
        fmt(r.unequal_variance.t, 4), fmt(r.unequal_variance.df, 2), fmtP(r.unequal_variance.p_two_tailed),
        fmt(r.unequal_variance.mean_difference, 4), fmt(r.unequal_variance.se_difference, 4),
        `[${fmt(r.unequal_variance.ci_lower, 4)}, ${fmt(r.unequal_variance.ci_upper, 4)}]`
      ],
    ]
  ));

  if (r.cohens_d != null) {
    body.appendChild(el('div', { class: 'text-sm text-muted', style: { marginTop: '8px' } },
      `Cohen's d = ${fmt(r.cohens_d, 4)}`));
  }

  card.appendChild(body);
  container.appendChild(card);
}

function renderPairedTTest(r, container) {
  const card = el('div', { class: 'result-card' });
  card.appendChild(el('div', { class: 'result-card-header' },
    el('div', { class: 'result-card-title' }, `Paired Samples T-Test: ${r.variable1} & ${r.variable2}`)));
  const body = el('div', { class: 'result-card-body' });

  body.appendChild(el('div', { class: 'output-subtitle' }, 'Paired Samples Statistics'));
  body.appendChild(makePivotTable(
    ['', 'N', 'Mean', 'SD', 'SE Mean'],
    [
      [r.variable1, r.n, fmt(r.mean1, 4), fmt(r.std1, 4), ''],
      [r.variable2, r.n, fmt(r.mean2, 4), fmt(r.std2, 4), ''],
    ]
  ));

  body.appendChild(el('div', { class: 'output-subtitle' }, 'Paired Samples Test'));
  body.appendChild(makePivotTable(
    ['Pair', 'Mean Diff.', 'SD Diff.', 'SE Diff.', 't', 'df', 'Sig. (2-tail)', '95% CI'],
    [[
      `${r.variable1} − ${r.variable2}`,
      fmt(r.mean_difference, 4), fmt(r.std_difference, 4), fmt(r.se_difference, 4),
      fmt(r.t, 4), r.df, fmtP(r.p_two_tailed),
      `[${fmt(r.ci_lower, 4)}, ${fmt(r.ci_upper, 4)}]`
    ]]
  ));

  card.appendChild(body);
  container.appendChild(card);
}

// ─── ANOVA ────────────────────────────────────────────────────────────
function renderAnovaResult(result, container) {
  const card = el('div', { class: 'result-card' });
  card.appendChild(el('div', { class: 'result-card-header' },
    el('div', { class: 'result-card-title' }, `One-Way ANOVA: ${result.dependent} by ${result.factor}`)));
  const body = el('div', { class: 'result-card-body' });

  // ANOVA table
  body.appendChild(el('div', { class: 'output-subtitle' }, 'ANOVA'));
  const at = result.anova_table;
  body.appendChild(makePivotTable(
    ['', 'SS', 'df', 'MS', 'F', 'Sig.'],
    [
      ['Between Groups', fmt(at.between.ss), at.between.df, fmt(at.between.ms), fmt(at.between.f, 4), fmtP(at.between.p)],
      ['Within Groups', fmt(at.within.ss), at.within.df, fmt(at.within.ms), '', ''],
      ['Total', fmt(at.total.ss), at.total.df, '', '', ''],
    ]
  ));

  // Group descriptives
  body.appendChild(el('div', { class: 'output-subtitle' }, 'Group Descriptives'));
  const groupRows = Object.entries(result.group_stats || {}).map(([g, s]) => [
    g, s.n, fmt(s.mean, 4), fmt(s.std, 4), fmt(s.se, 4),
    s.ci_lower != null ? `[${fmt(s.ci_lower, 4)}, ${fmt(s.ci_upper, 4)}]` : '',
    fmt(s.minimum), fmt(s.maximum),
  ]);
  body.appendChild(makePivotTable(
    ['Group', 'N', 'Mean', 'SD', 'SE', '95% CI', 'Min', 'Max'],
    groupRows
  ));

  // Eta squared
  if (result.eta_squared != null) {
    body.appendChild(el('div', { class: 'text-sm text-muted', style: { marginTop: '8px' } },
      `Eta squared (η²) = ${fmt(result.eta_squared, 4)}`));
  }

  // Post hoc
  const ph = result.post_hoc || {};
  for (const [method, comparisons] of Object.entries(ph)) {
    if (!comparisons?.length) continue;
    body.appendChild(el('div', { class: 'output-subtitle' }, `Post Hoc: ${method.charAt(0).toUpperCase() + method.slice(1)}`));
    body.appendChild(makePivotTable(
      ['Group (I)', 'Group (J)', 'Mean Diff.', 'SE', 'Sig.'],
      comparisons.map(c => [c.group1, c.group2, fmt(c.mean_difference, 4), fmt(c.se, 4), fmtP(c.p)])
    ));
  }

  card.appendChild(body);
  container.appendChild(card);
}

// ─── Regression ───────────────────────────────────────────────────────
function renderRegressionResult(result, container) {
  const card = el('div', { class: 'result-card' });
  card.appendChild(el('div', { class: 'result-card-header' },
    el('div', { class: 'result-card-title' }, `Linear Regression: ${result.dependent}`)));
  const body = el('div', { class: 'result-card-body' });

  // Model summary
  const ms = result.model_summary;
  body.appendChild(el('div', { class: 'output-subtitle' }, 'Model Summary'));
  body.appendChild(makePivotTable(
    ['R', 'R²', 'Adjusted R²', 'SE of Estimate'],
    [[fmt(ms.r, 4), fmt(ms.r_squared, 4), fmt(ms.adjusted_r_squared, 4), fmt(ms.se_estimate, 4)]]
  ));

  // ANOVA
  const at = result.anova_table;
  body.appendChild(el('div', { class: 'output-subtitle' }, 'ANOVA'));
  body.appendChild(makePivotTable(
    ['', 'SS', 'df', 'MS', 'F', 'Sig.'],
    [
      ['Regression', fmt(at.regression.ss), at.regression.df, fmt(at.regression.ms), fmt(at.regression.f, 4), fmtP(at.regression.p)],
      ['Residual', fmt(at.residual.ss), at.residual.df, fmt(at.residual.ms), '', ''],
      ['Total', fmt(at.total.ss), at.total.df, '', '', ''],
    ]
  ));

  // Coefficients
  body.appendChild(el('div', { class: 'output-subtitle' }, 'Coefficients'));
  body.appendChild(makePivotTable(
    ['', 'B', 'SE', 'Beta', 't', 'Sig.', '95% CI Lower', '95% CI Upper'],
    (result.coefficients || []).map(c => [
      c.name, fmt(c.b, 4), fmt(c.se, 4), c.beta != null ? fmt(c.beta, 4) : '',
      fmt(c.t, 4), fmtP(c.p), fmt(c.ci_lower, 4), fmt(c.ci_upper, 4)
    ])
  ));

  // VIF
  const vif = result.vif || {};
  if (Object.keys(vif).length > 0) {
    body.appendChild(el('div', { class: 'output-subtitle' }, 'Collinearity Statistics'));
    body.appendChild(makePivotTable(
      ['Variable', 'Tolerance', 'VIF'],
      Object.entries(vif).map(([v, s]) => [v, fmt(s.tolerance, 4), fmt(s.vif, 4)])
    ));
  }

  card.appendChild(body);
  container.appendChild(card);
}

// ─── Logistic Regression ──────────────────────────────────────────────
function renderLogisticResult(result, container) {
  const card = el('div', { class: 'result-card' });
  card.appendChild(el('div', { class: 'result-card-header' },
    el('div', { class: 'result-card-title' }, `Binary Logistic Regression: ${result.dependent}`)));
  const body = el('div', { class: 'result-card-body' });

  const mf = result.model_fit;
  body.appendChild(el('div', { class: 'output-subtitle' }, 'Model Fit'));
  body.appendChild(makePivotTable(
    ['-2 Log Likelihood', 'χ²', 'df', 'Sig.', 'Cox & Snell R²', 'Nagelkerke R²'],
    [[fmt(mf.neg_2ll, 4), fmt(mf.chi_square, 4), mf.df, fmtP(mf.p), fmt(mf.cox_snell_r2, 4), mf.nagelkerke_r2 != null ? fmt(mf.nagelkerke_r2, 4) : '—']]
  ));

  body.appendChild(el('div', { class: 'output-subtitle' }, 'Variables in the Equation'));
  body.appendChild(makePivotTable(
    ['', 'B', 'SE', 'Wald', 'df', 'Sig.', 'Exp(B)', '95% CI Exp(B)'],
    (result.coefficients || []).map(c => [
      c.name, fmt(c.b, 4), fmt(c.se, 4), fmt(c.wald, 4), c.df,
      fmtP(c.p), fmt(c.exp_b, 4),
      `[${fmt(c.exp_b_ci_lower, 4)}, ${fmt(c.exp_b_ci_upper, 4)}]`
    ])
  ));

  const ct = result.classification_table;
  body.appendChild(el('div', { class: 'output-subtitle' }, 'Classification Table'));
  body.appendChild(makePivotTable(
    ['', 'Predicted 0', 'Predicted 1', 'Correct %'],
    [
      ['Observed 0', ct.tn, ct.fp, fmt(ct.tn/(ct.tn+ct.fp)*100, 1) + '%'],
      ['Observed 1', ct.fn, ct.tp, fmt(ct.tp/(ct.tp+ct.fn)*100, 1) + '%'],
    ]
  ));
  body.appendChild(el('div', { class: 'text-sm text-muted', style: { marginTop: '6px' } },
    `Overall accuracy: ${ct.overall_accuracy_pct}%`));

  card.appendChild(body);
  container.appendChild(card);
}

// ─── Reliability ──────────────────────────────────────────────────────
function renderReliabilityResult(result, container) {
  const card = el('div', { class: 'result-card' });
  card.appendChild(el('div', { class: 'result-card-header' },
    el('div', { class: 'result-card-title' }, 'Reliability Analysis'),
    el('div', { class: 'text-sm', style: { display: 'flex', gap: '12px', alignItems: 'center' } },
      el('span', { class: 'bold text-accent' }, `α = ${fmt(result.alpha, 4)}`),
      el('span', { class: 'text-muted' }, result.alpha_interpretation)
    )
  ));
  const body = el('div', { class: 'result-card-body' });

  const ss = result.scale_statistics;
  body.appendChild(el('div', { class: 'output-subtitle' }, 'Scale Statistics'));
  body.appendChild(makePivotTable(
    ['Mean', 'Variance', 'SD', 'N of Items'],
    [[fmt(ss.mean, 4), fmt(ss.variance, 4), fmt(ss.std, 4), result.n_items]]
  ));

  body.appendChild(el('div', { class: 'output-subtitle' }, 'Item-Total Statistics'));
  body.appendChild(makePivotTable(
    ['Item', 'Scale Mean if Deleted', 'Scale Var if Deleted', 'Corrected Item-Total r', 'Alpha if Deleted'],
    (result.item_statistics || []).map(s => [
      s.item, fmt(s.scale_mean_if_deleted, 4), fmt(s.scale_variance_if_deleted, 4),
      fmt(s.corrected_item_total_r, 4),
      s.alpha_if_deleted != null ? fmt(s.alpha_if_deleted, 4) : '—'
    ])
  ));

  card.appendChild(body);
  container.appendChild(card);
}

// ─── Factor Analysis ──────────────────────────────────────────────────
function renderFactorResult(result, container) {
  const card = el('div', { class: 'result-card' });
  card.appendChild(el('div', { class: 'result-card-header' },
    el('div', { class: 'result-card-title' }, `Factor Analysis (${result.n_factors_extracted} factors extracted)`)));
  const body = el('div', { class: 'result-card-body' });

  // KMO and Bartlett
  body.appendChild(el('div', { class: 'output-subtitle' }, 'KMO and Bartlett\'s Test'));
  body.appendChild(makePivotTable(
    ['Test', 'Value', 'Sig.'],
    [
      ['KMO Measure of Sampling Adequacy', fmt(result.kmo, 4), ''],
      ['Bartlett\'s Test χ²', fmt(result.bartlett?.chi_square, 4), fmtP(result.bartlett?.p)],
    ]
  ));

  // Total Variance Explained
  body.appendChild(el('div', { class: 'output-subtitle' }, 'Total Variance Explained'));
  body.appendChild(makePivotTable(
    ['Component', 'Eigenvalue', '% of Variance', 'Cumulative %', 'Extracted'],
    (result.eigenvalue_table || []).slice(0, 10).map(r => [
      r.component, fmt(r.eigenvalue, 4), fmt(r.pct_variance, 4), fmt(r.cumulative_pct, 4),
      r.extracted ? '✓' : ''
    ])
  ));

  // Component/Factor Matrix
  const loadMatrix = result.loading_matrix || [];
  const nFactors = result.n_factors_extracted;
  const headers = ['Variable', ...Array.from({ length: nFactors }, (_, i) => `Factor ${i+1}`), 'Communality'];
  body.appendChild(el('div', { class: 'output-subtitle' }, `${result.rotation !== 'none' ? 'Rotated ' : ''}Component Matrix`));
  body.appendChild(makePivotTable(
    headers,
    loadMatrix.map(row => [
      row.variable,
      ...Array.from({ length: nFactors }, (_, i) => fmt(row[`factor_${i+1}`], 4)),
      fmt(row.communality, 4),
    ])
  ));

  card.appendChild(body);
  container.appendChild(card);
}

// ─── Nonparametric ────────────────────────────────────────────────────
function renderNonparametricResult(result, container) {
  const card = el('div', { class: 'result-card' });
  card.appendChild(el('div', { class: 'result-card-header' },
    el('div', { class: 'result-card-title' }, result.test || 'Nonparametric Test')));
  const body = el('div', { class: 'result-card-body' });

  const rows = [];
  if (result.U != null) rows.push(['Mann-Whitney U', fmt(result.U, 4), '']);
  if (result.z != null) rows.push(['Z', fmt(result.z, 4), '']);
  if (result.T != null) rows.push(['T', fmt(result.T, 4), '']);
  if (result.H != null) rows.push(['H (Kruskal-Wallis)', fmt(result.H, 4), result.df]);
  if (result.chi_square != null) rows.push(['χ² (Friedman)', fmt(result.chi_square, 4), result.df]);
  if (result.p != null) rows.push(['Asymp. Sig. (2-tailed)', fmtP(result.p), '']);
  if (result.effect_size_r != null) rows.push(['Effect Size r', fmt(result.effect_size_r, 4), '']);
  if (result.epsilon_squared != null) rows.push(['Epsilon²', fmt(result.epsilon_squared, 4), '']);
  if (result.kendall_w != null) rows.push(["Kendall's W", fmt(result.kendall_w, 4), '']);

  body.appendChild(makePivotTable(['Statistic', 'Value', 'df'], rows));
  card.appendChild(body);
  container.appendChild(card);
}

// ─── Helpers ──────────────────────────────────────────────────────────
function makePivotTable(headers, rows) {
  const table = el('table', { class: 'pivot-table' });
  const thead = el('thead', {}, el('tr', {}, ...headers.map(h => el('th', {}, String(h)))));
  table.appendChild(thead);
  const tbody = el('tbody', {});
  for (const row of rows) {
    const tr = el('tr', {});
    for (let i = 0; i < row.length; i++) {
      const td = el('td', { class: i === 0 ? 'label' : '' }, row[i] != null ? String(row[i]) : '');
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  return table;
}

function renderWarningBox(w) {
  if (!w) return el('div', {});
  const severity = (w.severity || 'LOW').toLowerCase();
  const box = el('div', { class: `warning-box ${severity}` });
  box.appendChild(el('div', { class: 'title' }, `${w.severity || 'INFO'}: ${w.code || ''}`));
  if (w.issue) box.appendChild(el('div', {}, el('strong', {}, 'Issue: '), w.issue));
  if (w.why_it_matters) box.appendChild(el('div', {}, el('strong', {}, 'Why it matters: '), w.why_it_matters));
  if (w.recommended_action) box.appendChild(el('div', {}, el('strong', {}, 'Recommended: '), w.recommended_action));
  return box;
}

function renderAssumptionItem(a) {
  const div = el('div', { class: `assumption-item ${a.status || 'not_tested'}` });
  div.appendChild(el('div', { class: `assumption-dot ${a.status || 'not_tested'}` }));
  const info = el('div', { style: { flex: '1' } });
  info.appendChild(el('div', { class: 'assumption-name' }, a.name));
  info.appendChild(el('div', { class: 'assumption-detail' },
    a.interpretation || a.description || ''));
  if (a.test_statistic != null) {
    info.appendChild(el('div', { class: 'text-sm text-muted' },
      `Statistic: ${fmt(a.test_statistic, 4)}` + (a.p_value != null ? `, p = ${fmtP(a.p_value)}` : '')));
  }
  div.appendChild(info);
  return div;
}

function renderModelSummary(data) {
  if (!data) return el('div', {});
  return el('div', { style: { fontFamily: 'var(--font-mono)', fontSize: '12px' } },
    JSON.stringify(data, null, 2));
}

function renderInterpretation(obj) {
  return el('div', {
    style: { background: 'var(--accent-light)', padding: '12px', borderRadius: '4px', marginBottom: '8px', fontSize: '13px' }
  }, obj.data?.text || obj.title || '');
}

export { renderOutputViewer, renderAnalysisResult };
