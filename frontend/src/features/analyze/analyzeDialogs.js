/**
 * Analysis Dialogs — UI for each statistical procedure
 */

import { el, svgIcon, showError, showSuccess } from '../../app/utils.js';
import { Analysis } from '../../app/api.js';
import { state } from '../../app/store.js';
import { renderAnalysisResult } from '../output/outputViewer.js';

// ─── Analysis Menu ────────────────────────────────────────────────────
export function renderAnalyzeMenu(container) {
  container.innerHTML = '';
  const menu = el('div', { class: 'analyze-menu' });

  const groups = [
    {
      label: 'Descriptive Statistics',
      items: [
        { id: 'frequencies', label: 'Frequencies…' },
        { id: 'descriptives', label: 'Descriptives…' },
        { id: 'crosstabs', label: 'Crosstabs…' },
      ]
    },
    {
      label: 'Correlate',
      items: [
        { id: 'correlation', label: 'Bivariate Correlations…' },
      ]
    },
    {
      label: 'Compare Means',
      items: [
        { id: 'ttest_onesample', label: 'One-Sample T-Test…' },
        { id: 'ttest_independent', label: 'Independent Samples T-Test…' },
        { id: 'ttest_paired', label: 'Paired Samples T-Test…' },
        { id: 'anova_oneway', label: 'One-Way ANOVA…' },
      ]
    },
    {
      label: 'Regression',
      items: [
        { id: 'linear_regression', label: 'Linear Regression…' },
        { id: 'logistic_regression', label: 'Binary Logistic Regression…' },
      ]
    },
    {
      label: 'Scale',
      items: [
        { id: 'reliability', label: 'Reliability Analysis (Alpha)…' },
      ]
    },
    {
      label: 'Dimension Reduction',
      items: [
        { id: 'factor_analysis', label: 'Factor Analysis…' },
      ]
    },
    {
      label: 'Nonparametric Tests',
      items: [
        { id: 'nonparametric_mannwhitney', label: 'Mann-Whitney U…' },
        { id: 'nonparametric_wilcoxon', label: 'Wilcoxon Signed-Rank…' },
        { id: 'nonparametric_kruskalwallis', label: 'Kruskal-Wallis…' },
        { id: 'nonparametric_friedman', label: 'Friedman…' },
      ]
    },
  ];

  for (const group of groups) {
    menu.appendChild(el('div', { class: 'analyze-group-header' }, group.label));
    for (const item of group.items) {
      const a = el('div', { class: 'analyze-item' }, item.label);
      a.addEventListener('click', () => openAnalysisDialog(item.id));
      menu.appendChild(a);
    }
  }

  container.appendChild(menu);
}

// ─── Dialog router ────────────────────────────────────────────────────
function openAnalysisDialog(procedureId) {
  const ds = state.get('activeDataset');
  const pageData = state.get('activeDatasetPage');
  if (!ds) {
    showError('No active dataset. Open a dataset first.');
    return;
  }
  const variables = pageData?.variables || ds.variables_meta || [];

  switch (procedureId) {
    case 'frequencies':
    case 'descriptives':
      openMultiVarDialog(procedureId, variables);
      break;
    case 'correlation':
      openCorrelationDialog(variables);
      break;
    case 'crosstabs':
      openCrosstabsDialog(variables);
      break;
    case 'ttest_onesample':
      openOneSampleTTestDialog(variables);
      break;
    case 'ttest_independent':
      openIndependentTTestDialog(variables);
      break;
    case 'ttest_paired':
      openPairedTTestDialog(variables);
      break;
    case 'anova_oneway':
      openAnovaDialog(variables);
      break;
    case 'linear_regression':
      openRegressionDialog(variables);
      break;
    case 'logistic_regression':
      openLogisticDialog(variables);
      break;
    case 'reliability':
      openReliabilityDialog(variables);
      break;
    case 'factor_analysis':
      openFactorDialog(variables);
      break;
    case 'nonparametric_mannwhitney':
    case 'nonparametric_kruskalwallis':
      openTwoGroupNPDialog(procedureId, variables);
      break;
    case 'nonparametric_wilcoxon':
    case 'nonparametric_paired':
      openPairedNPDialog(procedureId, variables);
      break;
    case 'nonparametric_friedman':
      openMultiVarDialog(procedureId, variables, 'variables');
      break;
    default:
      showError(`Dialog for '${procedureId}' not implemented yet.`);
  }
}

