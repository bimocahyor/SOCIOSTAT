const ProbabilityCalcUI = (() => {

  let _activeSubTab = 'calc';  // 'calc'|'critical'|'pvalue'|'examples'

  /* ── open() — Normal Probability Calculator (standalone) ── */
  function open(prefillZ) {
    const existing = document.getElementById('prob-calc-overlay');
    if (existing) existing.remove();

    const overlay = el('div', { id: 'prob-calc-overlay', class: 'dialog-overlay' });
    const box = el('div', { class: 'dialog-box prob-calc-box' });

    // Header — Normal Distribution only
    box.appendChild(el('div', { class: 'dialog-header' },
      el('div', { style: { display: 'flex', flexDirection: 'column', gap: '2px' } },
        el('h2', {}, '📐 Probability Calculator'),
        el('div', { style: { fontSize: '12px', color: 'var(--text-muted,#6b7280)', fontWeight: '500', marginTop: '1px' } },
          'Normal Distribution')
      ),
      el('button', { class: 'dialog-close', onclick: () => overlay.remove() }, '×')
    ));

    // Body — directly renders Normal calculator, no distribution switcher tabs
    const bodyEl = el('div', { class: 'prob-calc-body', id: 'prob-calc-body' });
    box.appendChild(bodyEl);

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    renderNormalCalc(bodyEl, prefillZ);
  }

  /* ── Normal Distribution calculator ── */
  function renderNormalCalc(container, prefillZ) {
    // Sub-tabs: Calculate | Critical Z | P-Value | Examples
    const subTabBar = el('div', { class: 'prob-sub-tabs' });
    const SUB_TABS = [
      { id: 'calc',     label: 'Calculate P' },
      { id: 'critical', label: 'Find Critical Z' },
      { id: 'pvalue',   label: 'P-Value from Z' },
      { id: 'examples', label: 'Examples' },
    ];
    const contentEl = el('div', { class: 'prob-content' });

    function switchSubTab(id) {
      _activeSubTab = id;
      subTabBar.querySelectorAll('.prob-sub-tab').forEach(b => b.classList.toggle('active', b.dataset.id === id));
      contentEl.innerHTML = '';
      if (id === 'calc') renderCalcTab(contentEl, prefillZ);
      else if (id === 'critical') renderCriticalTab(contentEl);
      else if (id === 'pvalue') renderPValueTab(contentEl, prefillZ);
      else renderExamplesTab(contentEl);
    }

    SUB_TABS.forEach(st => {
      const btn = el('button', { class: `prob-sub-tab${_activeSubTab === st.id ? ' active' : ''}`, 'data-id': st.id,
        onclick: () => switchSubTab(st.id) }, st.label);
      subTabBar.appendChild(btn);
    });

    container.appendChild(subTabBar);
    container.appendChild(contentEl);
    switchSubTab(_activeSubTab);
  }

  /* ── Tab: Calculate P ── */
  function renderCalcTab(container, prefillZ) {
    const state = {
      inputMode: 'z',       // 'z' | 'raw'
      tailType: 'left',     // 'left'|'right'|'between'|'two'
      calcMethod: 'exact',  // 'exact'|'table'
      z: prefillZ != null ? String(prefillZ) : '',
      x: '', x1: '', x2: '',
      z1: '', z2: '',
      mean: '0', sd: '1',
    };

    // Simple-mode explainer
    if (typeof _appMode !== 'undefined' && _appMode === 'simple') {
      container.appendChild(el('div', { class: 'prob-explainer' },
        el('div', { class: 'prob-explainer-title' }, '💡 What is Z?'),
        el('p', {}, 'A Z-score tells you how many standard deviations a value is from the mean. Z = 0 means exactly average.'),
        el('div', { class: 'prob-explainer-title' }, '💡 What is probability here?'),
        el('p', {}, 'Probability is the area under the normal distribution curve for the region you specify. It is always between 0 and 1.')
      ));
    }

    // Input mode toggle
    const modeWrap = el('div', { class: 'prob-row' },
      el('label', { class: 'prob-section-label' }, 'Input Mode'),
      el('div', { class: 'prob-toggle-group' },
        ...[['z','Z-Score'],['raw','Raw Score (X, μ, σ)']].map(([val, lbl]) => {
          const btn = el('button', {
            class: `prob-toggle-btn${state.inputMode === val ? ' active' : ''}`,
            onclick: () => { state.inputMode = val; rebuildForm(); }
          }, lbl);
          return btn;
        })
      )
    );

    // Method toggle
    const methodWrap = el('div', { class: 'prob-row' },
      el('label', { class: 'prob-section-label' }, 'Method'),
      el('div', { class: 'prob-toggle-group' },
        ...[['exact','Exact Calculation'],['table','Use Z Table']].map(([val, lbl]) => {
          const btn = el('button', {
            class: `prob-toggle-btn${state.calcMethod === val ? ' active' : ''}`,
            onclick: () => { state.calcMethod = val; rebuildForm(); }
          }, lbl);
          return btn;
        })
      )
    );

    // Tail type
    const tailWrap = el('div', { class: 'prob-row' },
      el('label', { class: 'prob-section-label' }, 'Probability Type'),
      el('div', { class: 'prob-tail-group' },
        ...[
          ['left',    'P(Z ≤ z)',     'Left Tail'],
          ['right',   'P(Z > z)',     'Right Tail'],
          ['between', 'P(z₁ < Z < z₂)', 'Between'],
          ['two',     'P(|Z| ≥ |z|)', 'Two-Tailed'],
        ].map(([val, formula, lbl]) => {
          const btn = el('button', {
            class: `prob-tail-btn${state.tailType === val ? ' active' : ''}`,
            title: formula,
            onclick: () => { state.tailType = val; rebuildForm(); }
          }, el('div', { class: 'prob-tail-formula' }, formula), el('div', { class: 'prob-tail-label' }, lbl));
          return btn;
        })
      )
    );

    // Inputs area
    const inputsArea = el('div', { class: 'prob-inputs-area' });

    // Results area
    const resultsArea = el('div', { class: 'prob-results-area', id: 'prob-results-area' });

    // Visualization area
    const vizArea = el('div', { class: 'prob-viz-area', id: 'prob-viz-area' });

    // Calculate button
    const calcBtn = el('button', { class: 'btn btn-primary prob-calc-btn', onclick: () => doCalc() }, '⚡ Calculate');

    container.appendChild(modeWrap);
    container.appendChild(methodWrap);
    container.appendChild(tailWrap);
    container.appendChild(inputsArea);
    container.appendChild(calcBtn);
    container.appendChild(vizArea);
    container.appendChild(resultsArea);

    function rebuildModeToggle() {
      modeWrap.querySelectorAll('.prob-toggle-btn').forEach((b, i) => {
        b.classList.toggle('active', ['z','raw'][i] === state.inputMode);
      });
    }
    function rebuildMethodToggle() {
      methodWrap.querySelectorAll('.prob-toggle-btn').forEach((b, i) => {
        b.classList.toggle('active', ['exact','table'][i] === state.calcMethod);
      });
    }
    function rebuildTailBtns() {
      tailWrap.querySelectorAll('.prob-tail-btn').forEach((b, i) => {
        b.classList.toggle('active', ['left','right','between','two'][i] === state.tailType);
      });
    }

    function rebuildForm() {
      rebuildModeToggle();
      rebuildMethodToggle();
      rebuildTailBtns();
      inputsArea.innerHTML = '';
      const isBetween = state.tailType === 'between';
      const isRaw = state.inputMode === 'raw';

      function numInput(label, key, placeholder, hint) {
        const wrap = el('div', { class: 'prob-field' });
        wrap.appendChild(el('label', { class: 'prob-label' }, label));
        const inp = el('input', {
          type: 'text',
          class: 'form-control prob-input',
          placeholder,
          value: state[key] != null ? state[key] : '',
          oninput: e => { state[key] = e.target.value; },
          onkeydown: e => { if (e.key === 'Enter') doCalc(); }
        });
        wrap.appendChild(inp);
        if (hint) wrap.appendChild(el('div', { class: 'prob-hint' }, hint));
        return wrap;
      }

      if (!isRaw) {
        if (!isBetween) {
          inputsArea.appendChild(numInput('Z-Score', 'z', 'e.g. 1.96', 'Enter any real number'));
        } else {
          inputsArea.appendChild(numInput('Z₁ (lower)', 'z1', 'e.g. -1.96', 'Lower Z boundary'));
          inputsArea.appendChild(numInput('Z₂ (upper)', 'z2', 'e.g. 1.96', 'Upper Z boundary'));
        }
      } else {
        if (!isBetween) {
          inputsArea.appendChild(numInput('X (raw value)', 'x', 'e.g. 130', ''));
        } else {
          inputsArea.appendChild(numInput('X₁ (lower value)', 'x1', 'e.g. 90', ''));
          inputsArea.appendChild(numInput('X₂ (upper value)', 'x2', 'e.g. 110', ''));
        }
        inputsArea.appendChild(numInput('Mean (μ)', 'mean', 'e.g. 100', 'Population or sample mean'));
        inputsArea.appendChild(numInput('Standard Deviation (σ)', 'sd', 'e.g. 15', 'Must be greater than 0'));
      }
    }

    function doCalc() {
      resultsArea.innerHTML = '';
      vizArea.innerHTML = '';

      const opts = {
        mode: state.inputMode,
        tailType: state.tailType,
        method: state.calcMethod,
        z: state.z, z1: state.z1, z2: state.z2,
        x: state.x, x1: state.x1, x2: state.x2,
        mean: state.mean, sd: state.sd,
      };

      const result = ProbabilityCalc.calculateNormal(opts);
      ProbabilityCalc.setLastResult(result);

      if (result.error) {
        resultsArea.appendChild(el('div', { class: 'prob-error' }, '⚠ ' + result.error));
        return;
      }

      renderResults(resultsArea, result);
      renderVisualization(vizArea, result);
    }

    rebuildForm();

    // Auto-calculate if prefillZ was provided
    if (prefillZ != null) setTimeout(doCalc, 50);
  }

  /* ── Render result cards ── */
  function renderResults(container, result) {
    const { z, z1, z2, type, probability, percentage, tableValue, method, mode, x, x1, x2, mean, sd } = result;

    const zDisplay = type === 'between'
      ? `z₁ = ${z1.toFixed(4)}, z₂ = ${z2.toFixed(4)}`
      : (z != null ? z.toFixed(6) : '—');

    const card = el('div', { class: 'prob-result-card' });

    // Z display
    if (mode === 'raw') {
      const xDisp = type === 'between'
        ? `X₁ = ${x1}, X₂ = ${x2}, μ = ${mean}, σ = ${sd}`
        : `X = ${x}, μ = ${mean}, σ = ${sd}`;
      card.appendChild(el('div', { class: 'prob-result-row prob-result-secondary' }, xDisp));
      card.appendChild(el('div', { class: 'prob-result-row' },
        el('span', { class: 'prob-result-label' }, 'Z-Score'),
        el('span', { class: 'prob-result-value prob-result-z' }, zDisplay)
      ));
    } else {
      card.appendChild(el('div', { class: 'prob-result-row' },
        el('span', { class: 'prob-result-label' }, 'Z-Score'),
        el('span', { class: 'prob-result-value prob-result-z' }, zDisplay)
      ));
    }

    // Tail type description
    const tailDesc = {
      left:    `P(Z ≤ ${z != null ? z.toFixed(4) : 'z'})`,
      right:   `P(Z > ${z != null ? z.toFixed(4) : 'z'})`,
      between: `P(${z1 != null ? z1.toFixed(4) : 'z₁'} < Z < ${z2 != null ? z2.toFixed(4) : 'z₂'})`,
      two:     `P(|Z| ≥ ${z != null ? Math.abs(z).toFixed(4) : '|z|'})`,
    }[type] || type;

    if (mode === 'raw' && type !== 'between' && x != null) {
      const xDesc = {
        left:  `P(X ≤ ${x})`,
        right: `P(X > ${x})`,
        two:   `P(|X - μ| ≥ |${x} - ${mean}|)`,
      }[type];
      if (xDesc) card.appendChild(el('div', { class: 'prob-result-row prob-result-secondary' }, xDesc));
    }

    card.appendChild(el('div', { class: 'prob-result-row' },
      el('span', { class: 'prob-result-label' }, tailDesc),
      el('div', { class: 'prob-result-value-group' },
        el('span', { class: 'prob-result-value prob-result-main' }, probability.toFixed(7)),
        el('span', { class: 'prob-result-pct' }, percentage.toFixed(4) + '%')
      )
    ));

    // Table value (if different from exact)
    if (tableValue != null) {
      const isSame = Math.abs(probability - tableValue) < 0.00005;
      card.appendChild(el('div', { class: 'prob-result-row' },
        el('span', { class: 'prob-result-label' }, 'Table Value (4 dp)'),
        el('span', { class: 'prob-result-value' + (isSame ? '' : ' prob-result-diff') },
          tableValue.toFixed(4) + (isSame ? '' : ` ← exact: ${probability.toFixed(7)}`)
        )
      ));
    }

    // Two-tailed breakdown
    if (type === 'two') {
      card.appendChild(el('div', { class: 'prob-result-divider' }));
      card.appendChild(el('div', { class: 'prob-result-row prob-result-secondary' },
        el('span', {}, `Left tail P(Z ≤ ${(-Math.abs(z)).toFixed(4)})`),
        el('span', {}, result.leftTail.toFixed(7))
      ));
      card.appendChild(el('div', { class: 'prob-result-row prob-result-secondary' },
        el('span', {}, `Right tail P(Z > ${Math.abs(z).toFixed(4)})`),
        el('span', {}, result.rightTail.toFixed(7))
      ));
    }

    // Significance interpretation
    if (type === 'two') {
      const sig = probability < 0.001 ? '*** p < .001' : probability < 0.01 ? '** p < .01' : probability < 0.05 ? '* p < .05' : 'Not significant (p ≥ .05)';
      card.appendChild(el('div', { class: 'prob-result-row prob-result-secondary' },
        el('span', { class: probability < 0.05 ? 'prob-sig' : 'prob-ns' }, sig)
      ));
    }

    card.appendChild(el('div', { class: 'prob-result-method' }, `Method: ${method === 'exact' ? 'Exact (normCdf)' : 'Z Table (4 dp)'}`));

    // Export button
    const exportBtn = el('button', { class: 'btn btn-sm prob-export-btn', onclick: () => exportToOutput(result) },
      '📋 Add to Output');
    card.appendChild(exportBtn);

    container.appendChild(card);
  }

  /* ── SVG Normal Curve Visualization ── */
  function renderVisualization(container, result) {
    const W = 420, H = 180, pad = { l: 30, r: 30, t: 20, b: 30 };
    const gW = W - pad.l - pad.r, gH = H - pad.t - pad.b;

    // Normal PDF
    const zRange = [-3.8, 3.8];
    const pdf = (z) => Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
    const maxPdf = pdf(0);

    function zToX(z) { return pad.l + (z - zRange[0]) / (zRange[1] - zRange[0]) * gW; }
    function pToY(p) { return pad.t + gH - (p / maxPdf) * gH * 0.9; }

    // Build path
    const steps = 200;
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const z = zRange[0] + (zRange[1] - zRange[0]) * i / steps;
      pts.push([zToX(z), pToY(pdf(z))]);
    }
    const curvePath = 'M' + pts.map(p => p.join(',')).join('L');
    const baselineY = pad.t + gH;

    // Build shaded region path
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', W); svg.setAttribute('height', H);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('class', 'prob-viz-svg');

    function makeShadePath(zFrom, zTo, color) {
      const pts2 = [];
      const s2 = 100;
      const zF = Math.max(zRange[0], zFrom);
      const zT = Math.min(zRange[1], zTo);
      for (let i = 0; i <= s2; i++) {
        const z = zF + (zT - zF) * i / s2;
        pts2.push([zToX(z), pToY(pdf(z))]);
      }
      const d = `M${zToX(zF)},${baselineY} L${pts2.map(p=>p.join(',')).join('L')} L${zToX(zT)},${baselineY} Z`;
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d', d);
      path.setAttribute('fill', color);
      path.setAttribute('opacity', '0.35');
      return path;
    }

    const { z, z1, z2, type } = result;

    // Shade regions
    if (type === 'left') {
      svg.appendChild(makeShadePath(zRange[0], z, '#3b82d4'));
    } else if (type === 'right') {
      svg.appendChild(makeShadePath(z, zRange[1], '#e6871e'));
    } else if (type === 'between') {
      svg.appendChild(makeShadePath(z1, z2, '#22c55e'));
    } else if (type === 'two') {
      svg.appendChild(makeShadePath(zRange[0], -Math.abs(z), '#7c5cd8'));
      svg.appendChild(makeShadePath(Math.abs(z), zRange[1], '#7c5cd8'));
    }

    // Curve
    const curve = document.createElementNS(ns, 'path');
    curve.setAttribute('d', curvePath);
    curve.setAttribute('fill', 'none');
    curve.setAttribute('stroke', 'var(--text-primary, #1f2328)');
    curve.setAttribute('stroke-width', '2');
    svg.appendChild(curve);

    // Baseline
    const baseline = document.createElementNS(ns, 'line');
    baseline.setAttribute('x1', pad.l); baseline.setAttribute('y1', baselineY);
    baseline.setAttribute('x2', W - pad.r); baseline.setAttribute('y2', baselineY);
    baseline.setAttribute('stroke', 'var(--border, #ccc)'); baseline.setAttribute('stroke-width', '1');
    svg.appendChild(baseline);

    // Z marker(s)
    function addZMarker(zVal, color, label) {
      const xPos = zToX(zVal);
      if (xPos < pad.l - 5 || xPos > W - pad.r + 5) return;
      const line2 = document.createElementNS(ns, 'line');
      line2.setAttribute('x1', xPos); line2.setAttribute('y1', pad.t);
      line2.setAttribute('x2', xPos); line2.setAttribute('y2', baselineY);
      line2.setAttribute('stroke', color); line2.setAttribute('stroke-width', '1.5');
      line2.setAttribute('stroke-dasharray', '3,2');
      svg.appendChild(line2);
      const txt = document.createElementNS(ns, 'text');
      txt.setAttribute('x', xPos); txt.setAttribute('y', H - 6);
      txt.setAttribute('text-anchor', 'middle');
      txt.setAttribute('font-size', '9');
      txt.setAttribute('fill', color);
      txt.textContent = label;
      svg.appendChild(txt);
    }

    if (type === 'between') {
      addZMarker(z1, '#22c55e', `z₁=${z1.toFixed(2)}`);
      addZMarker(z2, '#22c55e', `z₂=${z2.toFixed(2)}`);
    } else if (type === 'two') {
      addZMarker(-Math.abs(z), '#7c5cd8', `z=${(-Math.abs(z)).toFixed(2)}`);
      addZMarker(Math.abs(z), '#7c5cd8', `z=${Math.abs(z).toFixed(2)}`);
    } else {
      const color = type === 'left' ? '#3b82d4' : '#e6871e';
      addZMarker(z, color, `z=${z.toFixed(2)}`);
    }

    // μ = 0 marker
    const muX = zToX(0);
    const muTxt = document.createElementNS(ns, 'text');
    muTxt.setAttribute('x', muX); muTxt.setAttribute('y', H - 6);
    muTxt.setAttribute('text-anchor', 'middle');
    muTxt.setAttribute('font-size', '9');
    muTxt.setAttribute('fill', 'var(--text-muted, #777)');
    muTxt.textContent = 'μ=0';
    svg.appendChild(muTxt);

    container.appendChild(svg);
  }

  /* ── Tab: Find Critical Z ── */
  function renderCriticalTab(container) {
    const state = { probability: '0.975', tailType: 'left' };

    if (typeof _appMode !== 'undefined' && _appMode === 'simple') {
      container.appendChild(el('div', { class: 'prob-explainer' },
        el('p', {}, 'Find the Z value that corresponds to a given probability. For example: if you want P(Z ≤ z) = 0.975, the answer is Z ≈ 1.96.')
      ));
    }

    const fieldsEl = el('div', { class: 'prob-inputs-area' });
    const tailEl = el('div', { class: 'prob-row' });
    const resultEl = el('div', { class: 'prob-results-area' });

    function rebuild() {
      fieldsEl.innerHTML = '';
      tailEl.innerHTML = '';

      fieldsEl.appendChild(el('div', { class: 'prob-field' },
        el('label', { class: 'prob-label' }, 'Probability (0 < p < 1)'),
        el('input', { type: 'text', class: 'form-control prob-input', value: state.probability,
          oninput: e => { state.probability = e.target.value; },
          onkeydown: e => { if (e.key === 'Enter') calc(); }
        }),
        el('div', { class: 'prob-hint' }, 'Common values: 0.95, 0.975, 0.99, 0.995')
      ));

      tailEl.appendChild(el('label', { class: 'prob-section-label' }, 'Interpretation'));
      const tg = el('div', { class: 'prob-toggle-group' });
      [
        ['left',           'Left tail (P(Z ≤ z) = p)'],
        ['right',          'Right tail (P(Z > z) = p)'],
        ['two-confidence', 'Confidence level (e.g. 0.95)'],
        ['two-alpha',      'Alpha level (e.g. 0.05)'],
      ].forEach(([val, lbl]) => {
        const btn = el('button', {
          class: `prob-toggle-btn${state.tailType === val ? ' active' : ''}`,
          onclick: () => { state.tailType = val; rebuild(); }
        }, lbl);
        tg.appendChild(btn);
      });
      tailEl.appendChild(tg);
    }

    function calc() {
      resultEl.innerHTML = '';
      const r = ProbabilityCalc.criticalZ({ probability: state.probability, tailType: state.tailType });
      if (r.error) { resultEl.appendChild(el('div', { class: 'prob-error' }, '⚠ ' + r.error)); return; }

      const card = el('div', { class: 'prob-result-card' });
      card.appendChild(el('div', { class: 'prob-result-row' },
        el('span', { class: 'prob-result-label' }, r.label),
        el('span', { class: 'prob-result-value prob-result-z' }, `Z = ${r.z.toFixed(6)}`)
      ));
      card.appendChild(el('div', { class: 'prob-result-row prob-result-secondary' },
        el('span', {}, 'Verification: P(Z ≤ z) ='),
        el('span', {}, r.verification.toFixed(7))
      ));
      // Common reference values
      card.appendChild(el('div', { class: 'prob-result-divider' }));
      card.appendChild(el('div', { class: 'prob-result-secondary', style: { fontSize: '11px', color: 'var(--text-muted)' } },
        'Common critical values: Z(0.975) = 1.960 | Z(0.995) = 2.576 | Z(0.950) = 1.645 | Z(0.900) = 1.282'
      ));
      resultEl.appendChild(card);
    }

    rebuild();
    container.appendChild(fieldsEl);
    container.appendChild(tailEl);
    container.appendChild(el('button', { class: 'btn btn-primary prob-calc-btn', onclick: calc }, '⚡ Find Z'));
    container.appendChild(resultEl);
    calc();
  }

  /* ── Tab: P-Value from Z ── */
  function renderPValueTab(container, prefillZ) {
    const state = { z: prefillZ != null ? String(prefillZ) : '', alternative: 'two-sided' };
    const resultEl = el('div', { class: 'prob-results-area' });
    const vizEl = el('div', { class: 'prob-viz-area' });

    if (typeof _appMode !== 'undefined' && _appMode === 'simple') {
      container.appendChild(el('div', { class: 'prob-explainer' },
        el('p', {}, 'The p-value is the probability of observing a test statistic as extreme or more extreme as the one computed, assuming the null hypothesis is true.')
      ));
    }

    const altEl = el('div', { class: 'prob-row' },
      el('label', { class: 'prob-section-label' }, 'Alternative Hypothesis'),
      el('div', { class: 'prob-toggle-group' },
        ...[['two-sided', 'Two-Sided'], ['left', 'Left-Tailed'], ['right', 'Right-Tailed']].map(([val, lbl]) => {
          const btn = el('button', {
            class: `prob-toggle-btn${state.alternative === val ? ' active' : ''}`,
            onclick: () => {
              state.alternative = val;
              altEl.querySelectorAll('.prob-toggle-btn').forEach((b, i) => b.classList.toggle('active', ['two-sided','left','right'][i] === val));
              calc();
            }
          }, lbl);
          return btn;
        })
      )
    );

    function calc() {
      resultEl.innerHTML = '';
      vizEl.innerHTML = '';
      const r = ProbabilityCalc.pValueFromZ({ z: state.z, alternative: state.alternative });
      if (r.error) { resultEl.appendChild(el('div', { class: 'prob-error' }, '⚠ ' + r.error)); return; }

      const card = el('div', { class: 'prob-result-card' });
      card.appendChild(el('div', { class: 'prob-result-row' },
        el('span', { class: 'prob-result-label' }, 'Z'),
        el('span', { class: 'prob-result-value prob-result-z' }, r.z.toFixed(6))
      ));
      card.appendChild(el('div', { class: 'prob-result-row' },
        el('span', { class: 'prob-result-label' }, 'p-value'),
        el('span', { class: `prob-result-value ${r.pValue < 0.05 ? 'prob-sig' : 'prob-ns'}` }, r.pValue.toFixed(7))
      ));
      const sigText = r.pValue < 0.001 ? '*** Significant at p < .001' : r.pValue < 0.01 ? '** Significant at p < .01' : r.pValue < 0.05 ? '* Significant at p < .05' : 'Not significant at α = .05';
      card.appendChild(el('div', { class: 'prob-result-row prob-result-secondary' },
        el('span', { class: r.pValue < 0.05 ? 'prob-sig' : 'prob-ns' }, sigText)
      ));
      card.appendChild(el('div', { class: 'prob-result-method' }, `Alternative: ${r.alternative}`));
      resultEl.appendChild(card);

      // Visualization
      const vizResult = ProbabilityCalc.calculateNormal({
        mode: 'z', z: state.z,
        tailType: r.alternative === 'two-sided' ? 'two' : r.alternative === 'left' ? 'left' : 'right',
        method: 'exact'
      });
      if (!vizResult.error) renderVisualization(vizEl, vizResult);
    }

    container.appendChild(altEl);
    container.appendChild(el('div', { class: 'prob-inputs-area' },
      el('div', { class: 'prob-field' },
        el('label', { class: 'prob-label' }, 'Z Statistic'),
        el('input', { type: 'text', class: 'form-control prob-input', value: state.z,
          oninput: e => { state.z = e.target.value; },
          onkeydown: e => { if (e.key === 'Enter') calc(); }
        })
      )
    ));
    container.appendChild(el('button', { class: 'btn btn-primary prob-calc-btn', onclick: calc }, '⚡ Calculate p-value'));
    container.appendChild(vizEl);
    container.appendChild(resultEl);

    if (prefillZ != null) setTimeout(calc, 50);
  }

  /* ── Tab: Examples ── */
  function renderExamplesTab(container) {
    const examples = [
      {
        title: 'Example 1: Z = 1.96',
        desc: 'P(Z ≤ 1.96) — Classic confidence interval boundary',
        calc: { mode: 'z', tailType: 'left', z: 1.96, method: 'exact' },
        expected: 'P(Z ≤ 1.96) ≈ 0.9750 (97.50%)'
      },
      {
        title: 'Example 2: Raw Score — IQ',
        desc: 'X = 130, μ = 100, σ = 20 → Z = 1.50',
        calc: { mode: 'raw', tailType: 'left', x: 130, mean: 100, sd: 20, method: 'exact' },
        expected: 'P(X ≤ 130) ≈ 0.9332 (93.32%)'
      },
      {
        title: 'Example 3: Negative Z',
        desc: 'Z = −1.96, left tail',
        calc: { mode: 'z', tailType: 'left', z: -1.96, method: 'exact' },
        expected: 'P(Z ≤ −1.96) ≈ 0.0250 (2.50%)'
      },
      {
        title: 'Example 4: Two-Tailed Test',
        desc: 'Z = 1.96, two-tailed significance level',
        calc: { mode: 'z', tailType: 'two', z: 1.96, method: 'exact' },
        expected: 'P(|Z| ≥ 1.96) ≈ 0.0500 (5.00%)'
      },
      {
        title: 'Example 5: Z = 0 (Mean)',
        desc: 'Z = 0 is at the mean of the standard normal distribution',
        calc: { mode: 'z', tailType: 'left', z: 0, method: 'exact' },
        expected: 'P(Z ≤ 0) = 0.5000 (50.00%)'
      },
      {
        title: 'Example 6: Between',
        desc: 'P(−1.96 < Z < 1.96) — Middle 95%',
        calc: { mode: 'z', tailType: 'between', z1: -1.96, z2: 1.96, method: 'exact' },
        expected: 'P(−1.96 < Z < 1.96) ≈ 0.9500 (95.00%)'
      },
    ];

    const grid = el('div', { class: 'prob-examples-grid' });
    examples.forEach(ex => {
      const card = el('div', { class: 'prob-example-card' },
        el('div', { class: 'prob-example-title' }, ex.title),
        el('div', { class: 'prob-example-desc' }, ex.desc),
        el('div', { class: 'prob-example-expected' }, '✓ Expected: ' + ex.expected)
      );
      const runBtn = el('button', { class: 'btn btn-sm btn-primary', onclick: () => {
        // Calculate and show result inline
        const r = ProbabilityCalc.calculateNormal(ex.calc);
        const res = card.querySelector('.prob-example-result');
        if (res) res.remove();
        if (r.error) { card.appendChild(el('div', { class: 'prob-error' }, r.error)); return; }
        const resEl = el('div', { class: 'prob-example-result' },
          el('div', {}, `P = ${r.probability.toFixed(7)} (${r.percentage.toFixed(4)}%)`),
          el('div', { class: 'muted', style: { fontSize: '11px' } }, `Table: ${r.tableValue != null ? r.tableValue.toFixed(4) : '—'}`)
        );
        card.appendChild(resEl);
      }}, 'Run Example');
      card.appendChild(runBtn);
      grid.appendChild(card);
    });
    container.appendChild(el('h3', { class: 'prob-examples-title' }, 'Built-in Examples'));
    container.appendChild(grid);
  }

  /* ── Export result to Output Viewer ── */
  function exportToOutput(result) {
    const lines = [];
    lines.push('PROBABILITY CALCULATOR — Normal Distribution');
    lines.push('─'.repeat(50));
    if (result.mode === 'raw') {
      if (result.type !== 'between') {
        lines.push(`X = ${result.x}, μ = ${result.mean}, σ = ${result.sd}`);
      } else {
        lines.push(`X₁ = ${result.x1}, X₂ = ${result.x2}, μ = ${result.mean}, σ = ${result.sd}`);
      }
    }
    if (result.type === 'between') {
      lines.push(`Z₁ = ${result.z1.toFixed(6)}, Z₂ = ${result.z2.toFixed(6)}`);
    } else {
      lines.push(`Z = ${result.z.toFixed(6)}`);
    }
    const tailLabel = { left: 'Left Tail P(Z ≤ z)', right: 'Right Tail P(Z > z)', between: 'Between P(z₁ < Z < z₂)', two: 'Two-Tailed P(|Z| ≥ |z|)' }[result.type];
    lines.push(`${tailLabel}: ${result.probability.toFixed(7)} (${result.percentage.toFixed(4)}%)`);
    if (result.tableValue != null) lines.push(`Z-Table Value (4 dp): ${result.tableValue.toFixed(4)}`);
    lines.push(`Method: ${result.method === 'exact' ? 'Exact calculation (normCdf)' : 'Z-Table lookup'}`);

    const htmlOutput = `
      <div class="output-section">
        <h3 class="output-title">Probability Calculator — Normal Distribution</h3>
        <table class="pivot-table">
          <thead><tr><th>Parameter</th><th>Value</th></tr></thead>
          <tbody>
            ${result.type !== 'between' ? `<tr><td>Z-Score</td><td>${result.z.toFixed(6)}</td></tr>` : `<tr><td>Z₁</td><td>${result.z1.toFixed(6)}</td></tr><tr><td>Z₂</td><td>${result.z2.toFixed(6)}</td></tr>`}
            ${result.mode === 'raw' ? `<tr><td>μ (mean)</td><td>${result.mean}</td></tr><tr><td>σ (SD)</td><td>${result.sd}</td></tr>` : ''}
            <tr><td>${tailLabel}</td><td><strong>${result.probability.toFixed(7)}</strong></td></tr>
            <tr><td>Percentage</td><td>${result.percentage.toFixed(4)}%</td></tr>
            ${result.tableValue != null ? `<tr><td>Table Value</td><td>${result.tableValue.toFixed(4)}</td></tr>` : ''}
            <tr><td>Method</td><td>${result.method}</td></tr>
          </tbody>
        </table>
      </div>`;

    if (typeof Output !== 'undefined') {
      Output.addResult('probability_calculator', {
        status: 'complete',
        result: { html: htmlOutput, text: lines.join('\n'), data: result },
        warnings: []
      }, { distribution: 'normal' });
      if (typeof App !== 'undefined') App.navigate('output');
      notify('Added to Output', 'success');
    }
  }

  return { open };
})();

/* ══════════════════════════════════════════════════════════════════
   SECTION 10: OUTPUT VIEWER
   ══════════════════════════════════════════════════════════════════ */
