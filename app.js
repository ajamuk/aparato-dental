const LABELS  = ['<4h', '<8h', '<12h', '≥12h', 'Nada', 'Solo noche'];
const ICONS   = ['😬', '😐', '🙂', '😁', '❌', '🌙'];
const COLORS  = ['#e74c3c', '#e09b35', '#3aada8', '#4caf7d', '#444455', '#3d3470'];
const DAYS    = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MONTHS  = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                 'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const GH_OWNER   = 'ajamuk';
const GH_REPO    = 'aparato-dental';
const GH_FILE    = 'data.json';
const TOKEN_KEY  = 'aparato-dental-gh-token';
const CACHE_KEY  = 'aparato-dental-cache';

// Default férula config
const DEFAULT_FERULA = { total: 32, current: 7, history: { '7': todayKey() } };

// ---- helpers ----

function todayKey() { return dateToKey(new Date()); }
function dateToKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function pad(n) { return String(n).padStart(2, '0'); }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate()+n); return r; }

// ---- GitHub API ----

let ghToken  = localStorage.getItem(TOKEN_KEY) || '';
let fileSha  = null;
let saveTimer = null;

function ghHeaders() {
  return {
    'Authorization': `token ${ghToken}`,
    'Content-Type': 'application/json'
  };
}