// ─── Shared variable selector ────────────────────────────────────────
function makeVarListbox(variables, multi = true, filter = null) {
  const list = el('div', { class: 'var-list' });
  const filteredVars = filter ? variables.filter(filter) : variables;

  for (const v of filteredVars) {
    const item = el('div', { class: 'var-list-item', 'data-name': v.name });
    item.appendChild(el('span', { class: `var-type-badge` }, v.type?.charAt(0)?.toUpperCase() || 'N'));
    item.appendChild(el('span', {}, v.label || v.name));
    list.appendChild(item);
  }

  let selected = [];
  list.addEventListener('click', (e) => {
    const item = e.target.closest('.var-list-item');
    if (!item) return;
    const name = item.dataset.name;
    if (multi) {
      if (selected.includes(name)) {
        selected = selected.filter(n => n !== name);
        item.classList.remove('selected');
      } else {
        selected.push(name);
        item.classList.add('selected');
      }
    } else {
      list.querySelectorAll('.var-list-item').forEach(i => i.classList.remove('selected'));
      selected = [name];
      item.classList.add('selected');
    }
  });

  return { el: list, getSelected: () => [...selected] };
}

function makeSelectedList(label) {
  const wrapper = el('div', { style: { flex: '1' } });
  wrapper.appendChild(el('div', { class: 'form-label' }, label));
  const list = el('div', { class: 'var-list', style: { minHeight: '80px' } });
  wrapper.appendChild(list);

  let items = [];
  function render() {
    list.innerHTML = '';
    for (const name of items) {
      const item = el('div', { class: 'var-list-item selected' }, name);
      item.addEventListener('click', () => {
        items = items.filter(n => n !== name);
        render();
      });
      list.appendChild(item);
    }
  }

  return {
    el: wrapper,
    add(name) { if (!items.includes(name)) { items.push(name); render(); } },
    remove(name) { items = items.filter(n => n !== name); render(); },
    getItems: () => [...items],
    setItems(arr) { items = [...arr]; render(); },
  };
}

// ─── Generic multi-variable dialog ───────────────────────────────────
function openMultiVarDialog(procedureId, variables, paramKey = 'variables') {
  const labels = {
    frequencies: 'Frequencies', descriptives: 'Descriptive Statistics',
    nonparametric_friedman: 'Friedman Test',
  };
  const title = labels[procedureId] || procedureId;
  const content = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } });

  const sourceLabel = el('div', { class: 'form-label' }, 'Available Variables');
  const { el: sourceList, getSelected } = makeVarListbox(variables.filter(v => v.type !== 'string'));
  const selectedList = makeSelectedList('Selected Variable(s)');

  const moveBtn = el('button', { class: 'btn btn-secondary btn-sm' }, '→ Add');
  moveBtn.addEventListener('click', () => {
    for (const name of getSelected()) selectedList.add(name);
  });

  const row = el('div', { class: 'var-selector' });
  const leftCol = el('div', { style: { flex: '1' } }, sourceLabel, sourceList);
  row.appendChild(leftCol);
  row.appendChild(el('div', { class: 'var-selector-buttons' }, moveBtn));
  row.appendChild(selectedList.el);

  content.appendChild(row);
  const errorMsg = el('div', { class: 'text-error text-sm' });
  content.appendChild(errorMsg);

  const { close } = openDialogLocal({
    title,
    content,
    footer: makeFooter(
      () => close(),
      async () => {
        const vars = selectedList.getItems();
        if (!vars.length) { errorMsg.textContent = 'Select at least one variable'; return; }
        await runAnalysis(procedureId, { [paramKey]: vars }, close, errorMsg);
      },
      'OK'
    ),
  });
}

