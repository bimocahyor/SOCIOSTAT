const StatTooltips = {
  definitions: {
    'p-value':       { title: 'p-value (Significance)', text: 'Probability of observing results as extreme as these if the null hypothesis is true. p < .05 is commonly used as a threshold, but does NOT prove an effect is real or important.' },
    'confidence-interval': { title: 'Confidence Interval (CI)', text: 'A range of plausible values for the true parameter. A 95% CI means: if we repeated the study many times, 95% of the intervals would contain the true value.' },
    'effect-size':   { title: 'Effect Size', text: 'A standardised measure of the magnitude of an effect (e.g. Cohen\'s d, r, η²). Unlike p-values, effect sizes are not affected by sample size and indicate practical significance.' },
    'standard-deviation': { title: 'Standard Deviation (SD)', text: 'Average distance of each observation from the mean. Larger SD = more spread. Uses n-1 (Bessel correction) for sample estimates.' },
    'cronbach-alpha': { title: "Cronbach's Alpha (α)", text: 'Measure of internal consistency for a scale. Ranges 0–1. Interpretation: α ≥ .90 Excellent; ≥ .80 Good; ≥ .70 Acceptable; ≥ .60 Questionable; < .60 Poor.' },
    'kmo':           { title: 'Kaiser-Meyer-Olkin (KMO)', text: 'Measure of sampling adequacy for factor analysis. KMO ≥ 0.6 is generally acceptable; < 0.5 is unacceptable.' },
    'vif':           { title: 'Variance Inflation Factor (VIF)', text: 'Measures multicollinearity in regression. VIF > 10 indicates severe multicollinearity; VIF > 5 is concerning. Tolerance = 1/VIF.' },
    'r-squared':     { title: 'R² (Coefficient of Determination)', text: 'Proportion of variance in the outcome explained by the predictors. R² = .30 means 30% of variance is explained. Adjusted R² penalises for extra predictors.' },
    'odds-ratio':    { title: 'Odds Ratio (OR)', text: 'In logistic regression: how much the odds of the outcome multiply for a one-unit increase in the predictor. OR > 1 = increased odds; OR < 1 = decreased odds; OR = 1 = no effect.' },
    'bartlett':      { title: "Bartlett's Test of Sphericity", text: 'Tests whether the correlation matrix is an identity matrix (no correlations). Significant p < .05 is required before factor analysis — it confirms variables are sufficiently correlated.' },
  },
  show(termKey, anchorEl) {
    const def = this.definitions[termKey];
    if (!def) return;
    document.querySelectorAll('.tooltip-popup').forEach(t => t.remove());
    const popup = el('div', { class: 'tooltip-popup' },
      el('div', { class: 'tooltip-popup-title' }, def.title),
      document.createTextNode(def.text)
    );
    document.body.appendChild(popup);
    const rect = anchorEl.getBoundingClientRect();
    let top = rect.bottom + 6, left = rect.left;
    if (top + 120 > window.innerHeight) top = rect.top - 130;
    if (left + 290 > window.innerWidth) left = window.innerWidth - 300;
    popup.style.top = top + 'px';
    popup.style.left = left + 'px';
    const dismiss = () => { popup.remove(); document.removeEventListener('click', dismiss); };
    setTimeout(() => document.addEventListener('click', dismiss), 100);
  },
  badge(termKey) {
    const b = el('span', { class: 'stat-tooltip', title: 'Click for explanation' }, 'ⓘ');
    b.addEventListener('click', e => { e.stopPropagation(); StatTooltips.show(termKey, b); });
    return b;
  }
};

