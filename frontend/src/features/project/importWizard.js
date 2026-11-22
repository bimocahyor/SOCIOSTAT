/**
 * Import Wizard — multi-step file import UI
 */

import { el, svgIcon, showError, showSuccess } from '../../app/utils.js';
import { Import } from '../../app/api.js';
import { state } from '../../app/store.js';

export function openImportWizard(projectId, onComplete) {
  const overlay = el('div', { class: 'dialog-overlay' });
  const dialog = el('div', { class: 'dialog', style: { width: '720px' } });

  const header = el('div', { class: 'dialog-header' },
    el('div', { class: 'dialog-title' }, 'Import Data File'),
    el('button', { class: 'btn btn-ghost btn-icon', onClick: () => overlay.remove() }, svgIcon('x'))
  );
  const body = el('div', { class: 'dialog-body' });
  dialog.appendChild(header);
  dialog.appendChild(body);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  let step = 1;
  let preview = null;

  function renderStep() {
    body.innerHTML = '';
    renderStepIndicator(body, step);
    if (step === 1) renderUploadStep(body);
    else if (step === 2) renderPreviewStep(body);
  }

  function renderUploadStep(container) {
    const zone = el('div', { class: 'upload-zone', id: 'upload-zone' },
      svgIcon('upload', 40),
      el('p', {}, 'Drag & drop a CSV or XLSX file here, or click to select'),
      el('p', { style: { fontSize: '11px' } }, 'Max 100MB')
    );

    const fileInput = el('input', {
      type: 'file', accept: '.csv,.xlsx,.xls', style: { display: 'none' }
    });

    zone.addEventListener('click', () => fileInput.click());
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    });

    fileInput.addEventListener('change', () => {
      if (fileInput.files[0]) handleFile(fileInput.files[0]);
    });

    const statusMsg = el('div', { class: 'text-sm', style: { marginTop: '10px', textAlign: 'center' } });

    async function handleFile(file) {
      statusMsg.textContent = 'Uploading…';
      statusMsg.className = 'text-sm text-muted';
      zone.style.opacity = '0.7';
      try {
        preview = await Import.upload(projectId, file);
        step = 2;
        renderStep();
      } catch (e) {
        statusMsg.textContent = `Error: ${e.message}`;
        statusMsg.className = 'text-sm text-error';
        zone.style.opacity = '1';
      }
    }

    container.appendChild(zone);
    container.appendChild(fileInput);
    container.appendChild(statusMsg);
  }

  function renderPreviewStep(container) {
    if (!preview) return;

    // Dataset name input
    const nameRow = el('div', { class: 'form-group' });
    const nameInput = el('input', {
      class: 'form-input', type: 'text',
      value: preview.filename.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_\s]/g, ''),
      placeholder: 'Dataset name'
    });
    nameRow.appendChild(el('label', { class: 'form-label' }, 'Dataset Name'));
    nameRow.appendChild(nameInput);
    container.appendChild(nameRow);

    // Summary
    container.appendChild(el('div', { class: 'text-sm text-muted', style: { marginBottom: '10px' } },
      `File: ${preview.filename} — ${preview.n_rows} rows × ${preview.n_cols} columns`));

    // Column specs table
    const tableWrap = el('div', { style: { overflowX: 'auto', marginBottom: '12px' } });
    const table = el('table', { class: 'pivot-table', style: { width: '100%', fontSize: '11px' } });
    table.appendChild(el('thead', {},
      el('tr', {},
        el('th', {}, 'Include'),
        el('th', {}, 'Column'),
        el('th', {}, 'Variable Name'),
        el('th', {}, 'Label'),
        el('th', {}, 'Type'),
        el('th', {}, 'Measurement'),
        el('th', {}, 'Decimals'),
      )
    ));
    const tbody = el('tbody', {});

    const specs = preview.column_specs.map(s => ({ ...s }));

    for (let i = 0; i < specs.length; i++) {
      const spec = specs[i];
      const tr = el('tr', {});

      const cbInclude = el('input', { type: 'checkbox', checked: spec.include });
      cbInclude.addEventListener('change', () => { spec.include = cbInclude.checked; });
      tr.appendChild(el('td', { style: { textAlign: 'center' } }, cbInclude));

      tr.appendChild(el('td', { class: 'label', style: { fontSize: '10px', color: 'var(--text-muted)' } }, spec.original_name));

      const nameInput2 = el('input', { type: 'text', value: spec.variable_name, style: { width: '100%', border: '1px solid var(--border)', padding: '2px 4px', fontSize: '11px', fontFamily: 'var(--font-mono)' } });
      nameInput2.addEventListener('change', () => { spec.variable_name = nameInput2.value; });
      tr.appendChild(el('td', {}, nameInput2));

      const labelInput = el('input', { type: 'text', value: spec.label, style: { width: '100%', border: '1px solid var(--border)', padding: '2px 4px', fontSize: '11px' } });
      labelInput.addEventListener('change', () => { spec.label = labelInput.value; });
      tr.appendChild(el('td', {}, labelInput));

      const typeSelect = el('select', { style: { fontSize: '11px', border: '1px solid var(--border)', padding: '2px' } },
        ...['numeric', 'string', 'categorical', 'date', 'boolean'].map(
          t => el('option', { value: t, ...(spec.type === t ? { selected: true } : {}) }, t)
        )
      );
      typeSelect.addEventListener('change', () => { spec.type = typeSelect.value; });
      tr.appendChild(el('td', {}, typeSelect));

      const measSelect = el('select', { style: { fontSize: '11px', border: '1px solid var(--border)', padding: '2px' } },
        ...['scale', 'ordinal', 'nominal'].map(
          t => el('option', { value: t, ...(spec.measurement_level === t ? { selected: true } : {}) }, t)
        )
      );
      measSelect.addEventListener('change', () => { spec.measurement_level = measSelect.value; });
      tr.appendChild(el('td', {}, measSelect));

      const decInput = el('input', { type: 'number', value: spec.decimals, min: '0', max: '10', style: { width: '50px', border: '1px solid var(--border)', padding: '2px 4px', fontSize: '11px' } });
      decInput.addEventListener('change', () => { spec.decimals = parseInt(decInput.value) || 0; });
      tr.appendChild(el('td', {}, decInput));

      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    tableWrap.appendChild(table);
    container.appendChild(tableWrap);

    // Preview rows
    container.appendChild(el('div', { class: 'output-subtitle' }, 'Data Preview (first 5 rows)'));
    const previewTable = el('table', { class: 'pivot-table', style: { fontSize: '11px' } });
    const pHead = el('thead', {}, el('tr', {},
      ...preview.column_specs.map(s => el('th', {}, s.original_name))
    ));
    previewTable.appendChild(pHead);
    const pBody = el('tbody', {});
    for (const row of preview.preview_rows.slice(0, 5)) {
      pBody.appendChild(el('tr', {}, ...row.map(cell => el('td', {}, cell != null ? String(cell) : ''))));
    }
    previewTable.appendChild(pBody);
    container.appendChild(previewTable);

    // Footer buttons
    const footer = el('div', { class: 'dialog-footer', style: { marginTop: '12px' } });
    const backBtn = el('button', { class: 'btn btn-secondary' }, '← Back');
    backBtn.addEventListener('click', () => { step = 1; renderStep(); });
    const importBtn = el('button', { class: 'btn btn-primary' }, 'Import Dataset');
    const errorMsg = el('div', { class: 'text-error text-sm' });
    importBtn.addEventListener('click', async () => {
      const datasetName = nameInput.value.trim();
      if (!datasetName) { errorMsg.textContent = 'Dataset name is required'; return; }
      const includedSpecs = specs.filter(s => s.include);
      if (!includedSpecs.length) { errorMsg.textContent = 'Include at least one column'; return; }

      importBtn.disabled = true;
      importBtn.innerHTML = '<span class="spinner dark"></span> Importing…';
      try {
        const ds = await Import.confirm(projectId, {
          file_id: preview.file_id,
          dataset_name: datasetName,
          column_specs: specs,
          has_header: true,
          encoding: 'utf-8',
          decimal_separator: '.',
        });
        overlay.remove();
        onComplete?.(ds);
        showSuccess(`Imported ${ds.n_cases} cases, ${ds.n_variables} variables`);
      } catch (e) {
        errorMsg.textContent = e.message;
        importBtn.disabled = false;
        importBtn.textContent = 'Import Dataset';
      }
    });
    footer.appendChild(backBtn);
    footer.appendChild(errorMsg);
    footer.appendChild(importBtn);
    container.appendChild(footer);
  }

  renderStep();
}

function renderStepIndicator(container, activeStep) {
  const steps = ['Upload File', 'Configure Columns', 'Import'];
  const indicator = el('div', { class: 'wizard-steps' });
  steps.forEach((label, i) => {
    const idx = i + 1;
    const s = el('div', { class: `wizard-step ${idx === activeStep ? 'active' : idx < activeStep ? 'done' : ''}` },
      el('div', { class: 'wizard-step-num' }, idx < activeStep ? '✓' : String(idx)),
      el('span', {}, label)
    );
    if (i < steps.length - 1) s.appendChild(el('span', { style: { marginLeft: '8px', color: 'var(--border)' } }, '→'));
    indicator.appendChild(s);
  });
  container.appendChild(indicator);
}

export { openImportWizard };