// ─── Correlation ─────────────────────────────────────────────────────
function openCorrelationDialog(variables) {
  const content = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } });

  const { el: sourceList, getSelected } = makeVarListbox(variables.filter(v => v.type !== 'string'));
  const selectedList = makeSelectedList('Variables');
  const moveBtn = el('button', { class: 'btn btn-secondary btn-sm' }, '→ Add');
  moveBtn.addEventListener('click', () => { for (const n of getSelected()) selectedList.add(n); });

  const row = el('div', { class: 'var-selector' });
  row.appendChild(el('div', { style: { flex: '1' } }, el('div', { class: 'form-label' }, 'Available'), sourceList));
  row.appendChild(el('div', { class: 'var-selector-buttons' }, moveBtn));
  row.appendChild(selectedList.el);
  content.appendChild(row);

  // Method selection
  const methodRow = el('div', { style: { display: 'flex', gap: '10px', alignItems: 'center' } });
  methodRow.appendChild(el('span', { class: 'form-label', style: { marginBottom: 0 } }, 'Correlation:'));
  const methodSelect = el('select', { class: 'form-select', style: { width: '160px' } },
    el('option', { value: 'pearson' }, 'Pearson'),
    el('option', { value: 'spearman' }, 'Spearman'),
    el('option', { value: 'kendall' }, "Kendall's tau-b"),
  );
  methodRow.appendChild(methodSelect);
  content.appendChild(methodRow);

  const errorMsg = el('div', { class: 'text-error text-sm' });
  content.appendChild(errorMsg);

  const { close } = openDialogLocal({
    title: 'Bivariate Correlations',
    content,
    footer: makeFooter(() => close(), async () => {
      const vars = selectedList.getItems();
      if (vars.length < 2) { errorMsg.textContent = 'Select at least 2 variables'; return; }
      await runAnalysis('correlation', { variables: vars, method: methodSelect.value }, close, errorMsg);
    }),
  });
}

// ─── Crosstabs ────────────────────────────────────────────────────────
function openCrosstabsDialog(variables) {
  const content = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } });

  const { el: sourceList, getSelected } = makeVarListbox(variables);
  const rowSel = makeSelectedList('Row(s)');
  const colSel = makeSelectedList('Column(s)');

  const moveRowBtn = el('button', { class: 'btn btn-secondary btn-xs' }, '→ Row');
  const moveColBtn = el('button', { class: 'btn btn-secondary btn-xs' }, '→ Column');
  moveRowBtn.addEventListener('click', () => { const s = getSelected(); if (s[0]) rowSel.setItems([s[0]]); });
  moveColBtn.addEventListener('click', () => { const s = getSelected(); if (s[0]) colSel.setItems([s[0]]); });

  content.appendChild(el('div', { style: { display: 'flex', gap: '8px' } },
    el('div', { style: { flex: '1' } }, el('div', { class: 'form-label' }, 'Variables'), sourceList),
    el('div', { class: 'var-selector-buttons' }, moveRowBtn, moveColBtn),
    el('div', { style: { flex: '1', display: 'flex', flexDirection: 'column', gap: '8px' } },
      rowSel.el, colSel.el)
  ));

  const errorMsg = el('div', { class: 'text-error text-sm' });
  content.appendChild(errorMsg);

  const { close } = openDialogLocal({
    title: 'Crosstabs',
    content,
    footer: makeFooter(() => close(), async () => {
      const rows = rowSel.getItems();
      const cols = colSel.getItems();
      if (!rows[0] || !cols[0]) { errorMsg.textContent = 'Select a row and a column variable'; return; }
      await runAnalysis('crosstabs', { row_variable: rows[0], column_variable: cols[0] }, close, errorMsg);
    }),
  });
}