/* ── Command Palette ────────────────────────────────────────────── */
const CommandPalette = (() => {
  const COMMANDS = [
    { group: 'Navigate', label: 'Home', icon: '⌂', action: () => App.navigate('home') },
    { group: 'Navigate', label: 'Data View', icon: '⊞', action: () => App.navigate('data') },
    { group: 'Navigate', label: 'Variable View', icon: '⊞', action: () => { App.setDataSubview('variable'); App.navigate('data'); } },
    { group: 'Navigate', label: 'Transform', icon: '⇄', action: () => App.navigate('transform') },
    { group: 'Navigate', label: 'Analyze', icon: '📊', action: () => App.navigate('analyze') },
    { group: 'Navigate', label: 'Output', icon: '📋', action: () => App.navigate('output') },
    { group: 'Navigate', label: 'Graphs', icon: '📈', action: () => App.navigate('graphs') },
    { group: 'Navigate', label: 'Syntax Editor', icon: '📝', action: () => App.navigate('syntax') },
    { group: 'Navigate', label: 'AI Assistant', icon: '🤖', action: () => App.navigate('ai') },
    { group: 'Navigate', label: 'History', icon: '🕐', action: () => App.navigate('history') },
    { group: 'Navigate', label: 'Settings', icon: '⚙', action: () => App.navigate('settings') },
    { group: 'Navigate', label: 'Help Center', icon: '❓', action: () => App.navigate('help') },
    { group: 'File', label: 'Import Dataset (CSV/XLSX)', icon: '📥', action: () => App.triggerImport() },
    { group: 'File', label: 'New Project', icon: '✚', action: () => Project.newProject() },
    { group: 'File', label: 'Save Project', icon: '💾', action: () => Project.saveProject() },
    { group: 'File', label: 'Export Dataset as CSV', icon: '📤', action: () => App.exportDataCSV() },
    { group: 'Analyze', label: 'Frequencies', icon: '📊', action: () => AnalysisDialogs.openFrequencies() },
    { group: 'Analyze', label: 'Descriptive Statistics', icon: '📊', action: () => AnalysisDialogs.openDescriptives() },
    { group: 'Analyze', label: 'Crosstabs + Chi-Square', icon: '📊', action: () => AnalysisDialogs.openCrosstabs() },
    { group: 'Analyze', label: 'Bivariate Correlation', icon: '📊', action: () => AnalysisDialogs.openCorrelation() },
    { group: 'Analyze', label: 'One-Sample T-Test', icon: '📊', action: () => AnalysisDialogs.openOneSampleT() },
    { group: 'Analyze', label: 'Independent-Samples T-Test', icon: '📊', action: () => AnalysisDialogs.openIndepT() },
    { group: 'Analyze', label: 'Paired-Samples T-Test', icon: '📊', action: () => AnalysisDialogs.openPairedT() },
    { group: 'Analyze', label: 'One-Way ANOVA', icon: '📊', action: () => AnalysisDialogs.openOneWayANOVA() },
    { group: 'Analyze', label: 'Linear Regression', icon: '📊', action: () => AnalysisDialogs.openLinearRegression() },
    { group: 'Analyze', label: 'Logistic Regression', icon: '📊', action: () => AnalysisDialogs.openLogisticRegression() },
    { group: 'Analyze', label: 'Reliability (Cronbach Alpha)', icon: '📊', action: () => AnalysisDialogs.openReliability() },
    { group: 'Analyze', label: 'Factor Analysis', icon: '📊', action: () => AnalysisDialogs.openFactorAnalysis() },
    { group: 'Analyze', label: 'Nonparametric Tests', icon: '📊', action: () => AnalysisDialogs.openNonparametric() },
    { group: 'Analyze', label: 'Probability Calculator (Normal)', icon: '📐', action: () => ProbabilityCalcUI.open() },
    { group: 'Transform', label: 'Compute Variable', icon: '⇄', action: () => TransformDialogs.openComputeVariable() },
    { group: 'Transform', label: 'Recode Variable', icon: '⇄', action: () => TransformDialogs.openRecode() },
    { group: 'Transform', label: 'Select Cases (Filter)', icon: '⇄', action: () => TransformDialogs.openSelectCases() },
    { group: 'Transform', label: 'Weight Cases', icon: '⇄', action: () => TransformDialogs.openWeightCases() },
    { group: 'Mode', label: 'Switch to Simple Mode', icon: '🎓', action: () => App.setMode('simple') },
    { group: 'Mode', label: 'Switch to Pro Mode', icon: '⚡', action: () => App.setMode('pro') },
    { group: 'Help', label: 'Start Guided Tour', icon: '🗺', action: () => OnboardingTour.start() },
    { group: 'Help', label: 'Guided Research Analysis', icon: '🔬', action: () => GuidedAnalysis.open() },
  ];

  let _overlay = null;
  let _focused = 0;
  let _filtered = [];

  function open() {
    close();
    _focused = 0;
    _overlay = el('div', { class: 'cmd-overlay', onclick: e => { if (e.target === _overlay) close(); } });
    const box = el('div', { class: 'cmd-box' });
    const inp = el('input', { class: 'cmd-input', placeholder: 'Search SOCIOSTAT... (Analyze, Navigate, Transform...)', type: 'text' });
    const resultsDiv = el('div', { class: 'cmd-results' });
    box.appendChild(el('div', { class: 'cmd-input-wrap' },
      el('span', { class: 'cmd-search-icon' }, '🔍'), inp
    ));
    box.appendChild(resultsDiv);
    _overlay.appendChild(box);
    document.body.appendChild(_overlay);
    inp.focus();

    function render(q) {
      _filtered = q
        ? COMMANDS.filter(c => (c.label + c.group).toLowerCase().includes(q.toLowerCase()))
        : COMMANDS;
      resultsDiv.innerHTML = '';
      if (!_filtered.length) { resultsDiv.appendChild(el('div', { class: 'cmd-empty' }, 'No results found')); return; }
      const groups = [...new Set(_filtered.map(c => c.group))];
      groups.forEach(grp => {
        resultsDiv.appendChild(el('div', { class: 'cmd-result-group' }, grp));
        _filtered.filter(c => c.group === grp).forEach((c, i) => {
          const idx = _filtered.indexOf(c);
          const item = el('div', { class: `cmd-result-item${idx === _focused ? ' focused' : ''}`,
            onclick: () => { close(); c.action(); } },
            el('span', { class: 'cmd-result-icon' }, c.icon),
            el('span', { class: 'cmd-result-label' }, c.label),
            el('span', { class: 'cmd-result-meta' }, c.group)
          );
          resultsDiv.appendChild(item);
        });
      });
    }

    render('');
    inp.addEventListener('input', () => { _focused = 0; render(inp.value); });
    inp.addEventListener('keydown', e => {
      if (e.key === 'Escape') { close(); return; }
      if (e.key === 'ArrowDown') { _focused = Math.min(_focused + 1, _filtered.length - 1); render(inp.value); }
      if (e.key === 'ArrowUp') { _focused = Math.max(_focused - 1, 0); render(inp.value); }
      if (e.key === 'Enter' && _filtered[_focused]) { close(); _filtered[_focused].action(); }
    });
  }

  function close() {
    if (_overlay) { _overlay.remove(); _overlay = null; }
  }

  // Global Ctrl+K
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); open(); }
  });

  return { open, close };
})();

