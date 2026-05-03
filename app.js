const STORAGE_KEY = 'aparato-dental-data';
const LABELS = ['<4h', '<8h', '<12h', '≥12h'];
const ICONS  = ['😬', '😐', '🙂', '😁'];
const COLORS = ['#e74c3c', '#e09b35', '#3aada8', '#4caf7d'];
const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                     'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// ---- helpers ----

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function loadData() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
  catch { return {}; }
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// ---- state ----
let data = loadData();

// ---- TODAY section ----

function renderTodayDate() {
  const now = new Date();
  const opts = { weekday:'long', day:'numeric', month:'long', year:'numeric' };
  document.getElementById('today-date').textContent =
    now.toLocaleDateString('es-ES', opts);
}

function renderTodayButtons() {
  const key = todayKey();
  const saved = data[key];
  document.querySelectorAll('.option-btn').forEach(btn => {
    btn.className = 'option-btn';
    if (saved !== undefined && Number(btn.dataset.value) === saved) {
      btn.classList.add(`active-${saved}`);
    }
  });
}

document.querySelectorAll('.option-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const val = Number(btn.dataset.value);
    const key = todayKey();
    if (data[key] === val) {
      delete data[key]; // toggle off
    } else {
      data[key] = val;
    }
    saveData(data);
    renderTodayButtons();
    renderStats();
    renderCalendar();
  });
});

// ---- STATS ----

function computeStats() {
  const keys = Object.keys(data).sort();
  const total = keys.length;

  const counts = [0, 0, 0, 0];
  keys.forEach(k => counts[data[k]]++);

  // streak (consecutive days with ≥12h up to today)
  let streak = 0;
  const today = todayKey();
  let cursor = new Date();
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

  const goodDays = counts[3];
  const goodPct = total ? Math.round(goodDays / total * 100) : 0;

  return { total, counts, streak, best, goodPct };
}

function dateToKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function renderStats() {
  const { total, counts, streak, best, goodPct } = computeStats();
  document.getElementById('stat-streak').textContent = streak;
  document.getElementById('stat-best-streak').textContent = best;
  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-good-pct').textContent = goodPct + '%';

  // bar chart
  const chart = document.getElementById('bar-chart');
  chart.innerHTML = '';
  const maxCount = Math.max(...counts, 1);
  counts.forEach((c, i) => {
    const pct = Math.round(c / maxCount * 100);
    const group = document.createElement('div');
    group.className = 'bar-group';
    group.innerHTML = `
      <span class="bar-count">${c}</span>
      <div class="bar" style="height:${Math.max(pct, 2)}%; background:${COLORS[i]}"></div>
      <span class="bar-label">${LABELS[i]}</span>
    `;
    chart.appendChild(group);
  });

  // monthly summary — last 6 months
  renderMonthlySummary();
}

function renderMonthlySummary() {
  const el = document.getElementById('monthly-summary');
  el.innerHTML = '';
  const now = new Date();

  for (let m = 5; m >= 0; m--) {
    const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const year = d.getFullYear();
    const month = d.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    let total = 0, good = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      const k = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      if (data[k] !== undefined) {
        total++;
        if (data[k] === 3) good++;
      }
    }

    const pct = total ? Math.round(good / total * 100) : 0;
    const color = pct >= 80 ? COLORS[3] : pct >= 50 ? COLORS[2] : pct > 0 ? COLORS[1] : COLORS[0];

    const row = document.createElement('div');
    row.className = 'month-row';
    row.innerHTML = `
      <span class="month-label">${MONTH_NAMES[month].slice(0,3)}</span>
      <div class="month-bar-track">
        <div class="month-bar-fill" style="width:${pct}%; background:${color}"></div>
      </div>
      <span class="month-pct">${total ? pct+'%' : '—'}</span>
    `;
    el.appendChild(row);
  }
}

// ---- CALENDAR ----