async function ghLoad() {
  if (!ghToken) return null;
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${GH_FILE}`,
      { headers: ghHeaders() }
    );
    if (res.status === 404) return {};   // file doesn't exist yet
    if (!res.ok) return null;
    const json = await res.json();
    fileSha = json.sha;
    return JSON.parse(atob(json.content.replace(/\s/g, '')));
  } catch { return null; }
}

async function ghSave(payload) {
  if (!ghToken) return false;
  setSyncStatus('saving');
  try {
    const body = {
      message: `Registro ${todayKey()}`,
      content: btoa(unescape(encodeURIComponent(JSON.stringify(payload, null, 2)))),
      ...(fileSha ? { sha: fileSha } : {})
    };
    const res = await fetch(
      `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${GH_FILE}`,
      { method: 'PUT', headers: ghHeaders(), body: JSON.stringify(body) }
    );
    if (!res.ok) { setSyncStatus('error'); return false; }
    const json = await res.json();
    fileSha = json.content.sha;
    setSyncStatus('ok');
    return true;
  } catch { setSyncStatus('error'); return false; }
}

function scheduleSave() {
  // cache locally immediately
  localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  // debounce GitHub write by 1.5s to batch rapid clicks
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => ghSave(data), 1500);
}

// ---- sync status indicator ----

function setSyncStatus(state) {
  const el = document.getElementById('sync-status');
  if (!el) return;
  const map = { saving: ['⏳', 'Guardando…', ''], ok: ['✓', 'Guardado', 'ok'], error: ['✗', 'Error al guardar', 'error'] };
  const [icon, text, cls] = map[state] || ['', '', ''];
  el.textContent = `${icon} ${text}`;
  el.className = 'sync-status ' + cls;
  if (state === 'ok') setTimeout(() => { if (el.className.includes('ok')) el.textContent = ''; }, 2500);
}

// ---- state ----
let data = {};
// ferula lives inside data.ferula
function getFerula() {
  return data.ferula || DEFAULT_FERULA;
}
function setFerula(f) {
  data.ferula = f;
  scheduleSave();
  renderFerula();
  renderFerulaStats();
}

// ---- VIEW SWITCHING ----

const viewMain  = document.getElementById('view-main');
const viewStats = document.getElementById('view-stats');

document.getElementById('stats-toggle-btn').addEventListener('click', () => {
  viewMain.classList.add('hidden');
  viewStats.classList.remove('hidden');
  renderStats();
  renderCalendar();
  renderFerulaStats();
});

document.getElementById('back-btn').addEventListener('click', () => {
  viewStats.classList.add('hidden');
  viewMain.classList.remove('hidden');
});

// ---- TODAY ----

function renderTodayDate() {
  const opts = { weekday: 'long', day: 'numeric', month: 'long' };
  document.getElementById('today-date').textContent =
    new Date().toLocaleDateString('es-ES', opts);
}

function renderTodayButtons() {
  const key   = todayKey();
  const saved = data[key];
  const msg   = document.getElementById('today-status-msg');

  document.querySelectorAll('.option-btn').forEach(btn => {
    // preserve extra classes (option-wide, option-none)
    const extra = [...btn.classList].filter(c => c !== 'option-btn' && !c.startsWith('active-'));
    btn.className = ['option-btn', ...extra].join(' ');
    if (saved !== undefined && Number(btn.dataset.value) === saved) {
      btn.classList.add(`active-${saved}`);
    }
  });

  if (saved !== undefined) {
    msg.textContent = `Registrado: ${ICONS[saved]} ${LABELS[saved]}`;
    msg.className = 'today-status ' + (saved === 3 ? 'recorded' : 'warning');
    if (saved === 4) msg.style.color = '#555';
    else msg.style.color = '';
  } else {
    msg.textContent = 'Sin registrar hoy';
    msg.className = 'today-status';
    msg.style.color = '';
  }
}

document.querySelectorAll('.option-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const val = Number(btn.dataset.value);
    const key = todayKey();
    if (data[key] === val) delete data[key]; else data[key] = val;
    scheduleSave();
    renderTodayButtons();
  });
});

// ---- STATS ----

function computeStats() {
  const keys   = Object.keys(data).sort();
  const total  = keys.length;
  const counts = [0, 0, 0, 0, 0, 0];
  keys.forEach(k => counts[data[k]]++);

  let streak = 0;
  let cursor = new Date();
  const today = todayKey();
  while (true) {
    const k = dateToKey(cursor);
    if (k > today) { cursor = addDays(cursor, -1); continue; }
    if (data[k] === 3) { streak++; cursor = addDays(cursor, -1); } else break;
  }

  let best = 0, cur = 0;
  keys.forEach(k => {
    if (data[k] === 3) { cur++; if (cur > best) best = cur; } else cur = 0;
  });

  const goodPct = total ? Math.round(counts[3] / total * 100) : 0;
  return { total, counts, streak, best, goodPct };
}

function renderStats() {
  const { total, counts, streak, best, goodPct } = computeStats();
  document.getElementById('stat-streak').textContent      = streak;
  document.getElementById('stat-best-streak').textContent = best;
  document.getElementById('stat-total').textContent       = total;
  document.getElementById('stat-good-pct').textContent    = goodPct + '%';

  const chart = document.getElementById('bar-chart');
  chart.innerHTML = '';
  const maxC = Math.max(...counts, 1);
  counts.forEach((c, i) => {
    const pct = Math.round(c / maxC * 100);
    const g = document.createElement('div');
    g.className = 'bar-group';
    g.innerHTML = `
      <span class="bar-count">${c}</span>
      <div class="bar" style="height:${Math.max(pct,2)}%;background:${COLORS[i]}"></div>
      <span class="bar-label">${LABELS[i]}</span>`;
    chart.appendChild(g);
  });

  const el  = document.getElementById('monthly-summary');
  el.innerHTML = '';
  const now = new Date();
  for (let m = 5; m >= 0; m--) {
    const d     = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const year  = d.getFullYear(), month = d.getMonth();
    const days  = new Date(year, month + 1, 0).getDate();
    let total2 = 0, good = 0;
    for (let day = 1; day <= days; day++) {
      const k = `${year}-${pad(month+1)}-${pad(day)}`;
      if (data[k] !== undefined) { total2++; if (data[k] === 3) good++; }
    }
    const pct   = total2 ? Math.round(good / total2 * 100) : 0;
    const color = pct >= 80 ? COLORS[3] : pct >= 50 ? COLORS[2] : pct > 0 ? COLORS[1] : COLORS[0];
    const row   = document.createElement('div');
    row.className = 'month-row';
    row.innerHTML = `
      <span class="month-name">${MONTHS[month].slice(0,3)}</span>
      <div class="month-bar-track">
        <div class="month-bar-fill" style="width:${pct}%;background:${color}"></div>
      </div>
      <span class="month-pct">${total2 ? pct+'%' : '—'}</span>`;
    el.appendChild(row);
  }
}

// ---- CALENDAR ----

function renderCalendar() {
  const grid  = document.getElementById('calendar-grid');
  grid.innerHTML = '';
  const today = todayKey();
  const now   = new Date();

  DAYS.forEach(name => {
    const h = document.createElement('div');
    h.className = 'day-header';
    h.textContent = name;
    grid.appendChild(h);
  });

  const startRaw = addDays(now, -29);
  const dow      = (startRaw.getDay() + 6) % 7;
  const start    = addDays(startRaw, -dow);
  let cursor     = new Date(start);

  while (cursor <= now) {
    const key  = dateToKey(cursor);
    const cell = document.createElement('div');
    const val  = data[key];
    const isOutOfRange = key < dateToKey(addDays(now, -29));

    if (isOutOfRange) {
      cell.className = 'day-cell empty';
    } else if (val !== undefined) {
      cell.className = `day-cell val-${val}`;
      cell.innerHTML = `<span class="day-num">${cursor.getDate()}</span>`;
      cell.dataset.tooltip = `${key}  ${ICONS[val]} ${LABELS[val]}`;
      cell.addEventListener('click', () => openDayEdit(key, cell));
    } else {
      cell.className = 'day-cell no-data';
      cell.innerHTML = `<span class="day-num">${cursor.getDate()}</span>`;
      cell.dataset.tooltip = `${key}  Sin registro`;
      cell.addEventListener('click', () => openDayEdit(key, cell));
    }

    if (key === today) cell.classList.add('today-cell');
    cell.addEventListener('mouseenter', showTooltip);
    cell.addEventListener('mouseleave', hideTooltip);
    cell.addEventListener('mousemove',  moveTooltip);
    grid.appendChild(cell);
    cursor = addDays(cursor, 1);
  }
}

// ---- EDIT POPUP ----

let editPopup = null;

function openDayEdit(key, anchor) {
  closeEditPopup();
  const popup = document.createElement('div');
  popup.id = 'edit-popup';
  popup.style.cssText = `
    position:fixed; z-index:300; background:#1e2235; border:1px solid #3e4260;
    border-radius:12px; padding:14px; box-shadow:0 8px 32px rgba(0,0,0,0.5); min-width:190px;`;

  const title = document.createElement('div');
  title.style.cssText = 'font-size:0.78rem;color:#7c82a0;margin-bottom:10px;';
  title.textContent = key;
  popup.appendChild(title);

  LABELS.forEach((lbl, i) => {
    const btn    = document.createElement('button');
    const active = data[key] === i;
    btn.style.cssText = `
      display:flex;align-items:center;gap:8px;width:100%;padding:8px 10px;
      margin-bottom:6px;border-radius:8px;
      border:2px solid ${active ? COLORS[i] : '#2e3149'};
      background:${active ? 'rgba(255,255,255,0.06)' : 'transparent'};
      color:#e8eaf0;cursor:pointer;font-size:0.82rem;`;
    btn.innerHTML = `${ICONS[i]} ${lbl}`;
    btn.addEventListener('click', () => {
      if (data[key] === i) delete data[key]; else data[key] = i;
      scheduleSave();
      renderTodayButtons();
      renderStats();
      renderCalendar();
      closeEditPopup();
    });
    popup.appendChild(btn);
  });

  if (data[key] !== undefined) {
    const clr = document.createElement('button');
    clr.style.cssText = `
      display:block;width:100%;padding:6px;border-radius:8px;
      border:1px solid #2e3149;background:transparent;color:#7c82a0;
      cursor:pointer;font-size:0.75rem;margin-top:4px;`;
    clr.textContent = 'Borrar registro';
    clr.addEventListener('click', () => {
      delete data[key];
      scheduleSave();
      renderTodayButtons();
      renderStats();
      renderCalendar();
      closeEditPopup();
    });
    popup.appendChild(clr);
  }

  document.body.appendChild(popup);
  editPopup = popup;
  const rect = anchor.getBoundingClientRect();
  let left = rect.right + 8, top = rect.top;
  if (left + 200 > window.innerWidth)  left = rect.left - 200 - 8;
  if (top  + 260 > window.innerHeight) top  = window.innerHeight - 260 - 10;
  popup.style.left = left + 'px';
  popup.style.top  = top  + 'px';
  setTimeout(() => document.addEventListener('click', outsideClose), 0);
}

