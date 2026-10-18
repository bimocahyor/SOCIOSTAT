const Transform = (() => {
  /* Safe expression evaluator for Compute Variable
     Supports: arithmetic (+,-,*,/,**), Math functions, variable refs,
     conditional IF(cond,a,b), SYSMIS check                          */
  function safeEval(expr, rowVars) {
    // Replace variable references with their values
    let code = expr;
    // Replace IF(cond,a,b) → ternary
    code = code.replace(/\bIF\s*\(([^,]+),([^,]+),([^)]+)\)/gi,
      (_,c,a,b)=>`((${c})?(${a}):(${b}))`);
    // Replace SYSMIS → null check
    code = code.replace(/\bSYSMIS\b/gi, 'null');
    // Replace variable names (longest first to avoid partial match)
    const varNames = Object.keys(rowVars).sort((a,b)=>b.length-a.length);
    for (const vn of varNames) {
      const val = rowVars[vn];
      const safe = (val == null || val === '') ? 'null' : JSON.stringify(val);
      code = code.replace(new RegExp(`\\b${vn}\\b`,'g'), safe);
    }
    // Allow only safe constructs
    const allowed = /^[0-9\s\.\+\-\*\/\(\)\%\|\&\!\<\>\=\?\:\"\'nulltrue false,]+$|Math\.|null/;
    // Use Function constructor in a try/catch — no eval on user data, only numeric expressions
    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function(`"use strict"; return (${code});`);
      return fn();
    } catch(e) {
      return null;
    }
  }

  function computeVariable(dataset, targetVar, expression, label='') {
    const cases = dataset.cases;
    const varNames = dataset.variables.map(v=>v.name);
    const results = cases.map(row => {
      const rowVars = {};
      varNames.forEach(vn => { rowVars[vn] = row[vn] ?? null; });
      try {
        const v = safeEval(expression, rowVars);
        return (v == null || !isFinite(v)) ? null : v;
      } catch { return null; }
    });
    // Add or update variable
    let varDef = dataset.variables.find(v=>v.name===targetVar);
    if (!varDef) {
      varDef = {
        id: uuid(), name: targetVar, label: label||targetVar,
        type:'numeric', width:8, decimals:2, valueLabels:{},
        missingValues:[], measurementLevel:'scale', role:'input',
        visibility:true
      };
      dataset.variables.push(varDef);
    } else if (label) varDef.label = label;
    cases.forEach((row,i)=>{ row[targetVar]=results[i]; });
    return { changed: cases.length, variable: targetVar };
  }

  function recodeVariable(dataset, sourceVar, targetVar, mappings, elseValue='copy') {
    // mappings: [{from: [values...], to: value}, ...]
    // from can also be {lo,hi} range or 'SYSMIS'
    const srcIsTarget = (sourceVar===targetVar);
    if (!srcIsTarget) {
      let varDef = dataset.variables.find(v=>v.name===targetVar);
      if (!varDef) {
        const src = dataset.variables.find(v=>v.name===sourceVar);
        varDef = { ...src, id:uuid(), name:targetVar, label:targetVar, valueLabels:{} };
        dataset.variables.push(varDef);
      }
    }
    let changed=0;
    dataset.cases.forEach(row => {
      const orig = row[sourceVar];
      let matched = false;
      for (const m of mappings) {
        const from = m.from;
        let hit = false;
        if (from === 'SYSMIS' || from === null) {
          hit = (orig == null || orig === '');
        } else if (Array.isArray(from)) {
          hit = from.some(f => {
            if (f !== null && typeof f==='object' && 'lo' in f) {
              const lo = f.lo=='LOWEST' ? -Infinity : Number(f.lo);
              const hi = f.hi=='HIGHEST' ? Infinity : Number(f.hi);
              return Number(orig)>=lo && Number(orig)<=hi;
            }
            // eslint-disable-next-line eqeqeq
            return f == orig;
          });
        } else {
          // eslint-disable-next-line eqeqeq
          hit = (from == orig);
        }
        if (hit) {
          row[targetVar] = m.to === 'SYSMIS' ? null : m.to;
          matched = true; changed++; break;
        }
      }
      if (!matched) {
        if (elseValue==='copy') row[targetVar] = srcIsTarget ? orig : orig;
        else if (elseValue==='SYSMIS') row[targetVar] = null;
        else row[targetVar] = elseValue;
      }
    });
    return { changed };
  }

  function sortCases(dataset, sortKeys) {
    // sortKeys: [{variable, direction}]
    dataset.cases.sort((a,b) => {
      for (const { variable, direction } of sortKeys) {
        const av=a[variable], bv=b[variable];
        if (av==null && bv==null) continue;
        if (av==null) return 1;
        if (bv==null) return -1;
        const cmp = typeof av==='number'&&typeof bv==='number'
          ? av-bv : String(av).localeCompare(String(bv));
        if (cmp!==0) return direction==='desc' ? -cmp : cmp;
      }
      return 0;
    });
    return { sorted: dataset.cases.length };
  }

  function selectCases(dataset, filterExpr) {
    // Sets dataset.activeFilter — does not delete cases
    dataset.activeFilter = filterExpr || null;
    return { filter: dataset.activeFilter };
  }

  function weightCases(dataset, weightVar) {
    dataset.weightVariable = weightVar || null;
    return { weight: dataset.weightVariable };
  }

  function splitFile(dataset, splitVars) {
    dataset.splitVariables = splitVars || [];
    return { split: dataset.splitVariables };
  }

  function aggregate(dataset, breakVars, aggSpecs) {
    // aggSpecs: [{sourceVar, targetVar, function: 'mean'|'sum'|'min'|'max'|'count'|'sd'|'median'}]
    const groups = {};
    dataset.cases.forEach(row => {
      const key = breakVars.map(v=>String(row[v]??'')).join('|');
      if (!groups[key]) groups[key] = { _key:key, _rows:[] };
      groups[key]._rows.push(row);
    });
    const newCases = Object.values(groups).map(g => {
      const out = {};
      breakVars.forEach(v=>{ out[v]=g._rows[0][v]; });
      aggSpecs.forEach(({ sourceVar, targetVar, function:fn }) => {
        const vals = g._rows.map(r=>r[sourceVar]).filter(v=>typeof v==='number'&&isFinite(v));
        let val = null;
        if (vals.length) {
          if (fn==='mean') val=Stats.mean(vals);
          else if (fn==='sum') val=vals.reduce((s,v)=>s+v,0);
          else if (fn==='min') val=Math.min(...vals);
          else if (fn==='max') val=Math.max(...vals);
          else if (fn==='count') val=vals.length;
          else if (fn==='sd') val=Stats.std(vals);
          else if (fn==='median') val=Stats.quantile(Stats.sortNum(vals),0.5);
        }
        out[targetVar] = val!=null ? parseFloat(val.toFixed(6)) : null;
      });
      return out;
    });
    return newCases;
  }

  function applyFilter(cases, expr, variables) {
    if (!expr) return cases;
    const varNames = variables.map(v=>v.name);
    return cases.filter(row => {
      const rowVars = {};
      varNames.forEach(vn=>{ rowVars[vn]=row[vn]??null; });
      try {
        // eslint-disable-next-line no-new-func
        const fn = new Function(...varNames, `"use strict"; return !!(${expr});`);
        return fn(...varNames.map(vn=>rowVars[vn]));
      } catch { return true; }
    });
  }

  return { computeVariable, recodeVariable, sortCases, selectCases, weightCases, splitFile, aggregate, applyFilter };
})();

