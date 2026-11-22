/**
 * Data Editor — Data View (virtual spreadsheet) + Variable View
 */

import { el, svgIcon, showError, showSuccess, showNotification, fmt, debounce, uuid } from '../../app/utils.js';
import { Datasets } from '../../app/api.js';
import { state } from '../../app/store.js';
import { openImportWizard } from '../project/importWizard.js';

const PAGE_SIZE = 200;

export function renderDataEditor(container) {
  container.innerHTML = '';
  const ds = state.get('activeDataset');
  if (!ds) {
    container.appendChild(el('div', { class: 'home-screen' },
      el('div', { class: 'text-muted', style: { textAlign: 'center', paddingTop: '40px' } },
        'No dataset open. Import a file or create a dataset.'
      )
    ));
    return;
  }

  const view = el('div', { class: 'data-view' });
  const toolbar = renderDataToolbar(ds);
  view.appendChild(toolbar);

  const tabBar = el('div', { class: 'workspace-tabs', style: { borderBottom: '1px solid var(--border)', paddingLeft: '8px', height: '32px', background: 'var(--surface)' } });
  const dataTab = el('div', { class: `workspace-tab ${state.get('activeTab') === 'data' ? 'active' : ''}` }, 'Data View');
  const varTab = el('div', { class: `workspace-tab ${state.get('activeTab') === 'variable' ? 'active' : ''}` }, 'Variable View');
  tabBar.appendChild(dataTab);
  tabBar.appendChild(varTab);
  view.appendChild(tabBar);

  const content = el('div', { class: 'workspace-content' });
  view.appendChild(content);
  container.appendChild(view);

  function showTab(tab) {
    state.set('activeTab', tab);
    dataTab.className = `workspace-tab ${tab === 'data' ? 'active' : ''}`;
    varTab.className = `workspace-tab ${tab === 'variable' ? 'active' : ''}`;
    content.innerHTML = '';
    if (tab === 'data') renderDataGrid(content, ds);
    else renderVariableGrid(content, ds);
  }

  dataTab.addEventListener('click', () => showTab('data'));
  varTab.addEventListener('click', () => showTab('variable'));
  showTab(state.get('activeTab') || 'data');
}