function outsideClose(e) {
  if (editPopup && !editPopup.contains(e.target)) closeEditPopup();
}
function closeEditPopup() {
  if (editPopup) { editPopup.remove(); editPopup = null; }
  document.removeEventListener('click', outsideClose);
}

// ---- FÉRULA ----

function renderFerula() {
  const f = getFerula();
  document.getElementById('ferula-current').textContent = f.current;
  document.getElementById('ferula-total').textContent   = f.total;
  const pct = Math.round(f.current / f.total * 100);
  document.getElementById('ferula-bar').style.width = pct + '%';

  const startDate = f.history[String(f.current)];
  if (startDate) {
    const days = daysSince(startDate);
    const meta = document.getElementById('ferula-meta');
    meta.textContent = `Desde ${formatDate(startDate)} · ${days} día${days !== 1 ? 's' : ''}`;
  }
}

function renderFerulaStats() {
  const f   = getFerula();
  const pct = Math.round(f.current / f.total * 100);
  const rem = f.total - f.current;

  document.getElementById('fs-current').textContent  = f.current;
  document.getElementById('fs-total').textContent    = f.total;
  document.getElementById('fs-bar').style.width      = pct + '%';
  document.getElementById('fs-pct').textContent      = pct + '%';
  document.getElementById('fs-remaining').textContent = rem > 0 ? `Quedan ${rem}` : '¡Completado!';

  // history list (sorted descending)
  const hist = document.getElementById('ferula-history');
  hist.innerHTML = '';
  const entries = Object.entries(f.history)
    .map(([num, date]) => ({ num: Number(num), date }))
    .sort((a, b) => b.num - a.num);

  entries.forEach(({ num, date }, i) => {
    const isCurrent = num === f.current;
    const nextEntry = entries[i - 1]; // previous in desc order = higher num
    const days = isCurrent ? daysSince(date) : (nextEntry ? daysBetween(date, nextEntry.date) : daysSince(date));
    const row = document.createElement('div');
    row.className = 'ferula-history-row';
    row.innerHTML = `
      <span class="fh-num">#${num}</span>
      <span class="fh-date">${formatDate(date)}</span>
      <span class="fh-days">${days}d</span>
      ${isCurrent ? '<span class="fh-current">actual</span>' : ''}`;
    hist.appendChild(row);
  });
}