// ─── One-Sample T-Test ────────────────────────────────────────────────
function openOneSampleTTestDialog(variables) {
  const content = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } });
  const { el: sourceList, getSelected } = makeVarListbox(variables.filter(v => v.type !== 'string'), false);
  const selectedList = makeSelectedList('Test Variable(s)');
  const moveBtn = el('button', { class: 'btn btn-secondary btn-xs' }, '→ Add');
  moveBtn.addEventListener('click', () => { for (const n of getSelected()) selectedList.add(n); });

  content.appendChild(el('div', { style: { display: 'flex', gap: '8px' } },
    el('div', { style: { flex: '1' } }, el('div', { class: 'form-label' }, 'Variables'), sourceList),
    el('div', { class: 'var-selector-buttons' }, moveBtn),
    selectedList.el
  ));

  const testValInput = el('input', { class: 'form-input', type: 'number', value: '0', style: { width: '100px' } });
  content.appendChild(el('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
    el('label', { class: 'form-label', style: { marginBottom: 0 } }, 'Test Value:'), testValInput));

  const errorMsg = el('div', { class: 'text-error text-sm' });
  content.appendChild(errorMsg);

  const { close } = openDialogLocal({
    title: 'One-Sample T-Test',
    content,
    footer: makeFooter(() => close(), async () => {
      const vars = selectedList.getItems();
      if (!vars[0]) { errorMsg.textContent = 'Select a variable'; return; }
      await runAnalysis('ttest_onesample', {
        type: 'onesample', variable: vars[0], test_value: parseFloat(testValInput.value) || 0
      }, close, errorMsg);
    }),
  });
}

// ─── Independent T-Test ───────────────────────────────────────────────
function openIndependentTTestDialog(variables) {
  const content = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } });

  const { el: sourceList, getSelected } = makeVarListbox(variables.filter(v => v.type !== 'string'), false);

  const testVarSel = makeSelectedList('Test Variable');
  const groupVarSel = makeSelectedList('Grouping Variable');
  const moveTestBtn = el('button', { class: 'btn btn-secondary btn-xs' }, '→ Test Var');
  const moveGroupBtn = el('button', { class: 'btn btn-secondary btn-xs' }, '→ Group Var');

  moveTestBtn.addEventListener('click', () => { const s = getSelected(); if (s[0]) testVarSel.setItems([s[0]]); });
  moveGroupBtn.addEventListener('click', () => { const s = getSelected(); if (s[0]) groupVarSel.setItems([s[0]]); });

  content.appendChild(el('div', { style: { display: 'flex', gap: '8px' } },
    el('div', { style: { flex: '1' } }, el('div', { class: 'form-label' }, 'Variables'), sourceList),
    el('div', { class: 'var-selector-buttons' }, moveTestBtn, moveGroupBtn),
    el('div', { style: { flex: '1', display: 'flex', flexDirection: 'column', gap: '8px' } },
      testVarSel.el, groupVarSel.el)
  ));

  const errorMsg = el('div', { class: 'text-error text-sm' });
  content.appendChild(errorMsg);

  const { close } = openDialogLocal({
    title: 'Independent Samples T-Test',
    content,
    footer: makeFooter(() => close(), async () => {
      const testVars = testVarSel.getItems();
      const groupVars = groupVarSel.getItems();
      if (!testVars[0] || !groupVars[0]) { errorMsg.textContent = 'Select test and grouping variables'; return; }
      await runAnalysis('ttest_independent', {
        type: 'independent', variable: testVars[0], grouping_variable: groupVars[0]
      }, close, errorMsg);
    }),
  });
}

