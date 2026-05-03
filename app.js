const STORAGE_KEY = 'aparato-dental-data';
const LABELS  = ['<4h', '<8h', '<12h', '≥12h', 'Nada', 'Noche'];
const ICONS   = ['😬', '😐', '🙂', '😁', '❌', '🌙'];
const COLORS  = ['#e74c3c', '#e09b35', '#3aada8', '#4caf7d', '#444455', '#3d3470'];
const DAYS    = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MONTHS  = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                 'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// ---- helpers ----

function todayKey() {
  return dateToKey(new Date());
}

function dateToKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function pad(n) { return String(n).padStart(2, '0'); }

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function loadData() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
  catch { return {}; }
}

function saveData(d) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
}

// ---- state ----
let data = loadData();

// ---- VIEW SWITCHING ----

const viewMain  = document.getElementById('view-main');
const viewStats = document.getElementById('view-stats');

document.getElementById('stats-toggle-btn').addEventListener('click', () => {
  viewMain.classList.add('hidden');
  viewStats.classList.remove('hidden');
  renderStats();
  renderCalendar();
});

document.getElementById('back-btn').addEventListener('click', () => {
  viewStats.classList.add('hidden');
  viewMain.classList.remove('hidden');
});

// ---- TODAY ----

function renderTodayDate() {
  const now = new Date();
  const opts = { weekday: 'long', day: 'numeric', month: 'long' };
  document.getElementById('today-date').textContent =
    now.toLocaleDateString('es-ES', opts);
}

function renderTodayButtons() {
  const key  = todayKey();
  const saved = data[key];
  const msg  = document.getElementById('today-status-msg');

  document.querySelectorAll('.option-btn').forEach(btn => {
    btn.className = 'option-btn';
    if (saved !== undefined && Number(btn.dataset.value) === saved) {
      btn.classList.add(`active-${saved}`);
    }
  });

  if (saved !== undefined) {
    msg.textContent = `Registrado: ${ICONS[saved]} ${LABELS[saved]}`;
    msg.className = 'today-status ' + (saved === 3 ? 'recorded' : 'warning');
    msg.style.color = saved === 4 ? '#555' : '';
  } else {
    msg.textContent = 'Sin registrar hoy';
    msg.className = 'today-status';
  }
}

document.querySelectorAll('.option-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const val = Number(btn.dataset.value);
    const key = todayKey();
    data[key] = (data[key] === val) ? (() => { delete data[key]; return undefined; })() : val;
    if (data[key] === undefined) delete data[key];
    else data[key] = val;
    saveData(data);
    renderTodayButtons();
  });
});

// ---- STATS ----

function computeStats() {
  const keys   = Object.keys(data).sort();
  const total  = keys.length;
  const counts = [0, 0, 0, 0, 0, 0];
  keys.forEach(k => counts[data[k]]++);

  // current streak (≥12h days ending today)
  let streak = 0;
  let cursor = new Date();
  const today = todayKey();
  while (true) {
    const k = dateToKey(cursor);
    if (k > today) { cursor = addDays(cursor, -1); continue; }
    if (data[k] === 3) { streak++; cursor = addDays(cursor, -1); }
    else break;
  }

  // best streak
  let best = 0, cur = 0;
  keys.forEach(k => {
    if (data[k] === 3) { cur++; if (cur > best) best = cur; }
    else cur = 0;
  });

  const goodPct = total ? Math.round(counts[3] / total * 100) : 0;
  return { total, counts, streak, best, goodPct };
}

function renderStats() {
  const { total, counts, streak, best, goodPct } = computeStats();
  document.getElementById('stat-streak').textContent     = streak;
  document.getElementById('stat-best-streak').textContent = best;
  document.getElementById('stat-total').textContent      = total;
  document.getElementById('stat-good-pct').textContent   = goodPct + '%';

  // bar chart
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

  // monthly summary — last 6 months
  const el  = document.getElementById('monthly-summary');
  el.innerHTML = '';
  const now = new Date();
  for (let m = 5; m >= 0; m--) {
    const d     = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const year  = d.getFullYear();
    const month = d.getMonth();
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

// ---- CALENDAR (last 30 days) ----

function renderCalendar() {
  const grid  = document.getElementById('calendar-grid');
  grid.innerHTML = '';
  const today = todayKey();
  const now   = new Date();

  // day-of-week headers (Mon–Sun)
  DAYS.forEach(name => {
    const h = document.createElement('div');
    h.className = 'day-header';
    h.textContent = name;
    grid.appendChild(h);
  });

  // start 29 days ago, aligned to Monday
  const startRaw = addDays(now, -29);
  const dow      = (startRaw.getDay() + 6) % 7; // Mon=0
  const start    = addDays(startRaw, -dow);      // rewind to Monday

  let cursor = new Date(start);
  const end  = new Date(now);

  while (cursor <= end) {
    const key  = dateToKey(cursor);
    const cell = document.createElement('div');
    const val  = data[key];
    const isFuture = key > today;
    // days before our 30-day window (padding cells)
    const isOutOfRange = key < dateToKey(addDays(now, -29));

    if (isOutOfRange) {
      cell.className = 'day-cell empty';
    } else if (isFuture) {
      cell.className = 'day-cell future';
      cell.innerHTML = `<span class="day-num">${cursor.getDate()}</span>`;
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
    position:fixed; z-index:300;
    background:#1e2235; border:1px solid #3e4260;
    border-radius:12px; padding:14px; box-shadow:0 8px 32px rgba(0,0,0,0.5);
    min-width:190px;
  `;

  const title = document.createElement('div');
  title.style.cssText = 'font-size:0.78rem; color:#7c82a0; margin-bottom:10px;';
  title.textContent = key;
  popup.appendChild(title);

  LABELS.forEach((lbl, i) => {
    const btn = document.createElement('button');
    const active = data[key] === i;
    btn.style.cssText = `
      display:flex; align-items:center; gap:8px; width:100%;
      padding:8px 10px; margin-bottom:6px; border-radius:8px;
      border:2px solid ${active ? COLORS[i] : '#2e3149'};
      background:${active ? 'rgba(255,255,255,0.06)' : 'transparent'};
      color:#e8eaf0; cursor:pointer; font-size:0.82rem;
    `;
    btn.innerHTML = `${ICONS[i]} ${lbl}`;
    btn.addEventListener('click', () => {
      if (data[key] === i) delete data[key]; else data[key] = i;
      saveData(data);
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
      display:block; width:100%; padding:6px; border-radius:8px;
      border:1px solid #2e3149; background:transparent; color:#7c82a0;
      cursor:pointer; font-size:0.75rem; margin-top:4px;
    `;
    clr.textContent = 'Borrar registro';
    clr.addEventListener('click', () => {
      delete data[key];
      saveData(data);
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
  let left = rect.right + 8;
  let top  = rect.top;
  if (left + 200 > window.innerWidth)  left = rect.left - 200 - 8;
  if (top  + 240 > window.innerHeight) top  = window.innerHeight - 240 - 10;
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
renderTodayDate();
renderTodayButtons();