function daysSince(dateStr) {
  const then = new Date(dateStr + 'T00:00:00');
  const now  = new Date();
  now.setHours(0,0,0,0);
  return Math.round((now - then) / 86400000);
}

function daysBetween(d1, d2) {
  const a = new Date(d1 + 'T00:00:00');
  const b = new Date(d2 + 'T00:00:00');
  return Math.round(Math.abs(b - a) / 86400000);
}

function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

// férula arrows
document.getElementById('ferula-prev').addEventListener('click', () => {
  const f = { ...getFerula() };
  if (f.current <= 1) return;
  f.current--;
  setFerula(f);
});

document.getElementById('ferula-next').addEventListener('click', () => {
  const f = { ...getFerula() };
  if (f.current >= f.total) return;
  f.current++;
  if (!f.history[String(f.current)]) f.history[String(f.current)] = todayKey();
  setFerula(f);
});

document.getElementById('ferula-edit-btn').addEventListener('click', openFerulaEdit);

function openFerulaEdit() {
  closeEditPopup();
  const f = getFerula();
  const modal = document.createElement('div');
  modal.id = 'ferula-modal';
  modal.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:400;
    display:flex;align-items:center;justify-content:center;padding:20px;`;

  modal.innerHTML = `
    <div style="background:#1a1d27;border:1px solid #3e4260;border-radius:16px;
                padding:24px;max-width:340px;width:100%;">
      <h2 style="font-size:1rem;margin-bottom:18px;color:#e8eaf0;">⚙️ Configurar férula</h2>
      <label style="display:block;font-size:0.8rem;color:#7c82a0;margin-bottom:6px;">Férula actual</label>
      <input id="fe-current" type="number" min="1" value="${f.current}"
        style="width:100%;padding:9px 12px;border-radius:8px;border:1px solid #3e4260;
               background:#0f1117;color:#e8eaf0;font-size:1rem;margin-bottom:14px;outline:none;"/>
      <label style="display:block;font-size:0.8rem;color:#7c82a0;margin-bottom:6px;">Total de férulas</label>
      <input id="fe-total" type="number" min="1" value="${f.total}"
        style="width:100%;padding:9px 12px;border-radius:8px;border:1px solid #3e4260;
               background:#0f1117;color:#e8eaf0;font-size:1rem;margin-bottom:14px;outline:none;"/>
      <label style="display:block;font-size:0.8rem;color:#7c82a0;margin-bottom:6px;">Fecha inicio de la atual</label>
      <input id="fe-date" type="date" value="${f.history[String(f.current)] || todayKey()}"
        style="width:100%;padding:9px 12px;border-radius:8px;border:1px solid #3e4260;
               background:#0f1117;color:#e8eaf0;font-size:0.9rem;margin-bottom:18px;outline:none;"/>
      <div style="display:flex;gap:10px;">
        <button id="fe-save"
          style="flex:1;padding:10px;border-radius:8px;border:none;
                 background:#6c8ef7;color:#fff;cursor:pointer;font-size:0.88rem;font-weight:600;">
          Guardar
        </button>
        <button id="fe-cancel"
          style="padding:10px 16px;border-radius:8px;border:1px solid #3e4260;
                 background:transparent;color:#7c82a0;cursor:pointer;font-size:0.88rem;">
          Cancelar
        </button>
      </div>
    </div>`;

  document.body.appendChild(modal);

  document.getElementById('fe-save').addEventListener('click', () => {
    const newCurrent = Number(document.getElementById('fe-current').value);
    const newTotal   = Number(document.getElementById('fe-total').value);
    const newDate    = document.getElementById('fe-date').value;
    if (!newCurrent || !newTotal || newCurrent > newTotal) return;
    const newF = { ...f, current: newCurrent, total: newTotal };
    newF.history = { ...f.history, [String(newCurrent)]: newDate };
    setFerula(newF);
    modal.remove();
  });

  document.getElementById('fe-cancel').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

// ---- TOKEN MODAL ----

function openTokenModal() {
  closeTokenModal();
  const modal = document.createElement('div');
  modal.id = 'token-modal';
  modal.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:400;
    display:flex;align-items:center;justify-content:center;padding:20px;`;

  modal.innerHTML = `
    <div style="background:#1a1d27;border:1px solid #3e4260;border-radius:16px;
                padding:24px;max-width:420px;width:100%;">
      <h2 style="font-size:1rem;margin-bottom:8px;color:#e8eaf0;">🔑 Token de GitHub</h2>
      <p style="font-size:0.82rem;color:#7c82a0;margin-bottom:6px;line-height:1.6;">
        Para guardar los datos en GitHub necesitas un <strong style="color:#e8eaf0;">Personal Access Token</strong>
        con permiso de escritura en este repositorio.
      </p>
      <ol style="font-size:0.8rem;color:#7c82a0;margin:0 0 16px 16px;line-height:1.9;">
        <li>Ve a <strong style="color:#6c8ef7;">github.com → Settings → Developer settings → Personal access tokens → Fine-grained tokens</strong></li>
        <li>Pulsa <em>Generate new token</em></li>
        <li>En <em>Repository access</em> selecciona solo <strong style="color:#e8eaf0;">ajamuk/aparato-dental</strong></li>
        <li>En <em>Permissions → Contents</em> elige <strong style="color:#e8eaf0;">Read and write</strong></li>
        <li>Genera y copia el token</li>
      </ol>
      <input id="token-input" type="password" placeholder="github_pat_…"
        style="width:100%;padding:10px 12px;border-radius:8px;border:1px solid #3e4260;
               background:#0f1117;color:#e8eaf0;font-size:0.85rem;margin-bottom:12px;outline:none;" />
      <div style="display:flex;gap:10px;">
        <button id="token-save-btn"
          style="flex:1;padding:10px;border-radius:8px;border:none;
                 background:#6c8ef7;color:#fff;cursor:pointer;font-size:0.88rem;font-weight:600;">
          Guardar
        </button>
        <button id="token-cancel-btn"
          style="padding:10px 16px;border-radius:8px;border:1px solid #3e4260;
                 background:transparent;color:#7c82a0;cursor:pointer;font-size:0.88rem;">
          Cancelar
        </button>
      </div>
      <p id="token-error" style="font-size:0.78rem;color:#e74c3c;margin-top:10px;display:none;"></p>
    </div>`;

  document.body.appendChild(modal);

  if (ghToken) document.getElementById('token-input').value = ghToken;

  document.getElementById('token-save-btn').addEventListener('click', async () => {
    const val = document.getElementById('token-input').value.trim();
    if (!val) return;
    document.getElementById('token-save-btn').textContent = 'Verificando…';
    // verify token works
    const res = await fetch(
      `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}`,
      { headers: { 'Authorization': `token ${val}` } }
    );
    if (!res.ok) {
      const err = document.getElementById('token-error');
      err.textContent = 'Token inválido o sin acceso al repositorio.';
      err.style.display = 'block';
      document.getElementById('token-save-btn').textContent = 'Guardar';
      return;
    }
    ghToken = val;
    localStorage.setItem(TOKEN_KEY, ghToken);
    closeTokenModal();
    init();
  });

  document.getElementById('token-cancel-btn').addEventListener('click', closeTokenModal);
}

