const ChartExportManager = (() => {
  /* Registry: id → { id, title, chartType, instance, sourceModule, createdAt, metadata } */
  const _registry = new Map();

  function register(entry) {
    if (!entry || !entry.id) return;
    _registry.set(entry.id, { createdAt: new Date().toISOString(), ...entry });
  }

  function unregister(id) { _registry.delete(id); }
  function get(id) { return _registry.get(id) || null; }
  function getAll() { return [..._registry.values()]; }

  /* ── i18n helper ── */
  function _t(en, id) {
    return (typeof I18N !== 'undefined' && I18N.getLang() === 'id') ? id : en;
  }

  /* ── filename helper ── */
  function _filename(chartType, ext) {
    const ts = Date.now();
    return `sociostat_${(chartType || 'chart').replace(/[^a-z0-9]/gi, '_')}_${ts}.${ext}`;
  }

  /* ── PNG export (ECharts canvas OR generic element via html2canvas fallback) ── */
  function downloadPNG(chartId) {
    const entry = _registry.get(chartId);
    if (!entry) { notify('Chart not found: ' + chartId, 'error'); return; }

    // ECharts instance
    const inst = entry.instance;
    if (inst && typeof inst.getDataURL === 'function') {
      try {
        const url = inst.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#ffffff' });
        _triggerDownload(url, _filename(entry.chartType, 'png'));
        return;
      } catch(e) { notify('PNG export failed: ' + e.message, 'error'); return; }
    }

    // SVG element fallback (used by StudentTUI)
    const svgEl = entry.svgElement || document.getElementById(chartId);
    if (svgEl && svgEl.tagName === 'svg') {
      _svgToPNG(svgEl, _filename(entry.chartType, 'png'));
      return;
    }

    notify(_t('PNG export: no chart instance found.', 'Ekspor PNG: instance chart tidak ditemukan.'), 'error');
  }

  /* ── SVG export ── */
  function downloadSVG(chartId) {
    const entry = _registry.get(chartId);
    if (!entry) { notify('Chart not found: ' + chartId, 'error'); return; }

    // ECharts SVG renderer
    const inst = entry.instance;
    if (inst && typeof inst.getDataURL === 'function') {
      // ECharts only supports PNG via getDataURL when using canvas renderer
      // For SVG export from canvas: disable and show message
      const dom = inst.getDom ? inst.getDom() : null;
      notify(_t(
        'SVG export is not supported for this chart type (canvas renderer). Use PNG instead.',
        'Ekspor SVG tidak tersedia untuk jenis chart ini. Gunakan PNG.'
      ), 'warning', 4000);
      return;
    }

    // Native SVG element
    const svgEl = entry.svgElement || document.getElementById(chartId);
    if (svgEl && svgEl.tagName === 'svg') {
      try {
        const serial = new XMLSerializer().serializeToString(svgEl);
        const blob = new Blob([serial], { type: 'image/svg+xml' });
        _triggerDownload(URL.createObjectURL(blob), _filename(entry.chartType, 'svg'));
        return;
      } catch(e) { notify('SVG export failed: ' + e.message, 'error'); return; }
    }

    notify(_t('SVG export is not supported by this chart type.', 'Ekspor SVG tidak tersedia.'), 'warning');
  }

  /* ── PDF export ── */
  function downloadPDF(chartId) {
    const entry = _registry.get(chartId);
    if (!entry) { notify('Chart not found: ' + chartId, 'error'); return; }

    const JsPDF = (typeof window !== 'undefined') && (window.jspdf?.jsPDF || window.jsPDF);
    if (!JsPDF) {
      notify(_t(
        'PDF export unavailable — jsPDF library not loaded. PNG is available.',
        'PDF tidak tersedia — library jsPDF belum dimuat. Gunakan PNG.'
      ), 'warning', 5000);
      return;
    }

    // Get image data first, then build PDF
    function buildPDF(imgData, imgW, imgH) {
      try {
        const pageW = imgW + 80, pageH = imgH + 120;
        const doc = new JsPDF({ orientation: imgW > imgH ? 'landscape' : 'portrait', unit: 'pt', format: [pageW, pageH] });
        doc.setFontSize(14); doc.setFont('helvetica', 'bold');
        const title = entry.title || "SOCIOSTAT Chart";
        doc.text('SOCIOSTAT — ' + title, pageW / 2, 28, { align: 'center' });
        if (entry.metadata) {
          doc.setFontSize(10); doc.setFont('helvetica', 'normal');
          const meta = Object.entries(entry.metadata).map(([k, v]) => `${k} = ${v}`).join('   ');
          doc.text(meta, pageW / 2, 44, { align: 'center' });
        }
        doc.addImage(imgData, 'PNG', 40, 60, imgW, imgH);
        doc.save(_filename(entry.chartType, 'pdf'));
      } catch(e) { notify('PDF export failed: ' + e.message, 'error'); }
    }

    const inst = entry.instance;
    if (inst && typeof inst.getDataURL === 'function') {
      try {
        const url = inst.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#ffffff' });
        const img = new Image(); img.onload = () => buildPDF(url, img.width / 2, img.height / 2);
        img.src = url;
        return;
      } catch(e) { notify('PDF export failed: ' + e.message, 'error'); return; }
    }

    const svgEl = entry.svgElement || document.getElementById(chartId);
    if (svgEl && svgEl.tagName === 'svg') {
      const W = parseInt(svgEl.getAttribute('width') || 560);
      const H = parseInt(svgEl.getAttribute('height') || 320);
      _svgToPNGData(svgEl, W * 2, H * 2, dataUrl => buildPDF(dataUrl, W, H));
      return;
    }

    notify(_t('PDF export: no chart data available.', 'PDF: data chart tidak tersedia.'), 'error');
  }

  /* ── Copy to clipboard ── */
  function copy(chartId) {
    const entry = _registry.get(chartId);
    if (!entry) return;
    const inst = entry.instance;
    if (inst && typeof inst.getDataURL === 'function') {
      try {
        const url = inst.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#ffffff' });
        _clipboardFromDataURL(url);
        return;
      } catch(e) {}
    }
    notify(_t('Copy not supported for this chart.', 'Salin tidak tersedia untuk chart ini.'), 'warning');
  }

  /* ── Add to Output ── */
  function addToOutput(chartId) {
    const entry = _registry.get(chartId);
    if (!entry) { notify('Chart not found.', 'error'); return; }
    if (typeof Output === 'undefined') return;

    const inst = entry.instance;
    let imgData = '';
    if (inst && typeof inst.getDataURL === 'function') {
      try { imgData = inst.getDataURL({ type: 'png', pixelRatio: 1.5, backgroundColor: '#ffffff' }); } catch(e) {}
    }

    const metaHtml = entry.metadata
      ? Object.entries(entry.metadata).map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')
      : '';
    const imgHtml = imgData ? `<img src="${imgData}" style="max-width:100%;height:auto;border-radius:6px;display:block;margin:10px 0;" alt="${entry.title}">` : '';

    const htmlOutput = `
      <div class="output-section">
        <h3 class="output-title">${entry.title || 'Chart'}</h3>
        ${imgHtml}
        ${metaHtml ? `<table class="pivot-table"><thead><tr><th>Parameter</th><th>Value</th></tr></thead><tbody>${metaHtml}</tbody></table>` : ''}
      </div>`;

    Output.addResult(entry.sourceModule || 'chart', {
      status: 'complete',
      result: { html: htmlOutput, text: entry.title || 'Chart', data: entry.metadata },
      warnings: []
    }, { chartType: entry.chartType });

    if (typeof App !== 'undefined') App.navigate('output');
    notify(_t('Chart added to Output', 'Chart ditambahkan ke Output'), 'success');
  }

  /* ── Build a universal toolbar DOM element ── */
  function buildToolbar(chartId) {
    const bar = el('div', { class: 'cem-toolbar' });
    bar.appendChild(el('span', { class: 'cem-toolbar-label' }, _t('Download:', 'Unduh:')));

    function btn(label, action, classes) {
      return el('button', { class: 'cem-btn ' + (classes || ''), onclick: action }, label);
    }

    bar.appendChild(btn(_t('PNG', 'PNG'), () => downloadPNG(chartId)));
    bar.appendChild(btn(_t('SVG', 'SVG'), () => downloadSVG(chartId)));
    bar.appendChild(btn(_t('PDF', 'PDF'), () => downloadPDF(chartId)));
    bar.appendChild(btn('📋 ' + _t('Add to Output', 'Tambahkan ke Output'), () => addToOutput(chartId), 'cem-btn-primary'));
    return bar;
  }

  /* ── Batch: download all registered charts as PNG ── */
  function downloadAll() {
    const all = getAll();
    if (!all.length) { notify(_t('No charts to download.', 'Tidak ada chart untuk diunduh.'), 'warning'); return; }
    all.forEach((entry, i) => {
      setTimeout(() => downloadPNG(entry.id), i * 400); // stagger to avoid browser blocking
    });
    notify(_t(`Downloading ${all.length} chart(s)…`, `Mengunduh ${all.length} chart…`), 'info');
  }

  /* ── Internal helpers ── */
  function _triggerDownload(url, filename) {
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    if (url.startsWith('blob:')) URL.revokeObjectURL(url);
  }

  function _svgToPNG(svgEl, filename) {
    _svgToPNGData(svgEl,
      parseInt(svgEl.getAttribute('width') || 560) * 2,
      parseInt(svgEl.getAttribute('height') || 320) * 2,
      dataUrl => _triggerDownload(dataUrl, filename));
  }

  function _svgToPNGData(svgEl, W, H, callback) {
    try {
      const serial = new XMLSerializer().serializeToString(svgEl);
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, W, H);
        callback(canvas.toDataURL('image/png'));
      };
      img.onerror = () => notify('PNG rasterisation failed.', 'error');
      img.src = URL.createObjectURL(new Blob([serial], { type: 'image/svg+xml' }));
    } catch(e) { notify('PNG export failed: ' + e.message, 'error'); }
  }

  function _clipboardFromDataURL(dataUrl) {
    fetch(dataUrl).then(r => r.blob()).then(blob => {
      navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
        .then(() => notify(_t('Chart copied to clipboard.', 'Chart disalin ke clipboard.'), 'success'))
        .catch(() => notify(_t('Clipboard copy failed.', 'Gagal menyalin.'), 'error'));
    }).catch(() => notify(_t('Clipboard copy failed.', 'Gagal menyalin.'), 'error'));
  }

  return {
    register, unregister, get, getAll,
    downloadPNG, downloadSVG, downloadPDF, copy, addToOutput,
    buildToolbar, downloadAll
  };
})();

