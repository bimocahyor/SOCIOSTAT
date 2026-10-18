const AppState = (() => {
  const _state = {
    activeModule: 'home',
    activeTab: 'data',
    currentProject: null,
    projects: [],
    activeDataset: null,
    dataPage: { offset: 0, limit: 200, rows: [], total: 0, variables: [] },
    selectedVariable: null,
    analysisHistory: [],
    currentOutput: null,
    outputHistory: [],
    syntaxContent: '* SOCIOSTAT Syntax\n* Run analyses to auto-generate syntax\n\n',
    loading: false,
    aiMessages: [],
    aiApiKey: localStorage.getItem('ss_ai_key') || '',
    aiProvider: localStorage.getItem('ss_ai_provider') || 'rule-based',
  };
  const _subs = {};
  return {
    get: k => _state[k],
    getAll: () => _state,
    set(k, v) {
      _state[k] = v;
      (_subs[k] || []).forEach(fn => fn(v));
      (_subs['*'] || []).forEach(fn => fn(k, v));
    },
    subscribe(k, fn) {
      if (!_subs[k]) _subs[k] = [];
      _subs[k].push(fn);
      return () => { _subs[k] = _subs[k].filter(f => f !== fn); };
    },
  };
})();

/* ══════════════════════════════════════════════════════════════════
   SECTION 3: STORAGE (IndexedDB)
   ══════════════════════════════════════════════════════════════════ */

