/**
 * SOCIOSTAT — Main Application Entry Point
 * Bootstraps the SPA, handles routing between modules.
 */

import { Auth, Projects, Datasets } from './api.js';
import { state } from './store.js';
import { el, svgIcon, showError, showSuccess, showNotification, formatDateTime, debounce } from './utils.js';
import { renderAuthScreen } from '../features/auth/auth.js';
import { renderDataEditor } from '../features/data-editor/dataEditor.js';
import { renderAnalyzeMenu } from '../features/analyze/analyzeDialogs.js';
import { renderAnalysisResult } from '../features/output/outputViewer.js';
import { openImportWizard } from '../features/project/importWizard.js';

// ─── Bootstrap ────────────────────────────────────────────────────────
async function bootstrap() {
  const root = document.getElementById('app');
  if (!root) return;

  if (!Auth.isLoggedIn()) {
    root.appendChild(renderAuthScreen(() => {
      root.innerHTML = '';
      bootstrap();
    }));
    return;
  }

  // Verify token still valid
  try {
    const user = await Auth.me();
    state.set('user', user);
  } catch {
    Auth.logout();
    root.innerHTML = '';
    root.appendChild(renderAuthScreen(() => { root.innerHTML = ''; bootstrap(); }));
    return;
  }

  // Load projects
  try {
    const projects = await Projects.list();
    state.set('projects', projects);
  } catch (e) {
    showError('Failed to load projects: ' + e.message);
  }

  renderApp(root);
}

// ─── App Shell ────────────────────────────────────────────────────────
function renderApp(root) {
  root.innerHTML = '';

  const layout = el('div', { class: 'app-layout' });

  // Top bar
  const topBar = renderTopBar();
  layout.appendChild(topBar);

  // Main area
  const main = el('div', { class: 'app-main' });

  // Sidebar
  const sidebar = renderSidebar();
  main.appendChild(sidebar);

  // Workspace
  const workspace = el('div', { class: 'workspace' });
  const workspaceContent = el('div', { class: 'workspace-content' });
  workspace.appendChild(workspaceContent);
  main.appendChild(workspace);

  // Right panel
  const rightPanel = renderRightPanel();
  main.appendChild(rightPanel);

  layout.appendChild(main);

  // Status bar
  const statusBar = renderStatusBar();
  layout.appendChild(statusBar);

  root.appendChild(layout);

  // Initial render
  renderModule(workspaceContent, state.get('activeModule') || 'home');

  // Subscribe to module changes
  state.subscribe('activeModule', (module) => {
    renderModule(workspaceContent, module);
    updateSidebarActive(sidebar, module);
  });

  // Subscribe to dataset changes
  state.subscribe('activeDataset', (ds) => {
    updateStatusBar(statusBar, ds);
    updateRightPanel(rightPanel);
    if (state.get('activeModule') === 'data') {
      renderModule(workspaceContent, 'data');
    }
  });

  state.subscribe('selectedVariable', () => updateRightPanel(rightPanel));
  state.subscribe('currentOutput', () => {
    if (state.get('activeModule') === 'output') renderModule(workspaceContent, 'output');
  });

  // Listen for analysis-complete event
  document.addEventListener('analysis-complete', (e) => {
    renderModule(workspaceContent, 'output');
  });

  // Listen for dataset-updated event
  document.addEventListener('dataset-updated', (e) => {
    updateStatusBar(statusBar, e.detail);
  });

  // Load last active project if any
  const projects = state.get('projects');
  if (projects?.length > 0) {
    const lastProjectId = localStorage.getItem('sociostat_last_project');
    const target = lastProjectId ? projects.find(p => p.id === lastProjectId) : projects[0];
    if (target) loadProject(target.id, workspaceContent);
  }
}

