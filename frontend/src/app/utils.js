/**
 * SOCIOSTAT — UI Utilities
 */

// ─── DOM helpers ────────────────────────────────────────────────────
export function el(tag, attrs = {}, ...children) {
  const elem = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') elem.className = v;
    else if (k === 'style') Object.assign(elem.style, v);
    else if (k.startsWith('on')) elem.addEventListener(k.slice(2).toLowerCase(), v);
    else elem.setAttribute(k, v);
  }
  for (const child of children) {
    if (child == null) continue;
    if (typeof child === 'string' || typeof child === 'number') {
      elem.appendChild(document.createTextNode(String(child)));
    } else if (child instanceof Node) {
      elem.appendChild(child);
    } else if (Array.isArray(child)) {
      child.forEach(c => c instanceof Node && elem.appendChild(c));
    }
  }
  return elem;
}

export function html(strings, ...values) {
  const raw = strings.reduce((acc, s, i) => acc + escapeHtml(String(values[i - 1] ?? '')) + s);
  const div = document.createElement('div');
  div.innerHTML = raw;
  return div.firstElementChild || div;
}

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function query(sel, parent = document) { return parent.querySelector(sel); }
export function queryAll(sel, parent = document) { return [...parent.querySelectorAll(sel)]; }

// ─── Notifications ───────────────────────────────────────────────────
let notifContainer = null;

export function showNotification(message, type = 'info', duration = 3500) {
  if (!notifContainer) {
    notifContainer = el('div', { class: 'notifications', id: 'notif-container' });
    document.body.appendChild(notifContainer);
  }
  const notif = el('div', { class: `notification ${type}` }, message);
  notifContainer.appendChild(notif);
  setTimeout(() => { notif.style.opacity = '0'; setTimeout(() => notif.remove(), 300); }, duration);
}

export function showError(message) { showNotification(message, 'error', 5000); }
export function showSuccess(message) { showNotification(message, 'success', 3000); }
export function showWarning(message) { showNotification(message, 'warning', 4000); }

// ─── Dialog ──────────────────────────────────────────────────────────
export function openDialog({ title, content, footer, width = '500px', onClose }) {
  const overlay = el('div', {
    class: 'dialog-overlay',
    onClick(e) { if (e.target === overlay) { overlay.remove(); onClose?.(); } }
  });
  const dialog = el('div', { class: 'dialog', style: { width } });

  const header = el('div', { class: 'dialog-header' },
    el('div', { class: 'dialog-title' }, title),
    el('button', {
      class: 'btn btn-ghost btn-icon',
      onClick() { overlay.remove(); onClose?.(); }
    }, svgIcon('x'))
  );

  const body = el('div', { class: 'dialog-body' });
  if (typeof content === 'string') body.innerHTML = content;
  else if (content instanceof Node) body.appendChild(content);

  dialog.appendChild(header);
  dialog.appendChild(body);

  if (footer) {
    const footerEl = el('div', { class: 'dialog-footer' });
    if (footer instanceof Node) footerEl.appendChild(footer);
    else footerEl.innerHTML = footer;
    dialog.appendChild(footerEl);
  }

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  const close = () => { overlay.remove(); onClose?.(); };
  return { overlay, dialog, body, close };
}

// ─── SVG Icons ───────────────────────────────────────────────────────
export function svgIcon(name, size = 16) {
  const paths = {
    home: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10',
    database: 'M12 2C6.48 2 2 4.02 2 6.5S6.48 11 12 11s10-2.02 10-4.5S17.52 2 12 2zM2 11.5v3C2 16.98 6.48 19 12 19s10-2.02 10-4.5v-3M2 16.5v3C2 21.98 6.48 24 12 24s10-2.02 10-4.5v-3',
    'bar-chart': 'M12 20V10M18 20V4M6 20v-4',
    'trending-up': 'M22 7l-9.5 9.5-5-5L2 17',
    settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z',
    code: 'M16 18l6-6-6-6M8 6l-6 6 6 6',
    'file-text': 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8',
    clock: 'M12 2a10 10 0 100 20A10 10 0 0012 2zM12 6v6l4 2',
    'message-square': 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z',
    transform: 'M12 3v1m0 16v1M3 12h1m16 0h1m-2.636-7.364l-.707.707M6.343 17.657l-.707.707m0-11.314l.707.707M17.657 17.657l.707.707',
    x: 'M18 6L6 18M6 6l12 12',
    plus: 'M12 5v14M5 12h14',
    minus: 'M5 12h14',
    trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6',
    edit: 'M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z',
    download: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3',
    upload: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12',
    check: 'M20 6L9 17l-5-5',
    'alert-triangle': 'M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01',
    'chevron-right': 'M9 18l6-6-6-6',
    'chevron-down': 'M6 9l6 6 6-6',
    'chevron-left': 'M15 18l-6-6 6-6',
    play: 'M5 3l14 9-14 9V3z',
    'arrow-right': 'M5 12h14M12 5l7 7-7 7',
    filter: 'M22 3H2l8 9.46V19l4 2V12.46L22 3z',
    'layers': 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
    folder: 'M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z',
    'refresh-cw': 'M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15',
    copy: 'M20 9H11a2 2 0 00-2 2v9a2 2 0 002 2h9a2 2 0 002-2v-9a2 2 0 00-2-2zM5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1',
    save: 'M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2zM17 21v-8H7v8M7 3v5h8',
    'book-open': 'M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2zM22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z',
    zap: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  };
  const d = paths[name] || '';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  if (d) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  }
  return svg;
}

// ─── Format numbers ──────────────────────────────────────────────────
export function fmt(val, decimals = 3) {
  if (val == null || val === '') return '';
  const n = Number(val);
  if (isNaN(n)) return String(val);
  return n.toFixed(decimals);
}

export function fmtP(p) {
  if (p == null) return '';
  if (p < 0.001) return '< .001';
  return p.toFixed(3).replace('0.', '.');
}

// ─── Debounce ────────────────────────────────────────────────────────
export function debounce(fn, wait) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

// ─── UUID ────────────────────────────────────────────────────────────
export function uuid() {
  return crypto.randomUUID ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });
}

// ─── Date formatting ─────────────────────────────────────────────────
export function formatDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatTime(d) {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function formatDateTime(d) {
  if (!d) return '';
  return `${formatDate(d)} ${formatTime(d)}`;
}