/* ══════════════════════════════════════════════════════════════════
   SECTION 11: CHART ENGINE
   ══════════════════════════════════════════════════════════════════ */

const Charts = (() => {
  function getChart(id) {
    const dom=document.getElementById(id);
    if(!dom) return null;
    if(typeof echarts === 'undefined') {
      dom.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;flex-direction:column;gap:10px;color:#6b7280;font-size:13px;">' +
        '<span style="font-size:22px;">📊</span>' +
        '<span>Chart library is still loading or unavailable.</span>' +
        '<button class="btn btn-sm" onclick="LibraryLoader.retry(\'echarts\').then(()=>{ this.closest(\'[id]\') && (document.getElementById(this.closest(\'[id]\').id).innerHTML=\'\'); })">Retry</button>' +
        '</div>';
      return null;
    }
    // Dispose old instance
    const old=echarts.getInstanceByDom(dom);
    if(old) old.dispose();
    return echarts.init(dom, null, { renderer:'canvas' });
  }

  function histogram(domId, values, title='Histogram', variable='') {
    const chart=getChart(domId); if(!chart) return;
    const vals=values.filter(v=>typeof v==='number'&&isFinite(v));
    if(!vals.length) return;
    const mn=Math.min(...vals), mx=Math.max(...vals);
    const bins=Math.max(5,Math.min(30,Math.ceil(Math.sqrt(vals.length))));
    const w=(mx-mn)/bins;
    const counts=new Array(bins).fill(0);
    vals.forEach(v=>{ let i=Math.floor((v-mn)/w); if(i>=bins)i=bins-1; counts[i]++; });
    const labels=counts.map((_,i)=>fmt(mn+i*w+w/2,2));
    chart.setOption({ title:{text:title,left:'center',textStyle:{fontSize:13}},
      tooltip:{trigger:'axis'},
      xAxis:{type:'category',data:labels,name:variable},
      yAxis:{type:'value',name:'Frequency'},
      series:[{type:'bar',data:counts,itemStyle:{color:'#3b82d4'},barCategoryGap:'5%'}]
    });
  }

  function boxplot(domId, groups, title='Boxplot') {
    // groups: { groupName: [values...] }
    const chart=getChart(domId); if(!chart) return;
    const names=Object.keys(groups);
    const data=names.map(n=>{
      const v=groups[n].filter(x=>typeof x==='number'&&isFinite(x)).sort((a,b)=>a-b);
      if(!v.length) return [0,0,0,0,0];
      const q1=Stats.quantile(v,0.25), q2=Stats.quantile(v,0.5), q3=Stats.quantile(v,0.75);
      return [v[0],q1,q2,q3,v[v.length-1]];
    });
    chart.setOption({
      title:{text:title,left:'center',textStyle:{fontSize:13}},
      tooltip:{trigger:'item'},
      xAxis:{type:'category',data:names},
      yAxis:{type:'value'},
      series:[{type:'boxplot',data,itemStyle:{color:'#e6f0ff',borderColor:'#3b82d4'}}]
    });
  }

  function scatterPlot(domId, xVals, yVals, xLabel='X', yLabel='Y', title='Scatterplot') {
    const chart=getChart(domId); if(!chart) return;
    const data=xVals.map((x,i)=>[x,yVals[i]]).filter(d=>d[0]!=null&&d[1]!=null&&isFinite(d[0])&&isFinite(d[1]));
    chart.setOption({
      title:{text:title,left:'center',textStyle:{fontSize:13}},
      tooltip:{trigger:'item',formatter:p=>`${xLabel}: ${p.data[0].toFixed(3)}<br>${yLabel}: ${p.data[1].toFixed(3)}`},
      xAxis:{name:xLabel,nameLocation:'middle',nameGap:25},
      yAxis:{name:yLabel,nameLocation:'middle',nameGap:35},
      series:[{type:'scatter',data,symbolSize:6,itemStyle:{color:'#3b82d4',opacity:0.7}}]
    });
  }

  function scatterResiduals(domId, predicted, residuals) {
    scatterPlot(domId,predicted,residuals,'Predicted Value','Std. Residual','Residuals vs. Predicted');
  }

  function barChart(domId, categories, values, title='Bar Chart', label='') {
    const chart=getChart(domId); if(!chart) return;
    chart.setOption({
      title:{text:title,left:'center',textStyle:{fontSize:13}},
      tooltip:{trigger:'axis'},
      xAxis:{type:'category',data:categories,name:label},
      yAxis:{type:'value'},
      series:[{type:'bar',data:values,itemStyle:{color:'#3b82d4'}}]
    });
  }

  function screePlot(domId, eigenvalues) {
    const chart=getChart(domId); if(!chart) return;
    const labels=eigenvalues.map((_,i)=>`F${i+1}`);
    chart.setOption({
      title:{text:'Scree Plot',left:'center',textStyle:{fontSize:13}},
      tooltip:{trigger:'axis'},
      xAxis:{type:'category',data:labels,name:'Component'},
      yAxis:{type:'value',name:'Eigenvalue'},
      series:[
        {type:'line',data:eigenvalues,name:'Eigenvalue',itemStyle:{color:'#3b82d4'},markLine:{data:[{yAxis:1,lineStyle:{color:'red',type:'dashed'},label:{formatter:'λ=1'}}]}},
        {type:'scatter',data:eigenvalues,name:'',itemStyle:{color:'#3b82d4'},symbolSize:8}
      ]
    });
  }

  function qqPlot(domId, values, title='Q-Q Plot') {
    const chart=getChart(domId); if(!chart) return;
    const sorted=values.filter(v=>typeof v==='number'&&isFinite(v)).sort((a,b)=>a-b);
    const n=sorted.length;
    const expected=sorted.map((_,i)=>{
      const p=(i+0.5)/n;
      // Rational approximation for inverse normal
      let q; const c0=2.515517,c1=0.802853,c2=0.010328,d1=1.432788,d2=0.189269,d3=0.001308;
      const pp=p<0.5?p:1-p; const t2=Math.sqrt(-2*Math.log(pp));
      q=t2-(c0+c1*t2+c2*t2**2)/(1+d1*t2+d2*t2**2+d3*t2**3);
      return p<0.5?-q:q;
    });
    const mn=Stats.mean(sorted), sd=Stats.std(sorted);
    const lineX=[expected[0],expected[n-1]];
    const lineY=[expected[0]*sd+mn, expected[n-1]*sd+mn];
    chart.setOption({
      title:{text:title,left:'center',textStyle:{fontSize:13}},
      tooltip:{trigger:'item'},
      xAxis:{name:'Theoretical Quantile',nameLocation:'middle',nameGap:25},
      yAxis:{name:'Observed Value',nameLocation:'middle',nameGap:35},
      series:[
        {type:'scatter',data:expected.map((e,i)=>[e,sorted[i]]),symbolSize:5,itemStyle:{color:'#3b82d4',opacity:0.7}},
        {type:'line',data:lineX.map((x,i)=>[x,lineY[i]]),lineStyle:{color:'red',width:1},symbol:'none',itemStyle:{color:'red'}}
      ]
    });
  }

  function kaplanMeier(domId, result) {
    const chart=getChart(domId); if(!chart) return;
    const series=[];
    // Engine returns survival_curves:{key:[{t,survival,n_risk,n_event,n_censor}]}
    const curves=result.survival_curves||result.groups||{};
    Object.entries(curves).forEach(([gname,steps])=>{
      if(!steps||!steps.length) return;
      const label = gname==='all'?'Overall':gname;
      series.push({type:'line',name:label,data:steps.map(s=>[s.t,s.survival]),step:'end',symbol:'none'});
    });
    chart.setOption({
      title:{text:'Kaplan-Meier Survival Curve',left:'center',textStyle:{fontSize:13}},
      tooltip:{trigger:'axis'},
      xAxis:{type:'value',name:'Time',nameLocation:'middle',nameGap:25},
      yAxis:{type:'value',min:0,max:1,name:'Survival Probability',nameLocation:'middle',nameGap:40},
      legend:{bottom:0},
      series
    });
  }

  function lineChart(domId, xData, series, title='Line Chart') {
    const chart=getChart(domId); if(!chart) return;
    chart.setOption({
      title:{text:title,left:'center',textStyle:{fontSize:13}},
      tooltip:{trigger:'axis'},
      xAxis:{type:'category',data:xData},
      yAxis:{type:'value'},
      legend:{bottom:0},
      series:series.map(s=>({type:'line',name:s.name,data:s.data}))
    });
  }

  function pieChart(domId, labels, values, title='Pie Chart') {
    const chart=getChart(domId); if(!chart) return;
    chart.setOption({
      title:{text:title,left:'center',textStyle:{fontSize:13}},
      tooltip:{trigger:'item',formatter:'{b}: {c} ({d}%)'},
      legend:{bottom:0,type:'scroll'},
      series:[{type:'pie',radius:['30%','65%'],data:labels.map((l,i)=>({name:l,value:values[i]})),
        label:{formatter:'{b}\n{d}%'},emphasis:{itemStyle:{shadowBlur:10,shadowColor:'rgba(0,0,0,0.3)'}}}]
    });
  }

  return { histogram, boxplot, scatterPlot, scatterResiduals, barChart, screePlot, qqPlot, kaplanMeier, lineChart, pieChart };
})();

/* ══════════════════════════════════════════════════════════════════
   SECTION 12: SYNTAX EDITOR
   ══════════════════════════════════════════════════════════════════ */
