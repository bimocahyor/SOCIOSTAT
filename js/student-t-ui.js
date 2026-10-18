const StudentTUI = (() => {

  let _activeMode = 'critical'; // 'critical' | 'probability' | 'test'

  /* ── i18n helpers ── */
  function t(en, id) { return (typeof _appMode !== 'undefined' && typeof I18N !== 'undefined' && I18N.getLang() === 'id') ? id : en; }

  /* ── Modal shell ── */
  function open() {
    const existing = document.getElementById('student-t-overlay');
    if (existing) existing.remove();

    const overlay = el('div', { id: 'student-t-overlay', class: 'dialog-overlay' });
    const box = el('div', { class: 'dialog-box st-modal-box' });

    box.appendChild(el('div', { class: 'dialog-header' },
      el('h2', { style: { fontSize: '15px', fontWeight: '700' } }, '📐 ' + t("Student's t Distribution", "Distribusi t Student")),
      el('button', { class: 'dialog-close', onclick: () => overlay.remove() }, '×')
    ));

    // Mode tabs
    const modeTabBar = el('div', { class: 'prob-sub-tabs' });
    const MODES = [
      { id: 'critical',    labelEn: 'Find Critical t',       labelId: 'Cari t Kritis' },
      { id: 'probability', labelEn: 'Probability / p-value', labelId: 'Probabilitas / p-value' },
      { id: 'test',        labelEn: 'Test t Statistic',      labelId: 'Uji Statistik t' },
      { id: 'diagnostics', labelEn: '🔬 Diagnostics',        labelId: '🔬 Diagnostik' },
    ];

    const contentEl = el('div', { class: 'st-modal-content' });

    function switchMode(id) {
      _activeMode = id;
      modeTabBar.querySelectorAll('.prob-sub-tab').forEach(b =>
        b.classList.toggle('active', b.dataset.id === id));
      contentEl.innerHTML = '';
      if (id === 'critical')         renderCriticalMode(contentEl);
      else if (id === 'probability') renderProbabilityMode(contentEl);
      else if (id === 'test')        renderTestMode(contentEl);
      else                           renderDiagnosticsMode(contentEl);
    }

    MODES.forEach(m => {
      const btn = el('button', {
        class: `prob-sub-tab${_activeMode === m.id ? ' active' : ''}`,
        'data-id': m.id,
        onclick: () => switchMode(m.id)
      }, t(m.labelEn, m.labelId));
      modeTabBar.appendChild(btn);
    });

    box.appendChild(modeTabBar);
    box.appendChild(contentEl);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    switchMode(_activeMode);
  }

  /* ════════════════════════════════════════════════════
     SHARED FORM HELPERS
  ════════════════════════════════════════════════════ */

  /** Single text input field */
  function numField(label, key, state, placeholder, hint, onEnter) {
    const wrap = el('div', { class: 'st-field' });
    wrap.appendChild(el('label', { class: 'st-label' }, label));
    const inp = el('input', {
      type: 'text', class: 'form-control st-input',
      placeholder, value: state[key] != null ? state[key] : '',
      oninput: e => { state[key] = e.target.value; },
    });
    if (onEnter) inp.addEventListener('keydown', e => { if (e.key === 'Enter') onEnter(); });
    wrap.appendChild(inp);
    if (hint) wrap.appendChild(el('div', { class: 'st-hint' }, hint));
    return { wrap, inp };
  }

  /**
   * Alpha selector: preset dropdown + optional custom numeric input.
   * Shows ONLY the dropdown for preset values.
   * Shows the custom input ONLY when "Custom" is selected.
   */
  function alphaField(state, key, onEnter) {
    const wrap = el('div', { class: 'st-field' });
    wrap.appendChild(el('label', { class: 'st-label' }, t('Significance level (α)', 'Tingkat signifikansi (α)')));

    const PRESETS = ['0.25', '0.10', '0.05', '0.025', '0.01'];
    const isPreset = v => PRESETS.includes(String(v));

    const sel = el('select', { class: 'form-control st-input' });
    PRESETS.forEach(v => sel.appendChild(el('option', { value: v }, v)));
    sel.appendChild(el('option', { value: '__custom__' }, t('Custom…', 'Lainnya…')));

    const customWrap = el('div', { class: 'st-custom-alpha', style: { display: 'none', marginTop: '6px' } });
    const customInp = el('input', {
      type: 'text', class: 'form-control st-input',
      placeholder: t('e.g. 0.0375', 'mis. 0.0375'),
      value: (!isPreset(state[key]) && state[key]) ? state[key] : '',
    });
    customWrap.appendChild(customInp);
    customWrap.appendChild(el('div', { class: 'st-hint' }, t('Any value between 0 and 1', 'Nilai antara 0 dan 1')));
    if (onEnter) customInp.addEventListener('keydown', e => { if (e.key === 'Enter') onEnter(); });

    // Set initial select value
    const initVal = String(state[key] || '0.05');
    if (isPreset(initVal)) {
      sel.value = initVal;
    } else {
      sel.value = '__custom__';
      customWrap.style.display = '';
    }

    sel.addEventListener('change', () => {
      if (sel.value === '__custom__') {
        customWrap.style.display = '';
        customInp.value = state[key] && !isPreset(state[key]) ? state[key] : '';
        customInp.focus();
      } else {
        customWrap.style.display = 'none';
        state[key] = sel.value;
      }
    });
    customInp.addEventListener('input', () => { state[key] = customInp.value; });

    wrap.appendChild(sel);
    wrap.appendChild(customWrap);
    wrap.appendChild(el('div', { class: 'st-hint' }, t(
      'Table values: 0.25 / 0.10 / 0.05 / 0.025 / 0.01',
      'Nilai tabel: 0.25 / 0.10 / 0.05 / 0.025 / 0.01'
    )));
    return wrap;
  }

  /** Segmented tail selector — one active at a time, accent color */
  function tailField(state, key, onChange) {
    const wrap = el('div', { class: 'st-field' });
    wrap.appendChild(el('label', { class: 'st-label' }, t('Tail', 'Ekor')));
    const seg = el('div', { class: 'st-seg-group' });
    const OPTIONS = [
      { val: 'left',       en: '◀ Left',        id: '◀ Kiri' },
      { val: 'right',      en: 'Right ▶',       id: 'Kanan ▶' },
      { val: 'two-tailed', en: '↔ Two-tailed',  id: '↔ Dua Sisi' },
    ];
    const btns = OPTIONS.map(opt => {
      const btn = el('button', {
        class: 'st-seg-btn' + (state[key] === opt.val ? ' active' : ''),
        type: 'button',
        onclick: () => {
          state[key] = opt.val;
          btns.forEach((b, i) => b.classList.toggle('active', OPTIONS[i].val === opt.val));
          if (onChange) onChange(opt.val);
        }
      }, t(opt.en, opt.id));
      seg.appendChild(btn);
      return btn;
    });
    wrap.appendChild(seg);
    return wrap;
  }

  /** Compact help sidebar panel */
  function helpPanel(items) {
    const panel = el('div', { class: 'st-help-panel' });
    items.forEach(({ title, body }) => {
      panel.appendChild(el('div', { class: 'st-help-item' },
        el('div', { class: 'st-help-title' }, title),
        el('div', { class: 'st-help-body' }, body)
      ));
    });
    return panel;
  }

  /* ════════════════════════════════════════════════════
     GRAPH (enlarged SVG, full labels)
  ════════════════════════════════════════════════════ */

  function renderTCurve(container, opts, chartId) {
    const { df, alpha, tail, criticalValueAbs, tValue, mode, label } = opts;
    const dfSafe = Math.max(1, Number(df) || 1);
    // Dynamic x-range: for small df the tails are very heavy; for df≥30 ±4 is enough
    const xMax = Math.max(4, Math.min(8, (criticalValueAbs || Math.abs(tValue) || 2) * 1.35));
    const tRange = [-xMax, xMax];

    const W = 560, H = 320;
    const pad = { l: 48, r: 48, t: 64, b: 48 };
    const gW = W - pad.l - pad.r, gH = H - pad.t - pad.b;

    /* lgamma via Lanczos — same coefficients as in the engine */
    function lgamma(x) {
      if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
      x -= 1;
      const c = [0.99999999999980993,676.5203681218851,-1259.1392167224028,
        771.32342877765313,-176.61502916214059,12.507343278686905,
        -0.13857109526572012,9.9843695780195716e-6,1.5056327351493116e-7];
      let s = c[0];
      for (let i = 1; i < 9; i++) s += c[i] / (x + i);
      const tt = x + 7.5;
      return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(tt) - tt + Math.log(s);
    }
    function tPdf(tv, df) {
      const a = (df + 1) / 2, b = df / 2;
      const lnC = lgamma(a) - 0.5 * Math.log(df * Math.PI) - lgamma(b);
      return Math.exp(lnC - a * Math.log(1 + tv * tv / df));
    }

    const pdfMax = tPdf(0, dfSafe);
    function xToSvg(tv) { return pad.l + (tv - tRange[0]) / (tRange[1] - tRange[0]) * gW; }
    function yToSvg(p)  { return pad.t + gH - (p / pdfMax) * gH * 0.9; }

    const STEPS = 300;
    const pts = [];
    for (let i = 0; i <= STEPS; i++) {
      const tv = tRange[0] + (tRange[1] - tRange[0]) * i / STEPS;
      pts.push([xToSvg(tv), yToSvg(tPdf(tv, dfSafe))]);
    }
    const curvePath = 'M' + pts.map(p => p.join(',')).join('L');
    const baselineY = pad.t + gH;

    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    if (chartId) svg.id = chartId;
    svg.setAttribute('width', W); svg.setAttribute('height', H);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('class', 'st-chart-svg');
    svg.setAttribute('data-df', dfSafe);
    // white background for export
    const bg = document.createElementNS(ns, 'rect');
    bg.setAttribute('width', W); bg.setAttribute('height', H);
    bg.setAttribute('fill', '#ffffff');
    svg.appendChild(bg);

    /* shade helper */
    function shade(from, to, color) {
      const zF = Math.max(tRange[0], from), zT = Math.min(tRange[1], to);
      if (zF >= zT) return;
      const p2 = [];
      for (let i = 0; i <= 120; i++) {
        const tv = zF + (zT - zF) * i / 120;
        p2.push([xToSvg(tv), yToSvg(tPdf(tv, dfSafe))]);
      }
      const d = `M${xToSvg(zF)},${baselineY} L${p2.map(p=>p.join(',')).join('L')} L${xToSvg(zT)},${baselineY} Z`;
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d', d); path.setAttribute('fill', color); path.setAttribute('opacity', '0.38');
      svg.appendChild(path);
    }

    /* acceptance region highlight */
    const critAbs = criticalValueAbs != null ? criticalValueAbs : (tValue != null ? Math.abs(tValue) : 2);
    if (tail === 'two-tailed') {
      shade(-critAbs, critAbs, '#dcfce7');   // acceptance (green tint)
      shade(tRange[0], -critAbs, '#7c5cd8'); // left rejection
      shade(critAbs, tRange[1], '#7c5cd8');  // right rejection
    } else if (tail === 'right') {
      shade(tRange[0], critAbs, '#dcfce7');
      shade(critAbs, tRange[1], '#e6871e');
    } else {
      shade(-critAbs, tRange[1], '#dcfce7');
      shade(tRange[0], -critAbs, '#3b82d4');
    }

    /* observed t line (test mode) */
    if (mode === 'test' && tValue != null) {
      const xObs = xToSvg(tValue);
      const ln = document.createElementNS(ns, 'line');
      ln.setAttribute('x1', xObs); ln.setAttribute('y1', pad.t);
      ln.setAttribute('x2', xObs); ln.setAttribute('y2', baselineY);
      ln.setAttribute('stroke', '#dc2626'); ln.setAttribute('stroke-width', '2.5');
      svg.appendChild(ln);
      const lbl = document.createElementNS(ns, 'text');
      lbl.setAttribute('x', xObs + 4); lbl.setAttribute('y', pad.t + 12);
      lbl.setAttribute('font-size', '10'); lbl.setAttribute('fill', '#dc2626');
      lbl.textContent = `t=${Number(tValue).toFixed(3)}`;
      svg.appendChild(lbl);
    }

    /* curve */
    const curveEl = document.createElementNS(ns, 'path');
    curveEl.setAttribute('d', curvePath); curveEl.setAttribute('fill', 'none');
    curveEl.setAttribute('stroke', '#1f2328'); curveEl.setAttribute('stroke-width', '2.2');
    svg.appendChild(curveEl);

    /* baseline */
    const bl = document.createElementNS(ns, 'line');
    bl.setAttribute('x1', pad.l); bl.setAttribute('y1', baselineY);
    bl.setAttribute('x2', W - pad.r); bl.setAttribute('y2', baselineY);
    bl.setAttribute('stroke', '#6b7280'); bl.setAttribute('stroke-width', '1');
    svg.appendChild(bl);

    /* axis tick helpers */
    function xTick(tv, lbl, color) {
      const xp = xToSvg(tv);
      if (xp < pad.l - 4 || xp > W - pad.r + 4) return;
      const tk = document.createElementNS(ns, 'line');
      tk.setAttribute('x1', xp); tk.setAttribute('y1', baselineY);
      tk.setAttribute('x2', xp); tk.setAttribute('y2', baselineY + 5);
      tk.setAttribute('stroke', color || '#6b7280'); tk.setAttribute('stroke-width', '1');
      svg.appendChild(tk);
      const tx = document.createElementNS(ns, 'text');
      tx.setAttribute('x', xp); tx.setAttribute('y', baselineY + 16);
      tx.setAttribute('text-anchor', 'middle'); tx.setAttribute('font-size', '11');
      tx.setAttribute('fill', color || '#374151'); tx.textContent = lbl;
      svg.appendChild(tx);
    }

    /* standard axis ticks */
    [-3, -2, -1, 0, 1, 2, 3].forEach(v => {
      if (Math.abs(v) <= xMax) xTick(v, String(v), '#9ca3af');
    });

    /* critical value dashed markers */
    function critMarker(tv, color, lbl) {
      const xp = xToSvg(tv);
      if (xp < pad.l - 4 || xp > W - pad.r + 4) return;
      const ln = document.createElementNS(ns, 'line');
      ln.setAttribute('x1', xp); ln.setAttribute('y1', pad.t);
      ln.setAttribute('x2', xp); ln.setAttribute('y2', baselineY);
      ln.setAttribute('stroke', color); ln.setAttribute('stroke-width', '1.8');
      ln.setAttribute('stroke-dasharray', '5,3');
      svg.appendChild(ln);
      // label above baseline
      const tx = document.createElementNS(ns, 'text');
      tx.setAttribute('x', xp); tx.setAttribute('y', baselineY + 30);
      tx.setAttribute('text-anchor', 'middle'); tx.setAttribute('font-size', '11');
      tx.setAttribute('font-weight', '700'); tx.setAttribute('fill', color);
      tx.textContent = lbl;
      svg.appendChild(tx);
    }

    const critDisplay = critAbs.toFixed(3);
    if (tail === 'two-tailed') {
      critMarker(-critAbs, '#7c5cd8', `−${critDisplay}`);
      critMarker( critAbs, '#7c5cd8', `+${critDisplay}`);
    } else if (tail === 'right') {
      critMarker(critAbs, '#e6871e', `+${critDisplay}`);
    } else {
      critMarker(-critAbs, '#3b82d4', `−${critDisplay}`);
    }

    /* chart title block (top) */
    const titleLine1 = document.createElementNS(ns, 'text');
    titleLine1.setAttribute('x', W / 2); titleLine1.setAttribute('y', 18);
    titleLine1.setAttribute('text-anchor', 'middle'); titleLine1.setAttribute('font-size', '13');
    titleLine1.setAttribute('font-weight', '700'); titleLine1.setAttribute('fill', '#1f2328');
    titleLine1.textContent = t("Student's t Distribution", "Distribusi t Student");
    svg.appendChild(titleLine1);

    const metaStr = `df = ${dfSafe}   α = ${alpha != null ? alpha : '—'}   ${
      tail === 'two-tailed' ? t('Two-tailed', 'Dua Sisi') :
      tail === 'right'      ? t('Right-tailed', 'Ekor Kanan') :
                              t('Left-tailed', 'Ekor Kiri')}`;
    const titleLine2 = document.createElementNS(ns, 'text');
    titleLine2.setAttribute('x', W / 2); titleLine2.setAttribute('y', 36);
    titleLine2.setAttribute('text-anchor', 'middle'); titleLine2.setAttribute('font-size', '11');
    titleLine2.setAttribute('fill', '#6b7280');
    titleLine2.textContent = metaStr;
    svg.appendChild(titleLine2);

    /* legend */
    function legendDot(cx, cy, color, lbl) {
      const r = document.createElementNS(ns, 'rect');
      r.setAttribute('x', cx); r.setAttribute('y', cy - 7); r.setAttribute('width', 12); r.setAttribute('height', 8);
      r.setAttribute('fill', color); r.setAttribute('opacity', '0.45');
      svg.appendChild(r);
      const tx = document.createElementNS(ns, 'text');
      tx.setAttribute('x', cx + 15); tx.setAttribute('y', cy);
      tx.setAttribute('font-size', '10'); tx.setAttribute('fill', '#374151');
      tx.textContent = lbl;
      svg.appendChild(tx);
    }
    const rejColor = tail === 'two-tailed' ? '#7c5cd8' : tail === 'right' ? '#e6871e' : '#3b82d4';
    legendDot(pad.l, H - 8, rejColor, t('Rejection region', 'Daerah penolakan'));
    legendDot(pad.l + 130, H - 8, '#22c55e', t('Acceptance region', 'Daerah penerimaan'));

    container.appendChild(svg);
    return svg;
  }

  /* ════════════════════════════════════════════════════
     CHART EXPORT TOOLBAR (SVG-based chart only)
  ════════════════════════════════════════════════════ */

  function chartToolbar(svgEl, meta) {
    const bar = el('div', { class: 'st-chart-toolbar' });

    function downloadSVG() {
      try {
        const serial = new XMLSerializer().serializeToString(svgEl);
        const blob = new Blob([serial], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const a = el('a', { href: url, download: `sociostat_student_t_${Date.now()}.svg` });
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch(e) { notify('SVG export failed: ' + e.message, 'error'); }
    }

    function downloadPNG() {
      try {
        const serial = new XMLSerializer().serializeToString(svgEl);
        const img = new Image();
        const DPR = 2;
        const W = parseInt(svgEl.getAttribute('width')) * DPR;
        const H = parseInt(svgEl.getAttribute('height')) * DPR;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = W; canvas.height = H;
          const ctx = canvas.getContext('2d');
          ctx.scale(DPR, DPR);
          ctx.drawImage(img, 0, 0);
          canvas.toBlob(blob => {
            const url = URL.createObjectURL(blob);
            const a = el('a', { href: url, download: `sociostat_student_t_${Date.now()}.png` });
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }, 'image/png');
        };
        img.onerror = () => notify('PNG export failed — SVG could not be rasterised.', 'error');
        const blob = new Blob([serial], { type: 'image/svg+xml' });
        img.src = URL.createObjectURL(blob);
      } catch(e) { notify('PNG export failed: ' + e.message, 'error'); }
    }

    function downloadPDF() {
      if (typeof jspdf === 'undefined' && typeof window.jspdf === 'undefined' && typeof jsPDF === 'undefined') {
        notify(t('PDF export unavailable — jsPDF library not loaded. PNG is available.', 'PDF tidak tersedia. Gunakan PNG.'), 'warning', 4000);
        return;
      }
      try {
        const serial = new XMLSerializer().serializeToString(svgEl);
        const img = new Image();
        const W = parseInt(svgEl.getAttribute('width'));
        const H = parseInt(svgEl.getAttribute('height'));
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = W * 2; canvas.height = H * 2;
          const ctx = canvas.getContext('2d'); ctx.scale(2,2); ctx.drawImage(img, 0, 0);
          const imgData = canvas.toDataURL('image/png');
          const JsPDF = window.jspdf?.jsPDF || window.jsPDF;
          const doc = new JsPDF({ orientation: W > H ? 'landscape' : 'portrait', unit: 'pt', format: [W + 80, H + 120] });
          doc.setFontSize(14); doc.setFont('helvetica', 'bold');
          doc.text("SOCIOSTAT — Student's t Distribution", (W + 80) / 2, 30, { align: 'center' });
          if (meta) {
            doc.setFontSize(10); doc.setFont('helvetica', 'normal');
            const metaLine = `df = ${meta.df}   α = ${meta.alpha}   ${meta.tail}`;
            doc.text(metaLine, (W + 80) / 2, 46, { align: 'center' });
          }
          doc.addImage(imgData, 'PNG', 40, 60, W, H);
          doc.save(`sociostat_student_t_${Date.now()}.pdf`);
        };
        const blob = new Blob([serial], { type: 'image/svg+xml' });
        img.src = URL.createObjectURL(blob);
      } catch(e) { notify('PDF export failed: ' + e.message, 'error'); }
    }

    function addToOutputChart(r) {
      if (!r) { notify('No result to add.', 'warning'); return; }
      exportToOutput(r);
    }

    bar.appendChild(el('span', { class: 'st-chart-toolbar-label' }, t('Download:', 'Unduh:')));
    bar.appendChild(el('button', { class: 'btn btn-xs st-toolbar-btn', onclick: downloadPNG },
      t('PNG', 'PNG')));
    bar.appendChild(el('button', { class: 'btn btn-xs st-toolbar-btn', onclick: downloadSVG },
      t('SVG', 'SVG')));
    bar.appendChild(el('button', { class: 'btn btn-xs st-toolbar-btn', onclick: downloadPDF },
      t('PDF', 'PDF')));
    return { bar, downloadPNG, downloadSVG, downloadPDF };
  }

  /* ════════════════════════════════════════════════════
     MODE A: FIND CRITICAL t
  ════════════════════════════════════════════════════ */

  function renderCriticalMode(container) {
    const state = { df: '', alpha: '0.05', tail: 'two-tailed' };

    /* two-column layout */
    const layout = el('div', { class: 'st-layout' });
    const leftCol  = el('div', { class: 'st-col-left' });
    const rightCol = el('div', { class: 'st-col-right' });

    function doCalc() {
      graphArea.innerHTML = '';
      resultArea.innerHTML = '';
      const r = StudentTCalc.criticalT({ df: state.df, alpha: state.alpha, tail: state.tail });
      StudentTCalc.setLastResult(r);
      if (r.error) {
        resultArea.appendChild(stError(r.error,
          t('df must be a positive number; α must be between 0 and 1.',
            'df harus bilangan positif; α harus antara 0 dan 1.')));
        return;
      }
      const cid = 'st-chart-' + Date.now();
      const svgEl = renderTCurve(graphArea,
        { df: r.df, alpha: r.alpha, tail: r.tail,
          criticalValueAbs: r.criticalValueAbs, mode: 'critical' }, cid);
      const { bar } = chartToolbar(svgEl, { df: r.df, alpha: r.alpha, tail: r.tail });
      graphArea.appendChild(bar);
      renderCriticalResult(resultArea, r);
    }

    const { wrap: dfWrap, inp: dfInp } = numField(
      t('Degrees of freedom (df)', 'Derajat kebebasan (df)'),
      'df', state, t('e.g. 10', 'mis. 10'),
      t('Must be > 0 (usually n − 1)', 'Harus > 0 (biasanya n − 1)'),
      doCalc
    );
    leftCol.appendChild(dfWrap);
    leftCol.appendChild(alphaField(state, 'alpha', doCalc));
    leftCol.appendChild(tailField(state, 'tail'));

    const calcBtn = el('button', {
      class: 'btn btn-primary st-calc-btn',
      onclick: doCalc
    }, t('⚡ Calculate Critical t', '⚡ Hitung t Kritis'));
    leftCol.appendChild(calcBtn);

    rightCol.appendChild(helpPanel([
      { title: t('Why df?', 'Mengapa df?'),
        body: t('df controls the shape. Larger df → narrower tails → smaller critical values.',
                'df mengontrol bentuk distribusi. df besar → ekor lebih sempit → nilai kritis lebih kecil.') },
      { title: t('Two-tailed α', 'α Dua Sisi'),
        body: t('For two-tailed tests, α is split equally: table α = α / 2.',
                'Untuk uji dua sisi, α dibagi dua: α tabel = α / 2.') },
      { title: t('Preset values', 'Nilai preset'),
        body: t('Common: 0.05 (5%), 0.01 (1%), 0.10 (10%). Use Custom for others.',
                'Umum: 0.05 (5%), 0.01 (1%), 0.10 (10%). Gunakan Lainnya untuk nilai lain.') },
    ]));

    layout.appendChild(leftCol);
    layout.appendChild(rightCol);
    container.appendChild(layout);

    const graphArea  = el('div', { class: 'st-graph-area' });
    const resultArea = el('div', { class: 'st-result-area' });
    container.appendChild(el('div', { class: 'st-section-title' }, t('Distribution', 'Distribusi')));
    container.appendChild(graphArea);
    container.appendChild(resultArea);
  }

  function renderCriticalResult(container, r) {
    /* ── KEY RESULT ── */
    const dispVal = r.tail === 'two-tailed'
      ? `±${r.criticalValueAbs.toFixed(6)}`
      : r.criticalValue.toFixed(6);

    const keyCard = el('div', { class: 'st-result-key' });
    keyCard.appendChild(el('div', { class: 'st-result-section-title' }, t('KEY RESULT', 'HASIL UTAMA')));
    stRow(keyCard, t('t critical', 't kritis'), el('span', { class: 'st-val-hero' }, dispVal));
    stRow(keyCard, 'df', r.df);
    stRow(keyCard, 'α', r.alpha);
    stRow(keyCard, t('Tail', 'Ekor'), r.tail);
    container.appendChild(keyCard);

    /* ── REFERENCE VALIDATION (collapsible) ── */
    container.appendChild(refValidation(r));

    /* ── INTERPRETATION ── */
    container.appendChild(interpretationBlock(r));

    /* ── EXPORT + SYNTAX ── */
    const actRow = el('div', { class: 'st-action-row' });
    actRow.appendChild(el('button', {
      class: 'btn btn-sm', onclick: () => exportToOutput(r)
    }, '📋 ' + t('Add to Output', 'Tambahkan ke Output')));
    container.appendChild(actRow);
    renderSyntax(container, r);
  }

  /* ════════════════════════════════════════════════════
     MODE B: PROBABILITY / P-VALUE
  ════════════════════════════════════════════════════ */

  function renderProbabilityMode(container) {
    const state = { df: '', t: '', tail: 'two-tailed' };

    const layout = el('div', { class: 'st-layout' });
    const leftCol  = el('div', { class: 'st-col-left' });
    const rightCol = el('div', { class: 'st-col-right' });

    function doCalc() {
      graphArea.innerHTML = '';
      resultArea.innerHTML = '';
      const r = StudentTCalc.probability({ df: state.df, t: state.t, tail: state.tail });
      StudentTCalc.setLastResult(r);
      if (r.error) {
        resultArea.appendChild(stError(r.error,
          t('df must be positive; t must be numeric.',
            'df harus positif; t harus numerik.')));
        return;
      }
      const cid = 'st-chart-' + Date.now();
      const svgEl = renderTCurve(graphArea,
        { df: r.df, tail: r.tail, tValue: r.t,
          criticalValueAbs: Math.abs(r.t), mode: 'probability' }, cid);
      const { bar } = chartToolbar(svgEl, { df: r.df, alpha: null, tail: r.tail });
      graphArea.appendChild(bar);
      renderProbabilityResult(resultArea, r);
    }

    const { wrap: dfWrap, inp: dfInp } = numField(
      t('Degrees of freedom (df)', 'Derajat kebebasan (df)'),
      'df', state, 'e.g. 10', t('Must be > 0', 'Harus > 0'), doCalc
    );
    const { wrap: tWrap, inp: tInp } = numField(
      t('t statistic', 'Statistik t'),
      't', state, 'e.g. 2.228', t('Any real number', 'Bilangan real'), doCalc
    );
    leftCol.appendChild(dfWrap);
    leftCol.appendChild(tWrap);
    leftCol.appendChild(tailField(state, 'tail'));
    leftCol.appendChild(el('button', {
      class: 'btn btn-primary st-calc-btn', onclick: doCalc
    }, t('⚡ Calculate Probability', '⚡ Hitung Probabilitas')));

    rightCol.appendChild(helpPanel([
      { title: t('Left-tailed', 'Ekor Kiri'), body: 'P(T ≤ t)' },
      { title: t('Right-tailed', 'Ekor Kanan'), body: 'P(T ≥ t)' },
      { title: t('Two-tailed', 'Dua Sisi'),
        body: t('2 × min(P(T ≤ t), P(T ≥ t))', '2 × min(P(T ≤ t), P(T ≥ t))') },
      { title: t('p-value', 'p-value'),
        body: t('Probability of observing a result as extreme as t, assuming H₀ is true.',
                'Probabilitas mendapat nilai t seekstrem ini, jika H₀ benar.') },
    ]));

    layout.appendChild(leftCol);
    layout.appendChild(rightCol);
    container.appendChild(layout);

    const graphArea  = el('div', { class: 'st-graph-area' });
    const resultArea = el('div', { class: 'st-result-area' });
    container.appendChild(el('div', { class: 'st-section-title' }, t('Distribution', 'Distribusi')));
    container.appendChild(graphArea);
    container.appendChild(resultArea);
  }

  function renderProbabilityResult(container, r) {
    const tailLabel = {
      left:         `P(T ≤ ${r.t.toFixed(4)})`,
      right:        `P(T ≥ ${r.t.toFixed(4)})`,
      'two-tailed': t('Two-tailed p-value', 'p-value dua sisi'),
    }[r.tail];

    const keyCard = el('div', { class: 'st-result-key' });
    keyCard.appendChild(el('div', { class: 'st-result-section-title' }, t('KEY RESULT', 'HASIL UTAMA')));
    stRow(keyCard, 't', r.t.toFixed(6));
    stRow(keyCard, 'df', r.df);
    stRow(keyCard, tailLabel, el('span', { class: 'st-val-hero' }, r.probability.toFixed(7)));
    stRow(keyCard, 'p-value', el('span', { class: r.pValue < 0.05 ? 'prob-sig' : 'prob-ns' }, r.pValue.toFixed(7)));
    container.appendChild(keyCard);

    const detCard = el('div', { class: 'st-result-detail' });
    stRow(detCard, 'P(T ≤ t) ' + t('left tail', 'ekor kiri'), r.leftTail.toFixed(7));
    stRow(detCard, 'P(T ≥ t) ' + t('right tail', 'ekor kanan'), r.rightTail.toFixed(7));
    const sig = r.pValue < 0.001 ? '*** p < .001' : r.pValue < 0.01 ? '** p < .01' : r.pValue < 0.05 ? '* p < .05' : t('Not significant (p ≥ .05)', 'Tidak signifikan (p ≥ .05)');
    detCard.appendChild(el('div', { class: 'st-interp' }, el('span', { class: r.pValue < 0.05 ? 'prob-sig' : 'prob-ns' }, sig)));
    container.appendChild(detCard);

    const actRow = el('div', { class: 'st-action-row' });
    actRow.appendChild(el('button', { class: 'btn btn-sm', onclick: () => exportToOutput(r) },
      '📋 ' + t('Add to Output', 'Tambahkan ke Output')));
    container.appendChild(actRow);
    renderSyntax(container, r);
  }

  /* ════════════════════════════════════════════════════
     MODE C: TEST t STATISTIC
  ════════════════════════════════════════════════════ */

  function renderTestMode(container) {
    const state = { df: '', t: '', alpha: '0.05', tail: 'two-tailed' };

    const layout = el('div', { class: 'st-layout' });
    const leftCol  = el('div', { class: 'st-col-left' });
    const rightCol = el('div', { class: 'st-col-right' });

    function doCalc() {
      graphArea.innerHTML = '';
      resultArea.innerHTML = '';
      const r = StudentTCalc.testStatistic({ df: state.df, t: state.t, alpha: state.alpha, tail: state.tail });
      StudentTCalc.setLastResult(r);
      if (r.error) {
        resultArea.appendChild(stError(r.error,
          t('df must be positive; t must be numeric; α must be between 0 and 1.',
            'df harus positif; t harus numerik; α harus antara 0 dan 1.')));
        return;
      }
      const cid = 'st-chart-' + Date.now();
      const svgEl = renderTCurve(graphArea,
        { df: r.df, alpha: r.alpha, tail: r.tail,
          criticalValueAbs: r.tCriticalAbs, tValue: r.tObserved, mode: 'test' }, cid);
      const { bar } = chartToolbar(svgEl, { df: r.df, alpha: r.alpha, tail: r.tail });
      graphArea.appendChild(bar);
      renderTestResult(resultArea, r);
    }

    const { wrap: tWrap }  = numField(t('Observed t', 't Observasi'), 't',  state, 'e.g. 2.4',  t('Any real number', 'Bilangan real'), doCalc);
    const { wrap: dfWrap } = numField(t('Degrees of freedom (df)', 'Derajat kebebasan (df)'), 'df', state, 'e.g. 20', t('Must be > 0', 'Harus > 0'), doCalc);
    leftCol.appendChild(tWrap);
    leftCol.appendChild(dfWrap);
    leftCol.appendChild(alphaField(state, 'alpha', doCalc));
    leftCol.appendChild(tailField(state, 'tail'));
    leftCol.appendChild(el('button', {
      class: 'btn btn-primary st-calc-btn', onclick: doCalc
    }, t('⚡ Run Test', '⚡ Jalankan Uji')));

    rightCol.appendChild(helpPanel([
      { title: t('Decision rule', 'Aturan keputusan'),
        body: t('Reject H₀ if |t obs| ≥ t critical (two-tailed) or t obs ≥ t crit (right) or t obs ≤ −t crit (left).',
                'Tolak H₀ jika |t obs| ≥ t kritis (dua sisi).') },
      { title: t('Fail to reject ≠ Accept', '"Gagal tolak" ≠ "Terima"'),
        body: t('"Fail to reject H₀" does not mean H₀ is true — only that evidence is insufficient.',
                '"Gagal menolak H₀" bukan berarti H₀ benar — hanya kurang bukti.') },
    ]));

    layout.appendChild(leftCol);
    layout.appendChild(rightCol);
    container.appendChild(layout);

    const graphArea  = el('div', { class: 'st-graph-area' });
    const resultArea = el('div', { class: 'st-result-area' });
    container.appendChild(el('div', { class: 'st-section-title' }, t('Distribution', 'Distribusi')));
    container.appendChild(graphArea);
    container.appendChild(resultArea);
  }

  function renderTestResult(container, r) {
    const decisionOk = !r.reject;
    const keyCard = el('div', { class: 'st-result-key' });
    keyCard.appendChild(el('div', { class: 'st-result-section-title' }, t('KEY RESULT', 'HASIL UTAMA')));
    stRow(keyCard, t('Observed t', 't Observasi'), r.tObserved.toFixed(6));
    stRow(keyCard, 'df', r.df);
    stRow(keyCard, 'α', r.alpha);
    stRow(keyCard, t('Tail', 'Ekor'), r.tail);
    stRow(keyCard, t('t critical', 't kritis'),
      r.tail === 'two-tailed' ? `±${r.tCriticalAbs.toFixed(6)}` : r.tCritical.toFixed(6));
    stRow(keyCard, 'p-value', el('span', { class: r.pValue < r.alpha ? 'prob-sig' : 'prob-ns' }, r.pValue.toFixed(7)));
    keyCard.appendChild(el('div', { class: 'prob-result-divider' }));
    keyCard.appendChild(el('div', {
      class: 'st-decision',
      style: { color: r.reject ? '#dc2626' : '#15803d' }
    }, (r.reject ? '✗ ' : '✓ ') + r.decision));
    const detail = r.reject
      ? `|t| = ${Math.abs(r.tObserved).toFixed(4)} ≥ ${r.tCriticalAbs.toFixed(4)}`
      : `|t| = ${Math.abs(r.tObserved).toFixed(4)} < ${r.tCriticalAbs.toFixed(4)}`;
    keyCard.appendChild(el('div', { class: 'st-decision-detail' }, detail));
    container.appendChild(keyCard);

    if (r.tableAvailable) container.appendChild(refValidation(r));
    container.appendChild(interpretationBlock(r));

    const actRow = el('div', { class: 'st-action-row' });
    actRow.appendChild(el('button', { class: 'btn btn-sm', onclick: () => exportToOutput(r) },
      '📋 ' + t('Add to Output', 'Tambahkan ke Output')));
    container.appendChild(actRow);
    renderSyntax(container, r);
  }

  /* ════════════════════════════════════════════════════
     SHARED RESULT COMPONENTS
  ════════════════════════════════════════════════════ */

  /** A two-column label / value row */
  function stRow(parent, label, value) {
    const row = el('div', { class: 'prob-result-row' },
      el('span', { class: 'prob-result-label' }, label)
    );
    if (value instanceof Node) row.appendChild(value);
    else row.appendChild(el('span', { class: 'prob-result-value' }, String(value)));
    parent.appendChild(row);
  }

  /** Error box with what/why/how */
  function stError(msg, hint) {
    return el('div', { class: 'prob-error' },
      el('strong', {}, '⚠ ' + t('What happened?', 'Apa yang terjadi?')), el('br', {}),
      msg, el('br', {}),
      el('span', { class: 'st-hint' }, hint)
    );
  }

  /** Collapsible reference validation section */
  function refValidation(r) {
    const wrap = el('div', { class: 'st-collapsible' });
    let open = false;
    const header = el('div', { class: 'st-collapsible-header', onclick: () => {
      open = !open;
      body.style.display = open ? '' : 'none';
      toggle.textContent = open ? '▴' : '▾';
    }});
    const toggle = el('span', { class: 'st-collapsible-toggle' }, '▾');
    header.appendChild(toggle);
    header.appendChild(el('span', {}, t('▾ Reference Table Validation', '▾ Validasi Tabel Referensi')));
    wrap.appendChild(header);

    const body = el('div', { class: 'st-collapsible-body', style: { display: 'none' } });

    const tblCard = el('div', { class: 'st-ref-table' });
    stRow(tblCard, t('Requested α', 'α diminta'), r.alpha);
    if (r.tableAlpha !== undefined) stRow(tblCard, t('Table α (one-tailed)', 'α tabel (satu ekor)'), r.tableAlpha);
    stRow(tblCard, t('Reference', 'Referensi'), 't Student table');

    if (r.tableAvailable) {
      stRow(tblCard, t('Reference table value', 'Nilai tabel'), r.tableValue);
      const exactVal = r.criticalValueAbs != null ? r.criticalValueAbs : r.tCriticalAbs;
      stRow(tblCard, t('Exact calculation', 'Kalkulasi eksak'), exactVal != null ? exactVal.toFixed(6) : '—');
      if (exactVal != null) {
        const diff = Math.abs(exactVal - r.tableValue);
        const passEl = el('span', {
          style: { color: diff <= 0.005 ? '#15803d' : '#92400e', fontWeight: '600' }
        }, diff.toFixed(6) + (diff <= 0.005
          ? ' ✓ ' + t('Within expected rounding', 'Dalam batas pembulatan')
          : ' ⚠ ' + t('Check', 'Periksa')));
        stRow(tblCard, t('Difference', 'Selisih'), passEl);
        stRow(tblCard, t('Tolerance', 'Toleransi'), '0.005');
        stRow(tblCard, t('Status', 'Status'), diff <= 0.005
          ? t('✓ Within expected table rounding', '✓ Dalam pembulatan tabel yang wajar')
          : t('⚠ Exceeds tolerance', '⚠ Melebihi toleransi'));
      }
    } else {
      stRow(tblCard, t('Table df', 'df di tabel'),
        r.tableDF ? t('df in table', 'df tersedia') : t('Not in reference table — exact used', 'Tidak ada di tabel — eksak digunakan'));
      stRow(tblCard, t('Method', 'Metode'), r.method || 'exact');
    }

    body.appendChild(tblCard);
    wrap.appendChild(body);
    return wrap;
  }

  /** Interpretation paragraph */
  function interpretationBlock(r) {
    const wrap = el('div', { class: 'st-interp-block' });
    wrap.appendChild(el('div', { class: 'st-section-title' }, t('Interpretation', 'Interpretasi')));
    let text = '';
    if (r.mode === 'critical') {
      const ta = r.tableAlpha || r.alpha;
      const cv = (r.criticalValueAbs || 0).toFixed(3);
      if (r.tail === 'two-tailed') {
        text = t(
          `For a two-tailed test with α = ${r.alpha}, the significance level is divided equally: α / 2 = ${ta}. With df = ${r.df}, the critical value is approximately ±${cv}.`,
          `Untuk uji dua sisi dengan α = ${r.alpha}, tingkat signifikansi dibagi dua: α / 2 = ${ta}. Dengan df = ${r.df}, nilai kritis sekitar ±${cv}.`
        );
      } else if (r.tail === 'right') {
        text = t(
          `For a right-tailed test with α = ${r.alpha} and df = ${r.df}, the critical value is +${cv}. Reject H₀ when t > +${cv}.`,
          `Untuk uji ekor kanan dengan α = ${r.alpha} dan df = ${r.df}, nilai kritis adalah +${cv}. Tolak H₀ jika t > +${cv}.`
        );
      } else {
        text = t(
          `For a left-tailed test with α = ${r.alpha} and df = ${r.df}, the critical value is −${cv}. Reject H₀ when t < −${cv}.`,
          `Untuk uji ekor kiri dengan α = ${r.alpha} dan df = ${r.df}, nilai kritis adalah −${cv}. Tolak H₀ jika t < −${cv}.`
        );
      }
    } else if (r.mode === 'test') {
      const ta = r.tableAlpha || r.alpha;
      const cv = (r.tCriticalAbs || 0).toFixed(3);
      const alphaNote = r.tail === 'two-tailed'
        ? t(` (two-tailed: table α = ${ta})`, ` (dua sisi: α tabel = ${ta})`)
        : '';
      text = r.reject
        ? t(`t = ${r.tObserved}, df = ${r.df}, α = ${r.alpha}${alphaNote}: t critical = ${r.tail === 'two-tailed' ? '±' : ''}${cv}. p = ${r.pValue.toFixed(4)} < α. Reject H₀.`,
            `t = ${r.tObserved}, df = ${r.df}, α = ${r.alpha}${alphaNote}: t kritis = ${r.tail === 'two-tailed' ? '±' : ''}${cv}. p = ${r.pValue.toFixed(4)} < α. Tolak H₀.`)
        : t(`t = ${r.tObserved}, df = ${r.df}, α = ${r.alpha}${alphaNote}: t critical = ${r.tail === 'two-tailed' ? '±' : ''}${cv}. p = ${r.pValue.toFixed(4)} ≥ α. Fail to reject H₀.`,
            `t = ${r.tObserved}, df = ${r.df}, α = ${r.alpha}${alphaNote}: t kritis = ${r.tail === 'two-tailed' ? '±' : ''}${cv}. p = ${r.pValue.toFixed(4)} ≥ α. Gagal menolak H₀.`);
    } else if (r.mode === 'probability') {
      text = t(
        `t = ${r.t.toFixed(4)}, df = ${r.df}: the ${r.tail} p-value is ${r.pValue.toFixed(4)}.`,
        `t = ${r.t.toFixed(4)}, df = ${r.df}: p-value ${r.tail} adalah ${r.pValue.toFixed(4)}.`
      );
    }
    wrap.appendChild(el('p', { class: 'st-interp-text' }, text));
    return wrap;
  }

  /* ── Syntax block ── */
  function renderSyntax(container, r) {
    let syntax = '';
    if (r.mode === 'critical') {
      syntax = `T_DISTRIBUTION\n /DF=${r.df}\n /ALPHA=${r.alpha}\n /TAIL=${r.tail === 'two-tailed' ? 'TWO' : r.tail === 'right' ? 'RIGHT' : 'LEFT'}.`;
    } else if (r.mode === 'probability') {
      syntax = `T_PROBABILITY\n /DF=${r.df}\n /T=${r.t}\n /TAIL=${r.tail === 'two-tailed' ? 'TWO' : r.tail === 'right' ? 'RIGHT' : 'LEFT'}.`;
    } else if (r.mode === 'test') {
      syntax = `T_TEST_STAT\n /T_OBSERVED=${r.tObserved}\n /DF=${r.df}\n /ALPHA=${r.alpha}\n /TAIL=${r.tail === 'two-tailed' ? 'TWO' : r.tail === 'right' ? 'RIGHT' : 'LEFT'}.`;
    }
    if (!syntax) return;
    container.appendChild(el('details', { class: 'st-syntax-details' },
      el('summary', { class: 'st-syntax-summary' }, t('SOCIOSTAT Syntax', 'Sintaks SOCIOSTAT')),
      el('pre', { class: 'st-syntax-pre' }, syntax)
    ));
  }

  /* ── Export to Output viewer ── */
  function exportToOutput(r) {
    if (!r) return;
    const lines = [];
    lines.push("STUDENT'S t DISTRIBUTION");
    lines.push('─'.repeat(50));
    if (r.mode === 'critical') {
      lines.push(`Mode: ${t('Find Critical t', 'Cari t Kritis')}`);
      lines.push(`df = ${r.df}`);
      lines.push(`α = ${r.alpha}  |  Tail: ${r.tail}`);
      if (r.tableAlpha !== undefined) lines.push(`Table α = ${r.tableAlpha}`);
      lines.push(`t critical = ${r.tail === 'two-tailed' ? '±' + r.criticalValueAbs.toFixed(6) : r.criticalValue.toFixed(6)}`);
      if (r.tableAvailable) lines.push(`Reference table value = ${r.tableValue}`);
      lines.push(`Method: ${r.method}`);
    } else if (r.mode === 'probability') {
      lines.push(`Mode: ${t('Probability', 'Probabilitas')}`);
      lines.push(`df = ${r.df}  |  t = ${r.t}  |  Tail: ${r.tail}`);
      lines.push(`P = ${r.probability.toFixed(7)} (${r.percentage.toFixed(4)}%)`);
      lines.push(`p-value = ${r.pValue.toFixed(7)}`);
    } else if (r.mode === 'test') {
      lines.push(`Mode: ${t('Test t Statistic', 'Uji Statistik t')}`);
      lines.push(`t observed = ${r.tObserved}  |  df = ${r.df}  |  α = ${r.alpha}  |  Tail: ${r.tail}`);
      lines.push(`t critical = ${r.tail === 'two-tailed' ? '±' + r.tCriticalAbs.toFixed(6) : r.tCritical.toFixed(6)}`);
      lines.push(`p-value = ${r.pValue.toFixed(7)}`);
      lines.push(`Decision: ${r.decision}`);
    }

    const htmlRows = lines.slice(2).map(l => {
      const sep = l.indexOf(' = ');
      if (sep > -1) {
        return `<tr><td>${l.slice(0, sep).trim()}</td><td><strong>${l.slice(sep + 3).trim()}</strong></td></tr>`;
      }
      return `<tr><td colspan="2">${l}</td></tr>`;
    }).join('');

    const htmlOutput = `
      <div class="output-section">
        <h3 class="output-title">Student's t Distribution</h3>
        <table class="pivot-table">
          <thead><tr><th>Parameter</th><th>Value</th></tr></thead>
          <tbody>${htmlRows}</tbody>
        </table>
      </div>`;

    if (typeof Output !== 'undefined') {
      Output.addResult('student_t', {
        status: 'complete',
        result: { html: htmlOutput, text: lines.join('\n'), data: r },
        warnings: []
      }, { distribution: 'student_t' });
      if (typeof App !== 'undefined') App.navigate('output');
      notify(t('Added to Output', 'Ditambahkan ke Output'), 'success');
    }
  }

  /* ════════════════════════════════════════════════════
     MODE D: DIAGNOSTICS — Golden Tests + Reference Comparison
  ════════════════════════════════════════════════════ */

  function renderDiagnosticsMode(container) {
    // ── Section header ──
    container.appendChild(el('div', { class: 'st-section-title' },
      t('🔬 Validation & Diagnostics', '🔬 Validasi & Diagnostik')));

    container.appendChild(el('p', { class: 'st-interp-text', style: { margin: '0 0 12px' } },
      t(
        'Run automated golden tests and compare exact calculations against the reference "t Student" table (Tabel_Nilai_Kritis). All tests must pass for the module to be considered complete.',
        'Jalankan uji otomatis dan bandingkan kalkulasi eksak dengan tabel referensi "t Student". Semua uji harus lulus agar modul dinyatakan lengkap.'
      )
    ));

    // ── Golden Tests ──
    const gtSection = el('div', { class: 'st-result-key', style: { marginBottom: '14px' } });
    gtSection.appendChild(el('div', { class: 'st-result-section-title' },
      t('GOLDEN TESTS (8 tests)', 'UJI GOLDEN (8 uji)')));
    const gtBody = el('div');
    gtSection.appendChild(gtBody);
    container.appendChild(gtSection);

    const gtBtn = el('button', {
      class: 'btn btn-primary st-calc-btn',
      style: { margin: '0 0 14px', alignSelf: 'flex-start' },
      onclick: () => runGoldenTestsUI(gtBody)
    }, t('▶ Run Golden Tests', '▶ Jalankan Uji Golden'));
    // Insert button before the section
    container.insertBefore(gtBtn, gtSection);

    // ── Reference Comparison ──
    const rcSection = el('div', { class: 'st-result-key', style: { marginBottom: '14px' } });
    rcSection.appendChild(el('div', { class: 'st-result-section-title' },
      t('REFERENCE TABLE COMPARISON', 'PERBANDINGAN TABEL REFERENSI')));
    const rcBody = el('div');
    rcSection.appendChild(rcBody);
    container.appendChild(rcSection);

    const rcBtn = el('button', {
      class: 'btn st-calc-btn',
      style: { margin: '0 0 14px', alignSelf: 'flex-start', background: 'var(--surface-2,#f1f5f9)', color: 'var(--text,#1f2328)', border: '1px solid var(--border,#e5e7eb)' },
      onclick: () => runRefComparisonUI(rcBody)
    }, t('▶ Run Reference Comparison', '▶ Jalankan Perbandingan Referensi'));
    container.insertBefore(rcBtn, rcSection);
  }

  function runGoldenTestsUI(container) {
    container.innerHTML = '';
    const tests = StudentTCalc.runGoldenTests();
    const passCount = tests.filter(t => t.pass).length;
    const allPass = passCount === tests.length;

    const summary = el('div', {
      class: 'st-result-section-title',
      style: { color: allPass ? '#15803d' : '#dc2626', marginBottom: '8px' }
    }, allPass
      ? `✓ ALL ${passCount}/${tests.length} TESTS PASSED`
      : `⚠ ${passCount}/${tests.length} PASSED — ${tests.length - passCount} FAILED`);
    container.appendChild(summary);

    tests.forEach(test => {
      const row = el('div', {
        class: 'prob-result-row',
        style: { alignItems: 'flex-start', padding: '5px 0', borderBottom: '1px solid var(--border,#e5e7eb)' }
      });

      const statusEl = el('span', {
        style: {
          fontWeight: '700', minWidth: '52px', display: 'inline-block',
          color: test.pass ? '#15803d' : '#dc2626'
        }
      }, test.pass ? '✓ PASS' : '✗ FAIL');

      const nameEl = el('span', { class: 'prob-result-label', style: { flex: '1' } }, test.name);

      const expEl = el('span', { class: 'prob-result-value', style: { minWidth: '90px', textAlign: 'right' } },
        t('Expected: ', 'Ekspektasi: ') + test.expected);

      let gotStr = '—';
      if (test.result && !test.result.error) {
        if (test.result.criticalValue != null) gotStr = test.result.criticalValueAbs != null
          ? test.result.criticalValueAbs.toFixed(4) : test.result.criticalValue.toFixed(4);
        else if (test.result.pValue != null) gotStr = test.result.pValue.toFixed(6);
        else if (test.result.probability != null) gotStr = test.result.probability.toFixed(6);
      } else if (test.error) {
        gotStr = 'ERROR: ' + test.error;
      }
      const gotEl = el('span', { class: 'prob-result-value', style: { minWidth: '110px', textAlign: 'right', fontFamily: 'monospace' } },
        t('Got: ', 'Hasil: ') + gotStr);

      row.appendChild(statusEl);
      row.appendChild(nameEl);
      row.appendChild(expEl);
      row.appendChild(gotEl);
      container.appendChild(row);
    });

    // Export to Output button
    const exportBtn = el('button', {
      class: 'btn btn-sm',
      style: { marginTop: '10px' },
      onclick: () => exportGoldenTestsToOutput(tests)
    }, '📋 ' + t('Add to Output', 'Tambahkan ke Output'));
    container.appendChild(exportBtn);
  }

  function runRefComparisonUI(container) {
    container.innerHTML = '';
    const results = StudentTCalc.referenceComparison();
    const passCount = results.filter(r => r.pass).length;
    const allPass = passCount === results.length;

    const summary = el('div', {
      class: 'st-result-section-title',
      style: { color: allPass ? '#15803d' : '#dc2626', marginBottom: '8px' }
    }, allPass
      ? `✓ ALL ${passCount}/${results.length} REFERENCE ENTRIES MATCH`
      : `⚠ ${passCount}/${results.length} MATCH — ${results.length - passCount} OUTSIDE TOLERANCE (±0.005)`);
    container.appendChild(summary);

    // Build table
    const tbl = el('table', {
      class: 'pivot-table',
      style: { fontSize: '11px', width: '100%', marginTop: '6px' }
    });
    const thead = el('thead');
    thead.appendChild(el('tr', {},
      el('th', {}, 'df'),
      el('th', {}, 'α (one-tailed)'),
      el('th', {}, t('Table value', 'Nilai tabel')),
      el('th', {}, t('Exact', 'Eksak')),
      el('th', {}, t('Diff', 'Selisih')),
      el('th', {}, t('Status', 'Status'))
    ));
    tbl.appendChild(thead);

    const tbody = el('tbody');
    results.forEach(r => {
      const statusEl = el('td', {
        style: { fontWeight: '700', color: r.pass ? '#15803d' : '#dc2626' }
      }, r.pass ? '✓' : '✗');
      const tr = el('tr', {},
        el('td', {}, r.df),
        el('td', {}, r.alpha),
        el('td', {}, r.tableValue.toFixed(3)),
        el('td', { style: { fontFamily: 'monospace' } }, r.exactValue.toFixed(6)),
        el('td', { style: { fontFamily: 'monospace' } }, r.diff.toFixed(6)),
        statusEl
      );
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    container.appendChild(tbl);

    container.appendChild(el('div', { class: 'st-hint', style: { marginTop: '6px' } },
      t('Tolerance: ±0.005 (reference table values are rounded to 3 decimal places)',
        'Toleransi: ±0.005 (nilai tabel referensi dibulatkan ke 3 angka desimal)')
    ));

    // Export
    const exportBtn = el('button', {
      class: 'btn btn-sm',
      style: { marginTop: '10px' },
      onclick: () => exportRefComparisonToOutput(results)
    }, '📋 ' + t('Add to Output', 'Tambahkan ke Output'));
    container.appendChild(exportBtn);
  }

  function exportGoldenTestsToOutput(tests) {
    const passCount = tests.filter(t => t.pass).length;
    const rows = tests.map(test => {
      let gotStr = '—';
      if (test.result && !test.result.error) {
        if (test.result.criticalValueAbs != null) gotStr = test.result.criticalValueAbs.toFixed(4);
        else if (test.result.criticalValue != null) gotStr = test.result.criticalValue.toFixed(4);
        else if (test.result.pValue != null) gotStr = test.result.pValue.toFixed(6);
        else if (test.result.probability != null) gotStr = test.result.probability.toFixed(6);
      }
      return `<tr>
        <td style="color:${test.pass?'#15803d':'#dc2626'};font-weight:700">${test.pass?'✓ PASS':'✗ FAIL'}</td>
        <td>${test.name}</td>
        <td>${test.expected}</td>
        <td style="font-family:monospace">${gotStr}</td>
      </tr>`;
    }).join('');

    const htmlOutput = `<div class="output-section">
      <h3 class="output-title">Student's t Distribution — Golden Tests</h3>
      <p style="margin:4px 0 8px;font-weight:700;color:${passCount===tests.length?'#15803d':'#dc2626'}">
        ${passCount}/${tests.length} tests passed
      </p>
      <table class="pivot-table" style="font-size:12px">
        <thead><tr><th>Status</th><th>Test</th><th>Expected</th><th>Got</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

    if (typeof Output !== 'undefined') {
      Output.addResult('student_t', {
        status: 'complete',
        result: { html: htmlOutput, text: `Golden Tests: ${passCount}/${tests.length} passed`, data: tests },
        warnings: []
      }, { distribution: 'student_t' });
      if (typeof App !== 'undefined') App.navigate('output');
      notify(t('Added to Output', 'Ditambahkan ke Output'), 'success');
    }
  }

  function exportRefComparisonToOutput(results) {
    const passCount = results.filter(r => r.pass).length;
    const rows = results.map(r => `<tr>
      <td>${r.df}</td><td>${r.alpha}</td>
      <td>${r.tableValue.toFixed(3)}</td>
      <td style="font-family:monospace">${r.exactValue.toFixed(6)}</td>
      <td style="font-family:monospace">${r.diff.toFixed(6)}</td>
      <td style="font-weight:700;color:${r.pass?'#15803d':'#dc2626'}">${r.pass?'✓':'✗'}</td>
    </tr>`).join('');

    const htmlOutput = `<div class="output-section">
      <h3 class="output-title">Student's t Distribution — Reference Table Comparison</h3>
      <p style="margin:4px 0 8px;font-weight:700;color:${passCount===results.length?'#15803d':'#dc2626'}">
        ${passCount}/${results.length} entries within tolerance (±0.005)
      </p>
      <table class="pivot-table" style="font-size:11px">
        <thead><tr><th>df</th><th>α</th><th>Table</th><th>Exact</th><th>Diff</th><th>Status</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="font-size:11px;color:#6b7280;margin-top:6px">Tolerance: ±0.005 (table values rounded to 3 dp)</p>
    </div>`;

    if (typeof Output !== 'undefined') {
      Output.addResult('student_t', {
        status: 'complete',
        result: { html: htmlOutput, text: `Reference comparison: ${passCount}/${results.length} within tolerance`, data: results },
        warnings: []
      }, { distribution: 'student_t' });
      if (typeof App !== 'undefined') App.navigate('output');
      notify(t('Added to Output', 'Ditambahkan ke Output'), 'success');
    }
  }

  return { open };
})();

/* ══════════════════════════════════════════════════════════════════
   SECTION 5: TRANSFORMATION ENGINE
   ══════════════════════════════════════════════════════════════════ */
