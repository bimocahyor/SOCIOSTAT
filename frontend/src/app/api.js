/**
 * SOCIOSTAT — API Client
 * All HTTP communication with the backend.
 */

const BASE = '/api';

function getToken() {
  return localStorage.getItem('sociostat_token');
}

function setToken(token) {
  localStorage.setItem('sociostat_token', token);
}

function clearToken() {
  localStorage.removeItem('sociostat_token');
  localStorage.removeItem('sociostat_user');
}

function setUser(user) {
  localStorage.setItem('sociostat_user', JSON.stringify(user));
}

function getUser() {
  try { return JSON.parse(localStorage.getItem('sociostat_user') || 'null'); }
  catch { return null; }
}

async function request(method, path, body = null, isFormData = false) {
  const headers = {};
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (body && !isFormData) headers['Content-Type'] = 'application/json';

  const opts = {
    method,
    headers,
    body: body ? (isFormData ? body : JSON.stringify(body)) : null,
  };

  const res = await fetch(BASE + path, opts);

  if (res.status === 401) {
    clearToken();
    window.location.reload();
    return null;
  }

  const data = res.headers.get('Content-Type')?.includes('application/json')
    ? await res.json()
    : await res.text();

  if (!res.ok) {
    const msg = data?.detail || data?.message || (typeof data === 'string' ? data : 'Request failed');
    throw new ApiError(msg, res.status, data);
  }

  return data;
}

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

// ─── Auth ──────────────────────────────────────────────────────────
export const Auth = {
  async register(username, email, password, fullName) {
    const data = await request('POST', '/auth/register', { username, email, password, full_name: fullName });
    setToken(data.access_token);
    setUser(data.user);
    return data;
  },
  async login(username, password) {
    const formData = new URLSearchParams({ username, password });
    const res = await fetch(BASE + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new ApiError(err.detail || 'Login failed', res.status, err);
    }
    const data = await res.json();
    setToken(data.access_token);
    setUser(data.user);
    return data;
  },
  async me() { return request('GET', '/auth/me'); },
  logout() { clearToken(); },
  isLoggedIn() { return !!getToken(); },
  getUser,
};

// ─── Projects ─────────────────────────────────────────────────────
export const Projects = {
  list: () => request('GET', '/projects'),
  get: (id) => request('GET', `/projects/${id}`),
  create: (name, description) => request('POST', '/projects', { name, description }),
  update: (id, data) => request('PATCH', `/projects/${id}`, data),
  delete: (id) => request('DELETE', `/projects/${id}`),
};

// ─── Datasets ─────────────────────────────────────────────────────
export const Datasets = {
  create: (projectId, name, description) =>
    request('POST', `/projects/${projectId}/datasets`, { name, description }),

  get: (projectId, dsId) =>
    request('GET', `/projects/${projectId}/datasets/${dsId}`),

  delete: (projectId, dsId) =>
    request('DELETE', `/projects/${projectId}/datasets/${dsId}`),

  getPage: (projectId, dsId, offset = 0, limit = 200) =>
    request('GET', `/projects/${projectId}/datasets/${dsId}/data?offset=${offset}&limit=${limit}`),

  updateCells: (projectId, dsId, updates) =>
    request('PATCH', `/projects/${projectId}/datasets/${dsId}/cells`, { updates }),

  addVariable: (projectId, dsId, variable, position = null) =>
    request('POST', `/projects/${projectId}/datasets/${dsId}/variables`, { variable, position }),

  updateVariable: (projectId, dsId, varId, update) =>
    request('PATCH', `/projects/${projectId}/datasets/${dsId}/variables/${varId}`, update),

  deleteVariables: (projectId, dsId, variableIds) =>
    request('DELETE', `/projects/${projectId}/datasets/${dsId}/variables`, { variable_ids: variableIds }),

  addRows: (projectId, dsId, count, values = null) =>
    request('POST', `/projects/${projectId}/datasets/${dsId}/rows`, { count, values }),

  deleteRows: (projectId, dsId, rowIndices) =>
    request('DELETE', `/projects/${projectId}/datasets/${dsId}/rows`, { row_indices: rowIndices }),

  exportCsvUrl: (projectId, dsId, useLabels = false) =>
    `${BASE}/projects/${projectId}/datasets/${dsId}/export/csv?use_labels=${useLabels}`,
};

// ─── Import ────────────────────────────────────────────────────────
export const Import = {
  async upload(projectId, file) {
    const formData = new FormData();
    formData.append('file', file);
    const token = getToken();
    const res = await fetch(`${BASE}/projects/${projectId}/datasets/import/upload`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json();
      throw new ApiError(err.detail || 'Upload failed', res.status, err);
    }
    return res.json();
  },
  confirm: (projectId, req) =>
    request('POST', `/projects/${projectId}/datasets/import/confirm`, req),
};

// ─── Analysis ─────────────────────────────────────────────────────
export const Analysis = {
  run: (projectId, procedureId, datasetId, parameters) =>
    request('POST', `/projects/${projectId}/analysis/run`, {
      procedure_id: procedureId,
      dataset_id: datasetId,
      parameters,
    }),
  list: (projectId) => request('GET', `/projects/${projectId}/analysis`),
  listProcedures: (projectId) => request('GET', `/projects/${projectId}/analysis/procedures`),
};

export { ApiError, getToken, setToken, clearToken, getUser, setUser };