// ─── Top Bar ──────────────────────────────────────────────────────────
function renderTopBar() {
  const bar = el('div', { class: 'top-bar' });
  bar.appendChild(el('div', { class: 'top-bar-logo' }, 'SOCIOSTAT'));

  const projectInfo = el('div', { class: 'top-bar-project', id: 'topbar-project' }, 'No project open');
  bar.appendChild(projectInfo);

  const user = state.get('user');
  const userBtn = el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', color: 'rgba(255,255,255,0.7)', fontSize: '12px' } },
    el('span', {}, user?.full_name || user?.username || 'User'),
    el('button', {
      class: 'btn btn-ghost btn-sm',
      style: { color: 'rgba(255,255,255,0.5)', fontSize: '11px' },
      onClick() { if (confirm('Sign out?')) { Auth.logout(); window.location.reload(); } }
    }, 'Sign Out')
  );
  bar.appendChild(userBtn);

  state.subscribe('currentProject', (p) => {
    projectInfo.innerHTML = p ? `Project: <span>${p.name}</span>` : 'No project open';
  });

  return bar;
}

// ─── Sidebar ──────────────────────────────────────────────────────────
function renderSidebar() {
  const sidebar = el('div', { class: 'sidebar', id: 'main-sidebar' });
  const nav = el('div', { class: 'sidebar-nav' });

  const items = [
    { id: 'home', icon: 'home', label: 'Home' },
    { id: 'data', icon: 'database', label: 'Data' },
    { id: 'transform', icon: 'transform', label: 'Transform' },
    { id: 'analyze', icon: 'bar-chart', label: 'Analyze' },
    { id: 'output', icon: 'file-text', label: 'Output' },
    { id: 'syntax', icon: 'code', label: 'Syntax' },
    { id: 'history', icon: 'clock', label: 'History' },
  ];

  const divider1 = el('div', { class: 'sidebar-divider' });
  nav.appendChild(divider1);

  for (const item of items) {
    const btn = el('div', {
      class: `sidebar-item${state.get('activeModule') === item.id ? ' active' : ''}`,
      'data-module': item.id,
      role: 'button',
      tabindex: '0',
      'aria-label': item.label,
    });
    btn.appendChild(el('div', { class: 'sidebar-icon' }, svgIcon(item.icon, 18)));
    btn.appendChild(el('span', { class: 'sidebar-label' }, item.label));
    btn.addEventListener('click', () => state.set('activeModule', item.id));
    btn.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') state.set('activeModule', item.id); });
    nav.appendChild(btn);
  }

  // Bottom items
  const bottom = el('div', { style: { padding: '6px 0' } });
  const settingsBtn = el('div', { class: 'sidebar-item', role: 'button', 'aria-label': 'Settings' });
  settingsBtn.appendChild(el('div', { class: 'sidebar-icon' }, svgIcon('settings', 18)));
  settingsBtn.appendChild(el('span', { class: 'sidebar-label' }, 'Settings'));
  bottom.appendChild(settingsBtn);

  sidebar.appendChild(nav);
  sidebar.appendChild(bottom);
  return sidebar;
}

function updateSidebarActive(sidebar, module) {
  sidebar.querySelectorAll('.sidebar-item').forEach(item => {
    item.classList.toggle('active', item.dataset.module === module);
  });
}

// ─── Right Panel ─────────────────────────────────────────────────────
function renderRightPanel() {
  const panel = el('div', { class: 'right-panel', id: 'right-panel' });
  panel.appendChild(el('div', { class: 'right-panel-header' }, 'Variable Info'));
  panel.appendChild(el('div', { class: 'right-panel-content', id: 'right-panel-content' },
    el('div', { class: 'text-sm text-muted' }, 'Click a variable header to see details.')
  ));
  return panel;
}

