const VariableView = (() => {
  let _container=null, _dataset=null;

  function init(container) { _container=container; }

  function render(dataset) {
    _dataset=dataset;
    if (!_container) return;
    _container.innerHTML='';
    if (!dataset) { _container.innerHTML='<div class="empty-state">No dataset loaded.</div>'; return; }

    const toolbar=el('div',{class:'data-toolbar'});
    toolbar.appendChild(el('span',{class:'muted'},`${dataset.variables.length} variables`));
    toolbar.appendChild(el('button',{class:'btn btn-sm btn-primary',onclick:()=>addVariable(dataset)},'+ Variable'));
    _container.appendChild(toolbar);

    const scroll=el('div',{class:'data-grid-scroll'});
    const tbl=el('table',{class:'data-grid variable-grid'});
    const cols=['Name','Label','Type','Width','Decimals','Values','Missing','Level','Role','Status','Visible','Actions'];
    const thead=el('thead',{},el('tr',{},...cols.map(c=>el('th',{},c))));
    tbl.appendChild(thead);
    const tbody=el('tbody');
    dataset.variables.forEach((v,idx)=>{
      const tr=el('tr');
      const mkInput=(field,type='text',val)=>{
        const inp=el('input',{type,value:val??v[field]??'',class:'cell-input',
          oninput:e=>{
            // Live update — no tab-away required
            const newVal=type==='number'?Number(e.target.value):e.target.value;
            dataset.variables[idx][field]=newVal;
            dataset.updatedAt=new Date().toISOString();
            Project.markDirty();
          },
          onchange:e=>{
            const newVal=type==='number'?Number(e.target.value):e.target.value;
            dataset.variables[idx][field]=newVal;
            dataset.updatedAt=new Date().toISOString();
            Project.markDirty();
          }});
        return inp;
      };
      const mkSelect=(field,options)=>{
        const sel=el('select',{class:'cell-input',
          onchange:e=>{ dataset.variables[idx][field]=e.target.value; dataset.updatedAt=new Date().toISOString(); Project.markDirty(); }});
        options.forEach(o=>{
          const opt=el('option',{value:o},o); if(o===v[field])opt.selected=true;
          sel.appendChild(opt);
        });
        return sel;
      };

      // Atomic rename cell — double-click or ✎ to open rename dialog
      const nameCell = el('td');
      const nameSpan = el('span', {
        class:'var-name-display',
        style:'cursor:pointer;font-weight:600;padding:2px 4px;border-radius:3px;',
        title:'Double-click to rename',
        ondblclick:()=>openRenameDialog(dataset,idx,v.name)
      }, v.name);
      const renameBtn = el('button', {
        class:'btn btn-xs',
        style:'margin-left:4px;font-size:10px;',
        onclick:()=>openRenameDialog(dataset,idx,v.name)
      }, String.fromCharCode(0x270E));
      nameCell.append(nameSpan, renameBtn);
      tr.appendChild(nameCell);
      tr.appendChild(el('td',{},mkInput('label')));

      // ── Type dropdown — triggers real conversion dialog ──────────
      const typeCell = el('td');
      const typeOptions = ['numeric','string','date','datetime','boolean'];
      const typeSel = el('select', { class: 'cell-input' });
      typeOptions.forEach(o => {
        const opt = el('option', { value: o }, o);
        if (o === v.type) opt.selected = true;
        typeSel.appendChild(opt);
      });
      // Type badge showing N/S/D/B
      const TYPE_BADGE = { numeric: 'N', string: 'S', date: 'D', datetime: 'DT', boolean: 'B' };
      const TYPE_TITLE = {
        numeric: 'N • Numeric',
        string: 'S • String',
        date: 'D • Date',
        datetime: 'DT • DateTime',
        boolean: 'B • Boolean',
      };
      const typeBadge = el('span', {
        class: 'var-type-badge',
        title: TYPE_TITLE[v.type] || v.type,
        style: { cursor: 'default', userSelect: 'none' }
      }, TYPE_BADGE[v.type] || '?');
      typeSel.addEventListener('change', e => {
        const targetType = e.target.value;
        const currentType = dataset.variables[idx].type;
        if (targetType === currentType) return;
        // Show conversion dialog
        if (typeof DataTypeConverter !== 'undefined') {
          DataTypeConverter.showConversionDialog(dataset, v.name, targetType, (onInvalid) => {
            if (onInvalid === 'nochange' || onInvalid === 'noop') {
              typeSel.value = currentType;
              return;
            }
            const result = DataTypeConverter.convertVariable(dataset, v.name, targetType, onInvalid);
            if (result.error) {
              notify('Conversion failed: ' + result.error, 'error');
              typeSel.value = currentType;
              return;
            }
            dataset.updatedAt = new Date().toISOString();
            Project.markDirty();
            const msg = `Converted ${v.name}: ${result.converted} values → ${targetType}` +
              (result.errors > 0 ? `, ${result.errors} set missing` : '');
            notify(msg, 'success');
            render(dataset);  // re-render Variable View to reflect new type
            // Also refresh Data View if it's active
            if (typeof DataView !== 'undefined') DataView.render(dataset);
          });
          // Immediately reset select to current type — dialog will handle change
          typeSel.value = currentType;
        } else {
          // Fallback: direct metadata change only (no conversion engine)
          dataset.variables[idx].type = targetType;
          dataset.updatedAt = new Date().toISOString();
          Project.markDirty();
        }
      });
      typeCell.appendChild(typeBadge);
      typeCell.appendChild(typeSel);
      tr.appendChild(typeCell);
      tr.appendChild(el('td',{},mkInput('width','number',v.width)));
      tr.appendChild(el('td',{},mkInput('decimals','number',v.decimals)));
      // Value labels button
      const lblCount=Object.keys(v.valueLabels||{}).length;
      tr.appendChild(el('td',{},
        el('button',{class:'btn btn-sm',onclick:()=>openValueLabelsDialog(dataset,idx)},
          lblCount?`${lblCount} label${lblCount>1?'s':''}` : 'None')
      ));
      // Missing values button
      const mCount=(v.missingValues||[]).length;
      tr.appendChild(el('td',{},
        el('button',{class:'btn btn-sm',onclick:()=>openMissingDialog(dataset,idx)},
          mCount?`${mCount} value${mCount>1?'s':''}` : 'None')
      ));
      tr.appendChild(el('td',{},mkSelect('measurementLevel',['nominal','ordinal','scale'])));
      tr.appendChild(el('td',{},mkSelect('role',['input','target','both','none','partition','split','frequency','weight','identifier'])));
      // Status indicator — uses DataQuality service when available
      const statusCell = el('td',{class:'var-status-cell'});
      if (typeof DataQuality !== 'undefined') {
        const stats = DataQuality.getVariableStats(dataset, v.name);
        const STATUS_LABELS = { populated: 'Populated', partial: 'Partially Missing', empty: 'Empty', invalid: 'Invalid Values' };
        const STATUS_CLS   = { populated: 'status-populated', partial: 'status-partial', empty: 'status-empty', invalid: 'status-invalid' };
        const lbl = STATUS_LABELS[stats.status] || stats.status;
        const cls = STATUS_CLS[stats.status] || '';
        const tip = `${stats.valid} valid, ${stats.missing} missing of ${stats.total} cases`;
        statusCell.appendChild(el('span',{class:`var-status-badge ${cls}`,title:tip}, lbl));
      }
      tr.appendChild(statusCell);
      // Visibility checkbox
      const vis=el('input',{type:'checkbox',checked:v.visibility!==false,
        onchange:e=>{ dataset.variables[idx].visibility=e.target.checked; render(dataset); }});
      tr.appendChild(el('td',{},vis));
      // Actions — delegate to DataView.deleteVariableByName so undo/redo is consistent
      const del=el('button',{class:'btn btn-sm btn-danger',title:'Delete variable (undoable)',onclick:()=>{
        if (typeof DataView!=='undefined' && DataView.deleteVariableByName) {
          DataView.deleteVariableByName(dataset,v.name);
          // DataView.deleteVariableByName internally calls window._sociostatRenderDataModule
          // which refreshes the active subview (Variable View or Data View).
        } else {
          if (confirm(`Delete variable "${v.name}"?`)) {
            dataset.variables.splice(idx,1);
            dataset.cases.forEach(c=>delete c[v.name]);
            Project.markDirty(); render(dataset);
          }
        }
      }},'✕');
      const up=el('button',{class:'btn btn-sm',onclick:()=>{
        if(idx>0){[dataset.variables[idx-1],dataset.variables[idx]]=[dataset.variables[idx],dataset.variables[idx-1]]; Project.markDirty(); render(dataset);}
      }},'↑');
      const dn=el('button',{class:'btn btn-sm',onclick:()=>{
        if(idx<dataset.variables.length-1){[dataset.variables[idx+1],dataset.variables[idx]]=[dataset.variables[idx],dataset.variables[idx+1]]; Project.markDirty(); render(dataset);}
      }},'↓');
      tr.appendChild(el('td',{},up,dn,del));
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    scroll.appendChild(tbl);
    _container.appendChild(scroll);
  }

  function addVariable(dataset) {
    dataset.variables.push({
      id:uuid(), name:`var${dataset.variables.length+1}`, label:'New Variable',
      type:'numeric', width:8, decimals:2, valueLabels:{}, missingValues:[],
      measurementLevel:'scale', role:'input', visibility:true
    });
    Project.markDirty(); render(dataset);
  }

  function openValueLabelsDialog(dataset, varIdx) {
    const v=dataset.variables[varIdx];
    const overlay=el('div',{class:'dialog-overlay'});
    const box=el('div',{class:'dialog-box'});
    box.appendChild(el('div',{class:'dialog-header'},
      el('h3',{},`Value Labels — ${v.name}`),
      el('button',{class:'dialog-close',onclick:()=>overlay.remove()},'×')
    ));
    const body=el('div',{class:'dialog-body'});
    const labels={...(v.valueLabels||{})};
    const rows=el('div',{class:'value-label-rows'});
    function renderRows(){
      rows.innerHTML='';
      Object.entries(labels).forEach(([val,lbl])=>{
        const row=el('div',{class:'value-label-row'});
        const vi=el('input',{type:'text',class:'form-control',value:val,placeholder:'Value',style:{width:'80px'}});
        const li=el('input',{type:'text',class:'form-control',value:lbl,placeholder:'Label',style:{flex:'1'}});
        const rm=el('button',{class:'btn btn-sm btn-danger',onclick:()=>{delete labels[val];renderRows();}},'✕');
        vi.onchange=e=>{ const old=val; delete labels[old]; labels[e.target.value]=lbl; renderRows(); };
        li.onchange=e=>{ labels[val]=e.target.value; };
        row.append(vi,li,rm); rows.appendChild(row);
      });
      const addRow=el('div',{class:'value-label-row'});
      const nv=el('input',{type:'text',class:'form-control',placeholder:'New value',style:{width:'80px'}});
      const nl=el('input',{type:'text',class:'form-control',placeholder:'New label',style:{flex:'1'}});
      const add=el('button',{class:'btn btn-sm btn-primary',onclick:()=>{
        if(nv.value!==''){labels[nv.value]=nl.value; renderRows();}
      }},'+');
      addRow.append(nv,nl,add); rows.appendChild(addRow);
    }
    renderRows(); body.appendChild(rows);
    box.appendChild(body);
    box.appendChild(el('div',{class:'dialog-footer'},
      el('button',{class:'btn btn-primary',onclick:()=>{
        dataset.variables[varIdx].valueLabels=labels;
        Project.markDirty(); render(dataset); overlay.remove();
      }},'OK'),
      el('button',{class:'btn btn-secondary',onclick:()=>overlay.remove()},'Cancel')
    ));
    overlay.appendChild(box); document.body.appendChild(overlay);
  }

  function openMissingDialog(dataset, varIdx) {
    const v=dataset.variables[varIdx];
    const overlay=el('div',{class:'dialog-overlay'});
    const box=el('div',{class:'dialog-box'});
    box.appendChild(el('div',{class:'dialog-header'},
      el('h3',{},`Missing Values — ${v.name}`),
      el('button',{class:'dialog-close',onclick:()=>overlay.remove()},'×')
    ));
    const body=el('div',{class:'dialog-body'});
    const missList=[...(v.missingValues||[])];
    body.appendChild(el('p',{class:'muted'},'Enter user-defined missing value codes (up to 3 values, or a range):'));
    const inp=el('textarea',{class:'form-control',rows:'3',
      placeholder:'-99\n999\n-1',
      value:missList.join('\n')});
    body.appendChild(inp);
    box.appendChild(body);
    box.appendChild(el('div',{class:'dialog-footer'},
      el('button',{class:'btn btn-primary',onclick:()=>{
        dataset.variables[varIdx].missingValues=inp.value.split('\n').map(s=>s.trim()).filter(Boolean).map(s=>isNaN(s)?s:Number(s));
        Project.markDirty(); render(dataset); overlay.remove();
      }},'OK'),
      el('button',{class:'btn btn-secondary',onclick:()=>overlay.remove()},'Cancel')
    ));
    overlay.appendChild(box); document.body.appendChild(overlay);
  }

  function renameVariable(dataset, oldName, newName) {
    if (!newName || !newName.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/)) {
      notify('Invalid variable name. Use letters, numbers, underscore. Must start with letter.','error');
      return false;
    }
    if (oldName !== newName && dataset.variables.some(v=>v.name===newName)) {
      notify('Variable name already in use: '+newName,'error');
      return false;
    }
    if (oldName === newName) return true;
    try {
      const vi = dataset.variables.findIndex(v=>v.name===oldName);
      if (vi<0) { notify('Variable not found: '+oldName,'error'); return false; }
      // 1. Rename metadata
      dataset.variables[vi].name = newName;
      // 2. Rename property in every case (atomic)
      dataset.cases.forEach(row=>{
        if (Object.prototype.hasOwnProperty.call(row,oldName)) {
          row[newName]=row[oldName]; delete row[oldName];
        }
      });
      // 3. Update weight variable reference
      if (dataset.weightVariable===oldName) dataset.weightVariable=newName;
      // 4. Update split variables
      if (Array.isArray(dataset.splitVariables)) {
        dataset.splitVariables = dataset.splitVariables.map(n=>n===oldName?newName:n);
      }
      // 5. Update filter string (best-effort)
      if (dataset.activeFilter && typeof dataset.activeFilter==='string') {
        dataset.activeFilter = dataset.activeFilter.replace(
          new RegExp('\\b'+oldName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','g'), newName
        );
      }
      dataset.updatedAt = new Date().toISOString();
      Project.markDirty();
      notify('Renamed: '+oldName+' \u2192 '+newName,'success');
      return true;
    } catch(e) {
      notify('Rename failed: '+e.message,'error');
      return false;
    }
  }

  function openRenameDialog(dataset, varIdx, currentName) {
    const ov = el('div',{class:'dialog-overlay'});
    const inp = el('input',{type:'text',class:'form-control',value:currentName});
    inp.style.cssText='font-size:15px;font-weight:600;margin-bottom:6px;';
    const errDiv = el('div',{style:'color:#e57373;font-size:12px;min-height:16px;margin-bottom:4px;'});
    const box = el('div',{class:'dialog-box'},
      el('div',{class:'dialog-header'},
        el('h3',{},'Rename Variable'),
        el('button',{class:'dialog-close',onclick:()=>ov.remove()},'\u00D7')
      ),
      el('div',{class:'dialog-body'},
        el('p',{class:'muted small'},'Name must start with a letter. Only letters, numbers, and underscores allowed.'),
        inp, errDiv,
        el('p',{class:'muted small',style:'margin-top:4px;'},'\u26A0 All case data will be updated automatically.')
      ),
      el('div',{class:'dialog-footer'},
        el('button',{class:'btn btn-primary',onclick:()=>{
          const newName = inp.value.trim();
          if (!newName.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/)) {
            errDiv.textContent='Invalid name: letters/numbers/underscore only, start with letter.'; return;
          }
          if (newName!==currentName && dataset.variables.some(v=>v.name===newName)) {
            errDiv.textContent='Name already in use.'; return;
          }
          if (renameVariable(dataset, currentName, newName)) {
            ov.remove(); render(dataset);
            if (window._sociostatRenderDataModule) window._sociostatRenderDataModule();
          }
        }},'Rename'),
        el('button',{class:'btn btn-secondary',onclick:()=>ov.remove()},'Cancel')
      )
    );
    inp.onkeydown=e=>{ if(e.key==='Enter') box.querySelector('.btn-primary').click(); if(e.key==='Escape') ov.remove(); };
    ov.appendChild(box); document.body.appendChild(ov);
    setTimeout(()=>{ inp.focus(); inp.select(); },50);
  }

  return { init, render };
})();

/* ══════════════════════════════════════════════════════════════════
   SECTION 9: ANALYSIS DIALOGS
   ══════════════════════════════════════════════════════════════════ */

