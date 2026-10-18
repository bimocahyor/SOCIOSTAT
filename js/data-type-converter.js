const DataTypeConverter = (() => {

  /* ─────────────────────────────────────────────────────────────
     parseSemanticNumber(raw)
     Attempts to extract a JS number from a raw value that may be:
       • plain integer / decimal         "42000"  "42000.50"
       • US thousands                    "57,636"  "57,636.56"
       • EU/ID thousands                 "57.636"  "57.636,56"
       • Currency USD                    "$57.636,56"  "$57,636.56"
       • Currency IDR                    "Rp 57.636.560"  "Rp57.636,56"
       • Percentage                      "72.5%"  "72,5%"
       • Already a number                57636.56
     Returns { value: number, format: 'plain'|'currency_usd'|'currency_idr'|'percent'|'thousands_eu'|'thousands_us', original: raw }
     Returns null when value cannot be safely parsed.
  ───────────────────────────────────────────────────────────────── */
  function parseSemanticNumber(raw) {
    if (raw === null || raw === undefined || raw === '') return null;
    if (typeof raw === 'number') return isFinite(raw) ? { value: raw, format: 'plain', original: raw } : null;
    if (typeof raw === 'boolean') return { value: raw ? 1 : 0, format: 'plain', original: raw };

    let s = String(raw).trim();
    if (s === '') return null;

    let format = 'plain';
    let isNegative = false;

    // Leading minus / parentheses for accounting negatives: (1.234)
    if (s.startsWith('-')) { isNegative = true; s = s.slice(1).trim(); }
    else if (s.startsWith('(') && s.endsWith(')')) { isNegative = true; s = s.slice(1, -1).trim(); }

    // Strip currency prefix
    const usdPfx = /^\$\s*/;
    const idrPfx = /^Rp\.?\s*/i;
    if (usdPfx.test(s)) { s = s.replace(usdPfx, ''); format = 'currency_usd'; }
    else if (idrPfx.test(s)) { s = s.replace(idrPfx, ''); format = 'currency_idr'; }

    // Strip percent suffix
    let isPct = false;
    if (s.endsWith('%')) { s = s.slice(0, -1).trim(); isPct = true; if (format === 'plain') format = 'percent'; }

    // Now s should be a numeric string potentially with separators.
    // Detect EU notation:  digits with . as thousands separator and , as decimal
    //   Pattern: contains comma AND last group after comma is 1 or 2 digits
    //   (not 3, which would be thousands) OR has no comma but has .XXX groups
    // Detect US notation:  digits with , as thousands separator and . as decimal

    let normalised = '';
    const hasComma = s.includes(',');
    const hasDot   = s.includes('.');

    if (hasComma && hasDot) {
      // Both present — determine which is thousands and which is decimal
      const lastCommaIdx = s.lastIndexOf(',');
      const lastDotIdx   = s.lastIndexOf('.');
      if (lastDotIdx > lastCommaIdx) {
        // dot is last → US style: "57,636.56" or "1,234.5"
        normalised = s.replace(/,/g, '');
        if (format === 'plain') format = 'thousands_us';
      } else {
        // comma is last → EU style: "57.636,56" or "1.234,5"
        normalised = s.replace(/\./g, '').replace(',', '.');
        if (format === 'plain') format = 'thousands_eu';
      }
    } else if (hasComma && !hasDot) {
      // Only comma — could be EU decimal ("57,5") or US thousands ("57,636")
      const parts = s.split(',');
      const lastPart = parts[parts.length - 1];
      if (parts.length === 2 && lastPart.length !== 3) {
        // EU decimal: "57,5" or "1234,56"
        normalised = parts[0] + '.' + lastPart;
        if (format === 'plain') format = 'thousands_eu';
      } else {
        // US thousands: "57,636" or "1,234,567"
        normalised = s.replace(/,/g, '');
        if (format === 'plain') format = 'thousands_us';
      }
    } else if (!hasComma && hasDot) {
      // Only dot — could be EU thousands ("57.636") or plain decimal ("57.636" is ambiguous)
      const parts = s.split('.');
      const lastPart = parts[parts.length - 1];
      if (parts.length > 2) {
        // Multiple dots — must be EU thousands: "1.234.567"
        normalised = s.replace(/\./g, '');
        if (format === 'plain') format = 'thousands_eu';
      } else if (parts.length === 2 && lastPart.length === 3 && /^\d+$/.test(parts[0]) && /^\d+$/.test(lastPart) && parts[0].length >= 1) {
        // Ambiguous: "57.636" could be EU thousands 57636 or decimal 57.636
        // For currency/known formats, treat as thousands; otherwise treat as decimal
        if (format === 'currency_usd' || format === 'currency_idr') {
          normalised = s.replace(/\./g, '');
        } else {
          // Default: treat as plain decimal
          normalised = s;
        }
      } else {
        // Plain decimal: "3.14" or "57.5"
        normalised = s;
      }
    } else {
      // No separators
      normalised = s;
    }

    // After normalisation, must be a valid float
    if (!/^-?\d+(\.\d+)?$/.test(normalised)) return null;
    const num = parseFloat(normalised);
    if (!isFinite(num)) return null;

    let value = isNegative ? -num : num;
    if (isPct) value = value / 100;

    return { value, format, original: raw };
  }

  /* ─────────────────────────────────────────────────────────────
     detectColumnFormat(values)
     Examines a column of raw values and returns a summary:
       { numericCount, invalidCount, totalCount, format, canConvert }
  ───────────────────────────────────────────────────────────────── */
  function detectColumnFormat(values) {
    const nonEmpty = values.filter(v => v !== null && v !== undefined && v !== '');
    const totalCount = values.length;
    let numericCount = 0, invalidCount = 0;
    const formatCounts = {};
    nonEmpty.forEach(v => {
      const r = parseSemanticNumber(v);
      if (r !== null) {
        numericCount++;
        formatCounts[r.format] = (formatCounts[r.format] || 0) + 1;
      } else {
        invalidCount++;
      }
    });
    // Dominant format
    const dominantFormat = Object.entries(formatCounts).sort((a,b)=>b[1]-a[1])[0]?.[0] || 'plain';
    return {
      totalCount,
      nonEmptyCount: nonEmpty.length,
      numericCount,
      invalidCount,
      missingCount: totalCount - nonEmpty.length,
      format: dominantFormat,
      canConvert: nonEmpty.length > 0 && invalidCount === 0,
      canConvertPartial: numericCount > 0,
    };
  }

  /* ─────────────────────────────────────────────────────────────
     previewConversion(dataset, varName, targetType)
     Returns a preview object for the confirmation dialog.
  ───────────────────────────────────────────────────────────────── */
  function previewConversion(dataset, varName, targetType) {
    const v = dataset.variables.find(x => x.name === varName);
    if (!v) return { error: 'Variable not found: ' + varName };
    const currentType = v.type;
    if (currentType === targetType) return { noChange: true };

    const rawValues = dataset.cases.map(row => row[varName]);
    const preview = [];
    let validCount = 0, invalidCount = 0;

    if (targetType === 'numeric') {
      rawValues.forEach(raw => {
        if (raw === null || raw === undefined || raw === '') {
          preview.push({ original: raw, converted: null, valid: true, wasMissing: true });
          return;
        }
        const r = parseSemanticNumber(raw);
        if (r !== null) {
          validCount++;
          preview.push({ original: raw, converted: r.value, valid: true, format: r.format });
        } else {
          invalidCount++;
          preview.push({ original: raw, converted: null, valid: false });
        }
      });
      const { format } = detectColumnFormat(rawValues.filter(v=>v!=null&&v!=''));
      return {
        varName, currentType, targetType,
        format, totalCount: rawValues.length, validCount, invalidCount,
        preview: preview.slice(0, 10),
        canConvert: invalidCount === 0,
        canConvertPartial: validCount > 0,
      };
    }

    if (targetType === 'string') {
      rawValues.forEach(raw => {
        if (raw === null || raw === undefined) {
          preview.push({ original: raw, converted: null, valid: true, wasMissing: true });
          return;
        }
        const converted = String(raw);
        validCount++;
        preview.push({ original: raw, converted, valid: true });
      });
      return {
        varName, currentType, targetType,
        totalCount: rawValues.length, validCount, invalidCount: 0,
        preview: preview.slice(0, 10),
        canConvert: true, canConvertPartial: true,
      };
    }

    if (targetType === 'date') {
      const dateFormats = [
        { rx: /^\d{4}-\d{2}-\d{2}$/, label: 'ISO (YYYY-MM-DD)' },
        { rx: /^\d{2}\/\d{2}\/\d{4}$/, label: 'MM/DD/YYYY' },
        { rx: /^\d{2}-\d{2}-\d{4}$/, label: 'DD-MM-YYYY' },
      ];
      rawValues.forEach(raw => {
        if (raw === null || raw === undefined || raw === '') {
          preview.push({ original: raw, converted: null, valid: true, wasMissing: true });
          return;
        }
        const s = String(raw).trim();
        const d = new Date(s);
        if (!isNaN(d.getTime())) {
          validCount++;
          preview.push({ original: raw, converted: d.toISOString().slice(0, 10), valid: true });
        } else {
          invalidCount++;
          preview.push({ original: raw, converted: null, valid: false });
        }
      });
      return {
        varName, currentType, targetType,
        totalCount: rawValues.length, validCount, invalidCount,
        preview: preview.slice(0, 10),
        canConvert: invalidCount === 0, canConvertPartial: validCount > 0,
      };
    }

    if (targetType === 'boolean') {
      const trueVals = new Set(['true','yes','1','y','t']);
      const falseVals = new Set(['false','no','0','n','f']);
      rawValues.forEach(raw => {
        if (raw === null || raw === undefined || raw === '') {
          preview.push({ original: raw, converted: null, valid: true, wasMissing: true });
          return;
        }
        const s = String(raw).trim().toLowerCase();
        if (trueVals.has(s)) { validCount++; preview.push({ original: raw, converted: true, valid: true }); }
        else if (falseVals.has(s)) { validCount++; preview.push({ original: raw, converted: false, valid: true }); }
        else { invalidCount++; preview.push({ original: raw, converted: null, valid: false }); }
      });
      return {
        varName, currentType, targetType,
        totalCount: rawValues.length, validCount, invalidCount,
        preview: preview.slice(0, 10),
        canConvert: invalidCount === 0, canConvertPartial: validCount > 0,
      };
    }

    return { varName, currentType, targetType, noOp: true };
  }

  /* ─────────────────────────────────────────────────────────────
     convertVariable(dataset, varName, targetType, onInvalid)
     Performs the actual in-place conversion.
     onInvalid: 'missing' (default) | 'cancel'
     Returns { converted, skipped, errors }
  ───────────────────────────────────────────────────────────────── */
  function convertVariable(dataset, varName, targetType, onInvalid = 'missing') {
    const vIdx = dataset.variables.findIndex(x => x.name === varName);
    if (vIdx < 0) return { error: 'Variable not found: ' + varName };
    const v = dataset.variables[vIdx];
    const prev = previewConversion(dataset, varName, targetType);

    if (prev.error) return prev;
    if (prev.noChange || prev.noOp) return { converted: 0, skipped: 0, errors: 0 };

    if (onInvalid === 'cancel' && prev.invalidCount > 0) {
      return { error: `Conversion cancelled: ${prev.invalidCount} values could not be converted.` };
    }

    // Snapshot old values for undo support
    const oldValues = dataset.cases.map(row => row[varName]);
    const oldType = v.type;
    const oldLevel = v.measurementLevel;

    let converted = 0, skipped = 0, errors = 0;

    dataset.cases.forEach(row => {
      const raw = row[varName];
      if (raw === null || raw === undefined || raw === '') return; // keep missing

      if (targetType === 'numeric') {
        const r = parseSemanticNumber(raw);
        if (r !== null) { row[varName] = r.value; converted++; }
        else { row[varName] = null; errors++; }
      } else if (targetType === 'string') {
        row[varName] = (raw === null || raw === undefined) ? null : String(raw);
        converted++;
      } else if (targetType === 'date') {
        const d = new Date(String(raw).trim());
        if (!isNaN(d.getTime())) { row[varName] = d.toISOString().slice(0, 10); converted++; }
        else { row[varName] = null; errors++; }
      } else if (targetType === 'boolean') {
        const s = String(raw).trim().toLowerCase();
        const trueVals = new Set(['true','yes','1','y','t']);
        const falseVals = new Set(['false','no','0','n','f']);
        if (trueVals.has(s)) { row[varName] = true; converted++; }
        else if (falseVals.has(s)) { row[varName] = false; converted++; }
        else { row[varName] = null; errors++; }
      } else {
        skipped++;
      }
    });

    // Update metadata
    v.type = targetType;
    if (targetType === 'numeric') {
      v.measurementLevel = v.measurementLevel === 'nominal' ? 'scale' : v.measurementLevel || 'scale';
    } else if (targetType === 'string') {
      v.measurementLevel = v.measurementLevel === 'scale' ? 'nominal' : v.measurementLevel || 'nominal';
    } else if (targetType === 'date' || targetType === 'datetime') {
      v.measurementLevel = 'nominal';
    }

    dataset.updatedAt = new Date().toISOString();

    // Register in History for audit trail (not full undo — just a record)
    if (typeof History !== 'undefined') {
      History.addEntry({
        type: 'typeConversion',
        varName, oldType, newType: targetType, oldLevel,
        newLevel: v.measurementLevel,
        converted, errors,
        timestamp: new Date().toISOString(),
      });
    }

    return {
      converted, skipped, errors,
      // Expose restore function for manual undo if needed
      restore: () => {
        oldValues.forEach((val, i) => { if (i < dataset.cases.length) dataset.cases[i][varName] = val; });
        v.type = oldType;
        v.measurementLevel = oldLevel;
        dataset.updatedAt = new Date().toISOString();
      }
    };
  }

  /* ─────────────────────────────────────────────────────────────
     showConversionDialog(dataset, varName, targetType, onConfirm)
     Renders the preview + confirm dialog.
  ───────────────────────────────────────────────────────────────── */
  function showConversionDialog(dataset, varName, targetType, onConfirm) {
    const prev = previewConversion(dataset, varName, targetType);
    if (prev.noChange) { onConfirm && onConfirm('nochange'); return; }
    if (prev.noOp) { onConfirm && onConfirm('noop'); return; }

    const overlay = el('div', { class: 'dialog-overlay', id: 'type-conv-overlay' });
    const box = el('div', { class: 'dialog-box', style: { maxWidth: '560px' } });

    box.appendChild(el('div', { class: 'dialog-header' },
      el('h3', {}, 'Convert Variable Type'),
      el('button', { class: 'dialog-close', onclick: () => overlay.remove() }, '×')
    ));

    const body = el('div', { class: 'dialog-body' });

    // Summary banner
    const fmtLabel = {
      currency_usd: 'USD currency',
      currency_idr: 'IDR currency',
      percent: 'Percentage (%)',
      thousands_us: 'US number format (1,234.56)',
      thousands_eu: 'European/Indonesian number format (1.234,56)',
      plain: 'Plain number',
    }[prev.format] || prev.format || '';

    body.appendChild(el('div', { class: 'conv-summary' },
      el('div', { class: 'conv-row' }, el('span', { class: 'conv-lbl' }, 'Variable'), el('span', { class: 'conv-val' }, varName)),
      el('div', { class: 'conv-row' }, el('span', { class: 'conv-lbl' }, 'Current type'), el('span', { class: 'conv-val' }, prev.currentType)),
      el('div', { class: 'conv-row' }, el('span', { class: 'conv-lbl' }, 'Target type'), el('span', { class: 'conv-val conv-val-new' }, targetType)),
      fmtLabel ? el('div', { class: 'conv-row' }, el('span', { class: 'conv-lbl' }, 'Detected format'), el('span', { class: 'conv-val' }, fmtLabel)) : null
    ));

    // Stats
    body.appendChild(el('div', { class: 'conv-stats' },
      el('span', { class: 'conv-stat-valid' }, `✓ Valid: ${prev.validCount}`),
      el('span', { style: { margin: '0 8px' } }, '|'),
      el('span', { class: prev.invalidCount > 0 ? 'conv-stat-invalid' : '' }, `✗ Invalid: ${prev.invalidCount}`),
      el('span', { style: { margin: '0 8px' } }, '|'),
      el('span', {}, `Total: ${prev.totalCount}`)
    ));

    // Preview table
    if (prev.preview && prev.preview.length > 0) {
      body.appendChild(el('div', { class: 'conv-preview-title' }, 'Preview (first 10 values):'));
      const tbl = el('table', { class: 'pivot-table conv-preview-tbl' });
      tbl.appendChild(el('thead', {}, el('tr', {},
        el('th', {}, 'Original'), el('th', {}, '→'), el('th', {}, 'Converted'), el('th', {}, 'Status')
      )));
      const tbody = el('tbody');
      prev.preview.forEach(row => {
        if (row.wasMissing) return;
        const statusEl = row.valid
          ? el('td', { style: { color: '#15803d', fontWeight: '700' } }, '✓')
          : el('td', { style: { color: '#dc2626', fontWeight: '700' } }, '✗ invalid');
        tbody.appendChild(el('tr', {},
          el('td', { style: { fontFamily: 'monospace', fontSize: '11px' } }, String(row.original)),
          el('td', { style: { color: '#9ca3af' } }, '→'),
          el('td', { style: { fontFamily: 'monospace', fontSize: '11px', color: row.valid ? '#1f2328' : '#dc2626' } },
            row.valid && row.converted !== null ? String(row.converted) : (row.valid ? '(missing)' : '—')),
          statusEl
        ));
      });
      tbl.appendChild(tbody);
      body.appendChild(tbl);
    }

    // Invalid handling option
    let onInvalidVal = 'missing';
    if (prev.invalidCount > 0) {
      body.appendChild(el('div', { class: 'conv-invalid-section' },
        el('p', { style: { color: '#92400e', marginBottom: '8px' } },
          `⚠ ${prev.invalidCount} value(s) cannot be converted to ${targetType}.`),
        el('div', { class: 'conv-radio-group' },
          ...['missing', 'cancel'].map(opt => {
            const lbl = opt === 'missing' ? 'Set invalid values as system missing (null)' : 'Cancel — do not convert';
            const inp = el('input', { type: 'radio', name: 'conv-invalid', value: opt, checked: opt === 'missing' });
            inp.addEventListener('change', () => { onInvalidVal = opt; });
            return el('label', { class: 'conv-radio-label' }, inp, ' ' + lbl);
          })
        )
      ));
    }

    box.appendChild(body);

    box.appendChild(el('div', { class: 'dialog-footer' },
      el('button', { class: 'btn btn-secondary', onclick: () => overlay.remove() }, 'Cancel'),
      el('button', {
        class: 'btn btn-primary',
        onclick: () => {
          overlay.remove();
          if (onConfirm) onConfirm(onInvalidVal);
        }
      }, 'Convert')
    ));

    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  return { parseSemanticNumber, detectColumnFormat, previewConversion, convertVariable, showConversionDialog };
})();

/* ══════════════════════════════════════════════════════════════════
   SECTION 4C: PROBABILITY & DISTRIBUTION ENGINE
   Reuses Stats.normCdf — does not re-implement normal distribution.
   ══════════════════════════════════════════════════════════════════ */