function updateRightPanel(panel) {
  const content = panel.querySelector('#right-panel-content');
  if (!content) return;
  const v = state.get('selectedVariable');
  const ds = state.get('activeDataset');

  if (!v) {
    if (ds) {
      content.innerHTML = '';
      content.appendChild(el('div', { class: 'text-sm text-muted', style: { marginBottom: '10px' } }, 'Active Dataset'));
      const info = [
        ['Name', ds.name],
        ['Cases', String(ds.n_cases)],
        ['Variables', String(ds.n_variables)],
        ['Weight', ds.weight_variable || 'None'],
        ['Filter', ds.active_filter?.expression || 'None'],
        ['Split', (ds.split_variables || []).join(', ') || 'None'],
      ];
      for (const [k, v] of info) {
        content.appendChild(el('div', { style: { display: 'flex', gap: '6px', marginBottom: '5px', fontSize: '11px' } },
          el('span', { style: { color: 'var(--text-muted)', minWidth: '70px' } }, k + ':'),
          el('span', { style: { fontWeight: '500' } }, v)
        ));
      }
    } else {
      content.innerHTML = '<div class="text-sm text-muted">No dataset open.</div>';
    }
    return;
  }

  content.innerHTML = '';
  content.appendChild(el('div', { style: { fontWeight: '700', marginBottom: '8px', fontSize: '13px' } }, v.name));

  const fields = [
    ['Label', v.label || '—'],
    ['Type', v.type || '—'],
    ['Measurement', v.measurement_level || '—'],
    ['Role', v.role || '—'],
    ['Format', v.format || '—'],
    ['Decimals', String(v.decimals ?? '—')],
    ['Width', String(v.width || '—')],
  ];
  for (const [k, val] of fields) {
    content.appendChild(el('div', { style: { display: 'flex', gap: '6px', marginBottom: '5px', fontSize: '11px' } },
      el('span', { style: { color: 'var(--text-muted)', minWidth: '80px' } }, k + ':'),
      el('span', {}, val)
    ));
  }

  if (v.value_labels?.length > 0) {
    content.appendChild(el('div', { style: { marginTop: '10px', fontWeight: '600', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' } }, 'Value Labels'));
    for (const lbl of v.value_labels) {
      content.appendChild(el('div', { style: { fontSize: '11px', marginBottom: '3px' } },
        el('span', { class: 'font-mono', style: { color: 'var(--accent)' } }, String(lbl.value)),
        el('span', { style: { color: 'var(--text-muted)', margin: '0 4px' } }, '='),
        el('span', {}, lbl.label)
      ));
    }
  }

  if (v.description) {
    content.appendChild(el('div', { style: { marginTop: '10px', fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.5' } }, v.description));
  }
}

// ─── Status Bar ───────────────────────────────────────────────────────
function renderStatusBar() {
  const bar = el('div', { class: 'status-bar', id: 'status-bar' });

  bar.appendChild(makeStatusItem('Dataset', '—', 'status-dataset'));
  bar.appendChild(makeStatusItem('Cases', '—', 'status-cases'));
  bar.appendChild(makeStatusItem('Variables', '—', 'status-vars'));
  bar.appendChild(makeStatusItem('Filter', 'Off', 'status-filter'));
  bar.appendChild(makeStatusItem('Weight', 'Off', 'status-weight'));
  bar.appendChild(makeStatusItem('Split', 'Off', 'status-split'));

  const dot = el('div', { class: 'status-indicator', id: 'status-dot' });
  const status = el('div', { class: 'status-item' }, dot, el('span', { id: 'status-text', class: 'value' }, 'Ready'));
  bar.appendChild(status);

  return bar;
}

function makeStatusItem(label, value, id) {
  return el('div', { class: 'status-item' },
    el('span', { class: 'label' }, label + ':'),
    el('span', { class: 'value', id }), ` ${value}`
  );
}

function updateStatusBar(bar, ds) {
  if (!bar || !ds) return;
  const set = (id, val) => {
    const el = bar.querySelector(`#${id}`);
    if (el) el.parentElement.lastChild.textContent = ' ' + val;
  };
  set('status-dataset', ds.name || '—');
  set('status-cases', String(ds.n_cases || 0));
  set('status-vars', String(ds.n_variables || 0));
  set('status-filter', ds.active_filter ? 'On' : 'Off');
  set('status-weight', ds.weight_variable || 'Off');
  set('status-split', (ds.split_variables?.length ? ds.split_variables.join(', ') : 'Off'));
}

// ─── Module Renderers ─────────────────────────────────────────────────
function renderModule(container, module) {
  container.innerHTML = '';

  switch (module) {
    case 'home': renderHome(container); break;
    case 'data': renderDataEditor(container); break;
    case 'analyze': renderAnalyzeMenu(container); break;
    case 'output': renderOutputModule(container); break;
    case 'history': renderHistory(container); break;
    case 'syntax': renderSyntax(container); break;
    case 'transform': renderTransform(container); break;
    default:
      container.appendChild(el('div', { style: { padding: '24px', color: 'var(--text-muted)' } },
        `Module '${module}' coming soon.`));
  }
}

// ─── Home ─────────────────────────────────────────────────────────────
function renderHome(container) {
  const screen = el('div', { class: 'home-screen' });
  screen.appendChild(el('h2', {}, 'SOCIOSTAT'));
  screen.appendChild(el('div', { class: 'subtitle' }, 'Statistical Analysis Workbench — ' + (state.get('user')?.full_name || state.get('user')?.username)));

  // Quick actions
  const actionsRow = el('div', { style: { display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' } });
  const newProjectBtn = el('button', { class: 'btn btn-primary' }, svgIcon('plus', 14), 'New Project');
  newProjectBtn.addEventListener('click', () => openNewProjectDialog(container));

  actionsRow.appendChild(newProjectBtn);
  screen.appendChild(actionsRow);

  // Projects grid
  screen.appendChild(el('div', { style: { fontWeight: '700', marginBottom: '10px', fontSize: '13px' } }, 'Projects'));

  const grid = el('div', { class: 'project-grid' });

  const projects = state.get('projects') || [];
  for (const p of projects) {
    const card = el('div', { class: 'project-card' },
      el('div', { class: 'project-card-name' }, p.name),
      el('div', { class: 'project-card-meta' },
        `${p.dataset_count} dataset${p.dataset_count !== 1 ? 's' : ''} · Updated ${formatDateTime(p.updated_at)}`
      )
    );
    card.addEventListener('click', () => loadProject(p.id, document.querySelector('.workspace-content')));
    grid.appendChild(card);
  }

  // New project card
  const newCard = el('div', { class: 'project-card project-card-new' },
    svgIcon('plus', 20),
    el('span', { style: { fontSize: '12px' } }, 'New Project')
  );
  newCard.addEventListener('click', () => openNewProjectDialog(container));
  grid.appendChild(newCard);

  screen.appendChild(grid);
  container.appendChild(screen);
}

function openNewProjectDialog(container) {
  const overlay = el('div', { class: 'dialog-overlay' });
  const dialog = el('div', { class: 'dialog', style: { width: '400px' } });

  const header = el('div', { class: 'dialog-header' },
    el('div', { class: 'dialog-title' }, 'New Project'),
    el('button', { class: 'btn btn-ghost btn-icon', onClick: () => overlay.remove() }, svgIcon('x'))
  );

  const body = el('div', { class: 'dialog-body' });
  const nameInput = el('input', { class: 'form-input', type: 'text', placeholder: 'Project name', required: true });
  const descInput = el('input', { class: 'form-input', type: 'text', placeholder: 'Description (optional)' });
  const errorMsg = el('div', { class: 'text-error text-sm' });
  body.appendChild(el('div', { class: 'form-group' }, el('label', { class: 'form-label' }, 'Project Name *'), nameInput));
  body.appendChild(el('div', { class: 'form-group' }, el('label', { class: 'form-label' }, 'Description'), descInput));
  body.appendChild(errorMsg);

  const footer = el('div', { class: 'dialog-footer' });
  const cancelBtn = el('button', { class: 'btn btn-secondary' }, 'Cancel');
  cancelBtn.addEventListener('click', () => overlay.remove());
  const createBtn = el('button', { class: 'btn btn-primary' }, 'Create Project');
  createBtn.addEventListener('click', async () => {
    if (!nameInput.value.trim()) { errorMsg.textContent = 'Name is required'; return; }
    createBtn.disabled = true;
    try {
      const project = await Projects.create(nameInput.value.trim(), descInput.value.trim());
      overlay.remove();
      const projects = await Projects.list();
      state.set('projects', projects);
      await loadProject(project.id, document.querySelector('.workspace-content'));
      showSuccess(`Project '${project.name}' created`);
    } catch (e) {
      errorMsg.textContent = e.message;
      createBtn.disabled = false;
    }
  });

  footer.appendChild(cancelBtn);
  footer.appendChild(createBtn);
  dialog.appendChild(header);
  dialog.appendChild(body);
  dialog.appendChild(footer);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  nameInput.focus();
}

// ─── Output Module ────────────────────────────────────────────────────
function renderOutputModule(container) {
  const record = state.get('currentOutput');
  const history = state.get('analysisHistory') || [];

  if (!record && history.length === 0) {
    container.appendChild(el('div', { style: { padding: '32px', textAlign: 'center', color: 'var(--text-muted)' } },
      'No output yet. Run an analysis from the Analyze menu.'));
    return;
  }

  const viewer = el('div', { class: 'output-viewer' });

  // Tree panel
  const tree = el('div', { class: 'output-tree' });
  tree.appendChild(el('div', { style: { padding: '8px 10px', fontSize: '11px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.4px' } }, 'Analysis Output'));

  const content = el('div', { class: 'output-content' });

  for (let i = 0; i < history.length; i++) {
    const rec = history[i];
    const item = el('div', {
      class: `output-tree-item${i === 0 ? ' active' : ''}`,
      style: { fontSize: '11px' }
    },
      el('div', {}, procedureDisplayName(rec.procedure_id)),
      el('div', { style: { fontSize: '10px', color: 'var(--text-muted)' } }, formatDateTime(rec.timestamp))
    );
    item.addEventListener('click', () => {
      tree.querySelectorAll('.output-tree-item').forEach(el => el.classList.remove('active'));
      item.classList.add('active');
      content.innerHTML = '';
      renderAnalysisResult(rec, content);
    });
    tree.appendChild(item);
  }

  // Render most recent
  const latest = state.get('currentOutput') || history[0];
  if (latest) renderAnalysisResult(latest, content);

  viewer.appendChild(tree);
  viewer.appendChild(content);
  container.appendChild(viewer);
}

// ─── History ──────────────────────────────────────────────────────────
function renderHistory(container) {
  const history = state.get('analysisHistory') || [];
  const wrapper = el('div', { style: { height: '100%', overflow: 'auto' } });

  if (history.length === 0) {
    wrapper.appendChild(el('div', { style: { padding: '24px', textAlign: 'center', color: 'var(--text-muted)' } },
      'No analysis history yet.'));
    container.appendChild(wrapper);
    return;
  }

  wrapper.appendChild(el('div', { style: { padding: '12px 14px', fontWeight: '700', fontSize: '13px', borderBottom: '1px solid var(--border)' } }, 'Analysis History'));

  const list = el('div', { class: 'history-list' });
  for (const rec of history) {
    const item = el('div', { class: 'history-item' },
      el('div', { class: 'history-time' }, formatDateTime(rec.timestamp)),
      el('div', {},
        el('div', { class: 'history-procedure' }, procedureDisplayName(rec.procedure_id)),
        el('div', { class: 'history-detail' }, `Status: ${rec.status}`)
      )
    );
    item.addEventListener('click', () => {
      state.set('currentOutput', rec);
      state.set('activeModule', 'output');
    });
    list.appendChild(item);
  }
  wrapper.appendChild(list);
  container.appendChild(wrapper);
}

// ─── Syntax Editor ────────────────────────────────────────────────────
function renderSyntax(container) {
  const wrapper = el('div', { class: 'syntax-editor' });
  const toolbar = el('div', { class: 'toolbar' });

  const runBtn = el('button', { class: 'btn btn-primary btn-sm' }, svgIcon('play', 13), 'Run');
  toolbar.appendChild(runBtn);
  wrapper.appendChild(toolbar);

  const textarea = el('textarea', { class: 'syntax-textarea', placeholder: '* SOCIOSTAT Syntax\n* Generated by dialogs or written manually\n\n' });

  // Pre-populate with syntax from history
  const history = state.get('analysisHistory') || [];
  const syntaxLines = history.map(r => r.syntax || '').filter(s => s.trim()).join('\n\n');
  if (syntaxLines) textarea.value = syntaxLines;

  wrapper.appendChild(textarea);
  container.appendChild(wrapper);
}

// ─── Transform (placeholder) ─────────────────────────────────────────
function renderTransform(container) {
  container.appendChild(el('div', { style: { padding: '24px' } },
    el('div', { style: { fontWeight: '700', fontSize: '14px', marginBottom: '12px' } }, 'Transform'),
    el('div', { class: 'text-muted text-sm' }, 'Compute Variable, Recode, and other transformations coming in Phase 2.')
  ));
}

// ─── Project Loader ───────────────────────────────────────────────────
async function loadProject(projectId, workspaceContent) {
  try {
    const project = await Projects.get(projectId);
    state.set('currentProject', project);
    localStorage.setItem('sociostat_last_project', projectId);

    document.querySelector('#topbar-project')?.innerHTML ?
      document.querySelector('#topbar-project').innerHTML = `Project: <span>${project.name}</span>` : null;

    // Load active dataset
    if (project.active_dataset_id || project.datasets?.length > 0) {
      const dsId = project.active_dataset_id || project.datasets[0].id;
      try {
        const ds = await Datasets.get(projectId, dsId);
        state.set('activeDataset', ds);
        state.set('activeDatasetPage', null);
        updateStatusBar(document.querySelector('#status-bar'), ds);
        state.set('activeModule', 'data');
        if (workspaceContent) renderModule(workspaceContent, 'data');
      } catch (e) {
        state.set('activeModule', 'home');
        if (workspaceContent) renderModule(workspaceContent, 'home');
      }
    } else {
      state.set('activeModule', 'home');
      if (workspaceContent) {
        // Show project home with option to import
        renderProjectHome(workspaceContent, project);
      }
    }

    // Load analysis history for this project
    try {
      const { Analysis } = await import('./api.js');
      const history = await Analysis.list(projectId);
      state.set('analysisHistory', history);
    } catch (e) {
      // Not critical
    }

  } catch (e) {
    showError('Failed to load project: ' + e.message);
  }
}

function renderProjectHome(container, project) {
  container.innerHTML = '';
  const wrapper = el('div', { class: 'home-screen' });
  wrapper.appendChild(el('h2', {}, project.name));
  wrapper.appendChild(el('div', { class: 'subtitle' }, project.description || 'No description'));

  const importBtn = el('button', { class: 'btn btn-primary', style: { marginTop: '16px' } },
    svgIcon('upload', 14), 'Import Data File');
  importBtn.addEventListener('click', () => openImportWizard(project.id, async (ds) => {
    state.set('activeDataset', ds);
    state.set('activeDatasetPage', null);
    await Projects.update(project.id, { active_dataset_id: ds.id });
    updateStatusBar(document.querySelector('#status-bar'), ds);
    state.set('activeModule', 'data');
    renderModule(container, 'data');
  }));
  wrapper.appendChild(importBtn);
  container.appendChild(wrapper);
}

// ─── Helpers ──────────────────────────────────────────────────────────
function procedureDisplayName(id) {
  const names = {
    frequencies: 'Frequencies', descriptives: 'Descriptive Statistics',
    crosstabs: 'Crosstabs', correlation: 'Correlations',
    ttest_onesample: 'One-Sample T-Test', ttest_independent: 'Independent T-Test',
    ttest_paired: 'Paired T-Test', anova_oneway: 'One-Way ANOVA',
    linear_regression: 'Linear Regression', logistic_regression: 'Logistic Regression',
    reliability: 'Reliability (Alpha)', factor_analysis: 'Factor Analysis',
    nonparametric_mannwhitney: 'Mann-Whitney U', nonparametric_wilcoxon: 'Wilcoxon',
    nonparametric_kruskalwallis: 'Kruskal-Wallis', nonparametric_friedman: 'Friedman',
  };
  return names[id] || id;
}

// ─── Start ────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', bootstrap);
