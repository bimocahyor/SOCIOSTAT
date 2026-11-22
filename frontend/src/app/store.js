/**
 * SOCIOSTAT — Application State (reactive store)
 */

class Store {
  constructor(initial = {}) {
    this._state = { ...initial };
    this._subscribers = new Map();
  }

  get(key) { return this._state[key]; }

  set(key, value) {
    const old = this._state[key];
    this._state[key] = value;
    if (old !== value) this._notify(key, value, old);
  }

  update(key, fn) {
    const next = fn(this._state[key]);
    this.set(key, next);
  }

  subscribe(key, fn) {
    if (!this._subscribers.has(key)) this._subscribers.set(key, new Set());
    this._subscribers.get(key).add(fn);
    return () => this._subscribers.get(key)?.delete(fn);
  }

  _notify(key, value, old) {
    this._subscribers.get(key)?.forEach(fn => fn(value, old));
    this._subscribers.get('*')?.forEach(fn => fn(key, value, old));
  }
}

export const state = new Store({
  user: null,
  currentProject: null,
  projects: [],
  activeDataset: null,         // full dataset metadata
  activeDatasetPage: null,     // current page of data
  activeModule: 'home',        // current sidebar section
  activeTab: 'data',           // data | variable
  analysisHistory: [],
  outputDocuments: [],
  currentOutput: null,
  notifications: [],
  loading: false,
  dataLoading: false,
  selectedRows: new Set(),
  selectedCols: new Set(),
  selectedVariable: null,      // for right panel info
  importWizardState: null,
  analysisDialogOpen: null,
  dataOffset: 0,
  dataLimit: 200,
  editingCell: null,           // {row, col}
});
