const DB = (() => {
  let _db = null;
  const DB_NAME = 'sociostat_v1';
  const DB_VERSION = 1;

  function open() {
    return new Promise((res, rej) => {
      if (_db) return res(_db);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('datasets')) {
          const ds = db.createObjectStore('datasets', { keyPath: 'id' });
          ds.createIndex('projectId', 'projectId', { unique: false });
        }
        if (!db.objectStoreNames.contains('outputs')) {
          const out = db.createObjectStore('outputs', { keyPath: 'id' });
          out.createIndex('projectId', 'projectId', { unique: false });
        }
      };
      req.onsuccess = e => { _db = e.target.result; res(_db); };
      req.onerror = e => rej(e.target.error);
    });
  }

  async function tx(store, mode, fn) {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction(store, mode);
      const s = t.objectStore(store);
      const r = fn(s);
      r.onsuccess = e => res(e.target.result);
      r.onerror = e => rej(e.target.error);
    });
  }

  return {
    init: () => open(),
    saveProject: p => tx('projects', 'readwrite', s => s.put(p)),
    loadProject: id => tx('projects', 'readonly', s => s.get(id)),
    getProject: id => tx('projects', 'readonly', s => s.get(id)),
    listProjects: () => tx('projects', 'readonly', s => s.getAll()),
    getAllProjects: () => tx('projects', 'readonly', s => s.getAll()),
    deleteProject: id => tx('projects', 'readwrite', s => s.delete(id)),
    saveDataset: d => tx('datasets', 'readwrite', s => s.put(d)),
    getDataset: id => tx('datasets', 'readonly', s => s.get(id)),
    deleteDataset: id => tx('datasets', 'readwrite', s => s.delete(id)),
    getDatasetsForProject: async (projectId) => {
      const db = await open();
      return new Promise((res, rej) => {
        const t = db.transaction('datasets', 'readonly');
        const idx = t.objectStore('datasets').index('projectId');
        const req = idx.getAll(projectId);
        req.onsuccess = e => res(e.target.result);
        req.onerror = e => rej(e.target.error);
      });
    },
    saveOutput: o => tx('outputs', 'readwrite', s => s.put(o)),
    getOutputsForProject: async (projectId) => {
      const db = await open();
      return new Promise((res, rej) => {
        const t = db.transaction('outputs', 'readonly');
        const idx = t.objectStore('outputs').index('projectId');
        const req = idx.getAll(projectId);
        req.onsuccess = e => res(e.target.result);
        req.onerror = e => rej(e.target.error);
      });
    },
  };
})();

/* ══════════════════════════════════════════════════════════════════
   SECTION 4: STATISTICAL ENGINE (CLIENT-SIDE)
   All computations performed in JavaScript.
   No values are fabricated or hard-coded.
   ══════════════════════════════════════════════════════════════════ */


