let _appMode = localStorage.getItem('sociostat_mode') || 'simple'; // 'simple' | 'pro'

const App = (() => {
  let _currentModule = 'home';
  let _dataSubview = 'data';
  const _lang = () => I18N.getLang();

  const NAV_SECTIONS = [
    { label: 'WORKSPACE', items: [
      { id: 'home',      label: 'Home',         icon: '⌂' },
      { id: 'data',      label: 'Data',         icon: '⊞' },
      { id: 'transform', label: 'Transform',    icon: '⇄' },
      { id: 'analyze',   label: 'Analyze',      icon: '📊' },
      { id: 'graphs',    label: 'Graphs',       icon: '📈' },
    ]},
    { label: 'RESULTS', items: [
      { id: 'output',    label: 'Output',       icon: '📋' },
      { id: 'history',   label: 'History',      icon: '🕐' },
    ]},
    { label: 'ASSIST', items: [
      { id: 'ai',        label: 'AI Assistant', icon: '🤖' },
      { id: 'syntax',    label: 'Syntax',       icon: '📝' },
    ]},
    { label: 'SYSTEM', items: [
      { id: 'help',      label: 'Help',         icon: '❓' },
      { id: 'settings',  label: 'Settings',     icon: '⚙' },
    ]},
  ];

  function init() {
    renderShell();
    navigate('home');
    // Show onboarding on first ever visit
    if (!localStorage.getItem('sociostat_toured')) {
      setTimeout(() => { localStorage.setItem('sociostat_toured','1'); OnboardingTour.start(); }, 800);
    }
  }

  function renderShell() {
    document.body.innerHTML = '';

    // ── Top Bar ──────────────────────────────────────────────────
    const topbar = el('div', { class: 'topbar', id: 'topbar' },
      el('div', { class: 'topbar-brand' },
        'SOCIOSTAT',
        el('span', { class: 'topbar-brand-badge' }, 'BETA')
      ),
      el('div', { class: 'topbar-title', id: 'topbar-title' },
        el('span', {}, 'Statistical Analysis Workbench')
      ),
      // Command palette search button
      el('button', { class: 'topbar-search-btn', onclick: () => CommandPalette.open() },
        '🔍 Search SOCIOSTAT...',
        el('span', { class: 'topbar-search-kbd' }, 'Ctrl K')
      ),
      // Mode toggle
      el('div', { class: 'topbar-mode-toggle', id: 'mode-toggle' },
        el('button', { class: `mode-btn${_appMode === 'simple' ? ' active' : ''}`, id: 'mode-btn-simple',
          onclick: () => setMode('simple'), title: 'Simple Mode — guided, explanations shown' }, '🎓 Simple'),
        el('button', { class: `mode-btn${_appMode === 'pro' ? ' active' : ''}`, id: 'mode-btn-pro',
          onclick: () => setMode('pro'), title: 'Pro Mode — full controls, advanced features' }, '⚡ Pro')
      ),
      el('div', { class: 'topbar-lang', id: 'topbar-lang' },
        el('button', { class: `lang-btn-mini${I18N.getLang()==='id'?' active':''}`, id: 'lang-btn-id',
          onclick: () => { I18N.setLang('id'); updateTopbarLang(); notify('Bahasa Indonesia aktif','info'); navigate(getCurrentModule()); }
        }, 'ID'),
        el('span', { style:{color:'rgba(255,255,255,0.3)',fontSize:'11px'} }, '|'),
        el('button', { class: `lang-btn-mini${I18N.getLang()==='en'?' active':''}`, id: 'lang-btn-en',
          onclick: () => { I18N.setLang('en'); updateTopbarLang(); notify('English active','info'); navigate(getCurrentModule()); }
        }, 'EN')
      ),
      el('div', { class: 'topbar-actions' },
        el('button', { class: 'btn btn-sm', onclick: () => Project.newProject() }, '+ New'),
        el('button', { class: 'btn btn-sm', onclick: () => Project.saveProject() }, '💾 Save'),
        el('button', { class: 'btn btn-sm', onclick: () => openImportFile() }, '📥 Import'),
        el('button', { class: 'btn btn-sm', onclick: () => Project.exportProject() }, '📤 Export')
      )
    );

    // ── Sidebar ──────────────────────────────────────────────────
    const sidebar = el('nav', { class: 'sidebar', id: 'sidebar' });
    NAV_SECTIONS.forEach((sec, si) => {
      if (si > 0) sidebar.appendChild(el('div', { class: 'sidebar-divider' }));
      sidebar.appendChild(el('div', { class: 'sidebar-section-label' }, sec.label));
      sec.items.forEach(item => {
        const li = el('div', {
          class: 'nav-item', id: `nav-${item.id}`,
          onclick: () => navigate(item.id),
          title: item.label
        },
          el('span', { class: 'nav-icon' }, item.icon),
          el('span', { class: 'nav-label' }, item.label)
        );
        sidebar.appendChild(li);
      });
    });

    // ── Main Workspace ───────────────────────────────────────────
    const workspace = el('div', { class: 'workspace', id: 'workspace' });

    // ── Status Bar ───────────────────────────────────────────────
    const statusbar = el('div', { class: 'statusbar', id: 'statusbar' });

    // Notification area
    const notifArea = el('div', { class: 'notif-area', id: 'notif-area' });

    document.body.append(topbar, sidebar, workspace, statusbar, notifArea);

    // Init sub-modules
    Output.init(null);  // Will be set when navigating to output
    History.init(null);
    SyntaxEditor.init(null);
    AIAssistant.init(null);
    GraphsModule.init(null);

    updateStatusBar();
  }

  function navigate(moduleId) {
    _currentModule = moduleId;
    $$('.nav-item').forEach(n => n.classList.remove('active'));
    const navEl = document.getElementById(`nav-${moduleId}`);
    if (navEl) navEl.classList.add('active');

    const workspace = document.getElementById('workspace');
    if (!workspace) return;
    workspace.innerHTML = '';

    switch (moduleId) {
      case 'home':      renderHome(workspace); break;
      case 'data':      renderDataModule(workspace); break;
      case 'transform': renderTransformModule(workspace); break;
      case 'analyze':   renderAnalyzeModule(workspace); break;
      case 'graphs':    GraphsModule.init(workspace); GraphsModule.render(); break;
      case 'syntax':    SyntaxEditor.init(workspace); SyntaxEditor.render(); break;
      case 'output':    Output.init(workspace); Output.render(); break;
      case 'history':   History.init(workspace); History.render(); break;
      case 'ai':        AIAssistant.init(workspace); AIAssistant.render(); break;
      case 'settings':  renderSettings(workspace); break;
      case 'help':      renderHelpModule(workspace); break;
    }
    updateStatusBar();
  }

  // Expose navigate for modules that need it (AIAssistant action system, GraphsModule empty state)
  AIAssistant.setNavigateFn(navigate);
  window._sociostatNavigate = navigate;
  window._sociostatRenderDataModule = () => renderDataModule();

  function setMode(mode) {
    _appMode = mode;
    localStorage.setItem('sociostat_mode', mode);
    // Update buttons
    const bs = document.getElementById('mode-btn-simple');
    const bp = document.getElementById('mode-btn-pro');
    if (bs) bs.classList.toggle('active', mode === 'simple');
    if (bp) bp.classList.toggle('active', mode === 'pro');
    notify(`Switched to ${mode === 'simple' ? '🎓 Simple' : '⚡ Pro'} mode`, 'info');
    // Re-render current module
    navigate(_currentModule);
  }

  function setDataSubview(v) { _dataSubview = v; }

  function triggerImport() { openImportFile(); }

  function renderDataModule(container) {
    const ws = container || document.getElementById('workspace');
    if (!ws) return;
    ws.innerHTML = '';

    // Simple mode hint
    if (_appMode === 'simple') {
      ws.appendChild(el('div', { class: 'simple-hint', style: { margin: '8px 10px 0' } },
        el('span', { class: 'simple-hint-icon' }, 'ℹ️'),
        el('div', {},
          el('strong', {}, 'Data View'), ' shows your cases (rows) and variables (columns). ',
          el('strong', {}, 'Variable View'), ' lets you define labels, measurement levels, and missing values. ',
          el('span', { style: { color: 'var(--accent)', cursor: 'pointer', fontWeight: '600' },
            onclick: () => OnboardingTour.start() }, 'Start guided tour →')
        )
      ));
    }

    const tabs = el('div', { class: 'data-tabs' },
      el('button', { class: `tab-btn${_dataSubview === 'data' ? ' active' : ''}`,
        onclick: () => { _dataSubview = 'data'; renderDataModule(); } }, '⊞ Data View'),
      el('button', { class: `tab-btn${_dataSubview === 'variable' ? ' active' : ''}`,
        onclick: () => { _dataSubview = 'variable'; renderDataModule(); } }, '📋 Variable View')
    );
    ws.appendChild(tabs);

    const content = el('div', { class: 'data-content' });
    ws.appendChild(content);

    const ds = AppState.get('activeDataset');
    if (_dataSubview === 'data') { DataView.init(content); DataView.render(ds); }
    else { VariableView.init(content); VariableView.render(ds); }
  }

  function renderTransformModule(container) {
    const ws = container || document.getElementById('workspace');
    ws.innerHTML = '';

    const ds = AppState.get('activeDataset');
    const isId = _lang() === 'id';

    const wrap = el('div', { class: 'transform-workspace' });

    // ── Header ───────────────────────────────────────────────────
    wrap.appendChild(el('div', { class: 'transform-header' },
      el('h2', {}, I18N.t('transformTitle')),
      el('p', {}, isId
        ? 'Apa yang ingin Anda ubah dari data Anda?'
        : 'What would you like to change about your data?')
    ));

    // ── Simple mode guidance card ────────────────────────────────
    if (_appMode === 'simple') {
      wrap.appendChild(el('div', { class: 'simple-hint', style: { marginBottom: '16px' } },
        el('span', { class: 'simple-hint-icon' }, '💡'),
        el('div', {},
          isId
            ? 'Transformasi tidak menghancurkan data asli. Anda selalu bisa membatalkan atau membuat variabel baru.'
            : 'Transformations do not delete your original data. You can always undo or create a new variable instead of overwriting.'
        )
      ));
    }

    // ── Active state badges ──────────────────────────────────────
    const activeKeys = new Set();
    if (ds) {
      if (ds.activeFilter) activeKeys.add('filter');
      if (ds.weightVariable) activeKeys.add('weight');
      if (ds.splitVariables && ds.splitVariables.length) activeKeys.add('split');
    }

    // ── Card definitions ─────────────────────────────────────────
    const CARDS = [
      {
        icon: 'ƒ', key: 'compute',
        title: I18N.t('computeTitle'),
        desc: isId
          ? 'Hitung kolom baru dari variabel yang ada menggunakan ekspresi matematika.'
          : 'Create a variable using a formula.',
        example: 'price_million = harga_usd / 1000000',
        fn: () => TransformDialogs.openComputeVariable()
      },
      {
        icon: '↔', key: 'recode',
        title: I18N.t('recodeTitle'),
        desc: isId
          ? 'Petakan nilai lama ke nilai baru, atau kelompokkan kategori.'
          : 'Change values or group categories.',
        example: 'LCGC + Menengah → 1',
        fn: () => TransformDialogs.openRecode()
      },
      {
        icon: '↕', key: 'sort',
        title: I18N.t('sortTitle'),
        desc: isId
          ? 'Susun ulang baris data berdasarkan satu atau lebih variabel.'
          : 'Reorder cases by variable values.',
        example: null,
        fn: () => TransformDialogs.openSortCases()
      },
      {
        icon: '⊃', key: 'filter',
        title: I18N.t('filterTitle'),
        desc: isId
          ? 'Sementara simpan hanya kasus yang memenuhi kondisi tertentu.'
          : 'Temporarily include only matching cases.',
        example: 'age >= 18',
        fn: () => TransformDialogs.openSelectCases()
      },
      {
        icon: '⚖', key: 'weight',
        title: I18N.t('weightTitle'),
        desc: isId
          ? 'Berikan frekuensi berbeda pada kasus untuk analisis berbobot survei.'
          : 'Give different frequency weights to cases.',
        example: null,
        fn: () => TransformDialogs.openWeightCases()
      },
      {
        icon: '⊞', key: 'split',
        title: I18N.t('splitTitle'),
        desc: isId
          ? 'Jalankan analisis secara terpisah untuk setiap kelompok variabel.'
          : 'Run analyses separately by groups.',
        example: null,
        fn: () => TransformDialogs.openSplitFile()
      }
    ];

    // ── Grid of cards ─────────────────────────────────────────────
    const grid = el('div', { class: 'transform-grid-v2' });
    CARDS.forEach(card => {
      const isActive = activeKeys.has(card.key);
      const c = el('div', { class: 'transform-card-v2' + (isActive ? ' tc-active' : '') });

      // Icon (large, centered)
      c.appendChild(el('div', { class: 'tc-icon' }, card.icon));

      // Title
      c.appendChild(el('div', { class: 'tc-title' }, card.title));

      // Description
      c.appendChild(el('div', { class: 'tc-desc' }, card.desc));

      // Example code (if any)
      if (card.example) {
        c.appendChild(el('div', { class: 'tc-example' }, card.example));
      }

      // Active badge
      if (isActive) {
        c.appendChild(el('div', { class: 'tc-active-badge' }, '✓ Active'));
      }

      // Spacer to push button to bottom
      c.appendChild(el('div', { class: 'tc-spacer' }));

      // Start button (ONLY this launches dialog)
      const startBtn = el('button', { class: 'tc-start-btn' }, isId ? 'Mulai →' : 'Start →');
      startBtn.addEventListener('click', e => { e.stopPropagation(); card.fn(); });
      c.appendChild(startBtn);

      grid.appendChild(c);
    });

    wrap.appendChild(grid);
    ws.appendChild(wrap);
  }

  function renderAnalyzeModule(container) {
    const ws = container || document.getElementById('workspace');
    ws.innerHTML = '';

    const wrap = el('div', { class: 'analyze-workspace' });
    wrap.appendChild(el('div', { class: 'analyze-header' },
      el('h2', {}, '📊 Analyze'),
      el('p', {}, 'Select a statistical procedure. ' + (_appMode === 'simple' ? 'Start with a research question below, or browse procedures.' : 'All procedures are available below.'))
    ));

    // Simple mode: guided question chips
    if (_appMode === 'simple') {
      const qBox = el('div', { class: 'analyze-question-box' });
      qBox.appendChild(el('h3', {}, '💡 What do you want to know?'));
      const questions = [
        { label: 'Describe my data', action: () => GuidedAnalysis.open() },
        { label: 'Compare groups', action: () => GuidedAnalysis.open() },
        { label: 'Find relationships', action: () => GuidedAnalysis.open() },
        { label: 'Predict an outcome', action: () => GuidedAnalysis.open() },
        { label: 'Analyze questionnaire', action: () => GuidedAnalysis.open() },
        { label: 'Find dimensions/factors', action: () => GuidedAnalysis.open() },
        { label: 'Cluster cases', action: () => GuidedAnalysis.open() },
      ];
      const chips = el('div', { class: 'question-chips' });
      questions.forEach(q => {
        chips.appendChild(el('div', { class: 'question-chip', onclick: () => GuidedAnalysis.open() }, q.label));
      });
      qBox.appendChild(chips);
      qBox.appendChild(el('p', { style: { fontSize:'11px', color:'var(--text-muted)', marginTop:'10px' } },
        'Or browse all procedures below. Switch to ⚡ Pro mode for direct access without guidance.'));
      wrap.appendChild(qBox);
    }

    // All procedures as cards
    const CATALOG = [
      { title: 'Descriptive Statistics', desc: '', recommended: ['Frequencies', 'Descriptive Statistics'], items: [
        { label: 'Frequencies', desc: 'Count and percent for each value', badge: 'beginner', fn: () => AnalysisDialogs.openFrequencies() },
        { label: 'Descriptive Statistics', desc: 'Mean, SD, min/max, skewness', badge: 'beginner', fn: () => AnalysisDialogs.openDescriptives() },
        { label: 'Crosstabs + Chi-Square', desc: 'Association between categorical variables', badge: 'beginner', fn: () => AnalysisDialogs.openCrosstabs() },
      ]},
      { title: 'Compare Means', desc: '', items: [
        { label: 'One-Sample T-Test', desc: 'Compare one mean to a known value', badge: 'intermediate', fn: () => AnalysisDialogs.openOneSampleT() },
        { label: 'Independent-Samples T-Test', desc: 'Compare two independent groups', badge: 'intermediate', fn: () => AnalysisDialogs.openIndepT() },
        { label: 'Paired-Samples T-Test', desc: 'Compare two related measurements', badge: 'intermediate', fn: () => AnalysisDialogs.openPairedT() },
        { label: 'One-Way ANOVA', desc: 'Compare three or more groups', badge: 'intermediate', fn: () => AnalysisDialogs.openOneWayANOVA() },
      ]},
      { title: 'Correlate', desc: '', items: [
        { label: 'Bivariate Correlation', desc: 'Pearson, Spearman, or Kendall', badge: 'beginner', fn: () => AnalysisDialogs.openCorrelation() },
      ]},
      { title: 'Regression', desc: '', items: [
        { label: 'Linear Regression', desc: 'Predict a continuous outcome', badge: 'intermediate', fn: () => AnalysisDialogs.openLinearRegression() },
        { label: 'Binary Logistic Regression', desc: 'Predict a binary outcome', badge: 'advanced', fn: () => AnalysisDialogs.openLogisticRegression() },
      ]},
      { title: 'Scale / Reliability', desc: '', items: [
        { label: "Reliability (Cronbach's α)", desc: 'Internal consistency of Likert scales', badge: 'intermediate', fn: () => AnalysisDialogs.openReliability() },
      ]},
      { title: 'Dimension Reduction', desc: '', items: [
        { label: 'Exploratory Factor Analysis', desc: 'Find latent constructs', badge: 'advanced', fn: () => AnalysisDialogs.openFactorAnalysis() },
      ]},
      { title: 'Nonparametric Tests', desc: '', items: [
        { label: 'Nonparametric Tests', desc: 'Mann-Whitney, Wilcoxon, Kruskal-Wallis, Friedman', badge: 'intermediate', fn: () => AnalysisDialogs.openNonparametric() },
      ]},
      { title: 'Cluster Analysis', desc: '', items: [
        { label: 'K-Means Cluster Analysis', desc: 'Classify cases into k groups', badge: 'advanced', fn: () => AnalysisDialogs.openKMeans() },
      ]},
      { title: 'Survival Analysis', desc: '', items: [
        { label: 'Kaplan-Meier', desc: 'Survival curves and log-rank test', badge: 'advanced', fn: () => AnalysisDialogs.openKaplanMeier() },
      ]},
      { title: 'Probability & Distributions', desc: '', items: [
        { label: 'Probability Calculator', desc: 'Normal distribution: Z-score, probability, critical Z, p-value.', badge: 'beginner', fn: () => ProbabilityCalcUI.open() },
        { label: "Student's t Distribution", desc: 'Critical t, p-value, hypothesis test, reference table, graph.', badge: 'intermediate', fn: () => StudentTUI.open() },
        { label: 'Chi-Square Distribution', desc: 'Coming soon', badge: 'intermediate', fn: () => notify('Chi-square distribution — coming soon', 'warning', 2000) },
        { label: 'F Distribution', desc: 'Coming soon', badge: 'intermediate', fn: () => notify('F distribution — coming soon', 'warning', 2000) },
        { label: 'Binomial / Poisson / Hypergeometric', desc: 'Coming soon', badge: 'intermediate', fn: () => notify('Discrete distributions — coming soon', 'warning', 2000) },
      ]},
    ];

    const badgeColor = { beginner: '#dcfce7', intermediate: '#fef3c7', advanced: '#ede9fe' };
    const badgeText = { beginner: '#15803d', intermediate: '#92400e', advanced: '#6d28d9' };

    CATALOG.forEach(sec => {
      wrap.appendChild(el('div', { class: 'analyze-section-header' }, sec.title));
      const grid = el('div', { class: 'analyze-grid' });
      sec.items.forEach(item => {
        const card = el('div', { class: 'analyze-card', onclick: item.fn },
          el('div', { class: 'analyze-card-title' }, item.label),
          el('div', { class: 'analyze-card-desc' }, item.desc),
          el('div', { class: 'analyze-card-badge',
            style: { background: badgeColor[item.badge] || '#f3f4f6', color: badgeText[item.badge] || '#374151' } },
            item.badge)
        );
        grid.appendChild(card);
      });
      wrap.appendChild(grid);
    });

    ws.appendChild(wrap);
  }

  function renderHome(container) {
    const ws = container || document.getElementById('workspace');
    ws.innerHTML = '';
    const screen = el('div', { class: 'home-screen' });

    // Hero
    const hero = el('div', { class: 'home-hero' });
    const hc = el('div', { class: 'home-hero-content' });
    hc.appendChild(el('div', { class: 'home-title' },
      'SOCIO', el('span', {}, 'STAT')
    ));
    hc.appendChild(el('p', { class: 'home-author' }, I18N.t('heroAuthor')));
    hc.appendChild(el('p', { class: 'home-tagline' }, I18N.t('heroTagline')));
    const heroActions = el('div', { class: 'home-hero-actions' });
    heroActions.appendChild(el('button', { class: 'home-hero-btn primary', onclick: () => openImportFile() }, I18N.t('importDataset')));
    heroActions.appendChild(el('button', { class: 'home-hero-btn secondary', onclick: () => Project.newProject() }, I18N.t('newProject')));
    heroActions.appendChild(el('button', { class: 'home-hero-btn secondary', onclick: () => GuidedAnalysis.open() }, I18N.t('guidedAnalysis')));
    heroActions.appendChild(el('button', { class: 'home-hero-btn secondary', onclick: () => OnboardingTour.start() }, I18N.t('takeTour')));
    hc.appendChild(heroActions);
    hero.appendChild(hc);
    screen.appendChild(hero);

    // Body
    const body = el('div', { class: 'home-body' });

    // What would you like to do?
    body.appendChild(el('div', { class: 'home-section-title' }, I18N.t('whatToDo')));
    const actionCards = [
      { icon: '📥', title: 'Analyze my data', desc: 'Import a dataset and run statistical analysis', fn: () => openImportFile() },
      { icon: '🔍', title: 'Understand variables', desc: 'Define labels, types, missing values', fn: () => { navigate('data'); setDataSubview('variable'); } },
      { icon: '🔗', title: 'Find relationships', desc: 'Correlation, crosstabs, association', fn: () => { navigate('analyze'); } },
      { icon: '⚖️', title: 'Compare groups', desc: 'T-test, ANOVA, nonparametric tests', fn: () => { navigate('analyze'); } },
      { icon: '📏', title: 'Analyze questionnaire', desc: 'Reliability, factor analysis', fn: () => { navigate('analyze'); } },
      { icon: '📈', title: 'Create charts', desc: 'Histogram, scatter, boxplot, bar', fn: () => navigate('graphs') },
      { icon: '📝', title: 'Build a research report', desc: 'Export output to HTML, PDF, XLSX', fn: () => navigate('output') },
      { icon: '🎓', title: 'Learn statistics', desc: 'Help center, guided tour, AI Assistant', fn: () => navigate('help') },
    ];
    const agrid = el('div', { class: 'action-grid' });
    actionCards.forEach(c => {
      agrid.appendChild(el('div', { class: 'action-card', onclick: c.fn },
        el('div', { class: 'action-card-icon' }, c.icon),
        el('div', { class: 'action-card-title' }, c.title),
        el('div', { class: 'action-card-desc' }, c.desc)
      ));
    });
    body.appendChild(agrid);

    // Recent Projects
    body.appendChild(el('div', { class: 'home-section-title' }, I18N.t('recentProjects')));
    const recentArea = el('div', { id: 'recent-projects-area' });
    recentArea.appendChild(el('p', { class: 'muted text-sm' }, 'Loading...'));
    body.appendChild(recentArea);
    DB.listProjects().then(projects => {
      recentArea.innerHTML = '';
      if (!projects.length) {
        recentArea.appendChild(el('p', { class: 'muted text-sm' }, I18N.t('noRecentProjects')));
        return;
      }
      const grid = el('div', { class: 'project-grid' });
      projects.slice(0, 8).forEach(p => {
        const card = el('div', { class: 'project-card' });
        card.appendChild(el('div', { class: 'project-card-name', onclick: () => Project.openProject(p.id) }, p.name));
        card.appendChild(el('div', { class: 'project-card-meta' },
          `${(p.datasets||[]).length} dataset(s) · ${fmtDate(p.updatedAt||p.createdAt)}`));
        const actions = el('div', { class: 'project-card-actions' },
          el('button', { class: 'btn btn-xs', title: I18N.t('openProject'),
            onclick: () => Project.openProject(p.id) }, I18N.t('openProject')),
          el('button', { class: 'btn btn-xs', title: I18N.t('renameProject'),
            onclick: async () => {
              const newName = prompt('New name:', p.name);
              if (newName && newName.trim()) {
                await Project.renameProject(p.id, newName.trim());
                navigate('home');
              }
            }}, I18N.t('renameProject')),
          el('button', { class: 'btn btn-xs', title: I18N.t('duplicateProject'),
            onclick: async () => { await Project.duplicateProject(p.id); navigate('home'); }
          }, I18N.t('duplicateProject')),
          el('button', { class: 'btn btn-xs btn-danger', title: I18N.t('deleteProject'),
            onclick: async () => {
              if (!confirm(I18N.t('deleteProjectConfirm', p.name))) return;
              await Project.deleteProject(p.id);
              navigate('home');
            }}, I18N.t('deleteProject'))
        );
        card.appendChild(actions);
        grid.appendChild(card);
      });
      recentArea.appendChild(grid);
    });

    // Quick Start
    body.appendChild(el('div', { class: 'home-section-title', style: { marginTop: '24px' } }, 'Quick Start Guide'));
    body.appendChild(el('ol', { class: 'quickstart-list' },
      el('li', {}, 'Click ', el('strong', {}, 'Import Dataset'), ' or ', el('strong', {}, '+ New Project')),
      el('li', {}, 'Inspect your data in ', el('strong', {}, 'Data View'), ' — each row is a case, each column a variable'),
      el('li', {}, 'Define variable metadata in ', el('strong', {}, 'Variable View'), ' — labels, measurement levels, missing values'),
      el('li', {}, 'Use ', el('strong', {}, 'Transform'), ' to recode, compute new variables, or apply filters'),
      el('li', {}, 'Go to ', el('strong', {}, 'Analyze'), ' — or use ', el('strong', {}, '🔬 Guided Analysis'), ' if unsure which test to use'),
      el('li', {}, 'View structured results in ', el('strong', {}, 'Output'), ' — export to HTML, PDF, or XLSX'),
      el('li', {}, 'Use ', el('strong', {}, 'Ctrl+K'), ' to search for any feature, procedure, or navigation item')
    ));

    screen.appendChild(body);
    ws.appendChild(screen);
  }

  function renderSettings(container) {
    container.innerHTML = '';
    const wrap = el('div', { class: 'settings-workspace' });
    wrap.appendChild(el('h2', { style: { marginBottom: '20px' } }, `⚙ ${I18N.t('settingsTitle')}`));

    // Mode
    wrap.appendChild(el('div', { class: 'settings-section' },
      el('h4', {}, I18N.t('modeLabel')),
      el('div', { class: 'settings-row' },
        el('label', {}, I18N.t('simpleModeDesc')),
        el('button', { class: `btn btn-sm${_appMode === 'simple' ? ' btn-primary' : ''}`,
          onclick: () => setMode('simple') }, _appMode === 'simple' ? '✓ Active' : 'Switch')
      ),
      el('div', { class: 'settings-row' },
        el('label', {}, I18N.t('proModeDesc')),
        el('button', { class: `btn btn-sm${_appMode === 'pro' ? ' btn-primary' : ''}`,
          onclick: () => setMode('pro') }, _appMode === 'pro' ? '✓ Active' : 'Switch')
      )
    ));

    // Language
    const langSec = el('div', { class: 'settings-section' },
      el('h4', {}, I18N.t('languageLabel'))
    );
    const langToggle = el('div', { class: 'lang-toggle' });
    ['en','id'].forEach(code => {
      const label = code === 'en' ? '🇬🇧 English' : '🇮🇩 Bahasa Indonesia';
      const btn = el('button', {
        class: `lang-btn${I18N.getLang() === code ? ' active' : ''}`,
        onclick: () => {
          I18N.setLang(code);
          notify(code === 'id' ? 'Bahasa diubah ke Indonesia' : 'Language set to English', 'success');
          navigate('settings');
        }
      }, label);
      langToggle.appendChild(btn);
    });
    langSec.appendChild(langToggle);
    wrap.appendChild(langSec);

    // Storage manager
    const storageSec = el('div', { class: 'settings-section', id: 'storage-section' },
      el('h4', {}, I18N.t('storageLabel')),
      el('p', { class: 'muted small' }, 'Loading storage info...')
    );
    wrap.appendChild(storageSec);
    DB.listProjects().then(projects => {
      storageSec.innerHTML = '';
      storageSec.appendChild(el('h4', {}, I18N.t('storageLabel')));
      const totalDatasets = projects.reduce((s, p) => s + (p.datasets || []).length, 0);
      const totalOutputs = projects.reduce((s, p) => s + (p.outputs || []).length, 0);
      const stats = el('div', { class: 'storage-stats' });
      [
        [I18N.t('storageProjects'), projects.length],
        [I18N.t('storageDatasets'), totalDatasets],
        ['Outputs', totalOutputs],
      ].forEach(([label, val]) => {
        stats.appendChild(el('div', { class: 'storage-stat' },
          el('div', { class: 'storage-stat-num' }, String(val)),
          el('div', { class: 'storage-stat-label' }, label)
        ));
      });
      storageSec.appendChild(stats);
      storageSec.appendChild(el('div', { class: 'form-row', style: { marginTop: '12px' } },
        el('button', { class: 'btn btn-sm btn-danger', onclick: async () => {
          if (!confirm(I18N.t('clearAllConfirm'))) return;
          await Project.clearAllProjects();
          navigate('settings');
        }}, I18N.t('clearAllProjectsBtn'))
      ));
    });

    // Project
    wrap.appendChild(el('div', { class: 'settings-section' },
      el('h4', {}, I18N.t('projectLabel')),
      el('div', { class: 'form-row' },
        el('button', { class: 'btn btn-sm btn-secondary', onclick: () => Project.exportProject() }, I18N.t('exportProjectBtn')),
        el('button', { class: 'btn btn-sm btn-secondary', onclick: () => openProjectImport() }, I18N.t('importProjectBtn'))
      )
    ));

    // Data
    wrap.appendChild(el('div', { class: 'settings-section' },
      el('h4', {}, 'Data'),
      el('div', { class: 'form-row' },
        el('button', { class: 'btn btn-sm btn-secondary', onclick: () => exportDataCSV() }, I18N.t('exportCsvBtn')),
        el('button', { class: 'btn btn-sm btn-secondary', onclick: () => exportDataXLSX() }, I18N.t('exportXlsxBtn'))
      )
    ));

    // Tour
    wrap.appendChild(el('div', { class: 'settings-section' },
      el('h4', {}, 'Help & Tour'),
      el('div', { class: 'form-row' },
        el('button', { class: 'btn btn-sm btn-secondary', onclick: () => OnboardingTour.start() }, I18N.t('tourBtn')),
        el('button', { class: 'btn btn-sm btn-secondary', onclick: () => {
          localStorage.removeItem('sociostat_toured');
          notify(I18N.t('tourReset'), 'info');
        }}, I18N.t('resetTourBtn'))
      )
    ));

    // System Status
    const statusSec = el('div', { class: 'settings-section' }, el('h4', {}, '🔧 System Status'));
    function renderLibStatusRows() {
      statusSec.querySelectorAll('.lib-status-row').forEach(r => r.remove());
      const libs = [
        { key: 'jstat',      label: 'Statistics (jStat)',  icon: '📐' },
        { key: 'papaparse',  label: 'CSV (PapaParse)',     icon: '📄' },
        { key: 'xlsx',       label: 'Excel (XLSX)',        icon: '📊' },
        { key: 'echarts',    label: 'Charts (ECharts)',    icon: '📈' },
        { key: 'jspdf',      label: 'PDF (jsPDF)',         icon: '🖨️'  },
      ];
      libs.forEach(lib => {
        const info = LibraryLoader.status(lib.key);
        const badgeCls = info.state === 'ready' ? 'splash-badge-ok' : info.state === 'loading' ? 'splash-badge-loading' : 'splash-badge-fail';
        const badgeTxt = info.state === 'ready' ? 'Ready' : info.state === 'loading' ? 'Loading…' : 'Unavailable';
        const row = el('div', { class: 'settings-row lib-status-row', style: { alignItems: 'center' } },
          el('span', { style: { marginRight: '6px' } }, lib.icon),
          el('label', { style: { flex: '1' } }, lib.label),
          el('span', { class: `splash-status-badge ${badgeCls}`, style: { marginRight: '8px' } }, badgeTxt),
          info.state !== 'ready'
            ? el('button', { class: 'btn btn-sm', onclick: () => {
                LibraryLoader.retry(lib.key).then(() => renderLibStatusRows()).catch(() => renderLibStatusRows());
              }}, 'Retry')
            : el('span', {})
        );
        statusSec.appendChild(row);
      });
    }
    renderLibStatusRows();
    wrap.appendChild(statusSec);

    // Developer Diagnostics
    const devSec = el('div', { class: 'settings-section' });
    devSec.appendChild(el('h4', {}, '🔬 Developer Diagnostics'));
    devSec.appendChild(el('p', { class: 'muted small' }, 'Trace the data pipeline to diagnose N=0 issues. Results print to the browser console (F12) and appear below.'));

    const diagOutput = el('div', {
      style: {
        fontFamily: 'monospace', fontSize: '11px', background: '#1e1e2e', color: '#cdd6f4',
        borderRadius: '8px', padding: '12px', marginTop: '10px', maxHeight: '400px',
        overflowY: 'auto', whiteSpace: 'pre', display: 'none', lineHeight: '1.5'
      }
    });

    function showDiagResult(text) {
      diagOutput.style.display = '';
      diagOutput.textContent = text;
    }

    // Row 1: Self-test + active dataset
    const row1 = el('div', { class: 'form-row', style: { flexWrap: 'wrap', gap: '8px' } });

    row1.appendChild(el('button', {
      class: 'btn btn-sm btn-primary',
      onclick: () => {
        const r = DataPipelineInspector.printSelfTest();
        const lines = ['╔══ PIPELINE SELF-TEST ══╗'];
        Object.entries(r).forEach(([k, v]) => {
          if (k === '_summary') return;
          lines.push(`[${v.pass ? 'PASS' : 'FAIL'}] ${k}: ${v.detail}`);
        });
        lines.push('');
        lines.push(`CONCLUSION: ${r._summary.conclusion}`);
        showDiagResult(lines.join('\n'));
      }
    }, '▶ Run Pipeline Self-Test'));

    row1.appendChild(el('button', {
      class: 'btn btn-sm',
      onclick: () => {
        const ds = AppState.get('activeDataset');
        if (!ds) { showDiagResult('No active dataset loaded. Import a CSV first.'); return; }
        const text = DataPipelineInspector.printInspect(ds);
        showDiagResult(text);
      }
    }, '🔍 Inspect Active Dataset'));

    row1.appendChild(el('button', {
      class: 'btn btn-sm',
      onclick: () => {
        const ds = AppState.get('activeDataset');
        if (!ds) { showDiagResult('No active dataset.'); return; }
        // Show first 3 raw case objects
        const cases3 = ds.cases.slice(0, 3);
        const lines = ['=== FIRST 3 RAW CASE OBJECTS ==='];
        cases3.forEach((row, i) => { lines.push(`Case[${i}]: ${JSON.stringify(row)}`); });
        lines.push('');
        lines.push('=== VARIABLE METADATA ===');
        ds.variables.forEach(v => {
          lines.push(`  ${v.name} | type:${v.type} | level:${v.measurementLevel} | missing:${JSON.stringify(v.missingValues||[])}`);
        });
        console.log(lines.join('\n'));
        showDiagResult(lines.join('\n'));
      }
    }, '📋 Show Raw Cases'));

    row1.appendChild(el('button', {
      class: 'btn btn-sm',
      onclick: () => {
        const ds = AppState.get('activeDataset');
        if (!ds) { showDiagResult('No active dataset.'); return; }
        const firstNumVar = ds.variables.find(v => v.type === 'numeric');
        if (!firstNumVar) { showDiagResult('No numeric variable found.'); return; }
        try {
          const resolved = Stats.resolveDataset(ds, [firstNumVar.name], {});
          const lines = [
            `=== RESOLVE TRACE: ${firstNumVar.name} ===`,
            `Metadata: FOUND (type=${firstNumVar.type}, level=${firstNumVar.measurementLevel})`,
            `Cases total: ${ds.cases.length}`,
            `Raw col length: ${resolved.data[firstNumVar.name]?.length ?? 'N/A'}`,
            `Resolved N (after listwise): ${resolved.n}`,
            `Active filter: ${ds.activeFilter || 'NONE'}`,
            `Weight: ${ds.weightVariable || 'NONE'}`,
            `Warnings: ${resolved.warnings.join('; ') || 'none'}`,
            '',
            `First 5 resolved values: ${JSON.stringify((resolved.data[firstNumVar.name] || []).slice(0, 5))}`,
          ];
          // Also show first 5 raw values from cases
          const raw5 = ds.cases.slice(0, 5).map(row => row[firstNumVar.name]);
          lines.push(`First 5 raw case values: ${JSON.stringify(raw5)}`);
          lines.push(`typeof first raw: ${typeof raw5[0]}`);
          console.log(lines.join('\n'));
          showDiagResult(lines.join('\n'));
        } catch (e) {
          showDiagResult(`resolveDataset threw: ${e.message}\n${e.stack || ''}`);
        }
      }
    }, '⚙ Trace resolveDataset'));

    devSec.appendChild(row1);
    devSec.appendChild(diagOutput);
    wrap.appendChild(devSec);

    // About
    wrap.appendChild(el('div', { class: 'settings-section' },
      el('h4', {}, I18N.t('aboutLabel')),
      el('p', { class: 'muted text-sm' }, 'SOCIOSTAT — Statistical Analysis Workbench'),
      el('p', { class: 'muted text-sm' }, I18N.t('version')),
      el('p', { class: 'muted text-sm' }, I18N.t('disclaimer'))
    ));

    container.appendChild(wrap);
  }

  function renderHelpModule(container) {
    container.innerHTML = '';
    const HELP = [
      { section: 'Getting Started', items: [
        { title: 'What is SOCIOSTAT?', content: '<h2>What is SOCIOSTAT?</h2><p>SOCIOSTAT is a web-based statistical analysis workbench inspired by the workflow of professional statistical software. It runs entirely in your browser — no installation, no server required.</p><p>It supports the full research workflow: data import → variable metadata → transformation → analysis → output → interpretation → report.</p>' },
        { title: 'Importing Data', content: '<h2>Importing Data</h2><p>SOCIOSTAT supports CSV and XLSX files. Use the <strong>📥 Import</strong> button in the topbar to open the Import Wizard.</p><h3>Import Wizard Steps</h3><ul><li><strong>Upload</strong> — drag and drop or select your file</li><li><strong>Preview</strong> — see detected columns and sample rows</li><li><strong>Types</strong> — confirm or correct data types</li><li><strong>Missing values</strong> — define how missing data is coded</li><li><strong>Measurement levels</strong> — set Nominal, Ordinal, or Scale for each variable</li><li><strong>Confirm</strong> — import into your active project</li></ul>' },
        { title: 'Simple vs Pro Mode', content: '<h2>Simple vs Pro Mode</h2><p><strong>Simple Mode (🎓)</strong> — designed for beginners and students. Shows explanations, guided analysis, and contextual hints throughout the interface.</p><p><strong>Pro Mode (⚡)</strong> — direct access to all procedures without guidance. Recommended for researchers familiar with statistical methods.</p><p>Switch modes at any time using the toggle in the topbar or via Settings.</p>' },
      ]},
      { section: 'Measurement Levels', items: [
        { title: 'Nominal', content: '<h2>Nominal Variables</h2><p>Nominal variables represent categories without any natural order. The numbers are just labels.</p><h3>Examples</h3><ul><li>Gender: 1 = Male, 2 = Female, 3 = Other</li><li>Region: 1 = Urban, 2 = Suburban, 3 = Rural</li><li>Religion, ethnicity, political party</li></ul><h3>Appropriate analyses</h3><ul><li>Frequencies</li><li>Crosstabs + Chi-Square</li><li>Mode</li></ul><div class="help-example-box"><strong>Research example:</strong> "Is there a difference in political party preference between urban and rural residents?" → Crosstabs with Chi-Square.</div>' },
        { title: 'Ordinal', content: '<h2>Ordinal Variables</h2><p>Ordinal variables have a meaningful order, but the intervals between values are not necessarily equal.</p><h3>Examples</h3><ul><li>Education level: 1 = Primary, 2 = Secondary, 3 = Tertiary</li><li>Likert scale: 1 = Strongly Disagree … 5 = Strongly Agree</li><li>Socioeconomic class: Low, Middle, High</li></ul><h3>Appropriate analyses</h3><ul><li>Frequencies, crosstabs</li><li>Spearman or Kendall correlation</li><li>Mann-Whitney U, Kruskal-Wallis</li></ul><div class="help-example-box"><strong>Note:</strong> Many researchers treat 5-point or 7-point Likert scales as approximately continuous (Scale) for practical reasons, but the ordinal approach is more conservative.</div>' },
        { title: 'Scale', content: '<h2>Scale (Continuous) Variables</h2><p>Scale variables have equal intervals between values and can be meaningfully added, subtracted, and averaged.</p><h3>Examples</h3><ul><li>Age, income, temperature, test scores</li><li>Composite index scores (e.g. social trust score)</li></ul><h3>Appropriate analyses</h3><ul><li>Mean, SD, variance</li><li>Pearson correlation</li><li>T-tests, ANOVA</li><li>Linear regression</li></ul>' },
      ]},
      { section: 'Statistical Tests', items: [
        { title: 'Choosing the Right Test', content: '<h2>Choosing the Right Test</h2><p>Use <strong>🔬 Guided Analysis</strong> on the Home screen or Analyze module to get recommendations.</p><h3>Quick decision guide</h3><ul><li><strong>Describe data</strong> → Frequencies, Descriptives</li><li><strong>Two categorical variables</strong> → Crosstabs + Chi-Square</li><li><strong>Two scale variables</strong> → Pearson Correlation</li><li><strong>Compare 2 independent groups (scale outcome)</strong> → Independent T-Test</li><li><strong>Compare 3+ groups</strong> → One-Way ANOVA</li><li><strong>Predict continuous outcome</strong> → Linear Regression</li><li><strong>Predict binary outcome</strong> → Logistic Regression</li><li><strong>Scale reliability</strong> → Reliability Analysis (Cronbach\'s α)</li></ul>' },
        { title: 'p-value and Significance', content: '<h2>Understanding p-values</h2><p>The p-value is the probability of observing a result as extreme as yours (or more) if the null hypothesis were true.</p><p>p < .05 is commonly used as a threshold for "statistical significance", but this does NOT mean:</p><ul><li>The result is important or large</li><li>The effect is real with certainty</li><li>The relationship is causal</li></ul><p>Always report effect sizes alongside p-values. Always consider sample size and research design.</p><div class="help-example-box"><strong>Caution:</strong> p < .05 with N = 10,000 may reflect a trivially small effect. p = .08 with N = 20 may reflect a meaningful but underpowered effect.</div>' },
        { title: 'Effect Sizes', content: '<h2>Effect Sizes</h2><p>Effect sizes measure the magnitude of an effect independently of sample size.</p><ul><li><strong>Cohen\'s d</strong> (T-test): Small = 0.2, Medium = 0.5, Large = 0.8</li><li><strong>r</strong> (Correlation): Small = 0.1, Medium = 0.3, Large = 0.5</li><li><strong>η² (eta squared)</strong> (ANOVA): Small = .01, Medium = .06, Large = .14</li><li><strong>R²</strong> (Regression): proportion of variance explained</li></ul><p>Effect sizes are arguably more informative than p-values for practical and substantive interpretation.</p>' },
      ]},
      { section: 'Sociology Research', items: [
        { title: 'Likert Scale Analysis', content: '<h2>Analyzing Likert Scales</h2><p>Likert scales (e.g. 1–5 Strongly Disagree to Strongly Agree) are common in social science surveys.</p><h3>Steps</h3><ol><li>Define value labels in Variable View (1 = Strongly Disagree, etc.)</li><li>Check internal consistency with Reliability Analysis (Cronbach\'s α)</li><li>Create a composite score with Compute Variable (average of items)</li><li>Use the composite as a Scale variable in further analyses</li></ol><div class="help-example-box"><strong>Example:</strong> Social trust scale with 5 items → α = .82 (Good) → compute trust_index = mean of items → use in correlation with political participation.</div>' },
        { title: 'Survey Data Workflow', content: '<h2>Survey Data Workflow</h2><ol><li>Import CSV from survey export</li><li>Define variable labels and value labels in Variable View</li><li>Define missing values (e.g. 99 = refused, 98 = don\'t know)</li><li>Set measurement levels (nominal for categorical, ordinal/scale for Likert)</li><li>Check missing data patterns</li><li>Recode reverse-scored items if needed</li><li>Compute composite scale scores</li><li>Run reliability analysis on scales</li><li>Run descriptive statistics for the sample profile</li><li>Run inferential analyses based on research questions</li></ol>' },
      ]},
    ];

    const helpWrap = el('div', { class: 'help-workspace' });
    const helpSide = el('div', { class: 'help-sidebar' });
    const helpContent = el('div', { class: 'help-content', id: 'help-content' });

    let _activeItem = HELP[0].items[0];

    function showHelp(item) {
      _activeItem = item;
      helpContent.innerHTML = item.content;
      $$('.help-sidebar-item').forEach(i => i.classList.remove('active'));
      const matching = Array.from(helpSide.querySelectorAll('.help-sidebar-item')).find(i => i.dataset.title === item.title);
      if (matching) matching.classList.add('active');
    }

    HELP.forEach(sec => {
      helpSide.appendChild(el('div', { class: 'help-sidebar-section' }, sec.section));
      sec.items.forEach(item => {
        const sideItem = el('div', {
          class: 'help-sidebar-item' + (item === _activeItem ? ' active' : ''),
          onclick: () => showHelp(item)
        }, item.title);
        sideItem.dataset.title = item.title;
        helpSide.appendChild(sideItem);
      });
    });

    showHelp(_activeItem);
    helpWrap.append(helpSide, helpContent);
    container.appendChild(helpWrap);
  }

  function openImportFile() {
    const inp = el('input', { type: 'file', accept: '.csv,.xlsx,.xls' });
    inp.onchange = e => {
      const file = e.target.files[0];
      if (!file) return;
      ImportWizard.open(file, dataset => {
        Project.loadDatasetIntoApp(dataset);
        History.addEntry({ type: 'import', name: dataset.name, cases: dataset.cases.length, timestamp: new Date().toISOString() });
      });
    };
    inp.click();
  }

  function openProjectImport() {
    const inp = el('input', { type: 'file', accept: '.json' });
    inp.onchange = e => { const file = e.target.files[0]; if (file) Project.importProject(file); };
    inp.click();
  }

  function exportDataCSV() {
    const ds = AppState.get('activeDataset');
    if (!ds) { notify('No dataset loaded', 'warning'); return; }
    const headers = ds.variables.map(v => v.name);
    const rows = ds.cases.map(c => headers.map(h => c[h] ?? ''));
    const csv = [headers.join(','), ...rows.map(r => r.map(v => typeof v === 'string' && v.includes(',') ? `"${v}"` : v).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = el('a', { href: URL.createObjectURL(blob), download: `${ds.name}.csv` });
    a.click();
  }

  function exportDataXLSX() {
    const ds = AppState.get('activeDataset');
    if (!ds) { notify('No dataset loaded', 'warning'); return; }
    if (typeof XLSX === 'undefined') { notify('Excel export unavailable — library not loaded. Retry from Settings → System Status.', 'error'); return; }
    const headers = ds.variables.map(v => v.name);
    const rows = ds.cases.map(c => headers.map(h => c[h] ?? null));
    const ws2 = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws2, 'Data');
    XLSX.writeFile(wb, `${ds.name}.xlsx`);
  }

  function updateStatusBar() {
    const sb = document.getElementById('statusbar');
    if (!sb) return;
    const ds = AppState.get('activeDataset');
    if (!ds) {
      sb.innerHTML = '<span class="status-item">No dataset loaded</span>';
      return;
    }
    // Actual cases = rows with at least one non-missing registered value.
    // This excludes untouched visual placeholder rows.
    const actualCases = (typeof AnalysisEligibility !== 'undefined')
      ? AnalysisEligibility.getActualCaseCount(ds)
      : ds.cases.length;
    const filterCases = ds.activeFilter
      ? Transform.applyFilter(ds.cases, ds.activeFilter, ds.variables).length
      : actualCases;

    sb.innerHTML = '';
    const items = [
      `Dataset: ${ds.name}`,
      `Cases: ${filterCases}${ds.activeFilter ? ` (of ${actualCases} filtered)` : ''}`,
      `Variables: ${ds.variables.length}`,
      ds.activeFilter ? `Filter: ${ds.activeFilter.slice(0, 30)}` : null,
      ds.weightVariable ? `Weight: ${ds.weightVariable}` : null,
      ds.splitVariables && ds.splitVariables.length ? `Split: ${ds.splitVariables.join(', ')}` : null
    ].filter(Boolean);
    items.forEach(i => sb.appendChild(el('span', { class: 'status-item' }, i)));
  }

  function updateTopbarLang() {
    const bid = document.getElementById('lang-btn-id');
    const ben = document.getElementById('lang-btn-en');
    if (bid) bid.classList.toggle('active', I18N.getLang() === 'id');
    if (ben) ben.classList.toggle('active', I18N.getLang() === 'en');
  }

  function updateTitleBar() {
    const proj = AppState.get('currentProject');
    const titleEl = document.getElementById('topbar-title');
    if (titleEl && proj) {
      titleEl.innerHTML = '';
      titleEl.appendChild(el('span', {}, proj.name + (Project.isDirty() ? ' *' : '')));
    }
  }

  function getCurrentModule() { return _currentModule; }

  return {
    init, navigate, renderDataModule, updateStatusBar, updateTitleBar,
    getCurrentModule, setMode, setDataSubview, triggerImport,
    exportDataCSV, exportDataXLSX, updateTopbarLang
  };
})();

/* ══════════════════════════════════════════════════════════════════
   SECTION 19: LIBRARY LOADER + BOOTSTRAP
   Loads optional CDN libraries asynchronously.
   Core application starts immediately — never waits for optional libs.
   ══════════════════════════════════════════════════════════════════ */

const LibraryLoader = (() => {
  const LIBS = {
    jstat: {
      url: 'https://cdnjs.cloudflare.com/ajax/libs/jstat/1.9.6/jstat.min.js',
      global: 'jStat', timeout: 8000
    },
    papaparse: {
      url: 'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js',
      global: 'Papa', timeout: 8000
    },
    xlsx: {
      url: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
      global: 'XLSX', timeout: 10000
    },
    echarts: {
      url: 'https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js',
      global: 'echarts', timeout: 10000
    },
    jspdf: {
      url: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
      global: 'jspdf', timeout: 10000
    },
    jspdf_autotable: {
      url: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.6.0/jspdf.plugin.autotable.min.js',
      global: null, timeout: 8000, dependsOn: 'jspdf'
    },
  };

  // state: 'idle' | 'loading' | 'ready' | 'failed'
  const _state = {};
  const _callbacks = {};

  Object.keys(LIBS).forEach(k => { _state[k] = 'idle'; _callbacks[k] = []; });

  function status(key) {
    return { state: _state[key] || 'idle' };
  }

  function load(key) {
    const def = LIBS[key];
    if (!def) return Promise.resolve();

    // If already ready, resolve immediately
    if (_state[key] === 'ready') return Promise.resolve();

    // If loading, return a promise that resolves/rejects when done
    if (_state[key] === 'loading') {
      return new Promise((res, rej) => { _callbacks[key].push({ res, rej }); });
    }

    _state[key] = 'loading';

    // If depends on another lib, load that first
    const parentLoad = def.dependsOn ? load(def.dependsOn) : Promise.resolve();

    return parentLoad.then(() => new Promise((res, rej) => {
      _callbacks[key].push({ res, rej });

      // Check if already in DOM (e.g. duplicate call)
      if (def.global && typeof window[def.global] !== 'undefined') {
        _state[key] = 'ready';
        _drain(key, true);
        return;
      }

      const script = document.createElement('script');
      script.src = def.url;
      script.async = true;

      const timer = setTimeout(() => {
        script.onload = script.onerror = null;
        _state[key] = 'failed';
        console.warn(`[LibraryLoader] ${key} timed out after ${def.timeout}ms`);
        _drain(key, false, new Error(`${key} load timeout`));
      }, def.timeout);

      script.onload = () => {
        clearTimeout(timer);
        _state[key] = 'ready';
        console.log(`[LibraryLoader] ${key} ready`);
        _drain(key, true);
      };

      script.onerror = () => {
        clearTimeout(timer);
        _state[key] = 'failed';
        console.warn(`[LibraryLoader] ${key} failed to load`);
        _drain(key, false, new Error(`${key} failed to load`));
      };

      document.head.appendChild(script);
    })).catch(err => {
      _state[key] = 'failed';
      console.warn(`[LibraryLoader] ${key} dependency failed:`, err);
    });
  }

  function retry(key) {
    if (_state[key] === 'loading') return new Promise((res, rej) => { _callbacks[key].push({ res, rej }); });
    _state[key] = 'idle';
    // Remove existing script tag to force reload
    const existing = document.head.querySelector(`script[src="${LIBS[key]?.url}"]`);
    if (existing) existing.remove();
    return load(key);
  }

  function _drain(key, ok, err) {
    const cbs = _callbacks[key].splice(0);
    cbs.forEach(cb => ok ? cb.res() : cb.rej(err));
  }

  function loadAll() {
    return Promise.allSettled(
      Object.keys(LIBS).filter(k => !LIBS[k].dependsOn).map(k => load(k))
    );
  }

  return { load, loadAll, retry, status };
})();

/* ── Fault-tolerant Splash ───────────────────────────────────────── */
(function bootSplash() {
  const CORE_TIMEOUT_MS = 5000; // max wait before forcing app open
  const OPTIONAL_LIBS = ['jstat', 'papaparse', 'xlsx', 'echarts', 'jspdf', 'jspdf_autotable'];

  const splashSub    = document.getElementById('splash-sub');
  const splashStatus = document.getElementById('splash-status');
  const splashSpin   = document.getElementById('splash-spinner');
  const splashActs   = document.getElementById('splash-actions');

  function updateSplashStatus() {
    if (!splashStatus) return;
    const libs = [
      { key: 'jstat',     label: 'Statistics engine' },
      { key: 'papaparse', label: 'CSV library' },
      { key: 'xlsx',      label: 'Excel library' },
      { key: 'echarts',   label: 'Charts library' },
      { key: 'jspdf',     label: 'PDF library' },
    ];
    splashStatus.innerHTML = '';
    splashStatus.classList.add('visible');
    libs.forEach(lib => {
      const s = LibraryLoader.status(lib.key).state;
      const icon = s === 'ready' ? '✓' : s === 'failed' ? '⚠' : '⏳';
      const badge = s === 'ready' ? 'splash-badge-ok' : s === 'failed' ? 'splash-badge-fail' : 'splash-badge-loading';
      const badgeTxt = s === 'ready' ? 'Ready' : s === 'failed' ? 'Unavailable' : 'Loading…';
      const row = document.createElement('div');
      row.className = 'splash-status-row';
      row.innerHTML = `<span class="splash-status-icon">${icon}</span>` +
        `<span class="splash-status-label">${lib.label}</span>` +
        `<span class="splash-status-badge ${badge}">${badgeTxt}</span>`;
      splashStatus.appendChild(row);
    });
  }

  function showOpenButton() {
    if (!splashActs) return;
    if (splashSub) splashSub.textContent = 'Core application ready.';
    if (splashSpin) splashSpin.classList.add('hidden');
    splashActs.style.display = 'block';
    splashActs.innerHTML = '';
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary';
    btn.textContent = 'Open SOCIOSTAT';
    btn.onclick = () => launchApp();
    splashActs.appendChild(btn);
  }

  function launchApp() {
    DB.init().then(() => App.init()).catch(err => {
      console.error('[SOCIOSTAT] DB init failed, running without persistence:', err);
      App.init();
    });

    // Expose diagnostic helpers to the browser console so developers can run:
    //   DataIntegrity.inspect(AppState.get('activeDataset'))
    //   SS.ds()          → get active dataset
    //   SS.check()       → run integrity check on active dataset
    //   SS.inspect()     → print detailed report to console
    window.DataIntegrity = DataIntegrity;
    window.DataTypeConverter = DataTypeConverter;
    window.SS = {
      ds:      ()  => AppState.get('activeDataset'),
      check:   ()  => DataIntegrity.check(AppState.get('activeDataset')),
      inspect: ()  => DataIntegrity.inspect(AppState.get('activeDataset')),
      migrate: ()  => {
        const ds = AppState.get('activeDataset');
        if (!ds) { console.log('No active dataset'); return; }
        const r = DataIntegrity.migrateSchema(ds);
        console.log('Migration result:', r);
        return r;
      },
      resolve: (varNames) => {
        const ds = AppState.get('activeDataset');
        if (!ds) { console.log('No active dataset'); return; }
        return Stats.resolveDataset(ds, varNames || ds.variables.slice(0,3).map(v=>v.name));
      },
      parse: (val) => DataTypeConverter.parseSemanticNumber(val),
      convert: (varName, targetType, onInvalid) => {
        const ds = AppState.get('activeDataset');
        if (!ds) { console.log('No active dataset'); return; }
        const r = DataTypeConverter.convertVariable(ds, varName, targetType, onInvalid || 'missing');
        console.log('Conversion result:', r);
        return r;
      },
      preview: (varName, targetType) => {
        const ds = AppState.get('activeDataset');
        if (!ds) { console.log('No active dataset'); return; }
        return DataTypeConverter.previewConversion(ds, varName, targetType);
      },
    };
    console.log('[SOCIOSTAT] Developer tools: SS.inspect(), SS.check(), SS.ds(), SS.resolve(["var"]), SS.parse(val), SS.convert("var","numeric"), SS.preview("var","numeric")');
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (splashSub) splashSub.textContent = 'Starting workspace…';

    // Start loading all optional libraries in parallel
    OPTIONAL_LIBS.forEach(k => LibraryLoader.load(k));

    let _launched = false;
    let _pollTimer = null;
    let _forceTimer = null;

    function launch() {
      if (_launched) return;
      _launched = true;
      clearTimeout(_pollTimer);
      clearTimeout(_forceTimer);
      launchApp();
    }

    // Begin polling — update status display and launch when all settled
    function pollStatus() {
      updateSplashStatus();
      const allDone = OPTIONAL_LIBS.every(k => {
        const s = LibraryLoader.status(k).state;
        return s === 'ready' || s === 'failed';
      });
      if (!allDone) {
        _pollTimer = setTimeout(pollStatus, 300);
      } else {
        launch();
      }
    }

    // Hard deadline: 5 seconds → show [Open SOCIOSTAT] button instead of auto-launching
    _forceTimer = setTimeout(() => {
      if (_launched) return;
      clearTimeout(_pollTimer);
      updateSplashStatus();
      showOpenButton();
    }, CORE_TIMEOUT_MS);

    // Start polling immediately
    pollStatus();
  });
})();
