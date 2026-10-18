const TransformDialogs = (() => {
  function getDataset() { return AppState.get('activeDataset'); }

  function openComputeVariable() {
    const ds = getDataset(); if (!ds) { notify('No dataset loaded', 'error'); return; }
    const targetInp = el('input', { type: 'text', class: 'form-control', placeholder: 'new_variable' });
    const exprInp = el('textarea', { class: 'form-control', rows: '3', placeholder: 'income / 1000000\nIF(age >= 18, 1, 0)\n(v1 + v2 + v3) / 3' });
    const labelInp = el('input', { type: 'text', class: 'form-control', placeholder: 'Variable label (optional)' });

    const varButtons = el('div', { class: 'var-button-list' });
    ds.variables.forEach(v => {
      varButtons.appendChild(el('button', { class: 'btn btn-xs', onclick: () => { exprInp.value += v.name; exprInp.focus(); } }, v.name));
    });

    const body = el('div', { class: 'analysis-form' },
      el('div', { class: 'form-row' }, el('label', {}, 'Target variable:'), targetInp),
      el('div', { class: 'form-row' }, el('label', {}, 'Label:'), labelInp),
      el('label', {}, 'Expression:'), exprInp,
      el('p', { class: 'muted small' }, 'Variables:'),
      varButtons,
      el('p', { class: 'muted small' }, 'Functions: IF(cond,a,b), Math.abs(), Math.sqrt(), Math.log()')
    );

    const ov = el('div', { class: 'dialog-overlay' });
    const box = el('div', { class: 'dialog-box' },
      el('div', { class: 'dialog-header' }, el('h3', {}, 'Compute Variable'), el('button', { class: 'dialog-close', onclick: () => ov.remove() }, '×')),
      el('div', { class: 'dialog-body' }, body),
      el('div', { class: 'dialog-footer' },
        el('button', { class: 'btn btn-primary', onclick: () => {
          const target = targetInp.value.trim();
          const expr = exprInp.value.trim();
          if (!target || !expr) { notify('Target and expression required', 'warning'); return; }
          const r = Transform.computeVariable(ds, target, expr, labelInp.value.trim());
          History.addEntry({ type: 'transform', procedure: 'compute', variable: target, expression: expr, timestamp: new Date().toISOString() });
          Project.markDirty();
          notify(`Computed "${target}" for ${r.changed} cases`, 'success');
          App.updateStatusBar();
          ov.remove();
          if (App.getCurrentModule() === 'data') App.renderDataModule();
        } }, 'OK'),
        el('button', { class: 'btn btn-secondary', onclick: () => ov.remove() }, 'Cancel')
      )
    );
    ov.appendChild(box); document.body.appendChild(ov);
  }

  function openRecode() {
    const ds = getDataset(); if (!ds) { notify('No dataset loaded', 'error'); return; }
    const srcVar = [];
    let targetMode = 'same'; // 'same' or 'new'
    const targetInp = el('input', { type: 'text', class: 'form-control', placeholder: 'new_variable (leave blank to recode in place)' });

    const mappingRows = el('div', { class: 'recode-rows' });
    const mappings = [];

    function addMappingRow(fromVal = '', toVal = '') {
      const idx = mappings.length;
      mappings.push({ from: fromVal, to: toVal });
      const row = el('div', { class: 'recode-row' });
      const fInp = el('input', { type: 'text', class: 'form-control', value: fromVal, placeholder: 'Old value(s), e.g. 1 2 or 1-3' });
      const arrow = el('span', { style: { margin: '0 8px' } }, '→');
      const tInp = el('input', { type: 'text', class: 'form-control', value: toVal, placeholder: 'New value' });
      const rm = el('button', { class: 'btn btn-xs btn-danger', onclick: () => { mappings.splice(idx, 1); row.remove(); } }, '✕');
      fInp.onchange = e => { mappings[idx].from = e.target.value; };
      tInp.onchange = e => { mappings[idx].to = e.target.value; };
      row.append(fInp, arrow, tInp, rm);
      mappingRows.appendChild(row);
    }

    addMappingRow();

    const body = el('div', { class: 'analysis-form' },
      el('label', {}, 'Source variable:'),
      el('div', {}, ...ds.variables.map(v => {
        const b = el('button', { class: `btn btn-xs${srcVar[0] === v.name ? ' selected' : ''}`, onclick: () => { srcVar[0] = v.name; notify(`Selected: ${v.name}`, 'info'); } }, v.name);
        return b;
      })),
      el('div', { class: 'form-row' }, el('label', {}, 'Target variable (blank = recode in place):'), targetInp),
      el('label', {}, 'Value mappings:'),
      mappingRows,
      el('button', { class: 'btn btn-sm', onclick: () => addMappingRow() }, '+ Add mapping')
    );

    const ov = el('div', { class: 'dialog-overlay' });
    const box = el('div', { class: 'dialog-box' },
      el('div', { class: 'dialog-header' }, el('h3', {}, 'Recode Variable'), el('button', { class: 'dialog-close', onclick: () => ov.remove() }, '×')),
      el('div', { class: 'dialog-body' }, body),
      el('div', { class: 'dialog-footer' },
        el('button', { class: 'btn btn-primary', onclick: () => {
          if (!srcVar[0]) { notify('Select source variable', 'warning'); return; }
          const target = targetInp.value.trim() || srcVar[0];
          const parsedMappings = mappings.filter(m => m.from !== '' && m.to !== '').map(m => {
            let from;
            const f = m.from.trim();
            if (f === 'SYSMIS' || f === '') { from = 'SYSMIS'; }
            else if (f.includes('-')) {
              const parts = f.split('-');
              from = [{ lo: parts[0].trim(), hi: parts[1].trim() }];
            } else {
              from = f.split(/\s+/).map(v => isNaN(v) ? v : Number(v));
            }
            const to = m.to.trim() === 'SYSMIS' ? 'SYSMIS' : (isNaN(m.to.trim()) ? m.to.trim() : Number(m.to.trim()));
            return { from, to };
          });
          const r = Transform.recodeVariable(ds, srcVar[0], target, parsedMappings, 'copy');
          History.addEntry({ type: 'transform', procedure: 'recode', source: srcVar[0], target, timestamp: new Date().toISOString() });
          Project.markDirty();
          notify(`Recoded ${r.changed} values in "${target}"`, 'success');
          ov.remove();
          if (App.getCurrentModule() === 'data') App.renderDataModule();
        } }, 'OK'),
        el('button', { class: 'btn btn-secondary', onclick: () => ov.remove() }, 'Cancel')
      )
    );
    ov.appendChild(box); document.body.appendChild(ov);
  }

  function openSelectCases() {
    const ds = getDataset(); if (!ds) { notify('No dataset loaded', 'error'); return; }
    const exprInp = el('textarea', { class: 'form-control', rows: '3', value: ds.activeFilter || '', placeholder: 'age >= 18\ngender == 1\nincome > 5000000' });
    const varBtns = el('div', { class: 'var-button-list' });
    ds.variables.forEach(v => varBtns.appendChild(el('button', { class: 'btn btn-xs', onclick: () => { exprInp.value += v.name; exprInp.focus(); } }, v.name)));

    const ov = el('div', { class: 'dialog-overlay' });
    const box = el('div', { class: 'dialog-box' },
      el('div', { class: 'dialog-header' }, el('h3', {}, 'Select Cases'), el('button', { class: 'dialog-close', onclick: () => ov.remove() }, '×')),
      el('div', { class: 'dialog-body' },
        el('p', { class: 'muted' }, 'Enter a filter condition. Cases not matching will be excluded from analyses.'),
        exprInp, varBtns,
        el('p', { class: 'muted small' }, 'Use == for equality. Leave blank to remove filter.')
      ),
      el('div', { class: 'dialog-footer' },
        el('button', { class: 'btn btn-primary', onclick: () => {
          Transform.selectCases(ds, exprInp.value.trim() || null);
          History.addEntry({ type: 'transform', procedure: 'select_cases', filter: ds.activeFilter, timestamp: new Date().toISOString() });
          Project.markDirty(); App.updateStatusBar(); ov.remove();
          notify(ds.activeFilter ? `Filter active: ${ds.activeFilter}` : 'Filter cleared', 'success');
        } }, 'OK'),
        el('button', { class: 'btn btn-secondary', onclick: () => ov.remove() }, 'Cancel')
      )
    );
    ov.appendChild(box); document.body.appendChild(ov);
  }

  function openWeightCases() {
    const ds = getDataset(); if (!ds) { notify('No dataset loaded', 'error'); return; }
    const numVars = ds.variables.filter(v => v.type === 'numeric');
    const sel = el('select', { class: 'form-control' },
      el('option', { value: '' }, '(None — remove weight)'),
      ...numVars.map(v => { const o = el('option', { value: v.name }, `${v.name} — ${v.label || ''}`); if (v.name === ds.weightVariable) o.selected = true; return o; })
    );
    const ov = el('div', { class: 'dialog-overlay' });
    const box = el('div', { class: 'dialog-box' },
      el('div', { class: 'dialog-header' }, el('h3', {}, 'Weight Cases'), el('button', { class: 'dialog-close', onclick: () => ov.remove() }, '×')),
      el('div', { class: 'dialog-body' },
        el('p', { class: 'muted' }, 'Select a frequency weight variable. Each case will be treated as if it appears the number of times specified.'),
        sel
      ),
      el('div', { class: 'dialog-footer' },
        el('button', { class: 'btn btn-primary', onclick: () => {
          Transform.weightCases(ds, sel.value || null);
          Project.markDirty(); App.updateStatusBar(); ov.remove();
          notify(ds.weightVariable ? `Weight by: ${ds.weightVariable}` : 'Weight removed', 'success');
        } }, 'OK'),
        el('button', { class: 'btn btn-secondary', onclick: () => ov.remove() }, 'Cancel')
      )
    );
    ov.appendChild(box); document.body.appendChild(ov);
  }

  function openSortCases() {
    const ds = getDataset(); if (!ds) { notify('No dataset loaded', 'error'); return; }
    const sortKeys = [];
    const keyList = el('div', { class: 'sort-keys' });
    function addKey(vname = '', dir = 'asc') {
      const idx = sortKeys.length;
      sortKeys.push({ variable: vname, direction: dir });
      const row = el('div', { class: 'sort-key-row' });
      const vsel = el('select', { class: 'form-control', onchange: e => sortKeys[idx].variable = e.target.value },
        el('option', { value: '' }, '-- select --'),
        ...ds.variables.map(v => { const o = el('option', { value: v.name }, v.name); if (v.name === vname) o.selected = true; return o; })
      );
      const dsel = el('select', { class: 'form-control', onchange: e => sortKeys[idx].direction = e.target.value },
        el('option', { value: 'asc', selected: dir === 'asc' }, 'Ascending'),
        el('option', { value: 'desc', selected: dir === 'desc' }, 'Descending')
      );
      const rm = el('button', { class: 'btn btn-xs btn-danger', onclick: () => { sortKeys.splice(idx, 1); row.remove(); } }, '✕');
      row.append(vsel, dsel, rm); keyList.appendChild(row);
    }
    addKey();
    const ov = el('div', { class: 'dialog-overlay' });
    const box = el('div', { class: 'dialog-box' },
      el('div', { class: 'dialog-header' }, el('h3', {}, 'Sort Cases'), el('button', { class: 'dialog-close', onclick: () => ov.remove() }, '×')),
      el('div', { class: 'dialog-body' },
        el('p', { class: 'muted' }, 'Define sort order. First key = primary sort.'),
        keyList,
        el('button', { class: 'btn btn-sm', onclick: () => addKey() }, '+ Add key')
      ),
      el('div', { class: 'dialog-footer' },
        el('button', { class: 'btn btn-primary', onclick: () => {
          const validKeys = sortKeys.filter(k => k.variable);
          if (!validKeys.length) { notify('Select at least one sort variable', 'warning'); return; }
          Transform.sortCases(ds, validKeys);
          History.addEntry({ type: 'transform', procedure: 'sort_cases', keys: validKeys, timestamp: new Date().toISOString() });
          Project.markDirty();
          notify(`Sorted by: ${validKeys.map(k => k.variable + ' ' + k.direction).join(', ')}`, 'success');
          ov.remove();
          if (App.getCurrentModule() === 'data') App.renderDataModule();
        } }, 'OK'),
        el('button', { class: 'btn btn-secondary', onclick: () => ov.remove() }, 'Cancel')
      )
    );
    ov.appendChild(box); document.body.appendChild(ov);
  }

  function openSplitFile() {
    const ds = getDataset(); if (!ds) { notify('No dataset loaded', 'error'); return; }
    const sel = [];
    const body = el('div', { class: 'analysis-form' },
      el('p', { class: 'muted' }, 'Select variables to split the file by. Analyses will be run separately for each group.'),
      el('label', {}, 'Split by:'),
      el('div', { class: 'var-list' },
        ...ds.variables.map(v => {
          const chk = el('input', { type: 'checkbox', checked: ds.splitVariables.includes(v.name),
            onchange: e => { if (e.target.checked) sel.push(v.name); else { const i = sel.indexOf(v.name); if (i >= 0) sel.splice(i, 1); } }
          });
          if (ds.splitVariables.includes(v.name)) sel.push(v.name);
          return el('label', { class: 'var-item' }, chk, ' ', v.name);
        })
      )
    );
    const ov = el('div', { class: 'dialog-overlay' });
    const box = el('div', { class: 'dialog-box' },
      el('div', { class: 'dialog-header' }, el('h3', {}, 'Split File'), el('button', { class: 'dialog-close', onclick: () => ov.remove() }, '×')),
      el('div', { class: 'dialog-body' }, body),
      el('div', { class: 'dialog-footer' },
        el('button', { class: 'btn btn-primary', onclick: () => {
          Transform.splitFile(ds, sel);
          Project.markDirty(); App.updateStatusBar(); ov.remove();
          notify(sel.length ? `Split by: ${sel.join(', ')}` : 'Split removed', 'success');
        } }, 'OK'),
        el('button', { class: 'btn btn-secondary', onclick: () => ov.remove() }, 'Cancel')
      )
    );
    ov.appendChild(box); document.body.appendChild(ov);
  }

  return { openComputeVariable, openRecode, openSelectCases, openWeightCases, openSortCases, openSplitFile };
})();

/* ══════════════════════════════════════════════════════════════════
   SECTION 17: GRAPHS MODULE
   ══════════════════════════════════════════════════════════════════ */