// ─── Toolbar ─────────────────────────────────────────────────────────
function renderDataToolbar(ds) {
  const tb = el('div', { class: 'toolbar' });
  const project = state.get('currentProject');

  const addRowBtn = el('button', { class: 'btn btn-secondary btn-sm', title: 'Add Row' },
    svgIcon('plus', 13), 'Add Row');
  addRowBtn.addEventListener('click', async () => {
    try {
      await Datasets.addRows(project.id, ds.id, 1);
      await refreshDataset(project.id, ds.id);
    } catch (e) { showError(e.message); }
  });

  const addVarBtn = el('button', { class: 'btn btn-secondary btn-sm', title: 'Add Variable' },
    svgIcon('plus', 13), 'Add Variable');
  addVarBtn.addEventListener('click', () => openAddVariableDialog(ds));

  const importBtn = el('button', { class: 'btn btn-secondary btn-sm', title: 'Import File' },
    svgIcon('upload', 13), 'Import');
  importBtn.addEventListener('click', () => {
    const project = state.get('currentProject');
    if (!project) { showError('No project open'); return; }
    openImportWizard(project.id, async (newDs) => {
      state.set('activeDataset', newDs);
      state.set('activeDatasetPage', null);
      updateStatusBar(newDs);
      // Re-render data editor
      const workspaceContent = document.querySelector('.workspace-content');
      if (workspaceContent) renderDataEditor(workspaceContent);
    });
  });

  const exportBtn = el('button', { class: 'btn btn-secondary btn-sm', title: 'Export CSV' },
    svgIcon('download', 13), 'Export CSV');
  exportBtn.addEventListener('click', () => {
    const url = Datasets.exportCsvUrl(project.id, ds.id);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${ds.name}.csv`;
    a.setAttribute('Authorization', `Bearer ${localStorage.getItem('sociostat_token')}`);
    a.click();
  });

  tb.appendChild(addRowBtn);
  tb.appendChild(addVarBtn);
  tb.appendChild(el('div', { class: 'toolbar-divider' }));
  tb.appendChild(importBtn);
  tb.appendChild(exportBtn);
  return tb;
}

// ─── Data Grid ───────────────────────────────────────────────────────
async function renderDataGrid(container, ds) {
  container.innerHTML = '';

  const project = state.get('currentProject');
  state.set('dataLoading', true);

  let pageData = state.get('activeDatasetPage');
  if (!pageData) {
    try {
      pageData = await Datasets.getPage(project.id, ds.id, 0, PAGE_SIZE);
      state.set('activeDatasetPage', pageData);
    } catch (e) {
      showError('Failed to load data: ' + e.message);
      state.set('dataLoading', false);
      return;
    }
  }
  state.set('dataLoading', false);

  const variables = pageData.variables;
  const rows = pageData.rows;
  const totalCases = pageData.total_cases;

  const gridWrap = el('div', { class: 'data-grid-container', style: { height: 'calc(100% - 32px)' } });

  // Virtual scrolling approach: render visible rows + buffer
  const EXTRA_ROWS = 20;

  const table = document.createElement('table');
  table.className = 'data-grid';

  // Header
  const thead = document.createElement('thead');
  const hRow = document.createElement('tr');
  const thNum = document.createElement('th');
  thNum.className = 'row-num';
  thNum.textContent = '#';
  hRow.appendChild(thNum);

  for (const v of variables) {
    const th = document.createElement('th');
    th.style.width = (v.column_width || 100) + 'px';
    th.style.maxWidth = (v.column_width || 100) + 'px';
    const inner = el('div', { style: { display: 'flex', alignItems: 'center', gap: '4px' } },
      el('span', {}, v.label || v.name),
      el('span', { class: `meas-badge meas-${v.measurement_level || 'scale'}`, style: { fontSize: '8px' } },
        v.measurement_level?.charAt(0).toUpperCase() || 'S')
    );
    th.appendChild(inner);
    th.addEventListener('click', () => {
      state.set('selectedVariable', v);
    });
    hRow.appendChild(th);
  }

  // Add new column placeholder
  const thNew = document.createElement('th');
  thNew.style.width = '80px';
  thNew.style.color = 'var(--text-muted)';
  thNew.textContent = '+ var';
  thNew.style.cursor = 'pointer';
  thNew.addEventListener('click', () => openAddVariableDialog(ds));
  hRow.appendChild(thNew);
  thead.appendChild(hRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');

  function renderRows(startIdx, data, totalRows) {
    tbody.innerHTML = '';
    for (let i = 0; i < data.length; i++) {
      const rowIdx = startIdx + i;
      const row = data[i] || [];
      const tr = document.createElement('tr');

      const tdNum = document.createElement('td');
      tdNum.className = 'row-num';
      tdNum.textContent = rowIdx + 1;
      tr.appendChild(tdNum);

      for (let j = 0; j < variables.length; j++) {
        const td = document.createElement('td');
        const val = row[j];
        const v = variables[j];

        if (val == null || val === '') {
          td.className = 'missing';
          td.textContent = '.';
        } else {
          // Apply value labels for display
          const vl = (v.value_labels || []).find(lbl => String(lbl.value) === String(val));
          td.textContent = vl ? `${val} (${vl.label})` : String(val);
        }

        makeCellEditable(td, rowIdx, j, variables[j], ds, project.id);
        tr.appendChild(td);
      }

      // Empty cells for new rows at bottom
      if (rowIdx >= totalRows) {
        tr.querySelectorAll('td:not(.row-num)').forEach(td => {
          td.className = 'new-row';
          td.textContent = '';
        });
      }

      tbody.appendChild(tr);
    }

    // Add 5 extra empty rows at bottom
    for (let i = 0; i < 5; i++) {
      const emptyRow = data.length + startIdx + i;
      const tr = document.createElement('tr');
      const tdNum = document.createElement('td');
      tdNum.className = 'row-num new-row';
      tdNum.textContent = emptyRow + 1;
      tr.appendChild(tdNum);
      for (let j = 0; j < variables.length; j++) {
        const td = document.createElement('td');
        td.className = 'new-row';
        makeCellEditable(td, emptyRow, j, variables[j], ds, project.id, true);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
  }

  renderRows(pageData.offset, rows, totalCases);
  table.appendChild(tbody);
  gridWrap.appendChild(table);
  container.appendChild(gridWrap);

  // Pagination bar
  if (totalCases > PAGE_SIZE) {
    const paginationBar = el('div', {
      style: {
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '4px 12px', borderTop: '1px solid var(--border)',
        background: 'var(--surface)', fontSize: '11px', color: 'var(--text-muted)',
        height: '28px', flexShrink: '0'
      }
    });
    let currentOffset = pageData.offset;
    const offsetLabel = el('span', {});
    function updateLabel() {
      offsetLabel.textContent = `Rows ${currentOffset + 1}–${Math.min(currentOffset + PAGE_SIZE, totalCases)} of ${totalCases}`;
    }
    updateLabel();

    const prevBtn = el('button', { class: 'btn btn-ghost btn-xs' }, '← Prev');
    const nextBtn = el('button', { class: 'btn btn-ghost btn-xs' }, 'Next →');

    prevBtn.addEventListener('click', async () => {
      if (currentOffset === 0) return;
      currentOffset = Math.max(0, currentOffset - PAGE_SIZE);
      const page = await Datasets.getPage(project.id, ds.id, currentOffset, PAGE_SIZE);
      state.set('activeDatasetPage', page);
      renderRows(page.offset, page.rows, page.total_cases);
      updateLabel();
    });
    nextBtn.addEventListener('click', async () => {
      if (currentOffset + PAGE_SIZE >= totalCases) return;
      currentOffset += PAGE_SIZE;
      const page = await Datasets.getPage(project.id, ds.id, currentOffset, PAGE_SIZE);
      state.set('activeDatasetPage', page);
      renderRows(page.offset, page.rows, page.total_cases);
      updateLabel();
    });

    paginationBar.appendChild(prevBtn);
    paginationBar.appendChild(offsetLabel);
    paginationBar.appendChild(nextBtn);
    container.appendChild(paginationBar);
  }
}

function makeCellEditable(td, rowIdx, colIdx, variable, ds, projectId, isEmpty = false) {
  td.addEventListener('dblclick', () => {
    if (td.querySelector('input')) return;
    const oldText = td.textContent;
    const input = el('input', {
      type: 'text',
      value: isEmpty ? '' : (td.dataset.rawValue || oldText),
    });
    td.className = 'editing';
    td.innerHTML = '';
    td.appendChild(input);
    input.focus();
    input.select();

    const save = debounce(async () => {
      const newVal = input.value === '' ? null : input.value;
      try {
        await Datasets.updateCells(projectId, ds.id, [{ row: rowIdx, col: colIdx, value: newVal }]);
        await refreshDataset(projectId, ds.id);
      } catch (e) {
        showError('Cell update failed: ' + e.message);
      }
    }, 500);

    input.addEventListener('blur', save);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { input.blur(); }
      if (e.key === 'Escape') { td.className = ''; td.textContent = oldText; }
    });
  });
}

// ─── Variable View ────────────────────────────────────────────────────
function renderVariableGrid(container, ds) {
  const project = state.get('currentProject');
  const variables = (state.get('activeDatasetPage')?.variables) || ds.variables_meta || [];

  const gridWrap = el('div', { style: { height: '100%', overflow: 'auto' } });
  const table = document.createElement('table');
  table.className = 'var-grid';

  const cols = ['Name', 'Label', 'Type', 'Width', 'Dec', 'Value Labels', 'Missing', 'Measurement', 'Role'];
  const thead = el('thead', {});
  const hRow = el('tr', {});
  hRow.appendChild(el('th', {}, '#'));
  for (const c of cols) hRow.appendChild(el('th', {}, c));
  hRow.appendChild(el('th', {})); // actions
  thead.appendChild(hRow);
  table.appendChild(thead);

  const tbody = el('tbody', {});

  for (let i = 0; i < variables.length; i++) {
    const v = variables[i];
    const tr = makeVarRow(i, v, ds, project.id, () => renderVariableGrid(container, ds));
    tbody.appendChild(tr);
  }

  // Add new variable row at bottom
  const addRow = el('tr', {});
  const addTd = el('td', { colspan: '10', style: { textAlign: 'center', padding: '8px', cursor: 'pointer', color: 'var(--text-muted)' } },
    '+ Click to add variable');
  addTd.addEventListener('click', () => openAddVariableDialog(ds));
  addRow.appendChild(addTd);
  tbody.appendChild(addRow);

  table.appendChild(tbody);
  gridWrap.appendChild(table);
  container.appendChild(gridWrap);
}

function makeVarRow(idx, v, ds, projectId, onUpdate) {
  const tr = el('tr', {});

  // Row number
  tr.appendChild(el('td', { style: { textAlign: 'center', color: 'var(--text-muted)', width: '32px' } }, String(idx + 1)));

  // Name (read-only in simple view, editable if clicked)
  const nameTd = el('td', {}, el('span', { style: { fontWeight: '600', fontFamily: 'var(--font-mono)', fontSize: '11px' } }, v.name));
  tr.appendChild(nameTd);

  // Label
  const labelTd = makeEditableTd(v.label || '', async (val) => {
    await Datasets.updateVariable(projectId, ds.id, v.id, { label: val });
    await refreshDataset(projectId, ds.id);
    onUpdate();
  });
  tr.appendChild(labelTd);

  // Type
  const typeSelect = el('select', { class: 'form-select', style: { fontSize: '11px' } },
    ...[['numeric', 'Numeric'], ['string', 'String'], ['date', 'Date'], ['categorical', 'Categorical'], ['boolean', 'Boolean']].map(
      ([val, label]) => el('option', { value: val, ...(v.type === val ? { selected: true } : {}) }, label)
    )
  );
  typeSelect.addEventListener('change', async () => {
    await Datasets.updateVariable(projectId, ds.id, v.id, { type: typeSelect.value });
    await refreshDataset(projectId, ds.id);
  });
  tr.appendChild(el('td', {}, typeSelect));

  // Width
  tr.appendChild(makeEditableTd(String(v.width || 8), async (val) => {
    await Datasets.updateVariable(projectId, ds.id, v.id, { width: parseInt(val) || 8 });
  }));

  // Decimals
  tr.appendChild(makeEditableTd(String(v.decimals ?? 2), async (val) => {
    await Datasets.updateVariable(projectId, ds.id, v.id, { decimals: parseInt(val) ?? 2 });
  }));

  // Value Labels (summary)
  const vlCount = (v.value_labels || []).length;
  const vlTd = el('td', { style: { cursor: 'pointer' } },
    el('span', {
      class: 'text-sm',
      style: { color: vlCount > 0 ? 'var(--accent)' : 'var(--text-muted)' }
    }, vlCount > 0 ? `${vlCount} labels` : 'None'),
    el('span', { style: { marginLeft: '4px', color: 'var(--text-muted)', fontSize: '10px' } }, '✏️')
  );
  vlTd.addEventListener('click', () => openValueLabelsDialog(v, ds, projectId, onUpdate));
  tr.appendChild(vlTd);

  // Missing values
  const mvTd = el('td', { style: { cursor: 'pointer' } },
    el('span', { class: 'text-sm', style: { color: 'var(--text-muted)' } },
      (v.missing_values?.type === 'none' || !v.missing_values) ? 'None' : 'Set')
  );
  mvTd.addEventListener('click', () => openMissingValuesDialog(v, ds, projectId, onUpdate));
  tr.appendChild(mvTd);

  // Measurement level
  const measSelect = el('select', { class: 'form-select', style: { fontSize: '11px' } },
    ...[['scale', 'Scale'], ['ordinal', 'Ordinal'], ['nominal', 'Nominal']].map(
      ([val, label]) => el('option', { value: val, ...(v.measurement_level === val ? { selected: true } : {}) }, label)
    )
  );
  measSelect.addEventListener('change', async () => {
    await Datasets.updateVariable(projectId, ds.id, v.id, { measurement_level: measSelect.value });
    await refreshDataset(projectId, ds.id);
  });
  tr.appendChild(el('td', {}, measSelect));

  // Role
  const roleSelect = el('select', { class: 'form-select', style: { fontSize: '11px' } },
    ...[['input', 'Input'], ['target', 'Target'], ['both', 'Both'], ['none', 'None'],
       ['weight', 'Weight'], ['identifier', 'ID']].map(
      ([val, label]) => el('option', { value: val, ...(v.role === val ? { selected: true } : {}) }, label)
    )
  );
  roleSelect.addEventListener('change', async () => {
    await Datasets.updateVariable(projectId, ds.id, v.id, { role: roleSelect.value });
  });
  tr.appendChild(el('td', {}, roleSelect));

  // Delete button
  const delBtn = el('button', { class: 'btn btn-ghost btn-xs', title: 'Delete variable' }, svgIcon('trash', 12));
  delBtn.addEventListener('click', async () => {
    if (!confirm(`Delete variable '${v.name}'? This will remove all its data.`)) return;
    try {
      await Datasets.deleteVariables(projectId, ds.id, [v.id]);
      await refreshDataset(projectId, ds.id);
      onUpdate();
    } catch (e) { showError(e.message); }
  });
  tr.appendChild(el('td', {}, delBtn));

  return tr;
}

function makeEditableTd(initial, onSave) {
  const td = el('td', {});
  const input = el('input', {
    type: 'text', value: initial,
    style: { width: '100%', border: 'none', background: 'transparent', fontSize: '12px', fontFamily: 'var(--font)' }
  });
  input.addEventListener('change', () => onSave(input.value).catch(e => showError(e.message)));
  td.appendChild(input);
  return td;
}

// ─── Value Labels Dialog ──────────────────────────────────────────────
function openValueLabelsDialog(variable, ds, projectId, onUpdate) {
  const labels = [...(variable.value_labels || [])];
  const container = el('div', {});
  let editing = [...labels];

  function renderList() {
    container.innerHTML = '';
    const list = el('div', { style: { marginBottom: '12px', maxHeight: '240px', overflow: 'auto' } });
    for (let i = 0; i < editing.length; i++) {
      const item = editing[i];
      const row = el('div', { style: { display: 'flex', gap: '6px', marginBottom: '4px', alignItems: 'center' } });
      const valInput = el('input', { class: 'form-input', type: 'text', value: String(item.value), placeholder: 'Value', style: { width: '80px' } });
      const lblInput = el('input', { class: 'form-input', type: 'text', value: item.label, placeholder: 'Label', style: { flex: '1' } });
      const delBtn = el('button', { class: 'btn btn-ghost btn-xs' }, '✕');
      valInput.addEventListener('change', () => { editing[i] = { ...editing[i], value: valInput.value }; });
      lblInput.addEventListener('change', () => { editing[i] = { ...editing[i], label: lblInput.value }; });
      delBtn.addEventListener('click', () => { editing.splice(i, 1); renderList(); });
      row.appendChild(valInput);
      row.appendChild(lblInput);
      row.appendChild(delBtn);
      list.appendChild(row);
    }
    const addBtn = el('button', { class: 'btn btn-secondary btn-sm' }, svgIcon('plus', 12), 'Add Label');
    addBtn.addEventListener('click', () => { editing.push({ value: '', label: '' }); renderList(); });
    container.appendChild(list);
    container.appendChild(addBtn);
  }
  renderList();

  const { close } = openDialog({
    title: `Value Labels — ${variable.name}`,
    content: container,
    footer: (() => {
      const f = el('div', { style: { display: 'flex', gap: '8px' } });
      const cancelBtn = el('button', { class: 'btn btn-secondary' }, 'Cancel');
      cancelBtn.addEventListener('click', () => close());
      const saveBtn = el('button', { class: 'btn btn-primary' }, 'Save');
      saveBtn.addEventListener('click', async () => {
        try {
          await Datasets.updateVariable(projectId, ds.id, variable.id, { value_labels: editing });
          await refreshDataset(projectId, ds.id);
          onUpdate();
          close();
          showSuccess('Value labels saved');
        } catch (e) { showError(e.message); }
      });
      f.appendChild(cancelBtn);
      f.appendChild(saveBtn);
      return f;
    })(),
  });
}

// ─── Missing Values Dialog ────────────────────────────────────────────
function openMissingValuesDialog(variable, ds, projectId, onUpdate) {
  const mv = variable.missing_values || { type: 'none', system_missing: true, values: [] };

  const container = el('div', {});
  const typeSelect = el('select', { class: 'form-select', style: { marginBottom: '12px' } },
    ...['none', 'single', 'multiple', 'range'].map(
      t => el('option', { value: t, ...(mv.type === t ? { selected: true } : {}) }, t.charAt(0).toUpperCase() + t.slice(1))
    )
  );

  const valInputs = el('div', {});
  function updateInputs() {
    valInputs.innerHTML = '';
    const t = typeSelect.value;
    if (t === 'single' || t === 'multiple') {
      const n = t === 'single' ? 1 : 3;
      for (let i = 0; i < n; i++) {
        valInputs.appendChild(el('input', {
          class: 'form-input', type: 'text',
          value: mv.values?.[i] != null ? String(mv.values[i]) : '',
          placeholder: `Missing value ${i + 1}`,
          style: { marginBottom: '6px' }
        }));
      }
    } else if (t === 'range') {
      valInputs.appendChild(el('input', { class: 'form-input', type: 'number', value: mv.range_low ?? '', placeholder: 'Range low', style: { marginBottom: '6px' } }));
      valInputs.appendChild(el('input', { class: 'form-input', type: 'number', value: mv.range_high ?? '', placeholder: 'Range high' }));
    }
  }
  typeSelect.addEventListener('change', updateInputs);
  updateInputs();
  container.appendChild(typeSelect);
  container.appendChild(valInputs);

  const { close } = openDialog({
    title: `Missing Values — ${variable.name}`,
    content: container,
    footer: (() => {
      const f = el('div', { style: { display: 'flex', gap: '8px' } });
      const cancelBtn = el('button', { class: 'btn btn-secondary' }, 'Cancel');
      cancelBtn.addEventListener('click', () => close());
      const saveBtn = el('button', { class: 'btn btn-primary' }, 'Save');
      saveBtn.addEventListener('click', async () => {
        const t = typeSelect.value;
        const inputs = [...valInputs.querySelectorAll('input')];
        const spec = { type: t, system_missing: true };
        if (t === 'range') {
          spec.range_low = parseFloat(inputs[0]?.value) || null;
          spec.range_high = parseFloat(inputs[1]?.value) || null;
          spec.values = [];
        } else {
          spec.values = inputs.map(i => i.value).filter(v => v !== '');
        }
        try {
          await Datasets.updateVariable(projectId, ds.id, variable.id, { missing_values: spec });
          await refreshDataset(projectId, ds.id);
          onUpdate();
          close();
          showSuccess('Missing values saved');
        } catch (e) { showError(e.message); }
      });
      f.appendChild(cancelBtn);
      f.appendChild(saveBtn);
      return f;
    })(),
  });
}

// ─── Add Variable Dialog ──────────────────────────────────────────────
function openAddVariableDialog(ds) {
  const project = state.get('currentProject');
  const container = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } });

  const nameInput = el('input', { class: 'form-input', type: 'text', placeholder: 'Variable name (e.g., income)', required: true });
  const labelInput = el('input', { class: 'form-input', type: 'text', placeholder: 'Label (e.g., Monthly Income)' });

  const typeRow = el('div', { style: { display: 'flex', gap: '8px' } });
  const typeSelect = el('select', { class: 'form-select' },
    ...['numeric', 'string', 'categorical', 'date', 'boolean'].map(
      t => el('option', { value: t }, t.charAt(0).toUpperCase() + t.slice(1))
    )
  );
  const measSelect = el('select', { class: 'form-select' },
    ...['scale', 'ordinal', 'nominal'].map(
      t => el('option', { value: t }, t.charAt(0).toUpperCase() + t.slice(1))
    )
  );
  typeRow.appendChild(el('div', {}, el('label', { class: 'form-label' }, 'Type'), typeSelect));
  typeRow.appendChild(el('div', {}, el('label', { class: 'form-label' }, 'Measurement'), measSelect));

  container.appendChild(el('div', {}, el('label', { class: 'form-label' }, 'Variable Name *'), nameInput));
  container.appendChild(el('div', {}, el('label', { class: 'form-label' }, 'Label'), labelInput));
  container.appendChild(typeRow);

  const errorMsg = el('div', { class: 'text-error text-sm' });
  container.appendChild(errorMsg);

  const { close } = openDialog({
    title: 'Add Variable',
    content: container,
    footer: (() => {
      const f = el('div', { style: { display: 'flex', gap: '8px' } });
      const cancelBtn = el('button', { class: 'btn btn-secondary' }, 'Cancel');
      cancelBtn.addEventListener('click', () => close());
      const addBtn = el('button', { class: 'btn btn-primary' }, 'Add Variable');
      addBtn.addEventListener('click', async () => {
        const name = nameInput.value.trim();
        if (!name) { errorMsg.textContent = 'Name is required'; return; }
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
          errorMsg.textContent = 'Name must start with letter/underscore, contain only letters/numbers/underscores';
          return;
        }
        const variable = {
          id: uuid(),
          name,
          label: labelInput.value.trim(),
          type: typeSelect.value,
          measurement_level: measSelect.value,
          width: 8,
          decimals: typeSelect.value === 'numeric' ? 2 : 0,
          value_labels: [],
          missing_values: { type: 'none', system_missing: true, values: [] },
          role: 'input',
          column_width: 100,
          visibility: true,
          description: '',
          format: 'F8.2',
          custom_metadata: {},
        };
        try {
          await Datasets.addVariable(project.id, ds.id, variable);
          await refreshDataset(project.id, ds.id);
          close();
          showSuccess(`Variable '${name}' added`);
        } catch (e) { errorMsg.textContent = e.message; }
      });
      f.appendChild(cancelBtn);
      f.appendChild(addBtn);
      return f;
    })(),
  });
  nameInput.focus();
}

// ─── Helpers ──────────────────────────────────────────────────────────
async function refreshDataset(projectId, dsId) {
  const ds = await Datasets.get(projectId, dsId);
  state.set('activeDataset', ds);
  const page = await Datasets.getPage(projectId, dsId, state.get('dataOffset') || 0, PAGE_SIZE);
  state.set('activeDatasetPage', page);
  updateStatusBar(ds);
}

function updateStatusBar(ds) {
  const event = new CustomEvent('dataset-updated', { detail: ds });
  document.dispatchEvent(event);
}

// Local dialog implementation
function openDialog(opts) {
  return _openDialog(opts);
}

function _openDialog({ title, content, footer, width = '500px', onClose }) {
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
  else body.innerHTML = String(content || '');

  dialog.appendChild(header);
  dialog.appendChild(body);
  if (footer) {
    const footerEl = el('div', { class: 'dialog-footer' });
    if (footer instanceof Node) footerEl.appendChild(footer);
    else footerEl.innerHTML = String(footer);
    dialog.appendChild(footerEl);
  }
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  const close = () => { overlay.remove(); onClose?.(); };
  return { overlay, dialog, body, close };
}

export { renderDataEditor, openAddVariableDialog };