// ─── Paired T-Test ────────────────────────────────────────────────────
function openPairedTTestDialog(variables) {
  const content = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } });
  const numericVars = variables.filter(v => v.type !== 'string');

  const makeVarSelect = (label) => {
    const sel = el('select', { class: 'form-select' },
      el('option', { value: '' }, '— Select variable —'),
      ...numericVars.map(v => el('option', { value: v.name }, v.label || v.name))
    );
    return { el: el('div', {}, el('label', { class: 'form-label' }, label), sel), select: sel };
  };

  const v1 = makeVarSelect('Variable 1');
  const v2 = makeVarSelect('Variable 2');
  content.appendChild(v1.el);
  content.appendChild(v2.el);

  const errorMsg = el('div', { class: 'text-error text-sm' });
  content.appendChild(errorMsg);

  const { close } = openDialogLocal({
    title: 'Paired Samples T-Test',
    content,
    footer: makeFooter(() => close(), async () => {
      if (!v1.select.value || !v2.select.value) { errorMsg.textContent = 'Select both variables'; return; }
      if (v1.select.value === v2.select.value) { errorMsg.textContent = 'Variables must be different'; return; }
      await runAnalysis('ttest_paired', {
        type: 'paired', variable1: v1.select.value, variable2: v2.select.value
      }, close, errorMsg);
    }),
  });
}

// ─── One-Way ANOVA ────────────────────────────────────────────────────
function openAnovaDialog(variables) {
  const content = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } });
  const numVars = variables.filter(v => v.type !== 'string');

  const depSelect = el('select', { class: 'form-select' },
    el('option', { value: '' }, '— Select dependent variable —'),
    ...numVars.map(v => el('option', { value: v.name }, v.label || v.name))
  );
  const factorSelect = el('select', { class: 'form-select' },
    el('option', { value: '' }, '— Select factor variable —'),
    ...variables.map(v => el('option', { value: v.name }, v.label || v.name))
  );

  content.appendChild(el('div', {}, el('label', { class: 'form-label' }, 'Dependent Variable'), depSelect));
  content.appendChild(el('div', {}, el('label', { class: 'form-label' }, 'Factor'), factorSelect));

  // Post hoc options
  const postHocLabel = el('label', { class: 'form-label' }, 'Post Hoc Tests');
  const phRow = el('div', { style: { display: 'flex', gap: '12px' } });
  const phOptions = ['tukey', 'bonferroni', 'scheffe'];
  const phCheckboxes = {};
  for (const ph of phOptions) {
    const cb = el('input', { type: 'checkbox', value: ph });
    phCheckboxes[ph] = cb;
    phRow.appendChild(el('label', { style: { display: 'flex', gap: '4px', alignItems: 'center', fontSize: '12px' } },
      cb, ph.charAt(0).toUpperCase() + ph.slice(1)));
  }
  content.appendChild(el('div', {}, postHocLabel, phRow));

  const errorMsg = el('div', { class: 'text-error text-sm' });
  content.appendChild(errorMsg);

  const { close } = openDialogLocal({
    title: 'One-Way ANOVA',
    content,
    footer: makeFooter(() => close(), async () => {
      if (!depSelect.value || !factorSelect.value) { errorMsg.textContent = 'Select both variables'; return; }
      const postHoc = phOptions.filter(ph => phCheckboxes[ph].checked);
      await runAnalysis('anova_oneway', {
        dependent: depSelect.value, factor: factorSelect.value, post_hoc: postHoc
      }, close, errorMsg);
    }),
  });
}

// ─── Linear Regression ────────────────────────────────────────────────
function openRegressionDialog(variables) {
  const content = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } });
  const numVars = variables.filter(v => v.type !== 'string');

  const depSelect = el('select', { class: 'form-select' },
    el('option', { value: '' }, '— Select dependent variable —'),
    ...numVars.map(v => el('option', { value: v.name }, v.label || v.name))
  );
  content.appendChild(el('div', {}, el('label', { class: 'form-label' }, 'Dependent Variable'), depSelect));

  const { el: sourceList, getSelected } = makeVarListbox(numVars);
  const indepList = makeSelectedList('Independent Variable(s)');
  const moveBtn = el('button', { class: 'btn btn-secondary btn-xs' }, '→ Add');
  moveBtn.addEventListener('click', () => { for (const n of getSelected()) indepList.add(n); });

  content.appendChild(el('div', { style: { display: 'flex', gap: '8px' } },
    el('div', { style: { flex: '1' } }, el('div', { class: 'form-label' }, 'Available'), sourceList),
    el('div', { class: 'var-selector-buttons' }, moveBtn),
    indepList.el
  ));

  const errorMsg = el('div', { class: 'text-error text-sm' });
  content.appendChild(errorMsg);

  const { close } = openDialogLocal({
    title: 'Linear Regression',
    content,
    width: '600px',
    footer: makeFooter(() => close(), async () => {
      if (!depSelect.value) { errorMsg.textContent = 'Select dependent variable'; return; }
      const indep = indepList.getItems();
      if (!indep.length) { errorMsg.textContent = 'Select at least one independent variable'; return; }
      await runAnalysis('linear_regression', { dependent: depSelect.value, independent: indep }, close, errorMsg);
    }),
  });
}