function renderCalendar() {
  const grid = document.getElementById('calendar-grid');
  grid.innerHTML = '';

  // day-of-week headers
  DAY_NAMES.forEach(name => {
    const h = document.createElement('div');
    h.className = 'day-header';
    h.textContent = name;
    grid.appendChild(h);
  });

  const today = todayKey();
  const now = new Date();

  // show from earliest entry or 3 months back
  const keys = Object.keys(data).sort();
  let startDate;
  if (keys.length > 0) {
    const parts = keys[0].split('-');
    startDate = new Date(+parts[0], +parts[1]-1, +parts[2]);
  } else {
    startDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  }
  // go to start of that month
  startDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1);

  // end of current month
  const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  let cursor = new Date(startDate);
  let lastMonth = -1;

  // offset first week
  // Monday-based: getDay() returns 0=Sun, need Mon=0
  const firstDow = (cursor.getDay() + 6) % 7; // Mon=0
  for (let i = 0; i < firstDow; i++) {
    const blank = document.createElement('div');
    blank.className = 'day-cell empty';
    grid.appendChild(blank);
  }

  while (cursor <= endDate) {
    const month = cursor.getMonth();
    if (month !== lastMonth) {
      // insert month label spanning full row — but only after first offset
      const label = document.createElement('div');
      label.className = 'month-label-row';
      label.textContent = `${MONTH_NAMES[month]} ${cursor.getFullYear()}`;
      grid.appendChild(label);

      // re-align: after month label we need to re-pad to proper weekday
      const dow = (cursor.getDay() + 6) % 7;
      for (let i = 0; i < dow; i++) {
        const blank = document.createElement('div');
        blank.className = 'day-cell empty';
        grid.appendChild(blank);
      }
      lastMonth = month;
    }

    const key = dateToKey(cursor);
    const cell = document.createElement('div');
    const val = data[key];

    if (key > today) {
      cell.className = 'day-cell future';
    } else if (val !== undefined) {
      cell.className = `day-cell val-${val}`;
      cell.dataset.tooltip = `${key}  ${ICONS[val]} ${LABELS[val]}`;
    } else {
      cell.className = 'day-cell no-data';
      cell.dataset.tooltip = `${key}  Sin registro`;
    }

    if (key === today) cell.classList.add('today-cell');

    cell.innerHTML = `<span class="day-num">${cursor.getDate()}</span>`;

    // click on past cell to edit
    if (key <= today) {
      cell.addEventListener('click', () => openDayEdit(key, cell));
    }

    // tooltip
    cell.addEventListener('mouseenter', showTooltip);
    cell.addEventListener('mouseleave', hideTooltip);
    cell.addEventListener('mousemove', moveTooltip);

    grid.appendChild(cell);
    cursor = addDays(cursor, 1);
  }
}

// ---- EDIT PAST DAY ----

let editPopup = null;

function openDayEdit(key, anchorCell) {
  closeEditPopup();

  const popup = document.createElement('div');
  popup.id = 'edit-popup';
  popup.style.cssText = `
    position: fixed; z-index: 200;
    background: #1e2235; border: 1px solid #3e4260;
    border-radius: 12px; padding: 14px; box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    min-width: 200px;
  `;

  const title = document.createElement('div');
  title.style.cssText = 'font-size:0.8rem; color:#7c82a0; margin-bottom:10px;';
  title.textContent = key;
  popup.appendChild(title);

  LABELS.forEach((lbl, i) => {
    const btn = document.createElement('button');
    btn.style.cssText = `
      display:flex; align-items:center; gap:8px; width:100%;
      padding:8px 10px; margin-bottom:6px; border-radius:8px;
      border: 2px solid ${data[key]===i ? COLORS[i] : '#2e3149'};
      background: ${data[key]===i ? 'rgba(255,255,255,0.06)' : 'transparent'};
      color:#e8eaf0; cursor:pointer; font-size:0.82rem; text-align:left;
    `;
    btn.innerHTML = `${ICONS[i]} ${lbl}`;
    btn.addEventListener('click', () => {
      if (data[key] === i) { delete data[key]; }
      else { data[key] = i; }
      saveData(data);
      renderTodayButtons();
      renderStats();
      renderCalendar();
      closeEditPopup();
    });
    popup.appendChild(btn);
  });

  // clear button
  const clearBtn = document.createElement('button');
  clearBtn.style.cssText = `
    display:block; width:100%; padding:6px; border-radius:8px;
    border:1px solid #2e3149; background:transparent; color:#7c82a0;
    cursor:pointer; font-size:0.75rem; margin-top:4px;
  `;
  clearBtn.textContent = 'Borrar registro';
  clearBtn.addEventListener('click', () => {
    delete data[key];
    saveData(data);
    renderTodayButtons();
    renderStats();
    renderCalendar();
    closeEditPopup();
  });
  popup.appendChild(clearBtn);

  document.body.appendChild(popup);
  editPopup = popup;

  // position near cell
  const rect = anchorCell.getBoundingClientRect();
  const pw = 200, ph = 220;
  let left = rect.right + 6;
  let top  = rect.top;
  if (left + pw > window.innerWidth) left = rect.left - pw - 6;
  if (top + ph > window.innerHeight) top = window.innerHeight - ph - 10;
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

const tooltip = document.createElement('div');
tooltip.className = 'tooltip';
document.body.appendChild(tooltip);

function showTooltip(e) {
  const text = e.currentTarget.dataset.tooltip;
  if (!text) return;
  tooltip.textContent = text;
  tooltip.style.display = 'block';
  moveTooltip(e);
}

function hideTooltip() {
  tooltip.style.display = 'none';
}

function moveTooltip(e) {
  tooltip.style.left = (e.clientX + 12) + 'px';
  tooltip.style.top  = (e.clientY - 28) + 'px';
}

// ---- INIT ----

renderTodayDate();
renderTodayButtons();
renderStats();
renderCalendar();