/* ── Onboarding Tour ────────────────────────────────────────────── */
const OnboardingTour = (() => {
  const STEPS = [
    { title: 'Welcome to SOCIOSTAT', body: 'SOCIOSTAT is a statistical analysis workbench for sociology students and researchers. It works entirely in your browser — no installation or server required.', anchor: null },
    { title: 'Data View', body: 'The Data View shows your dataset as rows (cases) and columns (variables). Double-click any cell to edit it. Import CSV or XLSX files using the Import button.', anchor: 'nav-data' },
    { title: 'Variable View', body: 'Variable View lets you define metadata: variable labels, value labels (1=Male, 2=Female), missing values, and measurement levels (Nominal/Ordinal/Scale).', anchor: 'nav-data' },
    { title: 'Measurement Levels', body: 'Nominal: categories with no order (gender, region). Ordinal: ordered categories (education level, Likert scale). Scale: continuous numbers (age, income, scores).', anchor: null },
    { title: 'Transform', body: 'Transform lets you compute new variables, recode values, apply case filters, set frequency weights, and sort cases — all without destroying your original data.', anchor: 'nav-transform' },
    { title: 'Analyze', body: 'Analyze contains all statistical procedures: descriptives, t-tests, ANOVA, correlation, regression, reliability, factor analysis, and more. Results appear in Output.', anchor: 'nav-analyze' },
    { title: 'Output Viewer', body: 'Every analysis result is saved in the Output panel as a structured table. You can export results as HTML, PDF, or copy tables. Results include warnings and assumption checks.', anchor: 'nav-output' },
    { title: 'AI Assistant', body: 'The AI Assistant can explain statistical concepts, recommend procedures, help interpret results, and explain warnings. It never fabricates statistical values — all numbers come from real computation.', anchor: 'nav-ai' },
    { title: 'You\'re Ready!', body: 'Start by importing a dataset or creating a New Project. Use Ctrl+K to search for any feature quickly. If you need guidance, click "Guided Research Analysis" on the Home screen.', anchor: null },
  ];

  let _step = 0;
  let _box = null;
  let _active = false;

  function start() {
    _step = 0; _active = true; showStep();
  }

  function showStep() {
    if (_box) _box.remove();
    if (_step >= STEPS.length) { _active = false; return; }
    const s = STEPS[_step];
    const dots = el('div', { class: 'tour-dots' },
      ...STEPS.map((_, i) => el('div', { class: `tour-dot${i === _step ? ' active' : ''}` }))
    );
    _box = el('div', { class: 'tour-box' },
      el('div', { class: 'tour-box-title' }, s.title),
      el('div', { class: 'tour-box-body' }, s.body),
      el('div', { class: 'tour-box-footer' },
        dots,
        el('div', { class: 'flex gap-1' },
          _step > 0 ? el('button', { class: 'tour-btn skip', onclick: () => { _step--; showStep(); } }, '← Back') : null,
          el('button', { class: 'tour-btn skip', onclick: () => { _box.remove(); _active = false; } }, 'Skip'),
          el('button', { class: 'tour-btn', onclick: () => { _step++; showStep(); } },
            _step === STEPS.length - 1 ? '✓ Done' : 'Next →')
        )
      )
    );
    // Position: try to anchor near nav item, else bottom-right
    document.body.appendChild(_box);
    const anchor = s.anchor ? document.getElementById(s.anchor) : null;
    if (anchor) {
      const rect = anchor.getBoundingClientRect();
      _box.style.top = (rect.top + rect.height / 2 - 60) + 'px';
      _box.style.left = (rect.right + 12) + 'px';
    } else {
      _box.style.bottom = '60px';
      _box.style.right = '20px';
    }
  }

  return { start };
})();