// ─── Logistic Regression ──────────────────────────────────────────────
function openLogisticDialog(variables) {
  const content = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } });
  const numVars = variables.filter(v => v.type !== 'string');

  const depSelect = el('select', { class: 'form-select' },
    el('option', { value: '' }, '— Select dependent (binary) variable —'),
    ...numVars.map(v => el('option', { value: v.name }, v.label || v.name))
  );
  content.appendChild(el('div', {}, el('label', { class: 'form-label' }, 'Dependent Variable (binary)'), depSelect));

  const { el: sourceList, getSelected } = makeVarListbox(numVars);
  const indepList = makeSelectedList('Covariates');
  const moveBtn = el('button', { class: 'btn btn-secondary btn-xs' }, '→ Add');
  moveBtn.addEventListener('click', () => { for (const n of getSelected()) indepList.add(n); });

  content.appendChild(el('div', { style: { display: 'flex', gap: '8px' } },
    el('div', { style: { flex: '1' } }, el('div', { class: 'form-label' }, 'Available'), sourceList),
    el('div', { class: 'var-selector-buttons' }, moveBtn),
    indepList.el
  ));

  const errorMsg = el('div', { class: 'text-error text-sm' });
  content.appendChild(errorMsg);

  const { close } = openDialogLocal({
    title: 'Binary Logistic Regression',
    content,
    width: '600px',
    footer: makeFooter(() => close(), async () => {
      if (!depSelect.value) { errorMsg.textContent = 'Select dependent variable'; return; }
      const indep = indepList.getItems();
      if (!indep.length) { errorMsg.textContent = 'Select at least one covariate'; return; }
      await runAnalysis('logistic_regression', { dependent: depSelect.value, independent: indep }, close, errorMsg);
    }),
  });
}

// ─── Reliability ──────────────────────────────────────────────────────
function openReliabilityDialog(variables) {
  const content = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } });
  const numVars = variables.filter(v => v.type !== 'string');

  const { el: sourceList, getSelected } = makeVarListbox(numVars);
  const itemList = makeSelectedList('Items');
  const moveBtn = el('button', { class: 'btn btn-secondary btn-xs' }, '→ Add');
  moveBtn.addEventListener('click', () => { for (const n of getSelected()) itemList.add(n); });

  content.appendChild(el('div', { style: { display: 'flex', gap: '8px' } },
    el('div', { style: { flex: '1' } }, el('div', { class: 'form-label' }, 'Available'), sourceList),
    el('div', { class: 'var-selector-buttons' }, moveBtn),
    itemList.el
  ));

  const errorMsg = el('div', { class: 'text-error text-sm' });
  content.appendChild(errorMsg);

  const { close } = openDialogLocal({
    title: 'Reliability Analysis',
    content,
    footer: makeFooter(() => close(), async () => {
      const items = itemList.getItems();
      if (items.length < 2) { errorMsg.textContent = 'Select at least 2 items'; return; }
      await runAnalysis('reliability', { items }, close, errorMsg);
    }),
  });
}