const Project = (() => {
  let _dirty = false;
  let _autosaveTimer = null;

  function newProject() {
    const name = prompt('Project name:', 'New Project');
    if (!name) return;
    const proj = {
      id: uuid(),
      name,
      description: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      datasets: [],
      activeDatasetId: null,
      outputs: [],
      history: [],
      syntaxHistory: [],
      aiConversations: []
    };
    AppState.set('currentProject', proj);
    AppState.set('activeDataset', null);
    Output.setOutputs([]);
    History.setEntries([]);
    _dirty = false;
    App.navigate('data');
    notify(`Project "${name}" created`, 'success');
    DB.saveProject(proj);
  }

  function saveProject() {
    const proj = AppState.get('currentProject');
    if (!proj) { notify('No project to save', 'warning'); return; }
    proj.updatedAt = new Date().toISOString();
    // Sync dataset
    const ds = AppState.get('activeDataset');
    if (ds) {
      const idx = proj.datasets.findIndex(d => d.id === ds.id);
      if (idx >= 0) proj.datasets[idx] = ds;
      else proj.datasets.push(ds);
      proj.activeDatasetId = ds.id;
    }
    proj.outputs = Output.getOutputs();
    proj.history = History.getEntries();
    DB.saveProject(proj).then(() => {
      _dirty = false;
      notify('Project saved', 'success');
      App.updateTitleBar();
    });
  }

  function markDirty() {
    _dirty = true;
    App.updateTitleBar();
    clearTimeout(_autosaveTimer);
    _autosaveTimer = setTimeout(() => saveProject(), 5000);
  }

  function isDirty() { return _dirty; }

  async function openProject(projId) {
    const proj = await DB.loadProject(projId);
    if (!proj) { notify('Project not found', 'error'); return; }

    // Migrate all datasets in the project that have schema version < 2
    // (i.e., were created before the canonical key schema was enforced).
    if (typeof DataIntegrity !== 'undefined' && Array.isArray(proj.datasets)) {
      proj.datasets.forEach(ds => {
        const needsMigration = !ds.metadata?.schemaVersion || ds.metadata.schemaVersion < 2;
        if (needsMigration) {
          const integrity = DataIntegrity.check(ds);
          if (!integrity.ok) {
            const mig = DataIntegrity.migrateSchema(ds);
            if (mig.migrated) {
              console.warn(`[Project] Migrated dataset "${ds.name}":`, mig.changes);
              markDirty();
            }
          }
          ds.metadata = ds.metadata || {};
          ds.metadata.schemaVersion = 2;
        }
      });
    }

    AppState.set('currentProject', proj);
    const ds = proj.datasets.find(d => d.id === proj.activeDatasetId) || proj.datasets[0] || null;
    AppState.set('activeDataset', ds);
    if (proj.outputs) Output.setOutputs(proj.outputs);
    if (proj.history) History.setEntries(proj.history);
    _dirty = false;
    App.navigate('data');
    notify(`Opened project: ${proj.name}`, 'success');
    App.updateTitleBar();
    App.updateStatusBar();
  }

  async function loadProjectList() {
    return DB.listProjects();
  }

  function exportProject() {
    const proj = AppState.get('currentProject');
    if (!proj) { notify('No project to export', 'warning'); return; }
    const ds = AppState.get('activeDataset');
    if (ds) {
      const idx = proj.datasets.findIndex(d => d.id === ds.id);
      if (idx >= 0) proj.datasets[idx] = ds; else proj.datasets.push(ds);
    }
    proj.outputs = Output.getOutputs();
    const blob = new Blob([JSON.stringify(proj, null, 2)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: `${proj.name}.sociostat.json` });
    a.click();
  }

  function importProject(file) {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const proj = JSON.parse(e.target.result);
        if (!proj.id || !proj.datasets) throw new Error('Invalid project file');
        proj.id = uuid(); // new ID to avoid collision
        DB.saveProject(proj).then(() => openProject(proj.id));
      } catch (err) {
        notify('Import error: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  }

  function loadDatasetIntoApp(dataset) {
    const proj = AppState.get('currentProject');
    if (!proj) {
      // Create a default project if none
      const p = {
        id: uuid(), name: dataset.name || 'Untitled Project',
        description: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        datasets: [dataset], activeDatasetId: dataset.id,
        outputs: [], history: [], syntaxHistory: [], aiConversations: []
      };
      AppState.set('currentProject', p);
      DB.saveProject(p);
    } else {
      const idx = proj.datasets.findIndex(d => d.id === dataset.id);
      if (idx >= 0) proj.datasets[idx] = dataset; else proj.datasets.push(dataset);
      proj.activeDatasetId = dataset.id;
    }
    AppState.set('activeDataset', dataset);
    markDirty();
    App.navigate('data');
    App.updateStatusBar();
    notify(`Dataset "${dataset.name}" loaded (${dataset.cases.length} cases, ${dataset.variables.length} variables)`, 'success');
  }

  async function deleteProject(projId) {
    const currentProj = AppState.get('currentProject');
    await DB.deleteProject(projId);
    // If the deleted project was the active one, clear it
    if (currentProj && currentProj.id === projId) {
      AppState.set('currentProject', null);
      AppState.set('activeDataset', null);
      Output.setOutputs([]);
      History.setEntries([]);
      _dirty = false;
      App.updateTitleBar();
      App.updateStatusBar();
    }
    notify(I18N.t('projectDeleted', projId), 'success');
  }

  async function renameProject(projId, newName) {
    const proj = await DB.loadProject(projId);
    if (!proj) return;
    proj.name = newName;
    proj.updatedAt = new Date().toISOString();
    await DB.saveProject(proj);
    const current = AppState.get('currentProject');
    if (current && current.id === projId) {
      current.name = newName;
      App.updateTitleBar();
    }
    notify(`Renamed to "${newName}"`, 'success');
  }

  async function duplicateProject(projId) {
    const proj = await DB.loadProject(projId);
    if (!proj) return;
    const copy = JSON.parse(JSON.stringify(proj));
    copy.id = uuid();
    copy.name = proj.name + ' (Copy)';
    copy.createdAt = new Date().toISOString();
    copy.updatedAt = new Date().toISOString();
    // Assign new IDs to datasets
    copy.datasets = (copy.datasets || []).map(d => ({ ...d, id: uuid() }));
    if (copy.datasets.length) copy.activeDatasetId = copy.datasets[0].id;
    await DB.saveProject(copy);
    notify(`Duplicated as "${copy.name}"`, 'success');
    return copy;
  }

  async function clearAllProjects() {
    const projects = await DB.listProjects();
    for (const p of projects) await DB.deleteProject(p.id);
    AppState.set('currentProject', null);
    AppState.set('activeDataset', null);
    Output.setOutputs([]);
    History.setEntries([]);
    _dirty = false;
    App.updateTitleBar();
    App.updateStatusBar();
    notify('All projects cleared.', 'info');
  }

  return { newProject, saveProject, markDirty, isDirty, openProject, loadProjectList, exportProject, importProject, loadDatasetIntoApp, deleteProject, renameProject, duplicateProject, clearAllProjects };
})();

/* ══════════════════════════════════════════════════════════════════
   SECTION 14: AI ASSISTANT
   ══════════════════════════════════════════════════════════════════ */

