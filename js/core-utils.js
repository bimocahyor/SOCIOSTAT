/* ═══════════════════════════════════════════════════════════════════
   SOCIOSTAT — Statistical Analysis Workbench
   script.js — Pure client-side application
   No server required. Double-click index.html to run.
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

/* ══════════════════════════════════════════════════════════════════
   SECTION 1: UTILITIES
   ══════════════════════════════════════════════════════════════════ */

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') e.innerHTML = v;
    else e.setAttribute(k, v);
  }
  for (const c of children) {
    if (c == null) continue;
    if (typeof c === 'string' || typeof c === 'number') e.appendChild(document.createTextNode(String(c)));
    else if (c instanceof Node) e.appendChild(c);
    else if (Array.isArray(c)) c.forEach(x => x instanceof Node && e.appendChild(x));
  }
  return e;
}

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() :
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

function fmt(v, d = 3) {
  if (v == null || v === '') return '';
  const n = Number(v);
  if (isNaN(n)) return String(v);
  return n.toFixed(d);
}

function fmtP(p) {
  if (p == null) return '';
  if (p < 0.001) return '< .001';
  return p.toFixed(3).replace(/^0\./, '.');
}

function fmtStar(p) {
  if (p == null) return '';
  if (p < 0.001) return '***';
  if (p < 0.01) return '**';
  if (p < 0.05) return '*';
  return '';
}

function debounce(fn, ms) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

function formatDateTime(d) {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatTime(d) {
  if (!d) return '';
  return new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function svgIcon(name, size = 16) {
  const paths = {
    home: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z',
    database: 'M12 2C6.5 2 2 4 2 6.5s4.5 4.5 10 4.5 10-2 10-4.5S17.5 2 12 2zM2 11.5v3C2 17 6.5 19 12 19s10-2 10-4.5v-3M2 16.5v3C2 22 6.5 24 12 24s10-2 10-4.5v-3',
    'bar-chart': 'M12 20V10M18 20V4M6 20v-4',
    settings: 'M12 15a3 3 0 100-6 3 3 0 000 6z',
    code: 'M16 18l6-6-6-6M8 6L2 12l6 6',
    'file-text': 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8',
    clock: 'M12 2a10 10 0 100 20A10 10 0 0012 2zM12 6v6l4 2',
    'message-square': 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z',
    zap: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
    transform: 'M12 3v4M12 17v4M3 12h4M17 12h4',
    layers: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
    x: 'M18 6L6 18M6 6l12 12',
    plus: 'M12 5v14M5 12h14',
    minus: 'M5 12h14',
    trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6',
    edit: 'M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7',
    download: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3',
    upload: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12',
    check: 'M20 6L9 17l-5-5',
    'alert-triangle': 'M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01',
    'chevron-right': 'M9 18l6-6-6-6',
    'chevron-down': 'M6 9l6 6 6-6',
    play: 'M5 3l14 9-14 9V3z',
    save: 'M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2zM17 21v-8H7v8M7 3v5h8',
    folder: 'M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z',
    copy: 'M20 9H11a2 2 0 00-2 2v9a2 2 0 002 2h9a2 2 0 002-2v-9a2 2 0 00-2-2zM5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1',
    filter: 'M22 3H2l8 9.46V19l4 2V12.46L22 3',
    'book-open': 'M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2zM22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z',
    robot: 'M12 2a4 4 0 014 4v1h1a2 2 0 012 2v6a2 2 0 01-2 2h-1v1a4 4 0 01-8 0v-1H7a2 2 0 01-2-2V9a2 2 0 012-2h1V6a4 4 0 014-4z',
    'refresh-cw': 'M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15',
    info: 'M12 22a10 10 0 100-20 10 10 0 000 20zM12 8h.01M11 12h1v4h1',
  };
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', size); svg.setAttribute('height', size);
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
  const d = paths[name];
  if (d) { const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', d); svg.appendChild(path); }
  return svg;
}

/* Notifications */
let _notifContainer = null;
function notify(msg, type = 'info', ms = 3500) {
  if (!_notifContainer) {
    _notifContainer = el('div', { id: 'notifications' });
    document.body.appendChild(_notifContainer);
  }
  const n = el('div', { class: `notif ${type}` }, msg);
  _notifContainer.appendChild(n);
  setTimeout(() => { n.classList.add('fade'); setTimeout(() => n.remove(), 320); }, ms);
}
const notifyOk = m => notify(m, 'success');

function fmtDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
  } catch { return iso; }
}

const notifyErr = m => notify(m, 'error', 5000);
const notifyWarn = m => notify(m, 'warning', 4000);

/* ══════════════════════════════════════════════════════════════════
   SECTION 2: APPLICATION STATE
   ══════════════════════════════════════════════════════════════════ */