// ─── Factor Analysis ──────────────────────────────────────────────────
function openFactorDialog(variables) {
  const content = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } });
  const numVars = variables.filter(v => v.type !== 'string');

  const { el: sourceList, getSelected } = makeVarListbox(numVars);
  const varList = makeSelectedList('Variables');
  const moveBtn = el('button', { class: 'btn btn-secondary btn-xs' }, '→ Add');
  moveBtn.addEventListener('click', () => { for (const n of getSelected()) varList.add(n); });

  content.appendChild(el('div', { style: { display: 'flex', gap: '8px' } },
    el('div', { style: { flex: '1' } }, el('div', { class: 'form-label' }, 'Available'), sourceList),
    el('div', { class: 'var-selector-buttons' }, moveBtn),
    varList.el
  ));

  const rotationSelect = el('select', { class: 'form-select', style: { width: '150px' } },
    el('option', { value: 'varimax' }, 'Varimax'),
    el('option', { value: 'none' }, 'No Rotation'),
  );
  content.appendChild(el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
    el('label', { class: 'form-label', style: { marginBottom: 0 } }, 'Rotation:'), rotationSelect));

  const nFactorsInput = el('input', { class: 'form-input', type: 'number', value: '0', min: '0', style: { width: '80px' } });
  content.appendChild(el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
    el('label', { class: 'form-label', style: { marginBottom: 0 } }, 'N Factors (0=auto):'), nFactorsInput));

  const errorMsg = el('div', { class: 'text-error text-sm' });
  content.appendChild(errorMsg);

  const { close } = openDialogLocal({
    title: 'Factor Analysis',
    content,
    footer: makeFooter(() => close(), async () => {
      const vars = varList.getItems();
      if (vars.length < 3) { errorMsg.textContent = 'Select at least 3 variables'; return; }
      await runAnalysis('factor_analysis', {
        variables: vars,
        rotation: rotationSelect.value,
        n_factors: parseInt(nFactorsInput.value) || 0,
      }, close, errorMsg);
    }),
  });
}

// ─── Nonparametric ────────────────────────────────────────────────────
function openTwoGroupNPDialog(procedureId, variables) {
  const labels = {
    nonparametric_mannwhitney: 'Mann-Whitney U',
    nonparametric_kruskalwallis: 'Kruskal-Wallis',
  };
  const content = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } });
  const numVars = variables.filter(v => v.type !== 'string');

  const varSelect = el('select', { class: 'form-select' },
    el('option', { value: '' }, '— Select variable —'),
    ...numVars.map(v => el('option', { value: v.name }, v.label || v.name))
  );
  const factorSelect = el('select', { class: 'form-select' },
    el('option', { value: '' }, '— Select grouping variable —'),
    ...variables.map(v => el('option', { value: v.name }, v.label || v.name))
  );
  content.appendChild(el('div', {}, el('label', { class: 'form-label' }, 'Test Variable'), varSelect));
  content.appendChild(el('div', {}, el('label', { class: 'form-label' }, procedureId === 'nonparametric_kruskalwallis' ? 'Factor' : 'Grouping Variable'), factorSelect));

  const errorMsg = el('div', { class: 'text-error text-sm' });
  content.appendChild(errorMsg);

  const testKey = procedureId === 'nonparametric_mannwhitney' ? 'mannwhitney' : 'kruskalwallis';
  const { close } = openDialogLocal({
    title: labels[procedureId],
    content,
    footer: makeFooter(() => close(), async () => {
      if (!varSelect.value || !factorSelect.value) { errorMsg.textContent = 'Select both variables'; return; }
      const paramKey = procedureId === 'nonparametric_kruskalwallis' ? 'factor' : 'grouping_variable';
      await runAnalysis(procedureId, { test: testKey, variable: varSelect.value, [paramKey]: factorSelect.value }, close, errorMsg);
    }),
  });
}