/* ══════════════════════════════════════════════════════════════════
   SECTION 6: IMPORT WIZARD
   ══════════════════════════════════════════════════════════════════ */

const ImportWizard = (() => {
  let _state = {};

  function inferType(values) {
    const nonEmpty = values.filter(v => v != null && v !== '');
    if (!nonEmpty.length) return 'string';

    // Boolean check first
    const boolSet = new Set(['true','false','yes','no','1','0','y','n','t','f']);
    if (nonEmpty.every(v => boolSet.has(String(v).trim().toLowerCase()))) return 'boolean';

    // Date check (ISO YYYY-MM-DD or common date strings)
    const dateRx = /^\d{4}-\d{2}-\d{2}(T.*)?$/;
    if (nonEmpty.every(v => dateRx.test(String(v).trim()))) return 'date';

    // Numeric check — use semantic parser to handle currency/locale formats
    if (typeof DataTypeConverter !== 'undefined') {
      if (nonEmpty.every(v => typeof v === 'number' || DataTypeConverter.parseSemanticNumber(v) !== null)) {
        return 'numeric';
      }
    } else {
      // Fallback: plain numeric only
      if (nonEmpty.every(v => !isNaN(Number(v)) && v !== '')) return 'numeric';
    }

    return 'string';
  }

  function inferLevel(type, uniqueCount, totalCount) {
    // Numeric variables default to scale — do NOT infer ordinal from unique count alone.
    // The user can explicitly change this.
    if (type === 'numeric') return 'scale';
    if (type === 'boolean') return 'nominal';
    if (type === 'date' || type === 'datetime') return 'nominal';
    // String → nominal
    return 'nominal';
  }

  function buildVariables(headers, columns) {
    return headers.map((h, i) => {
      const vals = columns[i] || [];
      const nonEmpty = vals.filter(v => v != null && v !== '');
      const unique = new Set(nonEmpty.map(String)).size;
      const type = inferType(vals);
      const level = inferLevel(type, unique, nonEmpty.length);
      // Detect display format for numeric columns
      let displayFormat = 'general';
      if (type === 'numeric' && typeof DataTypeConverter !== 'undefined' && nonEmpty.length > 0) {
        const { format } = DataTypeConverter.detectColumnFormat(nonEmpty);
        if (format === 'currency_usd') displayFormat = 'currency_usd';
        else if (format === 'currency_idr') displayFormat = 'currency_idr';
        else if (format === 'percent') displayFormat = 'percent';
      }
      return {
        id: uuid(), name: h.replace(/\s+/g,'_').replace(/[^a-zA-Z0-9_]/g,''),
        label: h, type, width: 8, decimals: type === 'numeric' ? 2 : 0,
        valueLabels: {}, missingValues: [], measurementLevel: level,
        role: 'input', visibility: true, displayFormat,
        _inferred: { type, level, unique, n: nonEmpty.length }
      };
    });
  }

  /* ── Native CSV fallback (no PapaParse) ── */
  function parseCSVNative(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const text = e.target.result;
          const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
          if (!lines.length) { resolve({ headers: [], rows: [], columns: [] }); return; }
          // Simple CSV split respecting double-quoted fields
          function splitLine(line) {
            const fields = []; let cur = '', inQ = false;
            for (let i = 0; i < line.length; i++) {
              const c = line[i];
              if (c === '"') { inQ = !inQ; }
              else if (c === ',' && !inQ) { fields.push(cur); cur = ''; }
              else { cur += c; }
            }
            fields.push(cur);
            return fields.map(f => f.trim().replace(/^"|"$/g, ''));
          }
          const headers = splitLine(lines[0]);
          const rows = lines.slice(1).map(line => {
            const vals = splitLine(line);
            const obj = {};
            headers.forEach((h, i) => { obj[h] = vals[i] !== undefined ? vals[i] : null; });
            return obj;
          });
          const columns = headers.map(h => rows.map(r => r[h] ?? null));
          resolve({ headers, rows, columns });
        } catch(err) { reject(err); }
      };
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  function parseCSV(file) {
    if (typeof Papa === 'undefined') {
      console.warn('[SOCIOSTAT] PapaParse not available — using native CSV parser.');
      return parseCSVNative(file);
    }
    return new Promise((resolve,reject) => {
      Papa.parse(file, {
        header:true, skipEmptyLines:true, dynamicTyping:false,
        complete: res => {
          const headers = res.meta.fields || [];
          const rows = res.data;
          const columns = headers.map(h=>rows.map(r=>r[h]??null));
          resolve({ headers, rows, columns });
        },
        error: e => reject(e)
      });
    });
  }

  function parseXLSX(file) {
    if (typeof XLSX === 'undefined') {
      return Promise.reject(new Error('Excel support is currently unavailable (library not loaded). Please import a CSV file instead, or retry the Excel library from Settings → System Status.'));
    }
    return new Promise((resolve,reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const wb = XLSX.read(e.target.result, { type:'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(ws, { defval:null, raw:false });
          const headers = rows.length ? Object.keys(rows[0]) : [];
          const columns = headers.map(h=>rows.map(r=>r[h]??null));
          resolve({ headers, rows, columns });
        } catch(err) { reject(err); }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  async function open(file, onImport) {
    let parsed;
    try {
      if (file.name.endsWith('.csv') || file.type==='text/csv') parsed = await parseCSV(file);
      else parsed = await parseXLSX(file);
    } catch(e) {
      notify(`Import error: ${e.message}`, 'error'); return;
    }
    const { headers, rows, columns } = parsed;
    const variables = buildVariables(headers, columns);
    showWizard({ file, headers, rows, columns, variables }, onImport);
  }

  function showWizard({ file, headers, rows, columns, variables }, onImport) {
    _state = { step:1, file, headers, rows, columns, variables, onImport };
    renderWizard();
  }

  function renderWizard() {
    // Build the new wizard DOM entirely before touching the existing overlay.
    // If construction throws, the existing wizard survives.
    let newOverlay;
    try {
      newOverlay = buildWizardDOM();
    } catch(err) {
      // Construction failed — show error inside existing wizard if possible,
      // otherwise show a notification. Never silently close.
      const existing = $('#import-wizard-overlay');
      if (existing) {
        const errBox = el('div', { class:'warning-box high', style:{ margin:'12px' } },
          el('div', { class:'warning-header' }, 'Unable to display step'),
          el('div', { class:'warning-issue' }, String(err && err.message ? err.message : err))
        );
        const body = existing.querySelector('.wizard-body');
        if (body) { body.innerHTML = ''; body.appendChild(errBox); }
        else existing.querySelector('.dialog-box')?.appendChild(errBox);
      } else {
        notify('Wizard error: ' + (err && err.message ? err.message : String(err)), 'error');
      }
      console.error('[ImportWizard] renderWizard error:', err);
      return;
    }

    // Construction succeeded — swap out the old overlay atomically.
    const existing = $('#import-wizard-overlay');
    if (existing) existing.remove();
    document.body.appendChild(newOverlay);
  }

  function buildWizardDOM() {
    const overlay = el('div', { id:'import-wizard-overlay', class:'dialog-overlay' });
    const box = el('div', { class:'dialog-box wizard-box' });

    // Header
    box.appendChild(el('div', { class:'dialog-header' },
      el('h2', {}, `Import: ${_state.file.name}`),
      el('button', { class:'dialog-close', onclick:()=>overlay.remove() }, '×')
    ));

    // Steps indicator
    const stepsEl = el('div', { class:'wizard-steps' });
    ['Upload','Preview','Variables','Missing','Confirm'].forEach((s,i)=>{
      const cls = _state.step===i+1 ? 'wizard-step active'
                : _state.step>i+1  ? 'wizard-step done'
                : 'wizard-step';
      stepsEl.appendChild(el('div', { class:cls },
        el('span', { class:'step-num' }, String(i+1)),
        el('span', {}, s)
      ));
    });
    box.appendChild(stepsEl);

    // Body — render the current step
    const body = el('div', { class:'wizard-body' });
    switch (_state.step) {
      case 1: renderStep1(body); break;
      case 2: renderStep2(body); break;
      case 3: renderStep3(body); break;
      case 4: renderStep4(body); break;
      case 5: renderStep5(body); break;   // no extra args — uses _state directly
      default: renderStep1(body);
    }
    box.appendChild(body);

    // Footer
    const footer = el('div', { class:'dialog-footer' });
    if (_state.step > 1) {
      footer.appendChild(el('button', { class:'btn btn-secondary', onclick: () => {
        _state.step--;
        renderWizard();
      }}, '← Back'));
    }
    if (_state.step < 5) {
      footer.appendChild(el('button', { class:'btn btn-primary', onclick: () => {
        // Flush any un-blurred input on step 4 before advancing.
        // The missing-codes textarea stores its value via oninput/onchange;
        // read it directly from the DOM to be safe.
        if (_state.step === 4) {
          const inp = body.querySelector('#wizard-missing-input');
          if (inp) _state.missingCodes = inp.value;
        }
        _state.step++;
        renderWizard();
      }}, 'Next →'));
    } else {
      // Step 5 — Import Dataset button
      footer.appendChild(el('button', { class:'btn btn-primary', onclick: () => {
        doImport(overlay);
      }}, 'Import Dataset'));
    }

    box.appendChild(footer);
    overlay.appendChild(box);
    return overlay;
  }

  function renderStep1(body) {
    body.innerHTML='';
    const info = el('div', { class:'wizard-info' },
      el('p',{},`File: ${_state.file.name}`),
      el('p',{},`Size: ${(_state.file.size/1024).toFixed(1)} KB`),
      el('p',{},`Rows detected: ${_state.rows.length}`),
      el('p',{},`Columns detected: ${_state.headers.length}`)
    );
    body.appendChild(info);
  }

  function renderStep2(body) {
    body.innerHTML='';
    const previewRows = _state.rows.slice(0,10);
    const tbl = el('table',{class:'pivot-table preview-table'});
    const thead = el('thead'); const hrow = el('tr');
    _state.headers.forEach(h=>hrow.appendChild(el('th',{},h)));
    thead.appendChild(hrow); tbl.appendChild(thead);
    const tbody = el('tbody');
    previewRows.forEach(row=>{
      const tr=el('tr');
      _state.headers.forEach(h=>tr.appendChild(el('td',{},row[h]??'')));
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    body.appendChild(el('p',{class:'muted'},`Showing first ${previewRows.length} of ${_state.rows.length} rows`));
    body.appendChild(el('div',{class:'table-scroll'},tbl));
  }

  function renderStep3(body) {
    body.innerHTML='';
    body.appendChild(el('p',{class:'muted'},'Review inferred variable types and measurement levels. You can correct them before importing.'));
    const tbl = el('table',{class:'pivot-table'});
    const thead=el('thead',{},el('tr',{},
      ...['Name','Label','Type','Level','Unique','N'].map(h=>el('th',{},h))
    ));
    tbl.appendChild(thead);
    const tbody=el('tbody');
    _state.variables.forEach((v,i)=>{
      const tr=el('tr');
      // Name editable
      const nameInput=el('input',{type:'text',value:v.name,class:'cell-input',
        onchange:e=>{
          // Apply the same sanitisation as buildVariables so that the name
          // stored in metadata always matches what doImport uses as the case key.
          const sanitized = e.target.value.trim()
            .replace(/\s+/g,'_')
            .replace(/[^a-zA-Z0-9_]/g,'')
            || v.name;  // fall back to original if result is empty
          e.target.value = sanitized;
          _state.variables[i].name = sanitized;
        }});
      tr.appendChild(el('td',{},nameInput));
      tr.appendChild(el('td',{},v.label));
      // Type selector
      const typeSelect=el('select',{class:'cell-input',onchange:e=>_state.variables[i].type=e.target.value});
      ['numeric','string','date','boolean'].forEach(t=>{
        const o=el('option',{value:t},t); if(t===v.type)o.selected=true;
        typeSelect.appendChild(o);
      });
      tr.appendChild(el('td',{},typeSelect));
      // Level selector
      const levelSelect=el('select',{class:'cell-input',onchange:e=>_state.variables[i].measurementLevel=e.target.value});
      ['nominal','ordinal','scale'].forEach(l=>{
        const o=el('option',{value:l},l); if(l===v.measurementLevel)o.selected=true;
        levelSelect.appendChild(o);
      });
      tr.appendChild(el('td',{},levelSelect));
      tr.appendChild(el('td',{},String(v._inferred?.unique??'')));
      tr.appendChild(el('td',{},String(v._inferred?.n??'')));
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    body.appendChild(el('div',{class:'table-scroll'},tbl));
  }

  function renderStep4(body) {
    body.innerHTML = '';
    body.appendChild(el('p', { class:'muted' },
      'Specify how missing values are coded in your dataset. Leave blank if there are no special missing-value codes.'));

    const label = el('label', { for:'wizard-missing-input' },
      'Treat these values as system missing (optional):');
    label.style.display = 'block';
    label.style.marginBottom = '6px';

    // Use oninput so the value is captured on every keystroke,
    // not just on blur — prevents losing content when Next is clicked.
    const missingInput = el('input', {
      type: 'text',
      id: 'wizard-missing-input',
      class: 'form-control',
      value: _state.missingCodes || '',
      placeholder: '-99, 999, N/A',
      oninput: e => { _state.missingCodes = e.target.value; }
    });

    const hint = el('p', { class:'muted small' },
      'Comma-separated values. Empty cells are always system missing. ' +
      'Leave blank to import all non-empty values as valid data.');

    body.appendChild(label);
    body.appendChild(missingInput);
    body.appendChild(hint);
  }

  function renderStep5(body) {
    body.innerHTML='';
    body.appendChild(el('h3',{},'Ready to import'));
    body.appendChild(el('p',{},`${_state.rows.length} cases, ${_state.variables.length} variables will be imported.`));
    const summary=el('ul',{});
    _state.variables.slice(0,8).forEach(v=>summary.appendChild(el('li',{},`${v.name} (${v.type}, ${v.measurementLevel})`)));
    if (_state.variables.length>8) summary.appendChild(el('li',{class:'muted'},`...and ${_state.variables.length-8} more`));
    body.appendChild(summary);
  }

  function doImport(overlay) {
    // Flush missing-codes input one last time in case oninput didn't fire
    // (e.g. programmatic value set). Value may be undefined if user never
    // reached step 4, so default to empty string — that is always valid.
    const missingCodes = (_state.missingCodes || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    // Build a header→varIndex map so we look up raw CSV values by original
    // column name, not by reference-equality indexOf.
    // _state.variables[i] was built from _state.headers[i] positionally.
    const cases = _state.rows.map(row => {
      const c = {};
      _state.variables.forEach((v, i) => {
        const header = _state.headers[i];          // original CSV column name
        const raw = (header !== undefined) ? (row[header] ?? null) : null;
        if (raw === null || raw === '') {
          c[v.name] = null;
          return;
        }
        if (missingCodes.length > 0 && missingCodes.includes(String(raw))) {
          c[v.name] = null;
          return;
        }
        if (v.type === 'numeric') {
          // Use semantic parser to handle currency, locale, percentage formats.
          // Fall back to plain Number() for already-numeric values.
          if (typeof raw === 'number') {
            c[v.name] = isFinite(raw) ? raw : null;
          } else if (typeof DataTypeConverter !== 'undefined') {
            const parsed = DataTypeConverter.parseSemanticNumber(raw);
            c[v.name] = parsed !== null ? parsed.value : null;
          } else {
            const n = Number(raw);
            c[v.name] = isNaN(n) ? null : n;
          }
        } else {
          c[v.name] = raw;
        }
      });
      return c;
    });

    // Strip the _inferred helper field — not part of the persisted schema
    const variables = _state.variables.map(v => {
      const w = { ...v };
      delete w._inferred;
      return w;
    });

    const dataset = {
      id: uuid(),
      name: _state.file.name.replace(/\.[^.]+$/, ''),
      description: '',
      variables,
      cases,
      activeFilter: null,
      weightVariable: null,
      splitVariables: [],
      metadata: {
        importedFrom: _state.file.name,
        importedAt: new Date().toISOString(),
        missingCodes
      },
      transformationHistory: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // ── Post-import schema validation ────────────────────────────
    // Verify that every variable name is present as a key in every case row.
    // This catches any edge case where name sanitisation produced a mismatch.
    if (typeof DataIntegrity !== 'undefined') {
      const integrity = DataIntegrity.check(dataset);
      if (!integrity.ok) {
        // Attempt automatic migration before handing off
        const migration = DataIntegrity.migrateSchema(dataset);
        if (migration.migrated) {
          console.warn('[ImportWizard] Schema auto-migrated after import:', migration.changes);
        } else if (integrity.mismatchedVars.length > 0 || integrity.orphanCaseKeys.length > 0) {
          console.error('[ImportWizard] Post-import integrity check FAILED:', integrity);
        }
      }
      dataset.metadata.schemaVersion = 2;
      dataset.metadata.integrityCheckAt = new Date().toISOString();
      dataset.metadata.integrityOk = integrity.ok;
    }

    overlay.remove();
    if (typeof _state.onImport === 'function') _state.onImport(dataset);
  }

  return { open };
})();

/* ══════════════════════════════════════════════════════════════════
   SECTION 7: DATA VIEW
   ══════════════════════════════════════════════════════════════════ */