function closeTokenModal() {
  const m = document.getElementById('token-modal');
  if (m) m.remove();
}

document.getElementById('token-btn').addEventListener('click', openTokenModal);

// ---- TOOLTIP ----

const tooltip = document.getElementById('tooltip');
function showTooltip(e) {
  const text = e.currentTarget.dataset.tooltip;
  if (!text) return;
  tooltip.textContent = text;
  tooltip.style.display = 'block';
  moveTooltip(e);
}
function hideTooltip() { tooltip.style.display = 'none'; }
function moveTooltip(e) {
  tooltip.style.left = (e.clientX + 14) + 'px';
  tooltip.style.top  = (e.clientY - 32) + 'px';
}

// ---- INIT ----

async function init() {
  setSyncStatus('saving');
  const remote = await ghLoad();
  if (remote !== null) {
    data = remote;
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    setSyncStatus('ok');
  } else {
    // fall back to local cache
    try { data = JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch { data = {}; }
    if (!ghToken) {
      document.getElementById('sync-status').textContent = '⚠️ Sin token — datos solo locales';
      document.getElementById('sync-status').className = 'sync-status error';
    } else {
      setSyncStatus('error');
    }
  }
  if (!data.ferula) data.ferula = DEFAULT_FERULA;
  renderTodayDate();
  renderTodayButtons();
  renderFerula();
}

init();