function openPairedNPDialog(procedureId, variables) {
  const content = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } });
  const numVars = variables.filter(v => v.type !== 'string');

  const v1Select = el('select', { class: 'form-select' },
    el('option', { value: '' }, '— Variable 1 —'),
    ...numVars.map(v => el('option', { value: v.name }, v.label || v.name))
  );
  const v2Select = el('select', { class: 'form-select' },
    el('option', { value: '' }, '— Variable 2 —'),
    ...numVars.map(v => el('option', { value: v.name }, v.label || v.name))
  );
  content.appendChild(el('div', {}, el('label', { class: 'form-label' }, 'Variable 1'), v1Select));
  content.appendChild(el('div', {}, el('label', { class: 'form-label' }, 'Variable 2'), v2Select));

  const errorMsg = el('div', { class: 'text-error text-sm' });
  content.appendChild(errorMsg);

  const { close } = openDialogLocal({
    title: 'Wilcoxon Signed-Rank Test',
    content,
    footer: makeFooter(() => close(), async () => {
      if (!v1Select.value || !v2Select.value) { errorMsg.textContent = 'Select both variables'; return; }
      await runAnalysis(procedureId, { test: 'wilcoxon', variable1: v1Select.value, variable2: v2Select.value }, close, errorMsg);
    }),
  });
}

// ─── Run Analysis ─────────────────────────────────────────────────────
async function runAnalysis(procedureId, parameters, closeDialog, errorMsgEl) {
  const ds = state.get('activeDataset');
  const project = state.get('currentProject');
  if (!ds || !project) { errorMsgEl.textContent = 'No active dataset'; return; }

  errorMsgEl.textContent = '';

  // Show loading in button (handled by caller if desired)
  try {
    const record = await Analysis.run(project.id, procedureId, ds.id, parameters);

    // Add to history
    const history = state.get('analysisHistory') || [];
    history.unshift(record);
    state.set('analysisHistory', history);

    // Switch to output module
    state.set('activeModule', 'output');
    state.set('currentOutput', record);

    closeDialog?.();
    showSuccess(`Analysis complete: ${procedureId}`);

    // Dispatch event so main module renders output
    document.dispatchEvent(new CustomEvent('analysis-complete', { detail: record }));
  } catch (e) {
    errorMsgEl.textContent = e.message || 'Analysis failed';
  }
}

// ─── Dialog helpers ───────────────────────────────────────────────────
function openDialogLocal({ title, content, footer, width = '520px', onClose }) {
  const overlay = el('div', {
    class: 'dialog-overlay',
    onClick(e) { if (e.target === overlay) { overlay.remove(); onClose?.(); } }
  });
  const dialog = el('div', { class: 'dialog', style: { width } });
  const header = el('div', { class: 'dialog-header' },
    el('div', { class: 'dialog-title' }, title),
    el('button', { class: 'btn btn-ghost btn-icon', onClick: () => { overlay.remove(); onClose?.(); } }, svgIcon('x'))
  );
  const body = el('div', { class: 'dialog-body' });
  if (content instanceof Node) body.appendChild(content);
  dialog.appendChild(header);
  dialog.appendChild(body);
  if (footer) {
    const footerEl = el('div', { class: 'dialog-footer' });
    if (footer instanceof Node) footerEl.appendChild(footer);
    dialog.appendChild(footerEl);
  }
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  const close = () => { overlay.remove(); onClose?.(); };
  return { overlay, dialog, body, close };
}

function makeFooter(onCancel, onOk, okLabel = 'OK') {
  const f = el('div', { style: { display: 'flex', gap: '8px' } });
  const cancelBtn = el('button', { class: 'btn btn-secondary' }, 'Cancel');
  cancelBtn.addEventListener('click', () => onCancel());
  const okBtn = el('button', { class: 'btn btn-primary' }, okLabel);
  let loading = false;
  okBtn.addEventListener('click', async () => {
    if (loading) return;
    loading = true;
    okBtn.disabled = true;
    okBtn.innerHTML = '<span class="spinner dark"></span> Running…';
    await onOk();
    loading = false;
    okBtn.disabled = false;
    okBtn.textContent = okLabel;
  });
  f.appendChild(cancelBtn);
  f.appendChild(okBtn);
  return f;
}

export { renderAnalyzeMenu, openAnalysisDialog };
