const GraphsModule = (() => {
  let _container = null;

  const CHART_TYPES = [
    { id:'histogram', icon:'📊', label:'Histogram', labelId:'Histogram',
      desc:'Distribution shape of a single numeric variable',
      descId:'Distribusi bentuk satu variabel numerik',
      when:'Scale variable, check normality, explore spread',
      whenId:'Variabel skala, cek normalitas, eksplorasi sebaran',
      levels:['scale'], vars:['x'], varLabels:['Variable'] },
    { id:'boxplot', icon:'📦', label:'Boxplot', labelId:'Boxplot',
      desc:'Median, quartiles, and outliers of numeric data',
      descId:'Median, kuartil, dan outlier data numerik',
      when:'Compare distributions across groups',
      whenId:'Bandingkan distribusi antar kelompok',
      levels:['scale'], vars:['x','group'], varLabels:['Variable','Group by (optional)'] },
    { id:'scatter', icon:'🔵', label:'Scatterplot', labelId:'Diagram Pencar',
      desc:'Relationship between two numeric variables',
      descId:'Hubungan antara dua variabel numerik',
      when:'Explore correlation, linearity assumption',
      whenId:'Eksplorasi korelasi, asumsi linearitas',
      levels:['scale'], vars:['x','y'], varLabels:['X Variable','Y Variable'] },
    { id:'bar', icon:'📶', label:'Bar Chart', labelId:'Diagram Batang',
      desc:'Frequencies or means across categories',
      descId:'Frekuensi atau rata-rata antar kategori',
      when:'Categorical variable, compare group means',
      whenId:'Variabel kategorik, bandingkan rata-rata kelompok',
      levels:['nominal','ordinal','scale'], vars:['x','y'], varLabels:['Category Variable','Value Variable (optional)'] },
    { id:'pie', icon:'🥧', label:'Pie Chart', labelId:'Diagram Pie',
      desc:'Proportions of categories in a nominal variable',
      descId:'Proporsi kategori dalam variabel nominal',
      when:'Nominal variable with few categories (<10)',
      whenId:'Variabel nominal dengan sedikit kategori (<10)',
      levels:['nominal','ordinal'], vars:['x'], varLabels:['Category Variable'] },
    { id:'line', icon:'📈', label:'Line Chart', labelId:'Diagram Garis',
      desc:'Trends across an ordered X axis',
      descId:'Tren sepanjang sumbu X yang berurutan',
      when:'Time series, ordered categories',
      whenId:'Data deret waktu, kategori berurutan',
      levels:['scale','ordinal'], vars:['x','y'], varLabels:['X Variable','Y Variables (select multiple)'] },
    { id:'qq', icon:'📉', label:'Q-Q Plot', labelId:'Q-Q Plot',
      desc:'Normality assessment for a scale variable',
      descId:'Uji normalitas visual untuk variabel skala',
      when:'Check if data follows normal distribution',
      whenId:'Cek apakah data mengikuti distribusi normal',
      levels:['scale'], vars:['x'], varLabels:['Variable'] }
  ];

  function recommendCharts(ds) {
    if (!ds || !ds.variables.length) return [];
    const hasScale = ds.variables.some(v => v.measurementLevel === 'scale');
    const hasNominal = ds.variables.some(v => v.measurementLevel === 'nominal' || v.measurementLevel === 'ordinal');
    const recs = [];
    if (hasScale) recs.push('histogram','boxplot','scatter','qq');
    if (hasNominal) recs.push('bar','pie');
    if (hasScale && hasNominal) recs.push('boxplot');
    return [...new Set(recs)];
  }

  function init(container) { _container = container; }

  function render() {
    if (!_container) return;
    _container.innerHTML = '';
    _container.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden;';
    const ds = AppState.get('activeDataset');
    const lang = I18N.getLang();

    // Header
    const dsInfo = ds ? `${ds.name} · ${ds.cases.length} cases · ${ds.variables.length} vars` : '';
    _container.appendChild(el('div', { style:'padding:14px 20px 8px;flex-shrink:0;' },
      el('h2', { style:'font-size:18px;font-weight:800;margin-bottom:4px;' }, '📈 ' + (lang==='id' ? 'Pembangun Grafik' : 'Graph Builder')),
      el('p', { style:'font-size:12px;color:var(--text-muted);' }, dsInfo || (lang==='id' ? 'Belum ada dataset.' : 'No dataset loaded.'))
    ));

    if (!ds) {
      _container.appendChild(el('div', { class:'empty-state' },
        el('p', {}, lang==='id' ? 'Belum ada dataset. Impor data untuk membuat grafik.' : 'No dataset loaded. Import data to build charts.'),
        el('button', { class:'btn btn-primary', onclick:()=>{ if(window._sociostatNavigate) window._sociostatNavigate('data'); } },
          lang==='id' ? '📥 Buka Data' : '📥 Open Data')
      ));
      return;
    }

    const recs = recommendCharts(ds);

    // Recommendation bar
    if (recs.length) {
      const recBar = el('div', { class:'graph-rec-bar' });
      recBar.appendChild(el('span', {}, lang==='id' ? 'Direkomendasikan:' : 'Recommended for your data:'));
      recs.forEach(rid => {
        const ct = CHART_TYPES.find(c => c.id === rid);
        if (ct) recBar.appendChild(el('span', { class:'graph-rec-badge' }, ct.icon + ' ' + (lang==='id' ? ct.labelId : ct.label)));
      });
      _container.appendChild(recBar);
    }

    // Cards grid
    const grid = el('div', { class:'graph-cards-grid' });
    CHART_TYPES.forEach(ct => {
      const isRec = recs.includes(ct.id);
      const card = el('div', { class:'graph-card' + (isRec ? ' graph-card-recommended' : '') },
        el('div', { class:'graph-card-icon' }, ct.icon),
        el('div', { class:'graph-card-title' }, lang==='id' ? ct.labelId : ct.label),
        el('div', { class:'graph-card-desc' }, lang==='id' ? ct.descId : ct.desc),
        el('div', { class:'graph-card-when' }, lang==='id' ? ct.whenId : ct.when),
        el('button', { class:'btn btn-primary btn-sm graph-card-create',
          onclick: () => openGraphDialog(ds, ct)
        }, lang==='id' ? 'Buat' : 'Create')
      );
      grid.appendChild(card);
    });
    _container.appendChild(grid);

    const chartArea = el('div', { id:'graph-canvas-area', class:'graph-canvas-area' });
    _container.appendChild(chartArea);
  }

  /* ── GraphSpecValidator ──────────────────────────────────────── */
  function validateGraphSpec(ds, chartType, xVarName, yVarNames, groupVarName) {
    const errors = [];
    const xVarMeta = ds.variables.find(v=>v.name===xVarName);
    const getVals = vn => ds.cases.map(r=>r[vn]).filter(v=>typeof v==='number'&&isFinite(v));
    if (chartType==='histogram' || chartType==='qq') {
      if (!xVarName) errors.push({what:'No variable selected.',why:'This chart requires exactly one numeric variable.',fix:'Select a numeric (scale) variable.'});
      else if (xVarMeta && xVarMeta.type!=='numeric') errors.push({what:xVarName+' is not numeric.',why:'Histogram and Q-Q Plot require a numeric (scale) variable.',fix:'Select a variable with type = numeric.'});
      else if (xVarName && getVals(xVarName).length===0) errors.push({what:'No valid numeric values in '+xVarName+'.',why:'All values are missing or non-numeric.',fix:'Check data or choose a different variable.'});
    }
    if (chartType==='scatter') {
      if (!xVarName) errors.push({what:'No X variable selected.',why:'Scatterplot requires two numeric variables.',fix:'Select an X variable.'});
      if (!yVarNames||!yVarNames[0]) errors.push({what:'No Y variable selected.',why:'Scatterplot requires two numeric variables.',fix:'Select a Y variable.'});
    }
    if (chartType==='boxplot') {
      if (!xVarName) errors.push({what:'No variable selected.',why:'Boxplot requires one numeric variable.',fix:'Select a numeric variable.'});
      else if (xVarMeta && xVarMeta.type!=='numeric') errors.push({what:xVarName+' is not numeric.',why:'Boxplot main variable must be numeric.',fix:'Select a numeric variable.'});
    }
    if (chartType==='bar') {
      if (!xVarName) errors.push({what:'No category variable selected.',why:'Bar chart needs a category variable.',fix:'Select any variable as the category axis.'});
    }
    if (chartType==='pie') {
      if (!xVarName) errors.push({what:'No variable selected.',why:'Pie chart requires one categorical variable.',fix:'Select a nominal or ordinal variable.'});
      else {
        const cats = [...new Set(ds.cases.map(r=>String(r[xVarName]!=null?r[xVarName]:'')).filter(Boolean))];
        if (cats.length===0) errors.push({what:'No non-missing values in '+xVarName+'.',why:'Pie chart needs at least one category.',fix:'Check for missing data.'});
        else if (cats.length>20) errors.push({what:cats.length+' categories (max 20 shown).',why:'Too many slices reduces readability.',fix:'Consider a bar chart instead.'});
      }
    }
    if (chartType==='line') {
      if (!xVarName) errors.push({what:'No X variable selected.',why:'Line chart needs an X axis variable.',fix:'Select a variable for X axis.'});
      if (!yVarNames||!yVarNames[0]) errors.push({what:'No Y variable selected.',why:'Line chart needs at least one Y variable.',fix:'Select a numeric variable for Y axis.'});
    }
    return errors;
  }

  function showGraphError(container, errors) {
    container.innerHTML = '';
    const box = el('div',{class:'graph-error-box'},
      el('div',{class:'graph-error-title'},'\u26A0\uFE0F Cannot Draw Chart — '+errors.length+' issue(s)'),
      ...errors.map(e=>el('div',{class:'graph-error-item'},
        el('div',{style:'font-weight:600;margin-bottom:2px;'},'\u2022 '+e.what),
        el('div',{style:'color:var(--text-muted);font-size:12px;margin-left:12px;margin-bottom:1px;'},e.why),
        el('div',{style:'color:var(--accent);font-size:12px;margin-left:12px;font-style:italic;'},'\u2192 '+e.fix)
      ))
    );
    container.appendChild(box);
  }

  // Enhanced variable selector with obvious selected state
  function buildVarSel2(vars, sel, multi) {
    const wrap = el('div',{class:'vsel-wrap'});
    // Selected chips bar
    if (sel.length > 0) {
      const chipsDiv = el('div',{class:'vsel-chips'});
      chipsDiv.appendChild(el('span',{class:'vsel-chips-lbl'},'Selected:'));
      sel.forEach(sn=>{
        const chip = el('span',{class:'vsel-chip'},
          sn,
          el('button',{class:'vsel-chip-rm',onclick:(e)=>{
            e.stopPropagation();
            sel.splice(sel.indexOf(sn),1);
            const nb=buildVarSel2(vars,sel,multi);
            wrap.replaceWith(nb);
          }},'\u00D7')
        );
        chipsDiv.appendChild(chip);
      });
      wrap.appendChild(chipsDiv);
    } else {
      wrap.appendChild(el('div',{class:'vsel-none'},'None selected'));
    }
    // Variable list
    const listDiv = el('div',{class:'var-list'});
    vars.forEach(v=>{
      const isSelected = sel.includes(v.name);
      const typeColor = {scale:'#3b82d4',nominal:'#e6871e',ordinal:'#7c5cd8',string:'#555'}[v.measurementLevel||v.type]||'#888';
      const item = el('div',{
        class:'var-item'+(isSelected?' selected':''),
        onclick:()=>{
          if(multi){
            if(sel.includes(v.name))sel.splice(sel.indexOf(v.name),1);else sel.push(v.name);
          } else { sel.length=0; sel.push(v.name); }
          const nb=buildVarSel2(vars,sel,multi);
          wrap.replaceWith(nb);
        }
      },
        el('span',{class:'var-item-check'},isSelected?'\u2713':' '),
        el('span',{class:'var-item-name'},v.name),
        el('span',{class:'var-type-badge',style:'background:'+typeColor+';color:#fff;'},v.measurementLevel||v.type)
      );
      listDiv.appendChild(item);
    });
    wrap.appendChild(listDiv);
    return wrap;
  }

  function buildVarSel(vars, sel, multi) {
    return buildVarSel2(vars, sel, multi);
  }

  function openGraphDialog(ds, ct) {
    const lang = I18N.getLang();
    const numVars = ds.variables.filter(v => v.type === 'numeric');
    const xVar = [], yVar = [], groupVar = [];

    function getPool(vKey) {
      if (ct.id==='histogram'||ct.id==='qq') return numVars;
      if (ct.id==='scatter') return numVars;
      if (ct.id==='boxplot' && vKey==='x') return numVars;
      if (ct.id==='pie') return ds.variables;
      return ds.variables;
    }

    const formSections = [];
    ct.vars.forEach((vKey, i) => {
      const label = ct.varLabels[i] || vKey;
      const isMulti = (vKey==='y' && ct.id==='line');
      const pool = getPool(vKey);
      const sel = vKey==='x' ? xVar : vKey==='y' ? yVar : groupVar;
      const wrapper = el('div',{class:'form-section'});
      wrapper.appendChild(el('label',{style:'font-weight:600;margin-bottom:4px;display:block;'},label+':'));
      let selWidget = buildVarSel2(pool, sel, isMulti);
      // Live update when selection changes — wrap in a div we can replace
      const selContainer = el('div');
      selContainer.appendChild(selWidget);
      // Monkey-patch replaceWith to re-attach to container
      const origBuild = buildVarSel2;
      wrapper.appendChild(selContainer);
      formSections.push(wrapper);
    });

    const formContent = el('div',{class:'analysis-form'+(ct.vars.length>1?' two-col':'')}, ...formSections);
    const previewId = 'graph_preview_'+uuid();
    const previewDiv = el('div',{id:previewId,style:'height:200px;width:100%;margin-top:10px;'});
    const errorDiv = el('div',{class:'graph-dialog-error'});

    const ov = el('div',{class:'dialog-overlay'});
    const box = el('div',{class:'dialog-box'},
      el('div',{class:'dialog-header'},
        el('h3',{},ct.icon+' '+(lang==='id'?ct.labelId:ct.label)),
        el('button',{class:'dialog-close',onclick:()=>ov.remove()},'\u00D7')
      ),
      el('div',{class:'dialog-body'},
        el('p',{style:'font-size:12px;color:var(--text-muted);margin-bottom:10px;'},lang==='id'?ct.descId:ct.desc),
        formContent,
        errorDiv,
        previewDiv
      ),
      el('div',{class:'dialog-footer'},
        el('button',{class:'btn btn-secondary',onclick:()=>{
          errorDiv.innerHTML='';
          const errs=validateGraphSpec(ds,ct.id,xVar[0],yVar,groupVar[0]);
          if(errs.length){showGraphError(errorDiv,errs);return;}
          drawGraphInto(ds,ct.id,xVar[0],yVar,groupVar[0],previewId,true);
        }},lang==='id'?'Pratinjau':'Preview'),
        el('button',{class:'btn btn-primary',onclick:()=>{
          errorDiv.innerHTML='';
          const errs=validateGraphSpec(ds,ct.id,xVar[0],yVar,groupVar[0]);
          if(errs.length){showGraphError(errorDiv,errs);return;}
          ov.remove();
          drawGraph(ds,ct.id,xVar[0],yVar,groupVar[0]);
        }},lang==='id'?'Tambah ke Output':'Add to Output'),
        el('button',{class:'btn btn-secondary',onclick:()=>ov.remove()},lang==='id'?'Batal':'Cancel')
      )
    );
    ov.appendChild(box);
    document.body.appendChild(ov);
  }

  function drawGraphInto(ds, chartType, xVarName, yVarNames, groupVarName, chartId, resize) {
    if (resize) {
      const dom = document.getElementById(chartId);
      if (dom && typeof echarts !== 'undefined') { const inst = echarts.getInstanceByDom(dom); if(inst) inst.dispose(); }
    }
    const getVals = vn => ds.cases.map(r=>r[vn]).filter(v=>typeof v==='number'&&isFinite(v));
    setTimeout(() => {
      try {
        if (chartType==='histogram' && xVarName) {
          Charts.histogram(chartId, getVals(xVarName), 'Histogram of '+xVarName, xVarName);
        } else if (chartType==='qq' && xVarName) {
          Charts.qqPlot(chartId, getVals(xVarName), 'Q-Q Plot: '+xVarName);
        } else if (chartType==='scatter' && xVarName && yVarNames&&yVarNames[0]) {
          Charts.scatterPlot(chartId, getVals(xVarName), getVals(yVarNames[0]), xVarName, yVarNames[0], xVarName+' vs '+yVarNames[0]);
        } else if (chartType==='boxplot' && xVarName) {
          const groups = {};
          if (groupVarName) {
            const cats = [...new Set(ds.cases.map(r=>String(r[groupVarName]!=null?r[groupVarName]:'')))];
            cats.forEach(c=>{ groups[c]=ds.cases.filter(r=>String(r[groupVarName]!=null?r[groupVarName]:'')==c).map(r=>r[xVarName]).filter(v=>typeof v==='number'&&isFinite(v)); });
          } else { groups[xVarName]=getVals(xVarName); }
          Charts.boxplot(chartId, groups, 'Boxplot: '+xVarName);
        } else if (chartType==='bar' && xVarName) {
          const cats=[...new Set(ds.cases.map(r=>String(r[xVarName]!=null?r[xVarName]:'')).filter(Boolean))].slice(0,30);
          if (yVarNames&&yVarNames[0]) {
            const means=cats.map(c=>{
              const vs=ds.cases.filter(r=>String(r[xVarName]!=null?r[xVarName]:'')==c).map(r=>r[yVarNames[0]]).filter(v=>typeof v==='number'&&isFinite(v));
              return vs.length?Stats.mean(vs):0;
            });
            Charts.barChart(chartId, cats, means, yVarNames[0]+' by '+xVarName, xVarName);
          } else {
            const counts=cats.map(c=>ds.cases.filter(r=>String(r[xVarName]!=null?r[xVarName]:'')==c).length);
            Charts.barChart(chartId, cats, counts, 'Frequencies: '+xVarName, xVarName);
          }
        } else if (chartType==='pie' && xVarName) {
          const allVals=ds.cases.map(r=>String(r[xVarName]!=null?r[xVarName]:'')).filter(Boolean);
          const catCount={};
          allVals.forEach(v=>{ catCount[v]=(catCount[v]||0)+1; });
          const sorted=Object.entries(catCount).sort((a,b)=>b[1]-a[1]).slice(0,20);
          Charts.pieChart(chartId, sorted.map(e=>e[0]), sorted.map(e=>e[1]), 'Pie Chart: '+xVarName);
        } else if (chartType==='line' && xVarName && yVarNames&&yVarNames.length) {
          Charts.lineChart(chartId, ds.cases.map(r=>r[xVarName]),
            yVarNames.map(yn=>({name:yn,data:ds.cases.map(r=>r[yn])})), 'Line: '+yVarNames.join(', '));
        }
      } catch(e) {
        const dom=document.getElementById(chartId);
        if(dom) dom.innerHTML='<div class="graph-error-box"><div class="graph-error-title">\u26A0 Chart Error</div><div>'+e.message+'</div></div>';
      }
    }, 50);
  }

  function drawGraph(ds, chartType, xVarName, yVarNames, groupVarName) {
    const area = document.getElementById('graph-canvas-area');
    if (!area) return;
    const chartId = 'graph_' + uuid();
    area.innerHTML = '';
    const wrapper = el('div', { class:'graph-output-wrap' });
    const titleStr = `${chartType}: ${xVarName || ''}`;
    const titleEl = el('div', { class:'graph-title' }, titleStr);
    const chartDiv = el('div', { id:chartId, class:'graph-chart' });
    wrapper.append(titleEl, chartDiv);
    area.appendChild(wrapper);
    drawGraphInto(ds, chartType, xVarName, yVarNames, groupVarName, chartId, false);
    // Register with ChartExportManager after chart is initialised (next tick)
    setTimeout(() => {
      const dom = document.getElementById(chartId);
      const inst = dom && typeof echarts !== 'undefined' ? echarts.getInstanceByDom(dom) : null;
      if (inst) {
        ChartExportManager.register({
          id: chartId, title: titleStr,
          chartType: chartType.toLowerCase().replace(/[^a-z]/g, '_'),
          instance: inst, sourceModule: 'graphs',
          metadata: { type: chartType, variable: xVarName || '' }
        });
        wrapper.appendChild(ChartExportManager.buildToolbar(chartId));
      }
    }, 200);
  }

  function exportChart(chartId) {
    ChartExportManager.downloadPNG(chartId);
  }

  return { init, render };
})();

/* ══════════════════════════════════════════════════════════════════
   SECTION 18: APP SHELL v2 — Liquid Glass Design
   ══════════════════════════════════════════════════════════════════ */

/* ── Tooltip System ─────────────────────────────────────────────── */