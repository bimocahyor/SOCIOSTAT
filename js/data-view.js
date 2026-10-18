const DataView = (() => {
  const PAGE = 200;
  const PLACEHOLDER_TOTAL = 70; // minimum visible rows (actual + placeholders)
  let _container=null, _dataset=null, _page=0, _sortKey=null, _sortDir='asc';
  // Stable DOM references — never recreated on selection change
  let _tdMap=null;   // Map: "rowIdx:varIdx" → <td>  (rowIdx for placeholders: 'ph:N')
  let _trMap=null;   // Map: rowIdx → <tr>
  let _visVars=[];   // current visible variables (for this render)
  let _caseSlice=[];  // cases[start..end] references

  // Editor & selection state
  let _editCell=null;  // { td, rowIdx, varName, origVal, isPlaceholder }
  let _selCell=null;   // { rowIdx, varName, varIdx }
  let _undoStack=[], _redoStack=[];
  let _clipboard=null;
  let _scrollEl=null;
  // Placeholder row selection state (separate from _selCell — not actual cases)
  let _selPlaceholder=null, _lastPhTd=null;
  function init(container) {
    _container=container;
    document.addEventListener('paste', _onDocumentPaste, true);
  }

  function _onDocumentPaste(e) {
    if (!_dataset || (!_selCell && !_selPlaceholder)) return;
    if (_editCell) return;
    const tgt = e.target;
    if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) {
      if (!_container || !_container.contains(tgt)) return;
    }
    const text = e.clipboardData?.getData('text/plain');
    if (text == null || text === '') return;
    e.preventDefault();
    _applyPasteText(text);
  }

  /* ── Undo / Redo ─────────────────────────────────────────── */
  function pushUndo(entry) {
    _undoStack.push(entry);
    if (_undoStack.length > 200) _undoStack.shift();
    _redoStack=[];
  }

  function undo() {
    if (!_undoStack.length || !_dataset) return;
    const e=_undoStack.pop();
    _redoStack.push(e);
    if (e.type==='cell') {
      _dataset.cases[e.rowIdx][e.varName]=e.oldVal;
      _dataset.updatedAt=new Date().toISOString();
      Project.markDirty();
      _refreshCell(e.rowIdx, e.varName);
    } else if (e.type==='addRow') {
      _dataset.cases.splice(e.rowIdx,1);
      _dataset.updatedAt=new Date().toISOString();
      Project.markDirty(); render(_dataset);
    } else if (e.type==='addVar') {
      const vi=_dataset.variables.findIndex(v=>v.name===e.varName);
      if (vi>=0) {
        _dataset.variables.splice(vi,1);
        _dataset.cases.forEach(r=>delete r[e.varName]);
        _dataset.updatedAt=new Date().toISOString();
        Project.markDirty(); render(_dataset);
      }
    } else if (e.type==='deleteVar') {
      // Undo: restore the variable and its case values
      _dataset.variables.splice(e.varIdx,0,e.varDef);
      _dataset.cases.forEach((r,ri)=>{ r[e.varName]=e.caseValues[ri]??null; });
      _dataset.updatedAt=new Date().toISOString();
      Project.markDirty(); render(_dataset);
    } else if (e.type==='deleteRow') {
      _dataset.cases.splice(e.rowIdx,0,e.row);
      _dataset.updatedAt=new Date().toISOString();
      Project.markDirty(); render(_dataset);
    } else if (e.type==='pasteBlock') {
      // Restore variables first, then cases
      _dataset.variables.length=0;
      e.before.vars.forEach(v=>_dataset.variables.push({...v}));
      _dataset.cases.length=0;
      e.before.cases.forEach(r=>_dataset.cases.push({...r}));
      _dataset.updatedAt=new Date().toISOString();
      Project.markDirty(); render(_dataset);
    }
  }

  function redo() {
    if (!_redoStack.length || !_dataset) return;
    const e=_redoStack.pop();
    _undoStack.push(e);
    if (e.type==='cell') {
      _dataset.cases[e.rowIdx][e.varName]=e.newVal;
      _dataset.updatedAt=new Date().toISOString();
      Project.markDirty();
      _refreshCell(e.rowIdx, e.varName);
    } else if (e.type==='addRow') {
      _dataset.cases.splice(e.rowIdx,0,e.row);
      _dataset.updatedAt=new Date().toISOString();
      Project.markDirty(); render(_dataset);
    } else if (e.type==='addVar') {
      _dataset.variables.push(e.varDef);
      _dataset.cases.forEach(r=>{ r[e.varName]=null; });
      _dataset.updatedAt=new Date().toISOString();
      Project.markDirty(); render(_dataset);
    } else if (e.type==='deleteVar') {
      // Redo: remove variable again
      const vi=_dataset.variables.findIndex(v=>v.name===e.varName);
      if (vi>=0) {
        _dataset.variables.splice(vi,1);
        _dataset.cases.forEach(r=>delete r[e.varName]);
        _dataset.updatedAt=new Date().toISOString();
        Project.markDirty(); render(_dataset);
      }
    } else if (e.type==='deleteRow') {
      _dataset.cases.splice(e.rowIdx,1);
      _dataset.updatedAt=new Date().toISOString();
      Project.markDirty(); render(_dataset);
    } else if (e.type==='pasteBlock') {
      // Restore to after-paste state
      _dataset.variables.length=0;
      e.after.vars.forEach(v=>_dataset.variables.push({...v}));
      _dataset.cases.length=0;
      e.after.cases.forEach(r=>_dataset.cases.push({...r}));
      _dataset.updatedAt=new Date().toISOString();
      Project.markDirty(); render(_dataset);
    }
  }

  /* ── Clipboard ───────────────────────────────────────────── */
  function copySelected() {
    if (!_selCell||!_dataset) return;
    const val=_dataset.cases[_selCell.rowIdx]?.[_selCell.varName];
    _clipboard={value:val};
    navigator.clipboard?.writeText(val==null?'':String(val)).catch(()=>{});
    notify('Copied','success',1200);
  }

  /* ── Clipboard parsing ───────────────────────────────────── */
  // Parse clipboard text into a 2-D array of strings.
  // Rules:
  //   • Normalise CRLF → LF before splitting.
  //   • Strip exactly one trailing LF produced by spreadsheet apps.
  //   • Split on LF to get rows; split each row on TAB to get cells.
  //   • Do NOT remove interior empty rows — their position must be preserved.
  //   • Empty cells inside a row are kept as '' so column alignment is intact.
  function _parseClipboardText(text) {
    // Normalise Windows line endings
    let t = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    // Strip exactly one terminal newline (spreadsheet apps always add one)
    if (t.endsWith('\n')) t = t.slice(0, -1);
    if (t === '') return [['']];
    return t.split('\n').map(row => row.split('\t'));
  }

  /* ── Atomic paste apply ──────────────────────────────────── */
  function _applyPasteText(text) {
    if (!_dataset) return;
    let startRow, startVarIdx;
    if (_selCell) { startRow=_selCell.rowIdx; startVarIdx=_selCell.varIdx; }
    else if (_selPlaceholder) { startRow=_selPlaceholder.absIdx; startVarIdx=_selPlaceholder.varIdx; }
    else { return; }
    const grid = _parseClipboardText(text);
    if (!grid.length) return;
    const numPasteRows = grid.length;
    const numPasteCols = Math.max(...grid.map(r => r.length));
    const visVars = _dataset.variables.filter(x => x.visibility !== false);
    const endVarIdx = startVarIdx + numPasteCols - 1;
    const snapCases = _dataset.cases.map(r => ({...r}));
    const snapVarCount = _dataset.variables.length;
    const snapVars = _dataset.variables.map(v => ({...v}));
    const neededVars = endVarIdx + 1;
    const addedVarNames = [];
    if (neededVars > visVars.length) {
      const colsToAdd = neededVars - visVars.length;
      for (let c = 0; c < colsToAdd; c++) {
        let n = _dataset.variables.length + 1;
        let name = 'var' + String(n).padStart(3, '0');
        while (_dataset.variables.some(v => v.name === name)) { n++; name = 'var' + String(n).padStart(3, '0'); }
        const varDef = { id: uuid(), name, label: '', type: 'numeric', width: 8, decimals: 2,
          valueLabels: {}, missingValues: [], measurementLevel: 'scale', role: 'input', visibility: true };
        _dataset.variables.push(varDef);
        _dataset.cases.forEach(r => { r[name] = null; });
        addedVarNames.push(name);
      }
    }
    const visVarsNow = _dataset.variables.filter(x => x.visibility !== false);
    const requiredCaseCount = startRow + numPasteRows;
    if (requiredCaseCount > _dataset.cases.length) {
      for (let ri = _dataset.cases.length; ri < requiredCaseCount; ri++) {
        const row = {};
        _dataset.variables.forEach(v => { row[v.name] = null; });
        _dataset.cases.push(row);
      }
    }
    // First pass: infer column types for untouched blank default variables
    // If a default numeric variable has never had a value set and ALL pasted
    // cells in that column are non-numeric, treat the column as string.
    for (let c = 0; c < numPasteCols; c++) {
      const vi = startVarIdx + c;
      if (vi >= visVarsNow.length) break;
      const vDef = visVarsNow[vi];
      if (!vDef || vDef.type !== 'numeric') continue;
      // Only re-type if the variable is currently empty (all cases null)
      const alreadyHasData = _dataset.cases.some(row => row[vDef.name] != null);
      if (alreadyHasData) continue;
      // Check whether every non-empty cell in this paste column is parseable as a number
      let allNumeric = true;
      for (let r = 0; r < numPasteRows; r++) {
        const cellText = (c < grid[r].length) ? grid[r][c] : '';
        if (cellText === '') continue; // empty = missing, ok for numeric
        const parsed = DataTypeConverter.parseSemanticNumber(cellText);
        if (parsed === null) { allNumeric = false; break; }
      }
      if (!allNumeric) vDef.type = 'string';
    }

    let numericWarnings = 0;
    for (let r = 0; r < numPasteRows; r++) {
      const ri = startRow + r;
      const pasteRow = grid[r];
      for (let c = 0; c < numPasteCols; c++) {
        const vi = startVarIdx + c;
        if (vi >= visVarsNow.length) break;
        const vDef = visVarsNow[vi];
        const cellText = (c < pasteRow.length) ? pasteRow[c] : '';
        let val;
        if (vDef && vDef.type === 'numeric') {
          if (cellText === '') {
            val = null;
          } else {
            const parsed = DataTypeConverter.parseSemanticNumber(cellText);
            if (parsed === null) { val = null; numericWarnings++; }
            else { val = parsed.value; }
          }
        } else {
          val = cellText === '' ? null : cellText;
        }
        _dataset.cases[ri][vDef.name] = val;
      }
    }
    const snapCasesAfter = _dataset.cases.map(r => ({...r}));
    const snapVarsAfter  = _dataset.variables.map(v => ({...v}));
    pushUndo({ type: 'pasteBlock',
      before: { cases: snapCases, vars: snapVars, varCount: snapVarCount },
      after:  { cases: snapCasesAfter, vars: snapVarsAfter } });
    _dataset.updatedAt = new Date().toISOString();
    Project.markDirty();
    render(_dataset);
    const newCaseCount = _dataset.cases.length;
    const casesCreated = newCaseCount - snapCases.length;
    let msg = 'Pasted ' + numPasteRows + ' row' + (numPasteRows!==1?'s':'') + ' \u00D7 ' + numPasteCols + ' col' + (numPasteCols!==1?'s':'') + ' \u2014 ' + newCaseCount + ' case' + (newCaseCount!==1?'s':'') + ' total';
    if (casesCreated > 0) msg += ' (' + casesCreated + ' new)';
    if (addedVarNames.length > 0) msg += ', ' + addedVarNames.length + ' variable' + (addedVarNames.length!==1?'s':'') + ' added';
    notify(msg, 'success', 4000);
    if (numericWarnings > 0) notify(numericWarnings + ' non-numeric value' + (numericWarnings!==1?'s were':' was') + ' set to missing in numeric columns', 'warning', 5000);
  }

  function pasteSelected() {
    if (!_selCell && !_selPlaceholder) return;
    if (!_dataset) return;
    if (navigator.clipboard?.readText) {
      navigator.clipboard.readText()
        .then(text => _applyPasteText(text))
        .catch(() => notify('Clipboard access denied. Select a cell and press Ctrl+V to paste.', 'warning', 6000));
    } else {
      notify('Clipboard API unavailable. Select a cell and press Ctrl+V to paste.', 'warning', 6000);
    }
  }

  function addVariableCol(dataset) {
    let n=dataset.variables.length+1;
    let name='var'+String(n).padStart(3,'0');
    while (dataset.variables.some(v=>v.name===name)) { n++; name='var'+String(n).padStart(3,'0'); }
    const varDef={id:uuid(),name,label:'',type:'numeric',width:8,decimals:2,
      valueLabels:{},missingValues:[],measurementLevel:'scale',role:'input',visibility:true};
    dataset.variables.push(varDef);
    dataset.cases.forEach(r=>{ r[name]=null; });
    dataset.updatedAt=new Date().toISOString();
    pushUndo({type:'addVar',varName:name,varDef:{...varDef}});
    Project.markDirty(); render(dataset);
  }

  function deleteSelectedRow(dataset) {
    if (!_selCell) return;
    const ri=_selCell.rowIdx;
    pushUndo({type:'deleteRow',rowIdx:ri,row:{...dataset.cases[ri]}});
    dataset.cases.splice(ri,1);
    dataset.updatedAt=new Date().toISOString();
    _selCell=null;
    Project.markDirty(); render(dataset);
  }

  function createBlankDataset() {
    const name=prompt('Dataset name:','New Dataset');
    if (!name) return;
    const ds={
      id:uuid(),name,description:'',variables:[],cases:[],
      activeFilter:null,weightVariable:null,splitVariables:[],
      metadata:{},transformationHistory:[],
      createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()
    };
    // 20 default variable shells, no actual cases
    for (let i=1;i<=20;i++){
      const vn='var'+String(i).padStart(3,'0');
      ds.variables.push({id:uuid(),name:vn,label:'',type:'numeric',width:8,decimals:2,
        valueLabels:{},missingValues:[],measurementLevel:'scale',role:'input',visibility:true});
    }
    // cases starts empty — placeholder rows handle visual display
    AppState.set('activeDataset',ds);
    Project.markDirty(); render(ds);
  }

  /* ── Delete Variable from Data View ─────────────────────────── */
  function deleteVariableByName(dataset, varName) {
    const vi=dataset.variables.findIndex(v=>v.name===varName);
    if (vi<0) return;
    if (!confirm(`Delete variable "${varName}"?\n\nThis will remove all data in this column.\nThis action can be undone with Ctrl+Z.`)) return;
    const varDef={...dataset.variables[vi]};
    const caseValues=dataset.cases.map(r=>r[varName]??null);
    pushUndo({type:'deleteVar',varIdx:vi,varName,varDef,caseValues});
    dataset.variables.splice(vi,1);
    dataset.cases.forEach(r=>delete r[varName]);
    dataset.updatedAt=new Date().toISOString();
    _selCell=null;
    Project.markDirty(); render(dataset);
    notify(`Variable "${varName}" deleted. Ctrl+Z to undo.`,'success');
    // Keep Variable View in sync
    if (window._sociostatRenderDataModule) window._sociostatRenderDataModule();
  }

  /* ── Cell display helper ─────────────────────────────────── */
  function _cellDisplayVal(v, val) {
    if (val==null) return null; // signals missing
    if (v.valueLabels&&v.valueLabels[val]) return val+' ('+v.valueLabels[val]+')';
    if (v.type==='numeric') {
      const n=Number(val);
      return isNaN(n)?String(val):n.toFixed(v.decimals||2);
    }
    return String(val);
  }

  /* ── Refresh a single cell in-place (no table rebuild) ───── */
  function _refreshCell(rowIdx, varName) {
    if (!_tdMap||!_dataset) return;
    const vi=_visVars.findIndex(v=>v.name===varName);
    if (vi<0) return;
    const pageStart=_page*PAGE;
    const key=(rowIdx-pageStart)+':'+vi;
    const td=_tdMap.get(key);
    if (!td) return;
    const v=_visVars[vi];
    const val=_dataset.cases[rowIdx]?.[varName];
    const disp=_cellDisplayVal(v,val);
    td.innerHTML='';
    if (disp==null) { td.appendChild(el('span',{class:'missing-val'},'.')); }
    else { td.textContent=disp; }
  }

  /* ── Selection: CSS-only, no table rebuild ───────────────── */
  function _applySelection(newSel) {
    // Also clear any placeholder selection
    _clearPlaceholderSel();
    // Clear old
    if (_selCell) {
      const pageStart=_page*PAGE;
      const oldKey=(_selCell.rowIdx-pageStart)+':'+_selCell.varIdx;
      const oldTd=_tdMap?.get(oldKey);
      if (oldTd) { oldTd.classList.remove('cell-selected'); }
      const oldTr=_trMap?.get(_selCell.rowIdx);
      if (oldTr) oldTr.classList.remove('row-selected');
    }
    _selCell=newSel;
    // Apply new
    if (_selCell) {
      const pageStart=_page*PAGE;
      const newKey=(_selCell.rowIdx-pageStart)+':'+_selCell.varIdx;
      const newTd=_tdMap?.get(newKey);
      if (newTd) { newTd.classList.add('cell-selected'); newTd.focus?.(); }
      const newTr=_trMap?.get(_selCell.rowIdx);
      if (newTr) newTr.classList.add('row-selected');
      // Update toolbar copy/paste/del visibility
      _updateToolbar();
    }
  }

  function _updateToolbar() {
    const toolbar=_container?.querySelector('.data-toolbar');
    if (!toolbar||!_dataset) return;
    const hasSel=!!_selCell;
    const hasAnySel=hasSel||!!_selPlaceholder;
    ['btn-copy','btn-delrow'].forEach(cls=>{
      const b=toolbar.querySelector('.'+cls);
      if (b) b.style.display=hasSel?'':'none';
    });
    const pasteB=toolbar.querySelector('.btn-paste');
    if (pasteB) pasteB.style.display=hasAnySel?'':'none';
  }

  /* ── Show column-header context menu ─────────────────────── */
  function _showColContextMenu(v, dataset, th) {
    document.querySelectorAll('.col-ctx-menu').forEach(m=>m.remove());
    const menu=el('div',{class:'col-ctx-menu'});
    menu.appendChild(el('div',{class:'col-ctx-item',onclick:()=>{ menu.remove(); showVarContextPanel(v,dataset,th); }},'ⓘ Variable Info'));
    menu.appendChild(el('div',{class:'col-ctx-item',onclick:()=>{ menu.remove(); if(window.App){App.setDataSubview('variable');App.renderDataModule();}}},'📋 Variable View'));
    menu.appendChild(el('div',{class:'col-ctx-separator'}));
    menu.appendChild(el('div',{class:'col-ctx-item col-ctx-danger',onclick:()=>{ menu.remove(); deleteVariableByName(dataset,v.name); }},'✕ Delete Variable…'));
    document.body.appendChild(menu);
    const rect=th.getBoundingClientRect();
    let left=rect.left+window.scrollX;
    let top=rect.bottom+window.scrollY+2;
    if (left+180>window.innerWidth) left=window.innerWidth-185;
    menu.style.cssText=`position:absolute;left:${left}px;top:${top}px;z-index:9999;`;
    const closeMenu=ev=>{ if(!menu.contains(ev.target)){menu.remove();document.removeEventListener('mousedown',closeMenu);} };
    setTimeout(()=>document.addEventListener('mousedown',closeMenu),10);
  }

  /* ── Full render — builds stable DOM ─────────────────────── */
  function render(dataset) {
    _dataset=dataset;
    if (!_container) return;
    _container.innerHTML='';
    _container.style.cssText='display:flex;flex-direction:column;height:100%;';
    _tdMap=new Map(); _trMap=new Map();

    if (!dataset) {
      _container.appendChild(el('div',{class:'empty-state-full'},
        el('div',{class:'empty-state-icon'},'\u{1F4CB}'),
        el('h3',{},'No Dataset Loaded'),
        el('p',{},'Import a CSV/XLSX file or create a new empty dataset to get started.'),
        el('div',{class:'empty-state-actions'},
          el('button',{class:'btn btn-secondary',onclick:()=>createBlankDataset()},'\u2728 New Empty Dataset')
        )
      ));
      return;
    }

    const total=dataset.cases.length;
    const start=_page*PAGE, end=Math.min(start+PAGE,total);
    _visVars=dataset.variables.filter(v=>v.visibility!==false);

    // How many placeholder rows to add after real cases (on page 0)
    const realRowsOnPage=end-start;
    const placeholderCount=(_page===0) ? Math.max(0, PLACEHOLDER_TOTAL - total) : 0;

    // ── Toolbar ────────────────────────────────────────────
    const toolbar=el('div',{class:'data-toolbar data-toolbar-full'});
    toolbar.appendChild(el('div',{class:'data-toolbar-info'},
      el('span',{class:'muted small'},total+' cases \u00B7 '+dataset.variables.length+' variables')
    ));
    const btnGroup=el('div',{class:'data-toolbar-actions'});
    btnGroup.appendChild(el('button',{class:'btn btn-sm',title:'Undo (Ctrl+Z)',onclick:()=>undo()},'\u21A9 Undo'));
    btnGroup.appendChild(el('button',{class:'btn btn-sm',title:'Redo (Ctrl+Y)',onclick:()=>redo()},'\u21AA Redo'));
    btnGroup.appendChild(el('button',{class:'btn btn-sm btn-primary',onclick:()=>addRow(dataset),title:'Insert new case'},'+ Case'));
    btnGroup.appendChild(el('button',{class:'btn btn-sm btn-secondary',onclick:()=>addVariableCol(dataset),title:'Add variable column'},'+ Variable'));
    // Copy/Paste/Del only shown when selection active
    const hasSel=!!_selCell;
    const hasAnySel=hasSel||!!_selPlaceholder;
    const copyBtn=el('button',{class:'btn btn-sm btn-copy',style:'display:'+(hasSel?'':'none'),title:'Copy (Ctrl+C)',onclick:()=>copySelected()},'Copy');
    const pasteBtn=el('button',{class:'btn btn-sm btn-paste',style:'display:'+(hasAnySel?'':'none'),title:'Paste (Ctrl+V)',onclick:()=>pasteSelected()},'Paste');
    const delBtn=el('button',{class:'btn btn-sm btn-danger btn-delrow',style:'display:'+(hasSel?'':'none'),onclick:()=>deleteSelectedRow(dataset)},'Del Row');
    btnGroup.appendChild(copyBtn); btnGroup.appendChild(pasteBtn); btnGroup.appendChild(delBtn);
    // Inspect button — opens DataIntegrity report in a modal overlay
    btnGroup.appendChild(el('button', {
      class: 'btn btn-sm',
      title: 'Inspect dataset schema and numeric integrity',
      onclick: () => {
        const existing = document.getElementById('data-integrity-overlay');
        if (existing) { existing.remove(); return; }
        const rpt = typeof DataIntegrity !== 'undefined' ? DataIntegrity.report(dataset) : '<p>DataIntegrity not available.</p>';
        const ov = el('div', {
          id: 'data-integrity-overlay',
          style: {
            position: 'fixed', top: '60px', right: '16px', zIndex: '9999',
            width: 'min(700px,96vw)', maxHeight: '70vh',
            background: '#1e1e2e', border: '1px solid #313244',
            borderRadius: '10px', boxShadow: '0 8px 32px rgba(0,0,0,.45)',
            overflow: 'hidden', display: 'flex', flexDirection: 'column',
          }
        });
        const hdr = el('div', { style: { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px', background:'#181825', borderBottom:'1px solid #313244' } },
          el('span', { style: { color:'#cdd6f4', fontWeight:'700', fontSize:'13px', fontFamily:'monospace' } }, '🔍 Data Integrity Report'),
          el('button', { style: { background:'none', border:'none', color:'#cdd6f4', cursor:'pointer', fontSize:'18px', lineHeight:'1' }, onclick: () => ov.remove() }, '×')
        );
        const body = el('div', { style: { overflow:'auto', flex:'1' } });
        body.innerHTML = rpt;
        ov.appendChild(hdr); ov.appendChild(body);
        document.body.appendChild(ov);
      }
    }, '🔍 Inspect'));
    toolbar.appendChild(btnGroup);
    const pgDiv=el('div',{class:'data-toolbar-page'});
    if (total>0) {
      pgDiv.appendChild(el('span',{class:'small muted'},(start+1)+'\u2013'+end+' of '+total));
      pgDiv.appendChild(el('button',{class:'btn btn-xs',onclick:()=>{if(_page>0){_page--;render(dataset);}},disabled:_page===0},'\u25C0'));
      pgDiv.appendChild(el('button',{class:'btn btn-xs',onclick:()=>{if(end<total){_page++;render(dataset);}},disabled:end>=total},'\u25B6'));
    } else {
      pgDiv.appendChild(el('span',{class:'small muted'},'0 cases'));
    }
    toolbar.appendChild(pgDiv);
    _container.appendChild(toolbar);

    _container.appendChild(el('div',{class:'data-kb-hint'},
      '\u2328 Click to select \u00B7 Type/Dbl-click to edit \u00B7 Enter moves down \u00B7 Tab/Shift+Tab columns \u00B7 Ctrl+C/V \u00B7 Ctrl+Z/Y undo/redo \u00B7 Right-click header → Delete Variable'
    ));

    // ── Scroll / Table ─────────────────────────────────────
    const scroll=el('div',{class:'data-grid-scroll',tabIndex:'0'});
    _scrollEl=scroll;
    scroll.addEventListener('keydown',(e)=>handleKeyboard(e,dataset,_visVars));
    // Paste is handled exclusively by the document-level capture listener
    // (_onDocumentPaste) registered in init(). No second handler here.

    const tbl=el('table',{class:'data-grid'});
    const thead=el('thead');
    const hrow=el('tr');
    hrow.appendChild(el('th',{class:'row-num-header'},'#'));
    _visVars.forEach(v=>{
      const th=el('th',{title:(v.label||v.name)+'\nRight-click for options'});
      const nameSpan=document.createTextNode(v.name);
      th.appendChild(nameSpan);
      if (_sortKey===v.name) th.appendChild(document.createTextNode(_sortDir==='asc'?' \u25B2':' \u25BC'));
      // Left-click: sort
      th.addEventListener('click',()=>{
        _sortKey=v.name; _sortDir=_sortDir==='asc'?'desc':'asc'; _page=0; render(dataset);
      });
      // Right-click: context menu (delete variable etc.)
      th.addEventListener('contextmenu',e=>{
        e.preventDefault(); e.stopPropagation();
        _showColContextMenu(v,dataset,th);
      });
      // Double-click header → go to Variable View
      th.addEventListener('dblclick',e=>{
        e.stopPropagation();
        if (window.App) { App.setDataSubview('variable'); App.renderDataModule(); }
      });
      const infoBtn=el('span',{class:'var-col-info',title:'Variable info'},'ⓘ');
      infoBtn.addEventListener('click',e=>{ e.stopPropagation(); showVarContextPanel(v,dataset,th); });
      th.appendChild(infoBtn);
      hrow.appendChild(th);
    });
    thead.appendChild(hrow); tbl.appendChild(thead);

    let cases=[...dataset.cases];
    if (_sortKey) {
      const dir=_sortDir;
      cases.sort((a,b)=>{
        const av=a[_sortKey],bv=b[_sortKey];
        if(av==null&&bv==null)return 0; if(av==null)return 1; if(bv==null)return -1;
        const c=typeof av==='number'&&typeof bv==='number'?av-bv:String(av).localeCompare(String(bv));
        return dir==='asc'?c:-c;
      });
    }
    _caseSlice=cases.slice(start,end);

    const tbody=el('tbody');
    // Real case rows
    for (let i=0;i<_caseSlice.length;i++) {
      const absIdx=start+i;
      const row=_caseSlice[i];
      const isSel=_selCell&&_selCell.rowIdx===absIdx;
      const tr=el('tr',{class:isSel?'row-selected':''});
      _trMap.set(absIdx,tr);
      tr.appendChild(el('td',{class:'row-num'},String(absIdx+1)));
      _visVars.forEach((v,vi)=>{
        const val=row[v.name];
        const isCellSel=_selCell&&_selCell.rowIdx===absIdx&&_selCell.varIdx===vi;
        const td=el('td',{class:'data-cell'+(isCellSel?' cell-selected':'')});
        _tdMap.set(i+':'+vi, td);
        // Cell display
        const disp=_cellDisplayVal(v,val);
        if (disp==null) { td.appendChild(el('span',{class:'missing-val'},'.')); }
        else { td.textContent=disp; }
        td.addEventListener('click',()=>{
          if (_editCell) { commitEdit(); return; }
          _applySelection({rowIdx:absIdx,varName:v.name,varIdx:vi});
          if (_scrollEl) _scrollEl.focus({preventScroll:true});
        });
        // Double-click: start editing
        td.addEventListener('dblclick',e=>{
          e.stopPropagation();
          _applySelection({rowIdx:absIdx,varName:v.name,varIdx:vi});
          startEdit(td,dataset,absIdx,v.name,dataset.cases[absIdx][v.name]);
        });
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    }

    // Placeholder rows — visual only, not real cases
    for (let ph=0; ph<placeholderCount; ph++) {
      const phAbsIdx=total+ph; // row label = total+ph+1
      const tr=el('tr',{class:'placeholder-row'});
      tr.appendChild(el('td',{class:'row-num placeholder-num'},String(phAbsIdx+1)));
      _visVars.forEach((v,vi)=>{
        const td=el('td',{class:'data-cell placeholder-cell'});
        _tdMap.set('ph:'+ph+':'+vi, td);
        // Click on placeholder selects it without materializing
        td.addEventListener('click',()=>{
          if (_editCell) commitEdit();
          _clearPlaceholderSel(); // clear previous placeholder selection first
          // Deselect any real cell visually
          if (_selCell) {
            const pageStart=_page*PAGE;
            const ok=_tdMap?.get((_selCell.rowIdx-pageStart)+':'+_selCell.varIdx);
            if (ok) ok.classList.remove('cell-selected');
            const tr2=_trMap?.get(_selCell.rowIdx);
            if (tr2) tr2.classList.remove('row-selected');
            _selCell=null;
          }
          _selPlaceholder={phIdx:ph,absIdx:phAbsIdx,varIdx:vi,varName:v.name};
          td.classList.add('cell-selected');
          _lastPhTd=td;
          if (_scrollEl) _scrollEl.focus({preventScroll:true});
          _updateToolbar();
        });
        // Double-click or typing materializes the row and starts edit
        td.addEventListener('dblclick',e=>{
          e.stopPropagation();
          _materializePlaceholderRows(dataset,phAbsIdx,v.name,vi,td);
        });
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    }

    tbl.appendChild(tbody);
    scroll.appendChild(tbl);
    _container.appendChild(scroll);

    // Restore focus
    setTimeout(()=>{ if (_scrollEl) _scrollEl.focus(); },50);
  }

  function _clearPlaceholderSel() {
    if (_lastPhTd) { _lastPhTd.classList.remove('cell-selected'); _lastPhTd=null; }
    _selPlaceholder=null;
  }

  /* ── Materialize placeholder rows up to absIdx ───────────── */
  function _materializePlaceholderRows(dataset,targetAbsIdx,varName,varIdx,startTd) {
    const currentLen=dataset.cases.length;
    if (targetAbsIdx<currentLen) return; // already a real row
    // Create all needed rows from currentLen to targetAbsIdx
    const batch=[];
    for (let ri=currentLen; ri<=targetAbsIdx; ri++) {
      const row={};
      dataset.variables.forEach(v=>{ row[v.name]=null; });
      dataset.cases.push(row);
      batch.push({type:'addRow',rowIdx:ri,row:{...row}});
    }
    // Record as a single undo entry (batch)
    batch.forEach(e=>pushUndo(e));
    dataset.updatedAt=new Date().toISOString();
    Project.markDirty();
    render(dataset);
    // After render, start edit on the target cell
    setTimeout(()=>{
      const pageStart=_page*PAGE;
      const i=targetAbsIdx-pageStart;
      const td=_tdMap?.get(i+':'+varIdx);
      if (td) {
        _applySelection({rowIdx:targetAbsIdx,varName,varIdx});
        startEdit(td,dataset,targetAbsIdx,varName,dataset.cases[targetAbsIdx][varName]);
      }
    },30);
  }

  /* ── Keyboard handler ────────────────────────────────────── */
  function handleKeyboard(e,dataset,visVars) {
    // When editing, the input element handles keys; only global shortcuts reach here
    if (_editCell) {
      // Allow the input to handle its own keys (stopPropagation in startEdit)
      return;
    }
    if (e.ctrlKey||e.metaKey) {
      if (e.key==='z'||e.key==='Z') { e.preventDefault(); undo(); return; }
      if (e.key==='y'||e.key==='Y') { e.preventDefault(); redo(); return; }
      if (e.key==='c'||e.key==='C') { e.preventDefault(); copySelected(); return; }
      if (e.key==='v'||e.key==='V') { e.preventDefault(); return; }
    }

    // Handle keyboard when a placeholder row is selected
    if (!_selCell && _selPlaceholder) {
      const {phIdx,absIdx,varIdx,varName}=_selPlaceholder;
      if ((e.key==='Enter'||e.key==='F2') && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        _clearPlaceholderSel();
        _materializePlaceholderRows(dataset,absIdx,varName,varIdx,null);
        return;
      }
      if (e.key.length===1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        _clearPlaceholderSel();
        _materializePlaceholderRows(dataset,absIdx,varName,varIdx,null);
        // initChar will be typed after render
        return;
      }
      return;
    }

    if (!_selCell) return;
    let {rowIdx,varIdx}=_selCell;
    const total=dataset.cases.length;
    const getVN=idx=>visVars[idx]?.name||null;

    if (e.key==='ArrowDown') {
      e.preventDefault();
      if(rowIdx<total-1){ rowIdx++; _applySelection({rowIdx,varIdx,varName:getVN(varIdx)}); }
    } else if (e.key==='ArrowUp') {
      e.preventDefault();
      if(rowIdx>0){ rowIdx--; _applySelection({rowIdx,varIdx,varName:getVN(varIdx)}); }
    } else if (e.key==='ArrowRight') {
      e.preventDefault();
      if(varIdx<visVars.length-1){ varIdx++; _applySelection({rowIdx,varIdx,varName:getVN(varIdx)}); }
    } else if (e.key==='ArrowLeft') {
      e.preventDefault();
      if(varIdx>0){ varIdx--; _applySelection({rowIdx,varIdx,varName:getVN(varIdx)}); }
    } else if (e.key==='Tab') {
      e.preventDefault();
      const dir=e.shiftKey?-1:1;
      const newVi=clamp(varIdx+dir,0,visVars.length-1);
      _applySelection({rowIdx,varIdx:newVi,varName:getVN(newVi)});
    } else if (e.key==='Enter') {
      e.preventDefault();
      const pageStart=_page*PAGE;
      const td=_tdMap?.get((rowIdx-pageStart)+':'+varIdx);
      if(td) startEdit(td,dataset,rowIdx,visVars[varIdx].name,dataset.cases[rowIdx][visVars[varIdx].name]);
    } else if (e.key==='Delete'||e.key==='Backspace') {
      e.preventDefault();
      const vn=_selCell.varName;
      const oldVal=dataset.cases[_selCell.rowIdx][vn];
      if (oldVal!==null) {
        pushUndo({type:'cell',rowIdx:_selCell.rowIdx,varName:vn,oldVal,newVal:null});
        dataset.cases[_selCell.rowIdx][vn]=null;
        dataset.updatedAt=new Date().toISOString();
        Project.markDirty();
        _refreshCell(_selCell.rowIdx,vn);
      }
    } else if (e.key.length===1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Printable character — enter edit mode immediately
      const pageStart=_page*PAGE;
      const td=_tdMap?.get((rowIdx-pageStart)+':'+varIdx);
      if(td && visVars[varIdx]) {
        startEdit(td,dataset,rowIdx,visVars[varIdx].name,dataset.cases[rowIdx][visVars[varIdx].name],e.key);
      }
    }
  }

  /* ── Start inline edit ───────────────────────────────────── */
  function startEdit(td,dataset,rowIdx,varName,currentVal,initChar) {
    if (_editCell && _editCell.rowIdx===rowIdx && _editCell.varName===varName) return;
    if (_editCell) commitEdit();

    const v=dataset.variables.find(x=>x.name===varName);
    const origVal=currentVal;

    _editCell={td,dataset,rowIdx,varName,origVal};
    td.classList.add('editing');
    td.innerHTML='';

    const inp=el('input',{type:'text',class:'cell-edit-input'});
    // In edit mode show raw value, not labeled/formatted display
    const rawDisplay= (currentVal==null) ? '' :
      (v&&v.type==='numeric'&&!isNaN(Number(currentVal))) ? String(currentVal) : String(currentVal);
    inp.value = (initChar!=null) ? initChar : rawDisplay;

    inp.addEventListener('blur',()=>commitEdit());
    inp.addEventListener('keydown',e=>{
      e.stopPropagation();
      if (e.key==='Enter') {
        e.preventDefault();
        const committed=commitEdit();
        if (committed===false) return; // validation failed, stay in edit
        // Move to next row (materializes if in placeholder zone)
        const vis=dataset.variables.filter(x=>x.visibility!==false);
        const vi=vis.findIndex(x=>x.name===varName);
        const nextRow=rowIdx+1;
        if (nextRow<dataset.cases.length) {
          _applySelection({rowIdx:nextRow,varIdx:vi,varName});
          const pageStart=_page*PAGE;
          const nextTd=_tdMap?.get((nextRow-pageStart)+':'+vi);
          if (nextTd) setTimeout(()=>startEdit(nextTd,dataset,nextRow,varName,dataset.cases[nextRow][varName]),0);
        } else if (nextRow<dataset.cases.length+PLACEHOLDER_TOTAL) {
          // Next row is a placeholder — materialize and edit
          setTimeout(()=>_materializePlaceholderRows(dataset,nextRow,varName,vi,null),0);
        }
      } else if (e.key==='Tab') {
        e.preventDefault();
        const committed=commitEdit();
        if (committed===false) return;
        const vis=dataset.variables.filter(x=>x.visibility!==false);
        const vi=vis.findIndex(x=>x.name===varName);
        const nextVi=e.shiftKey?vi-1:vi+1;
        if (nextVi>=0&&nextVi<vis.length) {
          const nextVN=vis[nextVi].name;
          _applySelection({rowIdx,varIdx:nextVi,varName:nextVN});
          // Tab commits but does NOT auto-enter edit mode on next cell
        }
      } else if (e.key==='Escape') {
        e.preventDefault();
        // Discard — restore original value
        _editCell=null;
        td.classList.remove('editing');
        td.innerHTML='';
        const disp=_cellDisplayVal(v,origVal);
        if (disp==null) td.appendChild(el('span',{class:'missing-val'},'.'));
        else td.textContent=disp;
        if (_scrollEl) _scrollEl.focus();
      }
    });

    td.appendChild(inp);
    inp.focus();
    if (initChar!=null) { inp.setSelectionRange(inp.value.length,inp.value.length); }
    else { inp.select(); }
  }

  /* ── Commit edit (returns false if validation fails) ─────── */
  function commitEdit() {
    if (!_editCell) return true;
    const {td,dataset,rowIdx,varName,origVal}=_editCell;
    _editCell=null;
    td.classList.remove('editing');

    const inp=td.querySelector('input');
    if (!inp) return true;
    const raw=inp.value;
    const v=dataset.variables.find(x=>x.name===varName);

    let val;
    if (raw==='') {
      val=null;
    } else if (v&&v.type==='numeric') {
      const n=Number(raw);
      if (isNaN(n)) {
        // Invalid numeric — show error, keep editing
        _showNumericError(td,dataset,rowIdx,varName,origVal,raw);
        return false;
      }
      val=n;
    } else {
      val=raw;
    }

    const oldVal=dataset.cases[rowIdx][varName];
    if (val!==oldVal) {
      pushUndo({type:'cell',rowIdx,varName,oldVal,newVal:val});
      dataset.cases[rowIdx][varName]=val;
      dataset.updatedAt=new Date().toISOString();
      Project.markDirty();
    }

    // Update cell display in-place
    td.innerHTML='';
    const disp=_cellDisplayVal(v,val);
    if (disp==null) td.appendChild(el('span',{class:'missing-val'},'.'));
    else td.textContent=disp;

    if (_scrollEl) _scrollEl.focus();
    return true;
  }

  /* ── Numeric error inline UI ─────────────────────────────── */
  function _showNumericError(td,dataset,rowIdx,varName,origVal,badVal) {
    td.classList.add('editing');
    td.innerHTML='';
    const inp=el('input',{type:'text',class:'cell-edit-input cell-edit-error'});
    inp.value=badVal;
    const errMsg=el('div',{class:'cell-error-msg'},
      el('span',{},'Invalid numeric value. '),
      el('button',{class:'btn btn-xs btn-keep-editing',
        // Use mousedown+preventDefault to avoid triggering blur on inp
        onmousedown:(ev)=>{ ev.preventDefault(); },
        onclick:(ev)=>{ ev.preventDefault(); ev.stopPropagation(); inp.focus(); inp.select(); }
      },'Keep Editing'),
      el('button',{class:'btn btn-xs btn-clear-cell',
        onmousedown:(ev)=>{ ev.preventDefault(); },
        onclick:(ev)=>{
          ev.preventDefault(); ev.stopPropagation();
          // Clear _editCell before DOM manipulation to prevent blur from re-committing
          _editCell=null;
          const oldV=dataset.cases[rowIdx][varName];
          if (oldV!==null) {
            pushUndo({type:'cell',rowIdx,varName,oldVal:oldV,newVal:null});
            dataset.cases[rowIdx][varName]=null;
            dataset.updatedAt=new Date().toISOString();
            Project.markDirty();
          }
          td.classList.remove('editing');
          td.innerHTML='';
          td.appendChild(el('span',{class:'missing-val'},'.'));
          if (_scrollEl) _scrollEl.focus();
        }
      },'Set Missing')
    );

    // Re-enter edit mode on this cell
    _editCell={td,dataset,rowIdx,varName,origVal};
    inp.addEventListener('blur',()=>{
      // Don't commit on blur if focus went to error buttons (mousedown prevents that)
      // Small delay to allow button clicks to clear _editCell first
      setTimeout(()=>{ if(_editCell&&_editCell.td===td) commitEdit(); },50);
    });
    inp.addEventListener('keydown',e=>{
      e.stopPropagation();
      if (e.key==='Escape') {
        _editCell=null;
        td.classList.remove('editing');
        td.innerHTML='';
        const v2=dataset.variables.find(x=>x.name===varName);
        const disp=_cellDisplayVal(v2,origVal);
        if (disp==null) td.appendChild(el('span',{class:'missing-val'},'.'));
        else td.textContent=disp;
        if (_scrollEl) _scrollEl.focus();
      } else if (e.key==='Enter') {
        e.preventDefault();
        if (_editCell) commitEdit();
      }
    });

    td.appendChild(inp);
    td.appendChild(errMsg);
    inp.focus(); inp.select();
  }

  /* ── Add row (focuses first cell) ───────────────────────── */
  function addRow(dataset) {
    const newRow={};
    dataset.variables.forEach(v=>{ newRow[v.name]=null; });
    dataset.cases.push(newRow);
    dataset.updatedAt=new Date().toISOString();
    const newIdx=dataset.cases.length-1;
    _page=Math.floor(newIdx/PAGE);
    pushUndo({type:'addRow',rowIdx:newIdx,row:{...newRow}});
    Project.markDirty();
    render(dataset);
    // Focus first cell of new row
    setTimeout(()=>{
      const vis=dataset.variables.filter(v=>v.visibility!==false);
      if (vis.length>0) {
        const pageStart=_page*PAGE;
        const td=_tdMap?.get((newIdx-pageStart)+':0');
        if (td) {
          _applySelection({rowIdx:newIdx,varIdx:0,varName:vis[0].name});
        }
      }
      if (_scrollEl) _scrollEl.focus();
    },30);
  }

  return { init, render, undo, redo, deleteVariableByName };
})();

/* ── Variable Context Panel ──────────────────────────────────────────── */
function showVarContextPanel(v, ds, anchorEl) {
  document.querySelectorAll('.var-ctx-panel').forEach(p=>p.remove());
  const vals=ds.cases.map(r=>r[v.name]).filter(x=>x!=null);
  const numVals=vals.filter(x=>typeof x==='number'&&isFinite(x));
  const nValid=vals.length, nMissing=ds.cases.length-nValid;

  // Compute quick stats for numeric scale variables
  let statsBlock=null;
  if (v.type==='numeric'&&numVals.length>0) {
    const mn=Stats.mean(numVals), sd=Stats.std(numVals);
    const minV=Math.min(...numVals), maxV=Math.max(...numVals);
    statsBlock=el('div',{class:'vcp-stats'},
      el('div',{class:'vcp-stat'},el('span',{class:'vcp-stat-lbl'},'Mean'),el('span',{class:'vcp-stat-val'},fmt(mn,3))),
      el('div',{class:'vcp-stat'},el('span',{class:'vcp-stat-lbl'},'SD'),el('span',{class:'vcp-stat-val'},fmt(sd,3))),
      el('div',{class:'vcp-stat'},el('span',{class:'vcp-stat-lbl'},'Min'),el('span',{class:'vcp-stat-val'},fmt(minV,3))),
      el('div',{class:'vcp-stat'},el('span',{class:'vcp-stat-lbl'},'Max'),el('span',{class:'vcp-stat-val'},fmt(maxV,3)))
    );
  }

  // Value labels block
  let labelsBlock=null;
  if (v.valueLabels&&Object.keys(v.valueLabels).length>0) {
    const entries=Object.entries(v.valueLabels).slice(0,8);
    labelsBlock=el('div',{class:'vcp-labels'},
      el('div',{class:'vcp-section-title'},'Value Labels'),
      ...entries.map(([k,lbl])=>el('div',{class:'vcp-label-row'},
        el('span',{class:'vcp-label-key'},k),
        el('span',{class:'vcp-label-val'},lbl)
      ))
    );
  }

  // Recommended analyses
  const recMap={
    scale:['Descriptives','Correlation (Pearson)','T-Test','ANOVA','Linear Regression','Histogram','Boxplot'],
    ordinal:['Frequencies','Spearman Correlation','Mann-Whitney U','Kruskal-Wallis','Boxplot'],
    nominal:['Frequencies','Crosstabs (Chi-Square)','Bar Chart','Pie Chart']
  };
  const recs=recMap[v.measurementLevel]||recMap['scale'];
  const recsBlock=el('div',{class:'vcp-recs'},
    el('div',{class:'vcp-section-title'},'Recommended Analyses'),
    ...recs.map(r=>el('div',{class:'vcp-rec-item'},'\u2022 '+r))
  );

  const levelColor={scale:'#3b82d4',ordinal:'#7c5cd8',nominal:'#e6871e'};
  const panel=el('div',{class:'var-ctx-panel'},
    el('div',{class:'vcp-header'},
      el('div',{},
        el('div',{class:'vcp-name'},v.name),
        v.label?el('div',{class:'vcp-label-txt'},v.label):null
      ),
      el('button',{class:'vcp-close',onclick:()=>panel.remove()},'\u00D7')
    ),
    el('div',{class:'vcp-meta'},
      el('span',{class:'vcp-badge',style:{background:levelColor[v.measurementLevel]||'#aaa'}},v.measurementLevel||'unknown'),
      el('span',{class:'vcp-badge',style:{background:'#555'}},v.type||'numeric'),
      el('span',{class:'vcp-badge-outline'},nValid+' valid'),
      el('span',{class:'vcp-badge-outline',style:{color:'#e57373'}},nMissing+' missing')
    ),
    statsBlock,
    labelsBlock,
    recsBlock
  );

  // Position near the anchor
  document.body.appendChild(panel);
  const rect=anchorEl.getBoundingClientRect();
  let top=rect.bottom+window.scrollY+4;
  let left=rect.left+window.scrollX;
  if (left+260>window.innerWidth) left=window.innerWidth-270;
  panel.style.top=top+'px';
  panel.style.left=left+'px';

  // Close on outside click
  setTimeout(()=>{
    const close=e=>{
      if(!panel.contains(e.target)){panel.remove();document.removeEventListener('click',close);}
    };
    document.addEventListener('click',close);
  },10);
}

/* ══════════════════════════════════════════════════════════════════
   SECTION 8: VARIABLE VIEW
   ══════════════════════════════════════════════════════════════════ */