/* ── Guided Analysis ────────────────────────────────────────────── */
const GuidedAnalysis = (() => {
  const OPTIONS = [
    { icon: '📋', title: 'Describe my data', desc: 'Summarise variables: frequencies, means, distributions.', procs: [
      { name: 'Frequencies', desc: 'Count how many times each value appears. Ideal for categorical variables.', fn: () => AnalysisDialogs.openFrequencies() },
      { name: 'Descriptive Statistics', desc: 'Mean, SD, min/max, skewness for numeric variables.', fn: () => AnalysisDialogs.openDescriptives() },
    ]},
    { icon: '⚖️', title: 'Compare groups', desc: 'Test if two or more groups differ significantly.', procs: [
      { name: 'Independent-Samples T-Test', desc: 'Compare means of two independent groups. Requires numeric outcome + binary grouping variable.', fn: () => AnalysisDialogs.openIndepT() },
      { name: 'Paired-Samples T-Test', desc: 'Compare two measurements on the same subjects (before/after).', fn: () => AnalysisDialogs.openPairedT() },
      { name: 'One-Way ANOVA', desc: 'Compare means across three or more groups.', fn: () => AnalysisDialogs.openOneWayANOVA() },
      { name: 'Mann-Whitney U', desc: 'Non-parametric alternative to independent t-test.', fn: () => AnalysisDialogs.openNonparametric() },
    ]},
    { icon: '🔗', title: 'Find relationships', desc: 'Test if two variables are associated.', procs: [
      { name: 'Pearson / Spearman Correlation', desc: 'Linear association between two numeric or ordinal variables.', fn: () => AnalysisDialogs.openCorrelation() },
      { name: 'Crosstabs + Chi-Square', desc: 'Association between two categorical variables.', fn: () => AnalysisDialogs.openCrosstabs() },
    ]},
    { icon: '🎯', title: 'Predict an outcome', desc: 'Build a model using predictors.', procs: [
      { name: 'Linear Regression', desc: 'Predict a continuous outcome from one or more predictors.', fn: () => AnalysisDialogs.openLinearRegression() },
      { name: 'Logistic Regression', desc: 'Predict a binary (yes/no) outcome.', fn: () => AnalysisDialogs.openLogisticRegression() },
    ]},
    { icon: '📏', title: 'Analyze questionnaire reliability', desc: 'Test if scale items measure consistently.', procs: [
      { name: 'Reliability Analysis (Cronbach\'s α)', desc: 'Internal consistency of Likert scale items. Also shows which items to remove.', fn: () => AnalysisDialogs.openReliability() },
    ]},
    { icon: '🧩', title: 'Find underlying dimensions', desc: 'Reduce many variables to fewer factors.', procs: [
      { name: 'Exploratory Factor Analysis', desc: 'Identify latent constructs behind a set of variables. Requires KMO ≥ 0.6.', fn: () => AnalysisDialogs.openFactorAnalysis() },
    ]},
    { icon: '👥', title: 'Classify cases into groups', desc: 'Discover natural clusters in your data.', procs: [
      { name: 'K-Means Cluster Analysis', desc: 'Partition cases into k clusters based on variable similarity.', fn: () => AnalysisDialogs.openKMeans() },
    ]},
    { icon: '⏱', title: 'Survival / time-to-event', desc: 'Analyze time until an event occurs.', procs: [
      { name: 'Kaplan-Meier Survival Analysis', desc: 'Estimate survival curves and compare groups using log-rank test.', fn: () => AnalysisDialogs.openKaplanMeier() },
    ]},
  ];

  let _selected = null;
  let _overlay = null;

  function open() {
    if (_overlay) _overlay.remove();
    _selected = null;
    _overlay = el('div', { class: 'guided-overlay', onclick: e => { if (e.target === _overlay) close(); } });
    const box = el('div', { class: 'guided-box' });

    const header = el('div', { class: 'guided-header' },
      el('h2', {}, '🔬 Guided Research Analysis'),
      el('p', {}, 'What are you trying to find out? Select a goal and we\'ll recommend the right procedure.')
    );

    const body = el('div', { class: 'guided-body', id: 'guided-body' });
    const footer = el('div', { class: 'guided-footer' },
      el('button', { class: 'btn btn-ghost btn-sm', onclick: () => close() }, 'Cancel')
    );

    OPTIONS.forEach(opt => {
      const item = el('div', { class: 'guided-option',
        onclick: () => {
          $$('.guided-option', box).forEach(o => o.classList.remove('selected'));
          item.classList.add('selected');
          _selected = opt;
          showProcs(opt);
        }
      },
        el('span', { class: 'guided-option-icon' }, opt.icon),
        el('div', { class: 'guided-option-body' },
          el('div', { class: 'guided-option-title' }, opt.title),
          el('div', { class: 'guided-option-desc' }, opt.desc)
        )
      );
      body.appendChild(item);
    });

    box.append(header, body, footer);
    _overlay.appendChild(box);
    document.body.appendChild(_overlay);
  }

  function showProcs(opt) {
    const body = document.getElementById('guided-body');
    if (!body) return;
    body.innerHTML = '';
    body.appendChild(el('div', { class: 'guided-option', style: { cursor: 'default', background: '#f0f6ff', borderColor: '#bfdbfe' } },
      el('span', { class: 'guided-option-icon' }, opt.icon),
      el('div', { class: 'guided-option-body' },
        el('div', { class: 'guided-option-title' }, opt.title),
        el('div', { class: 'guided-option-desc' }, opt.desc)
      )
    ));
    body.appendChild(el('p', { style: { fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', margin: '10px 0 6px', textTransform: 'uppercase', letterSpacing: '0.4px' } }, 'Recommended Procedures'));
    opt.procs.forEach(proc => {
      const card = el('div', { class: 'guided-proc-card' },
        el('div', { class: 'guided-proc-name' }, proc.name),
        el('div', { class: 'guided-proc-desc' }, proc.desc),
        el('button', { class: 'btn btn-primary btn-sm', onclick: () => { close(); proc.fn(); } }, `Open ${proc.name}`)
      );
      body.appendChild(card);
    });
    body.appendChild(el('button', { class: 'btn btn-ghost btn-sm', onclick: () => { _selected = null; rebuildOptions(); } }, '← Back to all options'));
  }

  function rebuildOptions() {
    const body = document.getElementById('guided-body');
    if (!body) return;
    body.innerHTML = '';
    OPTIONS.forEach(opt => {
      const item = el('div', { class: 'guided-option',
        onclick: () => { $$('.guided-option', body).forEach(o => o.classList.remove('selected')); item.classList.add('selected'); _selected = opt; showProcs(opt); }
      },
        el('span', { class: 'guided-option-icon' }, opt.icon),
        el('div', { class: 'guided-option-body' },
          el('div', { class: 'guided-option-title' }, opt.title),
          el('div', { class: 'guided-option-desc' }, opt.desc)
        )
      );
      body.appendChild(item);
    });
  }

  function close() { if (_overlay) { _overlay.remove(); _overlay = null; } }

  return { open, close };
})();

/* ── App State: Simple/Pro Mode ─────────────────────────────────── */

/* ══════════════════════════════════════════════════════════════════
   SECTION 18A: I18N — BILINGUAL SYSTEM (EN / ID)
   ══════════════════════════════════════════════════════════════════ */

const VarPicker = {
  /**
   * Creates a variable picker list — in-place DOM updates, scroll and focus preserved.
   * @param {Array} variables  - array of variable objects with {name, label, type, measurementLevel}
   * @param {Array} selected   - mutable array of selected variable names (modified in-place)
   * @param {Object} opts
   *   multi      {boolean}  allow multiple selection
   *   maxHeight  {string}   CSS max-height for the scrollable list
   *   onChange   {function} called with current selection array after every change
   *   filter     {function} optional filter predicate (v) => bool
   *   showSearch {boolean}  show search input above list
   *   showCount  {boolean}  show selected-count badge
   * @returns {HTMLElement}
   */
  create(variables, selected, opts = {}) {
    const { multi = true, maxHeight = '180px', onChange, filter, showSearch = false, showCount = false } = opts;
    const vars = filter ? variables.filter(filter) : variables;

    const container = el('div', { class: 'varpicker-wrap' });
    let _searchTerm = '';
    let _lastClickIdx = -1;

    // Optional search input
    if (showSearch) {
      const srch = el('input', { type: 'text', class: 'varpicker-search', placeholder: 'Search…' });
      srch.addEventListener('input', () => { _searchTerm = srch.value.toLowerCase(); _refreshAll(); });
      container.appendChild(srch);
    }

    // Count badge
    const countBadge = showCount ? el('div', { class: 'varpicker-count' }, '') : null;
    if (countBadge) container.appendChild(countBadge);
    function _countText() { return selected.length ? `${selected.length} selected` : ''; }

    // Action row (Select All / Clear) for multi pickers
    if (multi) {
      const actRow = el('div', { class: 'varpicker-actions' },
        el('button', { class: 'btn btn-xs', onclick: () => {
          vars.forEach(v => { if (!selected.includes(v.name)) selected.push(v.name); });
          _refreshAll(); onChange && onChange([...selected]);
        }}, 'All'),
        el('button', { class: 'btn btn-xs', onclick: () => {
          selected.length = 0;
          _refreshAll(); onChange && onChange([...selected]);
        }}, 'Clear')
      );
      container.appendChild(actRow);
    }

    const wrap = el('div', { class: 'varpicker', tabIndex: '0' });
    wrap.style.maxHeight = maxHeight;
    container.appendChild(wrap);

    function _isSel(vname) { return selected.includes(vname); }

    function _refreshAll() {
      const scrollTop = wrap.scrollTop;
      wrap.querySelectorAll('.varpicker-item').forEach(item => {
        const vname = item.dataset.vn;
        const isSel = _isSel(vname);
        item.classList.toggle('selected', isSel);
        const chk = item.querySelector('.varpicker-check');
        if (chk) chk.textContent = isSel ? '✓' : '';
        item.style.display = (_searchTerm && !vname.toLowerCase().includes(_searchTerm)) ? 'none' : '';
      });
      wrap.scrollTop = scrollTop;
      if (countBadge) countBadge.textContent = _countText();
    }

    if (!vars.length) {
      wrap.appendChild(el('div', { class: 'varpicker-empty' }, 'No variables available'));
    } else {
      vars.forEach((v, vi) => {
        const isSel = _isSel(v.name);
        const item = el('div', { class: `varpicker-item${isSel ? ' selected' : ''}` },
          el('span', { class: 'varpicker-check' }, isSel ? '✓' : ''),
          el('span', { class: `varpicker-type varpicker-type-${v.type || 'numeric'}` },
            (v.type || 'N')[0].toUpperCase()),
          el('span', { class: 'varpicker-name' }, v.name),
          v.label ? el('span', { class: 'varpicker-label' }, v.label) : null
        );
        item.dataset.vn = v.name;
        item.dataset.vi = String(vi);

        item.addEventListener('click', e => {
          const scrollTop = wrap.scrollTop;
          const wasSel = _isSel(v.name);
          if (multi && e.shiftKey && _lastClickIdx >= 0) {
            const lo = Math.min(vi, _lastClickIdx), hi = Math.max(vi, _lastClickIdx);
            for (let k = lo; k <= hi; k++) {
              if (!selected.includes(vars[k].name)) selected.push(vars[k].name);
            }
          } else if (multi && (e.ctrlKey || e.metaKey)) {
            if (wasSel) { const idx = selected.indexOf(v.name); if (idx >= 0) selected.splice(idx, 1); }
            else selected.push(v.name);
            _lastClickIdx = vi;
          } else {
            if (multi) {
              if (wasSel) { const idx = selected.indexOf(v.name); if (idx >= 0) selected.splice(idx, 1); }
              else selected.push(v.name);
            } else {
              selected.length = 0;
              if (!wasSel) selected.push(v.name);
            }
            _lastClickIdx = vi;
          }
          _refreshAll();
          wrap.scrollTop = scrollTop;
          onChange && onChange([...selected]);
        });

        wrap.appendChild(item);
      });
    }

    // Ctrl+A / Cmd+A
    wrap.addEventListener('keydown', e => {
      if (multi && (e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        vars.forEach(v => { if (!selected.includes(v.name)) selected.push(v.name); });
        _refreshAll(); onChange && onChange([...selected]);
      }
    });

    return container;
  },

  /**
   * Shorthand: single-select picker.
   */
  single(variables, onSelect, opts = {}) {
    const sel = [];
    return VarPicker.create(variables, sel, {
      multi: false,
      onChange: arr => onSelect(arr[0] || null),
      ...opts
    });
  }
};
